// controllers/closingController.js
const { db } = require('../config/database');
const bcrypt = require('bcryptjs');

/**
 * Men-generate string SQL lengkap untuk backup data penting.
 * @param {object} connection - Koneksi database yang aktif.
 * @returns {string} - String berisi perintah SQL untuk backup.
 */
const generateSqlBackupString = async (connection) => {
    const tablesToBackup = ['transactions', 'transaction_details', 'expenses', 'customers', 'debts', 'stock_movements'];
    let sqlString = `
-- KASIRTTA SQL Backup
-- Tanggal Dibuat: ${new Date().toISOString()}
-- Database: ${process.env.DB_NAME}

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

`;

    for (const table of tablesToBackup) {
        try {
            // Dapatkan struktur tabel
            const [createTableResult] = await connection.query(`SHOW CREATE TABLE \`${table}\`;`);
            sqlString += `\n-- --------------------------------------------------------\n\n`;
            sqlString += `--\n-- Struktur tabel untuk \`${table}\`\n--\n\n`;
            sqlString += createTableResult[0]['Create Table'] + ';\n\n';

            // Dapatkan data tabel
            const [rows] = await connection.query(`SELECT * FROM \`${table}\`;`);

            if (rows.length > 0) {
                sqlString += `--\n-- Dumping data untuk tabel \`${table}\`\n--\n\n`;
                
                const columnNames = Object.keys(rows[0]).map(col => `\`${col}\``).join(', ');
                sqlString += `INSERT INTO \`${table}\` (${columnNames}) VALUES\n`;

                const values = rows.map((row, index) => {
                    const rowValues = Object.values(row).map(val => {
                        if (val === null) return 'NULL';
                        if (typeof val === 'string') {
                            // Escape single quotes
                            return `'${val.replace(/'/g, "''")}'`;
                        }
                        return val;
                    }).join(', ');
                    const terminator = (index === rows.length - 1) ? ';' : ',';
                    return `  (${rowValues})${terminator}`;
                }).join('\n');
                
                sqlString += values + '\n';
            }
        } catch (e) {
            console.error(`Gagal mem-backup tabel ${table}:`, e.message);
            // Lanjutkan ke tabel berikutnya jika satu gagal
        }
    }
    
    sqlString += `\nCOMMIT;\n`;
    return sqlString;
};

