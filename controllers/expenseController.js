// controllers/expenseController.js
const { db } = require('../config/database');

// Get expense categories (TETAP DIPERLUKAN)
const getCategories = async (req, res) => {
    try {
        const [categories] = await db.query(
            // Kita filter agar kategori 'Pembelian Barang' tidak muncul di form manual
            "SELECT * FROM expense_categories WHERE is_active = true AND category_name != 'Pembelian Barang' ORDER BY category_name"
        );
        
        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil kategori!',
            error: error.message
        });
    }
};

// Create expense (TETAP DIPERLUKAN)
const createExpense = async (req, res) => {
    try {
        const { 
            expense_date, 
            category_id, 
            description, 
            amount, 
            payment_method, 
            receipt_number, 
            notes 
        } = req.body;
        
        const [result] = await db.query(
            `INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, receipt_number, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [expense_date, category_id, description, amount, payment_method || 'cash', receipt_number, notes, req.user.user_id]
        );
        
        res.status(201).json({
            success: true,
            message: 'Pengeluaran berhasil ditambahkan!',
            data: { expense_id: result.insertId }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal menambah pengeluaran!',
            error: error.message
        });
    }
};

// Get expenses (TETAP DIPERLUKAN)
const getExpenses = async (req, res) => {
    try {
        const { start_date, end_date, category_id } = req.query;
        
        let query = `
            SELECT e.*, ec.category_name, u.full_name as created_by_name
            FROM expenses e
            JOIN expense_categories ec ON e.category_id = ec.category_id
            JOIN users u ON e.created_by = u.user_id
            WHERE 1=1
        `;
        const params = [];
        
        if (start_date) {
            query += ' AND e.expense_date >= ?';
            params.push(start_date);
        }
        
        if (end_date) {
            query += ' AND e.expense_date <= ?';
            params.push(end_date);
        }
        
        if (category_id) {
            query += ' AND e.category_id = ?';
            params.push(category_id);
        }
        
        query += ' ORDER BY e.expense_date DESC, e.expense_id DESC';
        
        const [expenses] = await db.query(query, params);
        
        res.json({
            success: true,
            data: expenses
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data pengeluaran!',
            error: error.message
        });
    }
};

// Get expense summary for period (TETAP DIPERLUKAN UNTUK LAPORAN)
const getExpenseSummary = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Periode harus diisi!'
            });
        }
        
        // Get expenses by category
        const [byCategory] = await db.query(
            `SELECT 
                ec.category_name,
                ec.category_type,
                COUNT(e.expense_id) as count,
                SUM(e.amount) as total
             FROM expense_categories ec
             LEFT JOIN expenses e ON ec.category_id = e.category_id 
                AND e.expense_date BETWEEN ? AND ?
             GROUP BY ec.category_id
             HAVING total > 0  -- Hanya tampilkan kategori yang ada pengeluarannya
             ORDER BY total DESC`,
            [start_date, end_date]
        );
        
        // Get total expenses
        const [totals] = await db.query(
            `SELECT 
                COUNT(*) as total_count,
                SUM(amount) as total_amount
             FROM expenses 
             WHERE expense_date BETWEEN ? AND ?`,
            [start_date, end_date]
        );
        
        res.json({
            success: true,
            data: {
                summary: totals[0],
                by_category: byCategory
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil summary!',
            error: error.message
        });
    }
};


// HAPUS FUNGSI createPurchase
// ... (fungsi createPurchase yang lama dihapus dari sini) ...

// Delete an expense (owner only)
const deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;

        // Cek apakah pengeluaran ini adalah tipe 'Pembelian Barang'
        const [expenses] = await db.query(
            `SELECT ec.category_name 
             FROM expenses e 
             JOIN expense_categories ec ON e.category_id = ec.category_id 
             WHERE e.expense_id = ?`,
            [id]
        );

        if (expenses.length === 0) {
            return res.status(404).json({ success: false, message: 'Data pengeluaran tidak ditemukan.' });
        }

        // PENTING: Jangan izinkan penghapusan pengeluaran yang tercatat otomatis dari pembelian
        if (expenses[0].category_name === 'Pembelian Barang') {
            return res.status(403).json({
                success: false,
                message: 'Pengeluaran dari pembelian barang tidak dapat dihapus manual. Silakan sesuaikan stok.'
            });
        }

        // Lanjutkan penghapusan jika bukan dari pembelian barang
        const [result] = await db.query('DELETE FROM expenses WHERE expense_id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Data pengeluaran tidak ditemukan.' });
        }

        res.json({ success: true, message: 'Pengeluaran berhasil dihapus.' });

    } catch (error) {
        console.error('Delete expense error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menghapus pengeluaran!',
            error: error.message
        });
    }
};

module.exports = {
    getCategories,
    createExpense,
    getExpenses,
    getExpenseSummary,
    deleteExpense
};