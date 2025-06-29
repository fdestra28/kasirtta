// controllers/closingController.js
const { db } = require('../config/database');
const bcrypt = require('bcryptjs');

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
                COALESCE(SUM(e.amount), 0) as total_amount,
                e.payment_method
             FROM expenses e
             JOIN expense_categories ec ON e.category_id = ec.category_id
             WHERE DATE(e.expense_date) BETWEEN ? AND ?
             GROUP BY ec.category_id, e.payment_method`,
            [start_date, end_date] // Perbaikan filter tanggal
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

const executeClosing = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { period_name, start_date, end_date, notes, password, financial_report } = req.body;
        
        if (!financial_report || !financial_report.equity_statement) {
            return res.status(400).json({ success: false, message: 'Data laporan keuangan tidak lengkap.' });
        }

        const [users] = await db.query('SELECT password FROM users WHERE user_id = ?', [req.user.user_id]);
        if (users.length === 0) return res.status(401).json({ success: false, message: 'User tidak valid.' });
        const isValid = await bcrypt.compare(password, users[0].password);
        if (!isValid) return res.status(401).json({ success: false, message: 'Password salah!' });
        
        await connection.beginTransaction();
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `MANUAL_RESET_${timestamp}`;
        
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
    executeClosing,
    getClosingHistory,
    downloadBackup,
    getHistoricalReport
};