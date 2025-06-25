// controllers/productController.js
const { db } = require('../config/database');

// --- PERBAIKAN PADA DEFINISI FUNGSI ---
// Pastikan 'connection' adalah parameter pertama
const generateProductCode = async (connection, itemType) => {
    const prefix = itemType === 'barang' ? 'P' : 'J';
    // Query ini sekarang menggunakan 'connection' yang dilewatkan, bukan 'db' global.
    const [result] = await connection.query(
        `SELECT item_code FROM products 
         WHERE item_type = ? AND item_code LIKE ?
         ORDER BY CAST(SUBSTRING(item_code, 2) AS UNSIGNED) DESC 
         LIMIT 1`,
        [itemType, prefix + '%']
    );
    let nextNumber = 1;
    if (result.length > 0 && result[0].item_code) {
        const currentNumber = parseInt(result[0].item_code.substring(1));
        nextNumber = currentNumber + 1;
    }
    return `${prefix}${String(nextNumber).padStart(3, '0')}`;
};

// ... (getAllProducts dan getProductById tetap sama, tidak perlu diubah)
const getAllProducts = async (req, res) => {
    try {
        const { search, type, active } = req.query;
        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        if (search) {
            query += ' AND (item_name LIKE ? OR item_code LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (type && ['barang', 'jasa'].includes(type)) {
            query += ' AND item_type = ?';
            params.push(type);
        }
        if (active !== undefined) {
            query += ' AND is_active = ?';
            params.push(active === 'true');
        }
        query += ' ORDER BY item_name ASC';
        const [products] = await db.query(query, params);
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal mengambil data produk!', error: error.message });
    }
};
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const [products] = await db.query('SELECT * FROM products WHERE product_id = ?', [id]);
        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan!' });
        }
        res.json({ success: true, data: products[0] });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal mengambil data produk!', error: error.message });
    }
};


const createProduct = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { item_name, item_type, selling_price, purchase_price, current_stock, min_stock } = req.body;
        if (!item_name || !item_type || !selling_price) {
            return res.status(400).json({ success: false, message: 'Nama, jenis, dan harga jual harus diisi!' });
        }

        const trimmedItemName = item_name.trim();
        const [existingProduct] = await connection.query('SELECT product_id FROM products WHERE item_name = ?', [trimmedItemName]);
        if (existingProduct.length > 0) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: `Nama produk "${trimmedItemName}" sudah ada!` });
        }
        
        // --- PERBAIKAN PADA PEMANGGILAN FUNGSI ---
        // Pastikan kita memanggilnya dengan benar: (koneksi, tipe_item)
        const item_code = await generateProductCode(connection, item_type);
        
        const stock = item_type === 'jasa' ? 0 : (parseInt(current_stock) || 0);
        const minStock = item_type === 'jasa' ? 0 : (parseInt(min_stock) || 10);
        const purchasePrice = parseFloat(purchase_price) || 0;

        const [result] = await connection.query(
            `INSERT INTO products (item_code, item_name, item_type, selling_price, purchase_price, current_stock, min_stock) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [item_code, trimmedItemName, item_type, selling_price, purchasePrice, stock, minStock]
        );
        const newProductId = result.insertId;

        if (item_type === 'barang' && stock > 0 && purchasePrice > 0) {
            const totalPurchaseCost = stock * purchasePrice;
            const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
            if (categories.length > 0) {
                await connection.query(
                    `INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`,
                    [categories[0].category_id, `Pembelian awal: ${trimmedItemName}`, totalPurchaseCost, `Stok awal produk baru #${newProductId}`, req.user.user_id]
                );
            }
        }
        if (item_type === 'barang' && stock > 0) {
            await connection.query(
                `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, notes, user_id) VALUES (?, 'in', ?, 'initial', 'Stok awal produk baru', ?)`,
                [newProductId, stock, req.user.user_id]
            );
        }
        await connection.commit();
        res.status(201).json({ success: true, message: 'Produk berhasil ditambahkan!', data: { product_id: newProductId, item_code, item_name: trimmedItemName, item_type, selling_price, purchase_price: purchasePrice, current_stock: stock } });
    } catch (error) {
        await connection.rollback();
        console.error('Create product error (transaction rolled back):', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Terjadi konflik kode produk. Silakan coba lagi.' });
        }
        res.status(500).json({ success: false, message: 'Gagal menambah produk!', error: error.message });
    } finally {
        if (connection) connection.release();
    }
};


