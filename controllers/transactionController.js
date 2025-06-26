// controllers/transactionController.js
const { db } = require('../config/database');

// Generate transaction code
const generateTransactionCode = async () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, ''); // Format: YYYYMMDD
    const prefix = `TRX-${dateStr}-`;

    // Query ini lebih aman dari race condition sederhana.
    // Ia mencari nomor urut tertinggi untuk hari ini.
    const [result] = await db.query(
        `SELECT transaction_code FROM transactions 
         WHERE transaction_code LIKE ? 
         ORDER BY CAST(SUBSTRING_INDEX(transaction_code, '-', -1) AS UNSIGNED) DESC 
         LIMIT 1`,
        [prefix + '%']
    );

    let nextNumber = 1;
    if (result.length > 0 && result[0].transaction_code) {
        // Ekstrak nomor terakhir dari kode (misal: TRX-20240521-005 -> 5)
        const lastNumber = parseInt(result[0].transaction_code.split('-').pop(), 10);
        nextNumber = lastNumber + 1;
    }

    // Kembalikan kode baru dengan padding
    return `${prefix}${String(nextNumber).padStart(3, '0')}`;
};

// Create new transaction - UPDATE dengan debug
const createTransaction = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { items, payment_method, payment_received } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Item transaksi tidak boleh kosong!'
            });
        }

        await connection.beginTransaction();

        let server_calculated_total = 0;
        const verified_item_details = [];

        for (const item of items) {
            if (!item.product_id || !item.quantity || item.quantity <= 0) {
                throw new Error('Data item dalam keranjang tidak valid!');
            }

            const [products] = await connection.query(
                // Ambil juga purchase_price di sini
                'SELECT product_id, item_name, item_type, selling_price, purchase_price, current_stock, is_active FROM products WHERE product_id = ? AND is_active = true FOR UPDATE',
                [item.product_id]
            );

            if (products.length === 0) {
                throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan atau tidak aktif!`);
            }

            const product = products[0];

            if (product.item_type === 'barang' && product.current_stock < item.quantity) {
                throw new Error(`Stok untuk "${product.item_name}" tidak cukup! Sisa: ${product.current_stock}`);
            }

            const subtotal = parseFloat(product.selling_price) * item.quantity;
            server_calculated_total += subtotal;

            verified_item_details.push({
                product_id: product.product_id,
                quantity: item.quantity,
                unit_price: parseFloat(product.selling_price),
                purchase_price: parseFloat(product.purchase_price), // <-- SIMPAN HARGA BELI HISTORIS
                subtotal: subtotal,
                item_type: product.item_type,
                item_name: product.item_name
            });
        }

        if (payment_method === 'cash' && payment_received < server_calculated_total) {
            throw new Error('Jumlah pembayaran tunai kurang!');
        }

        const change_amount = payment_method === 'cash' ? payment_received - server_calculated_total : 0;
        const transaction_code = await generateTransactionCode();

        const [transResult] = await connection.query(
            `INSERT INTO transactions (transaction_code, admin_id, total_amount, payment_method, payment_received, change_amount)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [transaction_code, req.user.user_id, server_calculated_total, payment_method || 'cash', payment_received || server_calculated_total, change_amount]
        );

        const transaction_id = transResult.insertId;

        for (const detail of verified_item_details) {
            // Masukkan purchase_price ke query
            await connection.query(
                `INSERT INTO transaction_details (transaction_id, product_id, quantity, unit_price, purchase_price, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [transaction_id, detail.product_id, detail.quantity, detail.unit_price, detail.purchase_price, detail.subtotal]
            );

            if (detail.item_type === 'barang') {
                await connection.query(
                    'UPDATE products SET current_stock = current_stock - ? WHERE product_id = ?',
                    [detail.quantity, detail.product_id]
                );

                await connection.query(
                    `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, reference_id, user_id)
                     VALUES (?, 'out', ?, 'transaction', ?, ?)`,
                    [detail.product_id, detail.quantity, transaction_id, req.user.user_id]
                );
            }
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Transaksi berhasil!',
            data: {
                transaction_id,
                transaction_code,
                transaction_date: new Date(), // Untuk struk
                total_amount: server_calculated_total,
                payment_received: payment_received || server_calculated_total,
                change_amount,
                items: verified_item_details.map(d => ({
                    product_name: d.item_name,
                    quantity: d.quantity,
                    unit_price: d.unit_price,
                    subtotal: d.subtotal
                }))
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Transaction Error:', error.message);
        res.status(400).json({
            success: false,
            message: error.message || 'Gagal membuat transaksi!'
        });
    } finally {
        connection.release();
    }
};

// Get all transactions
const getAllTransactions = async (req, res) => {
    try {
        const { start_date, end_date, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT t.*, u.full_name as cashier_name 
            FROM transactions t
            JOIN users u ON t.admin_id = u.user_id
            WHERE 1=1
        `;
        const params = [];

        // Filter by date range
        if (start_date) {
            query += ' AND DATE(t.transaction_date) >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND DATE(t.transaction_date) <= ?';
            params.push(end_date);
        }

        // If owner, show all. If admin, show only their transactions
        if (req.user.role === 'admin') {
            query += ' AND t.admin_id = ?';
            params.push(req.user.user_id);
        }

        query += ' ORDER BY t.transaction_date DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [transactions] = await db.query(query, params);

        res.json({
            success: true,
            data: transactions
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data transaksi!',
            error: error.message
        });
    }
};

