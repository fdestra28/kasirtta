// controllers/closingController.js
const { db } = require('../config/database');
// Kita tidak lagi memerlukan fs, exec, dll. untuk backup di sini.
// Backup akan tetap berjalan di fungsi executeClosing.

const fs = require('fs').promises;
const path = require('path');

// Fungsi ini dirombak total untuk menghasilkan laporan keuangan
const generateFinancialReport = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({ success: false, message: 'Tanggal periode harus diisi!' });
        }

        // ================= 1. PENDAPATAN =================
        const [revenueResult] = await db.query(
            `SELECT 
                COALESCE(SUM(total_amount), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_in
             FROM transactions 
             WHERE DATE(transaction_date) BETWEEN ? AND ?`,
            [start_date, end_date]
        );
        const totalRevenue = parseFloat(revenueResult[0].total_revenue);
        const cashIn = parseFloat(revenueResult[0].cash_in);

        // ================= 2. HPP (HARGA POKOK PENJUALAN) - PERBAIKAN LOGIKA =================
        // Query ini sekarang mengambil purchase_price dari transaction_details, BUKAN dari products
        const [cogsResult] = await db.query(
            `SELECT 
                COALESCE(SUM(td.quantity * td.purchase_price), 0) as total_cogs
             FROM transaction_details td
             JOIN transactions t ON td.transaction_id = t.transaction_id
             JOIN products p ON td.product_id = p.product_id
             WHERE DATE(t.transaction_date) BETWEEN ? AND ?
               AND p.item_type = 'barang' -- Hanya hitung HPP untuk barang fisik
               AND td.purchase_price > 0`, // Pastikan harga belinya tercatat
            [start_date, end_date]
        );
        const totalCOGS = parseFloat(cogsResult[0].total_cogs);

        // ================= 3. LABA KOTOR =================
        const grossProfit = totalRevenue - totalCOGS;

        // ================= 4. BIAYA OPERASIONAL & PRIVE =================
        const [expensesResult] = await db.query(
            `SELECT 
                ec.category_name,
                ec.category_type,
                COALESCE(SUM(e.amount), 0) as total_amount
             FROM expenses e
             JOIN expense_categories ec ON e.category_id = ec.category_id
             WHERE DATE(e.expense_date) BETWEEN ? AND ?
             GROUP BY ec.category_id`,
            [`${start_date} 00:00:00`, `${end_date} 23:59:59`] // Perbaikan filter tanggal untuk DATETIME
        );
        
        let operationalExpenses = [];
        let ownerDraw = { category_name: 'Prive', total_amount: 0 }; 
        let totalOperationalExpenses = 0;
        let cashOut = 0;

        expensesResult.forEach(exp => {
            const amount = parseFloat(exp.total_amount);
            if (exp.category_name.toLowerCase() === 'prive') {
                ownerDraw.total_amount = amount;
            } else {
                operationalExpenses.push({ category_name: exp.category_name, total_amount: amount });
                totalOperationalExpenses += amount;
            }
            cashOut += amount;
        });

        // ================= 5. LABA BERSIH =================
        const netProfit = grossProfit - totalOperationalExpenses;

        // ================= 6. ARUS KAS =================
        const netCashFlow = cashIn - cashOut;
        
        // ================= 7. MODAL AWAL =================
        const [lastClosing] = await db.query(
            `SELECT ending_capital FROM book_closings ORDER BY closing_date DESC LIMIT 1`
        );
        const beginningCapital = lastClosing.length > 0 ? parseFloat(lastClosing[0].ending_capital) : 0;
        
        // ================= 8. MODAL AKHIR =================
        const endingCapital = beginningCapital + netProfit - ownerDraw.total_amount;

        res.json({
            success: true,
            data: {
                period: { start_date, end_date },
                profit_loss_statement: {
                    total_revenue: totalRevenue,
                    total_cogs: totalCOGS,
                    gross_profit: grossProfit,
                    operational_expenses: {
                        details: operationalExpenses,
                        total: totalOperationalExpenses
                    },
                    net_profit: netProfit
                },
                cash_flow_statement: {
                    cash_in: cashIn,
                    cash_out: cashOut,
                    net_cash_flow: netCashFlow
                },
                equity_statement: {
                    beginning_capital: beginningCapital,
                    net_profit: netProfit,
                    owner_draw: ownerDraw.total_amount,
                    ending_capital: endingCapital
                }
            }
        });

    } catch (error) {
        console.error('Generate financial report error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal generate laporan keuangan!',
            error: error.message
        });
    }
};

