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
        const { items, payment_method, payment_received, debt_details } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Item transaksi tidak boleh kosong!' });
        }
        
        if (payment_method === 'hutang' && (!debt_details || !debt_details.customer_id)) {
            return res.status(400).json({ success: false, message: 'Data pelanggan harus ada untuk transaksi hutang!' });
        }

        await connection.beginTransaction();

        let server_calculated_total = 0;
        const verified_item_details = [];

        for (const item of items) {
            if (!item.product_id || !item.quantity || item.quantity <= 0) {
                throw new Error('Data item dalam keranjang tidak valid!');
            }

            // --- LOGIKA BARU UNTUK MEMBEDAKAN PRODUK & VARIAN ---
            if (item.variant_id) {
                // Skenario 1: Item yang dijual adalah sebuah VARIAN
                const [variants] = await connection.query(
                    `SELECT 
                        v.variant_id, v.variant_name, v.selling_price, v.purchase_price, v.current_stock,
                        p.product_id, p.item_name, p.item_type, p.is_active
                     FROM product_variants v
                     JOIN products p ON v.product_id = p.product_id
                     WHERE v.variant_id = ? AND v.is_active = true AND p.is_active = true FOR UPDATE`,
                    [item.variant_id]
                );

                if (variants.length === 0) {
                    throw new Error(`Varian produk dengan ID ${item.variant_id} tidak ditemukan atau tidak aktif!`);
                }
                const variant = variants[0];

                if (variant.item_type === 'barang' && variant.current_stock < item.quantity) {
                    throw new Error(`Stok untuk "${variant.item_name} - ${variant.variant_name}" tidak cukup! Sisa: ${variant.current_stock}`);
                }

                const subtotal = parseFloat(variant.selling_price) * item.quantity;
                server_calculated_total += subtotal;

                verified_item_details.push({
                    product_id: variant.product_id,
                    variant_id: variant.variant_id, // Menyimpan ID varian
                    quantity: item.quantity,
                    unit_price: parseFloat(variant.selling_price),
                    purchase_price: parseFloat(variant.purchase_price),
                    subtotal: subtotal,
                    item_type: variant.item_type,
                    item_name: `${variant.item_name} (${variant.variant_name})` // Gabungkan nama untuk struk
                });

            } else {
                // Skenario 2: Item yang dijual adalah PRODUK TUNGGAL (logika lama yang disempurnakan)
                const [products] = await connection.query(
                    'SELECT product_id, item_name, item_type, selling_price, purchase_price, current_stock, has_variants, is_active FROM products WHERE product_id = ? AND is_active = true FOR UPDATE',
                    [item.product_id]
                );

                if (products.length === 0) {
                    throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan atau tidak aktif!`);
                }
                const product = products[0];

                // Pengaman: Jangan izinkan produk induk yang punya varian dijual langsung
                if (product.has_variants) {
                    throw new Error(`Produk "${product.item_name}" memiliki varian. Silakan pilih salah satu varian.`);
                }
                
                if (product.item_type === 'barang' && product.current_stock < item.quantity) {
                    throw new Error(`Stok untuk "${product.item_name}" tidak cukup! Sisa: ${product.current_stock}`);
                }

                const subtotal = parseFloat(product.selling_price) * item.quantity;
                server_calculated_total += subtotal;

                verified_item_details.push({
                    product_id: product.product_id,
                    variant_id: null, // ID varian adalah NULL untuk produk tunggal
                    quantity: item.quantity,
                    unit_price: parseFloat(product.selling_price),
                    purchase_price: parseFloat(product.purchase_price),
                    subtotal: subtotal,
                    item_type: product.item_type,
                    item_name: product.item_name
                });
            }
            // --- AKHIR LOGIKA BARU ---
        }

        if (payment_method === 'cash' && payment_received < server_calculated_total) {
            throw new Error('Jumlah pembayaran tunai kurang!');
        }

        let final_payment_received = 0;
        let change_amount = 0;

        if (payment_method === 'cash') {
            final_payment_received = payment_received;
            change_amount = payment_received - server_calculated_total;
        } else if (payment_method === 'transfer') {
            final_payment_received = server_calculated_total;
            change_amount = 0;
        }

        const transaction_code = await generateTransactionCode();

        const [transResult] = await connection.query(
            `INSERT INTO transactions (transaction_code, admin_id, total_amount, payment_method, payment_received, change_amount)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [transaction_code, req.user.user_id, server_calculated_total, payment_method, final_payment_received, change_amount]
        );

        const transaction_id = transResult.insertId;

        for (const detail of verified_item_details) {
            // MODIFIKASI: Menyimpan variant_id ke dalam tabel transaction_details
            await connection.query(
                `INSERT INTO transaction_details (transaction_id, product_id, variant_id, quantity, unit_price, purchase_price, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [transaction_id, detail.product_id, detail.variant_id, detail.quantity, detail.unit_price, detail.purchase_price, detail.subtotal]
            );

            if (detail.item_type === 'barang') {
                // MODIFIKASI: Update stok di tabel yang benar
                if (detail.variant_id) {
                    // Update stok di tabel product_variants
                    await connection.query(
                        'UPDATE product_variants SET current_stock = current_stock - ? WHERE variant_id = ?',
                        [detail.quantity, detail.variant_id]
                    );
                } else {
                    // Update stok di tabel products (untuk produk tunggal)
                    await connection.query(
                        'UPDATE products SET current_stock = current_stock - ? WHERE product_id = ?',
                        [detail.quantity, detail.product_id]
                    );
                }

                // MODIFIKASI: Mencatat variant_id di stock_movements
                await connection.query(
                    `INSERT INTO stock_movements (product_id, variant_id, movement_type, quantity, reference_type, reference_id, user_id)
                     VALUES (?, ?, 'out', ?, 'transaction', ?, ?)`,
                    [detail.product_id, detail.variant_id, detail.quantity, transaction_id, req.user.user_id]
                );
            }
        }
        
        if (payment_method === 'hutang') {
            await connection.query(
                `INSERT INTO debts (transaction_id, customer_id, amount_due, due_date, notes, status)
                 VALUES (?, ?, ?, ?, ?, 'unpaid')`,
                [transaction_id, debt_details.customer_id, server_calculated_total, debt_details.due_date || null, debt_details.notes || null]
            );
        }

        await connection.commit();

        res.status(201).json({
            success: true,
            message: 'Transaksi berhasil!',
            data: {
                transaction_id,
                transaction_code,
                transaction_date: new Date(),
                total_amount: server_calculated_total,
                payment_received: final_payment_received,
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

        if (req.user.role === 'admin' && transactions[0].admin_id !== req.user.user_id) {
            return res.status(403).json({
                success: false,
                message: 'Anda tidak memiliki akses ke transaksi ini!'
            });
        }

        const [details] = await db.query(
            `SELECT td.*, p.item_name, p.item_code, p.item_type
             FROM transaction_details td
             JOIN products p ON td.product_id = p.product_id
             WHERE td.transaction_id = ?`,
            [id]
        );

        // --- BLOK BARU UNTUK MENGGABUNGKAN NAMA VARIAN ---
        // Kita gunakan Promise.all agar query berjalan paralel dan lebih cepat
        await Promise.all(details.map(async (detail) => {
            if (detail.variant_id) {
                const [variant] = await db.query(
                    'SELECT variant_name FROM product_variants WHERE variant_id = ?',
                    [detail.variant_id]
                );
                if (variant.length > 0) {
                    // Gabungkan nama produk induk dengan nama varian
                    detail.item_name = `${detail.item_name} (${variant[0].variant_name})`;
                }
            }
        }));
        // --- AKHIR BLOK BARU ---

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

        // --- QUERY YANG DISEMPURNAKAN DENGAN LOGIKA VARIAN ---
        const [products] = await db.query(
            `SELECT 
                p.product_id,
                p.item_code,
                p.item_name,
                p.item_type,
                p.selling_price,
                p.current_stock,
                p.has_variants, -- Ambil flag has_variants
                p.is_active,
                COUNT(DISTINCT t.transaction_id) as transaction_count,
                SUM(td.quantity) as total_sold,
                -- Logika Agregat untuk produk bervarian (sama seperti di getAllProducts)
                CASE 
                    WHEN p.has_variants = TRUE THEN (
                        SELECT SUM(pv.current_stock) 
                        FROM product_variants pv 
                        WHERE pv.product_id = p.product_id AND pv.is_active = TRUE
                    )
                    ELSE p.current_stock
                END AS total_stock,
                CASE 
                    WHEN p.has_variants = TRUE THEN (
                        SELECT MIN(pv.selling_price) 
                        FROM product_variants pv 
                        WHERE pv.product_id = p.product_id AND pv.is_active = TRUE
                    )
                    ELSE p.selling_price
                END AS min_price,
                CASE 
                    WHEN p.has_variants = TRUE THEN (
                        SELECT MAX(pv.selling_price) 
                        FROM product_variants pv 
                        WHERE pv.product_id = p.product_id AND pv.is_active = TRUE
                    )
                    ELSE p.selling_price
                END AS max_price,
                CASE 
                    WHEN p.has_variants = TRUE THEN (
                        SELECT CONCAT('[', GROUP_CONCAT(JSON_OBJECT(
                            'variant_id', pv.variant_id,
                            'variant_name', pv.variant_name,
                            'selling_price', pv.selling_price,
                            'current_stock', pv.current_stock,
                            'min_stock', pv.min_stock
                        )), ']')
                        FROM product_variants pv 
                        WHERE pv.product_id = p.product_id AND pv.is_active = TRUE
                    )
                    ELSE NULL
                END AS variants_json
             FROM products p
             JOIN transaction_details td ON p.product_id = td.product_id
             JOIN transactions t ON td.transaction_id = t.transaction_id
             WHERE t.transaction_date >= DATE_SUB(NOW(), INTERVAL ? DAY)
                AND p.is_active = true
             GROUP BY p.product_id
             ORDER BY total_sold DESC
             LIMIT 10`,
            [parseInt(days)]
        );

        // Proses string JSON menjadi objek array (sama seperti di getAllProducts)
        products.forEach(p => {
            if (p.variants_json) {
                try {
                    p.variants = JSON.parse(p.variants_json);
                } catch (e) {
                    p.variants = [];
                }
            }
            delete p.variants_json;
        });
        // --- AKHIR PENYEMPURNAAN ---

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