// Fungsi ini dirombak total untuk menghasilkan laporan keuangan
const generateFinancialReport = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({ success: false, message: 'Tanggal periode harus diisi!' });
        }

         // ================= 1. PENDAPATAN (UBAH QUERY INI) =================
        const [revenueResult] = await db.query(
            `SELECT 
                COALESCE(SUM(total_amount), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_in
             FROM transactions 
             WHERE DATE(CONVERT_TZ(transaction_date, 'UTC', '+08:00')) BETWEEN ? AND ?`,
            [start_date, end_date]
        );
        const totalRevenue = parseFloat(revenueResult[0].total_revenue);
        const cashIn = parseFloat(revenueResult[0].cash_in);

        // ================= 2. HPP (UBAH QUERY INI) =================
        const [cogsResult] = await db.query(
            `SELECT 
                COALESCE(SUM(td.quantity * td.purchase_price), 0) as total_cogs
             FROM transaction_details td
             JOIN transactions t ON td.transaction_id = t.transaction_id
             JOIN products p ON td.product_id = p.product_id
             WHERE DATE(CONVERT_TZ(t.transaction_date, 'UTC', '+08:00')) BETWEEN ? AND ?
               AND p.item_type = 'barang'
               AND td.purchase_price > 0`,
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
                COALESCE(SUM(e.amount), 0) as total_amount,
                e.payment_method
             FROM expenses e
             JOIN expense_categories ec ON e.category_id = ec.category_id
             WHERE DATE(e.expense_date) BETWEEN ? AND ?
             GROUP BY ec.category_id, e.payment_method`,
            [start_date, end_date]
        );
        
        let operationalExpenses = [];
        let ownerDraw = { category_name: 'Prive', total_amount: 0 }; 
        let totalOperationalExpenses = 0;
        let cashOut = 0;

        const expenseMap = new Map();
        expensesResult.forEach(exp => {
            const amount = parseFloat(exp.total_amount);
            if (expenseMap.has(exp.category_name)) {
                expenseMap.set(exp.category_name, expenseMap.get(exp.category_name) + amount);
            } else {
                expenseMap.set(exp.category_name, amount);
            }
            if(exp.payment_method === 'cash'){
                cashOut += amount;
            }
        });

        expenseMap.forEach((amount, name) => {
            if (name.toLowerCase() === 'prive') {
                ownerDraw.total_amount = amount;
            } else {
                operationalExpenses.push({ category_name: name, total_amount: amount });
                totalOperationalExpenses += amount;
            }
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

const downloadBackupBeforeClosing = async (req, res) => {
    const connection = await db.getConnection();
    try {
        // Generate konten SQL dari helper yang kita buat
        const sqlContent = await generateSqlBackupString(connection);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `KASIRTTA_BACKUP_${timestamp}.sql`;

        // Set response headers untuk memicu download di browser
        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
        
        // Kirim konten SQL sebagai respons
        res.status(200).send(sqlContent);

    } catch (error) {
        console.error('Download backup error:', error);
        res.status(500).json({ success: false, message: 'Gagal membuat file backup!', error: error.message });
    } finally {
        if (connection) connection.release();
    }
};

const executeClosing = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { period_name, start_date, end_date, notes, password, financial_report } = req.body;
        
        if (!period_name || !start_date || !end_date || !password || !financial_report) {
            return res.status(400).json({ success: false, message: 'Data permintaan tidak lengkap.' });
        }
        
        await connection.beginTransaction();

        const [users] = await connection.query('SELECT password FROM users WHERE user_id = ?', [req.user.user_id]);
        if (users.length === 0) {
            await connection.rollback();
            return res.status(401).json({ success: false, message: 'User tidak valid.' });
        }
        const isValid = await bcrypt.compare(password, users[0].password);
        if (!isValid) {
            await connection.rollback();
            return res.status(401).json({ success: false, message: 'Password salah!' });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFileReference = `BACKUP_DOWNLOADED_${timestamp}.sql`;
        const { beginning_capital, ending_capital } = financial_report.equity_statement;

        const [closingResult] = await connection.query(
            `INSERT INTO book_closings (period_name, start_date, end_date, notes, backup_file, beginning_capital, ending_capital, closed_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [period_name, start_date, end_date, notes, backupFileReference, beginning_capital, ending_capital, req.user.user_id]
        );
        
        // === BLOK PENGHAPUSAN HARD RESET ===

        // 1. Hapus semua referensi dari tabel "anak" terlebih dahulu.
        // Urutan ini sangat penting untuk menghindari error Foreign Key.
        await connection.query('DELETE FROM stock_movements WHERE reference_type = "transaction"');
        await connection.query('DELETE FROM transaction_details');
        
        // 2. Hapus data piutang karena induknya akan dihapus.
        await connection.query('DELETE FROM debts');

        // 3. Setelah semua anak dihapus, baru hapus "induk"-nya.
        await connection.query('DELETE FROM transactions');
        
        // 4. Hapus data pengeluaran.
        await connection.query('DELETE FROM expenses');
        
        // === AKHIR BLOK PENGHAPUSAN ===

        await connection.commit();
        
        res.json({
            success: true,
            message: 'Tutup buku (Hard Reset) berhasil! Semua data transaksi, piutang, dan pengeluaran telah dihapus.',
            data: { closing_id: closingResult.insertId }
        });
        
    } catch (error) {
        await connection.rollback();
        console.error('Execute closing error:', error);
        res.status(500).json({ success: false, message: 'Gagal melakukan finalisasi tutup buku!', error: error.message });
    } finally {
        if (connection) connection.release();
    }
};

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
    return res.status(501).json({ 
        success: false, 
        message: 'Fitur download backup tidak tersedia. Backup tercatat di riwayat.' 
    });
};

const getHistoricalReport = async (req, res) => {
     return res.status(501).json({ 
        success: false, 
        message: 'Fitur laporan historis tidak tersedia. Silakan generate laporan baru untuk periode yang diinginkan.'
    });
};

module.exports = {
    generateFinancialReport,
    downloadBackupBeforeClosing,
    executeClosing,
    getClosingHistory,
    downloadBackup,
    getHistoricalReport
};