// GANTI FUNGSI LAMA executeClosing DENGAN VERSI FINAL INI
const executeClosing = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { period_name, start_date, end_date, notes, password, financial_report } = req.body;
        
        if (!financial_report || !financial_report.equity_statement) {
            return res.status(400).json({ success: false, message: 'Data laporan keuangan tidak lengkap.' });
        }

        const bcrypt = require('bcryptjs');
        const [users] = await db.query('SELECT password FROM users WHERE user_id = ?', [req.user.user_id]);
        if (users.length === 0) return res.status(401).json({ success: false, message: 'User tidak valid.' });
        const isValid = await bcrypt.compare(password, users[0].password);
        if (!isValid) return res.status(401).json({ success: false, message: 'Password salah!' });
        
        await connection.beginTransaction();
        
        const backupDir = require('path').join(__dirname, '..', 'backups');
        await require('fs').promises.mkdir(backupDir, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `backup_${timestamp}.json`;
        const backupPath = require('path').join(backupDir, backupFile);
        const backupData = {
            timestamp: new Date().toISOString(),
            period: { name: period_name, start_date, end_date },
            financial_summary: financial_report,
            data: {}
        };

        // Hapus 'purchases' dan 'purchase_details' dari daftar tabel yang akan di-backup
        const tables = ['users', 'products', 'transactions', 'transaction_details', 'stock_movements', 'expenses', 'expense_categories'];
    
        for (const table of tables) {
            const [rows] = await connection.query(`SELECT * FROM ${table}`);
            backupData.data[table] = rows;
        }
        await require('fs').promises.writeFile(backupPath, JSON.stringify(backupData, null, 2));
        
        const { beginning_capital, ending_capital } = financial_report.equity_statement;
        const [closingResult] = await connection.query(
            `INSERT INTO book_closings (period_name, start_date, end_date, notes, backup_file, beginning_capital, ending_capital, closed_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [period_name, start_date, end_date, notes, backupFile, beginning_capital, ending_capital, req.user.user_id]
        );
        
        await connection.query('DELETE FROM transaction_details');
        await connection.query('DELETE FROM transactions');
        await connection.query('DELETE FROM expenses');
        
        await connection.query('ALTER TABLE transactions AUTO_INCREMENT = 1');
        await connection.query('ALTER TABLE transaction_details AUTO_INCREMENT = 1');
        await connection.query('ALTER TABLE expenses AUTO_INCREMENT = 1');
        
        await connection.query('DELETE FROM stock_movements WHERE reference_type = "transaction"');

        await connection.commit();
        
        res.json({
            success: true,
            message: 'Tutup buku berhasil! Sistem akan logout otomatis untuk memulai sesi baru.',
            data: { closing_id: closingResult.insertId, backup_file: backupFile }
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Closing error:', error);
        res.status(500).json({ success: false, message: 'Gagal melakukan tutup buku!', error: error.message });
    } finally {
        connection.release();
    }
};

// Fungsi getClosingHistory dan downloadBackup tetap sama
const getClosingHistory = async (req, res) => {
    try {
        const [closings] = await db.query(
            `SELECT bc.*, u.full_name as closed_by_name
             FROM book_closings bc
             JOIN users u ON bc.closed_by = u.user_id
             ORDER BY bc.closing_date DESC`
        );
        res.json({ success: true, data: closings });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal mengambil history!', error: error.message });
    }
};

const downloadBackup = async (req, res) => {
    try {
        const { filename } = req.params;
        const backupPath = require('path').join(__dirname, '..', 'backups', filename);
        await require('fs').promises.access(backupPath);
        res.download(backupPath);
    } catch (error) {
        res.status(404).json({ success: false, message: 'File backup tidak ditemukan!' });
    }
};

const getHistoricalReport = async (req, res) => {
    try {
        const { id } = req.params; // Ini adalah closing_id

        // 1. Dapatkan nama file backup dari database
        const [closings] = await db.query(
            'SELECT backup_file, period_name FROM book_closings WHERE closing_id = ?', 
            [id]
        );

        if (closings.length === 0) {
            return res.status(404).json({ success: false, message: 'Riwayat tutup buku tidak ditemukan.' });
        }

        const { backup_file, period_name } = closings[0];
        if (!backup_file) {
            return res.status(404).json({ success: false, message: 'File backup untuk periode ini tidak terdaftar.' });
        }

        // 2. Baca file backup
        const backupPath = path.join(__dirname, '..', 'backups', backup_file);
        const backupContent = await fs.readFile(backupPath, 'utf8');
        const backupData = JSON.parse(backupContent);

        // 3. Ekstrak data laporan keuangan dari backup
        if (!backupData.financial_summary) {
            return res.status(404).json({ success: false, message: 'Data laporan keuangan tidak ditemukan di dalam file backup.' });
        }

        // 4. Kirim data ke frontend
        res.json({
            success: true,
            data: {
                report: backupData.financial_summary,
                period_name: period_name
            }
        });

    } catch (error) {
        if (error.code === 'ENOENT') {
            return res.status(404).json({ success: false, message: 'File backup fisik tidak ditemukan di server.' });
        }
        console.error('Get historical report error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil laporan historis.' });
    }
};

module.exports = {
    // Kita ganti nama fungsinya agar lebih jelas
    generateFinancialReport,
    executeClosing,
    getClosingHistory,
    downloadBackup,
    getHistoricalReport
};