// Get transaction detail
const getTransactionById = async (req, res) => {
    try {
        const { id } = req.params;

        // Get transaction header
        const [transactions] = await db.query(
            `SELECT t.*, u.full_name as cashier_name 
             FROM transactions t
             JOIN users u ON t.admin_id = u.user_id
             WHERE t.transaction_id = ?`,
            [id]
        );

        if (transactions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Transaksi tidak ditemukan!'
            });
        }

        // Check permission
        if (req.user.role === 'admin' && transactions[0].admin_id !== req.user.user_id) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses ke transaksi ini!'
            });
        }

        // Get transaction details
        const [details] = await db.query(
            `SELECT td.*, p.item_name, p.item_code, p.item_type
             FROM transaction_details td
             JOIN products p ON td.product_id = p.product_id
             WHERE td.transaction_id = ?`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...transactions[0],
                details
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil detail transaksi!',
            error: error.message
        });
    }
};

// Get daily summary (for quick stats)
const getDailySummary = async (req, res) => {
    try {
        const { date } = req.query;
        const targetDate = date || new Date().toISOString().slice(0, 10);

        let baseQuery = 'DATE(transaction_date) = ?';
        let params = [targetDate];

        // If admin, only show their own summary
        if (req.user.role === 'admin') {
            baseQuery += ' AND admin_id = ?';
            params.push(req.user.user_id);
        }

        // Get summary
        const [summary] = await db.query(
            `SELECT 
                COUNT(*) as total_transactions,
                COALESCE(SUM(total_amount), 0) as total_revenue,
                COALESCE(AVG(total_amount), 0) as average_transaction
             FROM transactions 
             WHERE ${baseQuery}`,
            params
        );

        // Get top products
        const [topProducts] = await db.query(
            `SELECT 
                p.item_name,
                p.item_type,
                SUM(td.quantity) as total_quantity,
                SUM(td.subtotal) as total_revenue
             FROM transaction_details td
             JOIN transactions t ON td.transaction_id = t.transaction_id
             JOIN products p ON td.product_id = p.product_id
             WHERE ${baseQuery}
             GROUP BY p.product_id
             ORDER BY total_quantity DESC
             LIMIT 5`,
            params
        );

        res.json({
            success: true,
            data: {
                date: targetDate,
                summary: summary[0],
                top_products: topProducts
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil ringkasan harian!',
            error: error.message
        });
    }
};

// Get report data (owner only)
const getReportData = async (req, res) => {
    try {
        const { start_date, end_date, group_by = 'daily' } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal awal dan akhir harus diisi!'
            });
        }

        let dateFormat;
        switch (group_by) {
            case 'monthly':
                dateFormat = '%Y-%m';
                break;
            case 'weekly':
                dateFormat = '%Y-%u'; // Week number
                break;
            default: // daily
                dateFormat = '%Y-%m-%d';
        }

        // Get revenue data
        const [revenueData] = await db.query(
            `SELECT DATE_FORMAT(transaction_date, ?) as period, COUNT(*) as total_transactions, SUM(total_amount) as total_revenue FROM transactions WHERE DATE(transaction_date) BETWEEN ? AND ? GROUP BY period ORDER BY period`,
            [dateFormat, start_date, end_date]
        );

        // Get product performance
        const [productData] = await db.query(
            `SELECT p.product_id, p.item_name, p.item_type, SUM(td.quantity) as total_quantity, SUM(td.subtotal) as total_revenue, COUNT(DISTINCT t.transaction_id) as transaction_count FROM transaction_details td JOIN transactions t ON td.transaction_id = t.transaction_id JOIN products p ON td.product_id = p.product_id WHERE DATE(t.transaction_date) BETWEEN ? AND ? GROUP BY p.product_id ORDER BY total_revenue DESC`,
            [start_date, end_date]
        );

        // Get cashier performance
        const [cashierData] = await db.query(
            `SELECT u.user_id, u.full_name, COUNT(*) as total_transactions, SUM(t.total_amount) as total_revenue FROM transactions t JOIN users u ON t.admin_id = u.user_id WHERE DATE(t.transaction_date) BETWEEN ? AND ? GROUP BY u.user_id ORDER BY total_revenue DESC`,
            [start_date, end_date]
        );
        
        // --- PERBAIKAN UTAMA ADA DI BLOK INI ---

        // 1. Get total expense summary
        const [expenseTotalResult] = await db.query(
            `SELECT 
                COALESCE(SUM(amount), 0) as total_expense,
                COUNT(*) as total_expense_items
             FROM expenses
             WHERE DATE(expense_date) BETWEEN ? AND ?`,
             [start_date, end_date]
        );
        
        // 2. Get expense data by category
        const [expenseDataByCategory] = await db.query(
            `SELECT 
                ec.category_name,
                COALESCE(SUM(e.amount), 0) as total_amount
             FROM expense_categories ec
             LEFT JOIN expenses e ON ec.category_id = e.category_id AND DATE(e.expense_date) BETWEEN ? AND ?
             GROUP BY ec.category_id, ec.category_name
             HAVING COALESCE(SUM(e.amount), 0) > 0
             ORDER BY total_amount DESC`,
            [start_date, end_date]
        );

        // 3. Combine both expense results into a single object and send to frontend
        res.json({
            success: true,
            data: {
                period: { start_date, end_date },
                revenue_trend: revenueData,
                product_performance: productData,
                cashier_performance: cashierData,
                expense_summary: {
                    summary: expenseTotalResult[0],
                    by_category: expenseDataByCategory
                }
            }
        });
        // --- AKHIR BLOK PERBAIKAN ---

    } catch (error) {
        console.error("Error in getReportData:", error); // <-- Tambahkan log error di backend
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data laporan!',
            error: error.message
        });
    }
};

// Get popular products
const getPopularProducts = async (req, res) => {
    try {
        const { days = 30 } = req.query; // Default 30 hari terakhir

        const [products] = await db.query(
            `SELECT 
                p.product_id,
                p.item_code,
                p.item_name,
                p.item_type,
                p.selling_price,
                p.current_stock,
                p.is_active, -- Pastikan kita juga mengambil status aktif
                COUNT(DISTINCT t.transaction_id) as transaction_count,
                SUM(td.quantity) as total_sold
             FROM products p
             JOIN transaction_details td ON p.product_id = td.product_id
             JOIN transactions t ON td.transaction_id = t.transaction_id
             WHERE t.transaction_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
                AND p.is_active = true
             GROUP BY p.product_id
             ORDER BY total_sold DESC
             LIMIT 10`, // Ambil 10 produk terpopuler
            [parseInt(days)]
        );

        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil produk populer!',
            error: error.message
        });
    }
};

module.exports = {
    createTransaction,
    getAllTransactions,
    getTransactionById,
    getDailySummary,
    getReportData,
    getPopularProducts // <-- Pastikan fungsi baru diekspor
};