// ... (sisa fungsi lain seperti updateProduct, updateStock, dll. tetap sama) ...
const updateProduct = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        const { item_name, selling_price, purchase_price, current_stock, min_stock, is_active } = req.body;
        const [products] = await connection.query('SELECT * FROM products WHERE product_id = ? FOR UPDATE', [id]);
        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan!' });
        }
        const product = products[0];
        let updateFields = [];
        let params = [];
        if (item_name !== undefined) {
            updateFields.push('item_name = ?');
            params.push(item_name);
        }
        if (selling_price !== undefined) {
            if (req.user.role !== 'owner') {
                await connection.rollback();
                return res.status(403).json({ success: false, message: 'Hanya owner yang bisa mengubah harga!' });
            }
            updateFields.push('selling_price = ?');
            params.push(selling_price);
        }
        const newPurchasePrice = parseFloat(purchase_price) || product.purchase_price;
        if (purchase_price !== undefined) {
            if (req.user.role !== 'owner') {
                await connection.rollback();
                return res.status(403).json({ success: false, message: 'Hanya owner yang bisa mengubah harga!' });
            }
            updateFields.push('purchase_price = ?');
            params.push(newPurchasePrice);
        }
        if (current_stock !== undefined && product.item_type === 'barang') {
            const stockDiff = parseInt(current_stock) - product.current_stock;
            if (stockDiff !== 0) {
                updateFields.push('current_stock = ?');
                params.push(current_stock);
                const movementType = stockDiff > 0 ? 'in' : 'out';
                const quantity = Math.abs(stockDiff);
                await connection.query(`INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, notes, user_id) VALUES (?, ?, ?, 'adjustment', 'Update via edit produk', ?)`, [id, movementType, quantity, req.user.user_id]);
                if (stockDiff > 0 && newPurchasePrice > 0) {
                    const totalPurchaseCost = stockDiff * newPurchasePrice;
                    const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
                    if (categories.length > 0) {
                        const purchaseCategoryId = categories[0].category_id;
                        await connection.query(`INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`, [purchaseCategoryId, `Penambahan stok (edit): ${product.item_name}`, totalPurchaseCost, `Penambahan stok dari menu edit produk #${id}`, req.user.user_id]);
                    }
                }
            }
        }
        if (min_stock !== undefined && product.item_type === 'barang') {
            updateFields.push('min_stock = ?');
            params.push(min_stock);
        }
        if (is_active !== undefined) {
            updateFields.push('is_active = ?');
            params.push(is_active);
        }
        if (updateFields.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Tidak ada data yang diupdate!' });
        }
        params.push(id);
        await connection.query(`UPDATE products SET ${updateFields.join(', ')} WHERE product_id = ?`, params);
        await connection.commit();
        res.json({ success: true, message: 'Produk berhasil diupdate!' });
    } catch (error) {
        await connection.rollback();
        console.error('Update product error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengupdate produk!', error: error.message });
    } finally {
        connection.release();
    }
};
const updateStock = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;
        const { quantity, type, notes } = req.body;
        if (!quantity || !type || !['in', 'out', 'adjustment'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Quantity dan type (in/out/adjustment) harus diisi dengan benar!' });
        }
        const parsedQuantity = parseInt(quantity);
        if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
            return res.status(400).json({ success: false, message: 'Quantity harus berupa angka positif.' });
        }
        await connection.beginTransaction();
        const [products] = await connection.query('SELECT product_id, item_name, current_stock, purchase_price FROM products WHERE product_id = ? AND item_type = "barang" FOR UPDATE', [id]);
        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan atau bukan barang!' });
        }
        const product = products[0];
        let newStock = product.current_stock;
        if (type === 'in') {
            newStock += parsedQuantity;
        } else if (type === 'out') {
            newStock -= parsedQuantity;
        } else {
            newStock = parsedQuantity;
        }
        if (newStock < 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Stok tidak boleh negatif!' });
        }
        await connection.query('UPDATE products SET current_stock = ? WHERE product_id = ?', [newStock, id]);
        await connection.query(`INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, notes, user_id) VALUES (?, ?, ?, 'manual', ?, ?)`, [id, type, parsedQuantity, notes || `Stok ${type} manual`, req.user.user_id]);
        if (type === 'in' && product.purchase_price > 0) {
            const totalPurchaseCost = parsedQuantity * product.purchase_price;
            const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
            if (categories.length > 0) {
                const purchaseCategoryId = categories[0].category_id;
                await connection.query(`INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`, [purchaseCategoryId, `Penambahan stok: ${product.item_name}`, totalPurchaseCost, notes || `Penambahan stok manual produk #${id}`, req.user.user_id]);
            }
        }
        await connection.commit();
        res.json({ success: true, message: 'Stok berhasil diupdate!', data: { product_id: id, old_stock: product.current_stock, new_stock: newStock } });
    } catch (error) {
        await connection.rollback();
        console.error('Update stock error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengupdate stok!', error: error.message });
    } finally {
        connection.release();
    }
};
const getLowStock = async (req, res) => {
    try {
        const [products] = await db.query(`SELECT * FROM products WHERE item_type = 'barang' AND current_stock <= min_stock AND is_active = true ORDER BY current_stock ASC`);
        res.json({ success: true, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal mengambil data stok rendah!', error: error.message });
    }
};
const deleteProduct = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;
        await connection.beginTransaction();
        const [products] = await connection.query('SELECT * FROM products WHERE product_id = ?', [id]);
        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan!' });
        }
        const [transactions] = await connection.query('SELECT COUNT(*) as count FROM transaction_details WHERE product_id = ?', [id]);
        if (transactions[0].count > 0) {
            await connection.query('UPDATE products SET is_active = false WHERE product_id = ?', [id]);
            await connection.commit();
            res.json({ success: true, message: 'Produk dinonaktifkan karena sudah pernah digunakan dalam transaksi' });
        } else {
            await connection.query('DELETE FROM stock_movements WHERE product_id = ?', [id]);
            await connection.query('DELETE FROM products WHERE product_id = ?', [id]);
            await connection.commit();
            res.json({ success: true, message: 'Produk berhasil dihapus' });
        }
    } catch (error) {
        await connection.rollback();
        console.error('Delete product error:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus produk!', error: error.message });
    } finally {
        connection.release();
    }
};


module.exports = {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    updateStock,
    getLowStock,
    deleteProduct
};