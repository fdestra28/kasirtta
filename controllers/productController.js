// controllers/productController.js
const { db } = require('../config/database');
const { parse } = require('csv-parse'); // Untuk CSV
const xlsx = require('xlsx');           // Untuk Excel

// --- PERBAIKAN PADA DEFINISI FUNGSI ---
// Pastikan 'connection' adalah parameter pertama
const generateProductCode = async (connection, itemType) => {
    const prefix = itemType === 'barang' ? 'P' : 'J';
    const [result] = await connection.query( // Menggunakan connection
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

        // --- QUERY YANG DISEMPURNAKAN ---
        let query = `
            SELECT 
                p.*,
                CASE 
                    WHEN p.has_variants = TRUE THEN (
                        -- Ambil total stok dari semua varian aktif
                        SELECT SUM(pv.current_stock) 
                        FROM product_variants pv 
                        WHERE pv.product_id = p.product_id AND pv.is_active = TRUE
                    )
                    ELSE p.current_stock
                END AS total_stock,
                CASE 
                    WHEN p.has_variants = TRUE THEN (
                        -- Ambil harga jual terendah dari varian aktif
                        SELECT MIN(pv.selling_price) 
                        FROM product_variants pv 
                        WHERE pv.product_id = p.product_id AND pv.is_active = TRUE
                    )
                    ELSE p.selling_price
                END AS min_price,
                CASE 
                    WHEN p.has_variants = TRUE THEN (
                        -- Ambil harga jual tertinggi dari varian aktif
                        SELECT MAX(pv.selling_price) 
                        FROM product_variants pv 
                        WHERE pv.product_id = p.product_id AND pv.is_active = TRUE
                    )
                    ELSE p.selling_price
                END AS max_price,
                CASE 
                    WHEN p.has_variants = TRUE THEN (
                        -- Ambil data JSON semua varian aktif
                        SELECT CONCAT('[', GROUP_CONCAT(JSON_OBJECT(
                            'variant_id', pv.variant_id,
                            'variant_name', pv.variant_name,
                            'item_code', pv.item_code,
                            'selling_price', pv.selling_price,
                            'purchase_price', pv.purchase_price,
                            'current_stock', pv.current_stock,
                            'min_stock', pv.min_stock,
                            'is_active', pv.is_active
                        )), ']')
                        FROM product_variants pv 
                        WHERE pv.product_id = p.product_id AND pv.is_active = TRUE
                    )
                    ELSE NULL
                END AS variants_json
            FROM products p
            WHERE 1=1
        `;
        // --- AKHIR QUERY YANG DISEMPURNAKAN ---

        const params = [];

        if (search) {
            query += ' AND (p.item_name LIKE ? OR p.item_code LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        if (type && ['barang', 'jasa'].includes(type)) {
            query += ' AND p.item_type = ?';
            params.push(type);
        }
        if (active !== undefined) {
            query += ' AND p.is_active = ?';
            params.push(active === 'true');
        }

        query += ' ORDER BY p.item_name ASC';

        const [products] = await db.query(query, params);

        products.forEach(p => {
            if (p.variants_json) {
                try {
                    p.variants = JSON.parse(p.variants_json);
                } catch (e) {
                    p.variants = []; // Tangani jika GROUP_CONCAT menghasilkan NULL/kosong
                }
            }
            delete p.variants_json;
        });

        res.json({ success: true, data: products });
    } catch (error) {
        console.error("Error in getAllProducts:", error);
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

const getProductWithVariantsById = async (req, res) => {
    try {
        const { id } = req.params;
        const [products] = await db.query('SELECT * FROM products WHERE product_id = ?', [id]);
        
        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan!' });
        }

        const product = products[0];

        // Jika produk memiliki varian, ambil juga data variannya
        if (product.has_variants) {
            const [variants] = await db.query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY variant_id ASC', [id]);
            product.variants = variants;
        }

        res.json({ success: true, data: product });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal mengambil data produk dan varian!', error: error.message });
    }
};

const createProduct = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // --- MODIFIKASI DIMULAI ---
        // Kita sekarang menerima 'has_variants' dan 'variants' dari body
        const { item_name, item_type, selling_price, purchase_price, current_stock, min_stock, has_variants, variants } = req.body;
        // --- MODIFIKASI SELESAI ---

        if (!item_name || !item_type) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Nama dan jenis item harus diisi!' });
        }

        const trimmedItemName = item_name.trim();
        const [existingProduct] = await connection.query('SELECT product_id FROM products WHERE item_name = ?', [trimmedItemName]);
        if (existingProduct.length > 0) {
            await connection.rollback();
            return res.status(409).json({ success: false, message: `Nama produk "${trimmedItemName}" sudah ada!` });
        }

        const item_code = await generateProductCode(connection, item_type);

        // Insert produk induk (parent product)
        const [parentResult] = await connection.query(
            `INSERT INTO products (item_code, item_name, item_type, has_variants, selling_price, purchase_price, current_stock, min_stock) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                item_code,
                trimmedItemName,
                item_type,
                has_variants || false,
                // Jika punya varian, harga/stok di induk bisa kita set 0 atau biarkan dari inputan pertama
                has_variants ? 0 : (selling_price || 0),
                has_variants ? 0 : (purchase_price || 0),
                has_variants ? 0 : (current_stock || 0),
                min_stock || 10
            ]
        );
        const newProductId = parentResult.insertId;

        // --- LOGIKA BARU UNTUK VARIAN ---
        if (has_variants && variants && Array.isArray(variants) && variants.length > 0) {
            for (const variant of variants) {
                if (!variant.variant_name || !variant.selling_price) {
                    throw new Error('Setiap varian harus memiliki nama dan harga jual.');
                }

                const [variantResult] = await connection.query(
                    `INSERT INTO product_variants (product_id, variant_name, selling_price, purchase_price, current_stock, min_stock) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [newProductId, variant.variant_name, variant.selling_price, variant.purchase_price || 0, variant.current_stock || 0, variant.min_stock || 10]
                );
                const newVariantId = variantResult.insertId;

                // Generate dan update item_code untuk varian
                const variant_item_code = `${item_code}-${newVariantId}`;
                await connection.query('UPDATE product_variants SET item_code = ? WHERE variant_id = ?', [variant_item_code, newVariantId]);

                // Log pergerakan stok dan pengeluaran untuk setiap varian
                const stock = parseInt(variant.current_stock) || 0;
                const purchasePrice = parseFloat(variant.purchase_price) || 0;

                if (item_type === 'barang' && stock > 0) {
                    await connection.query(
                        `INSERT INTO stock_movements (product_id, variant_id, movement_type, quantity, reference_type, notes, user_id) 
                         VALUES (?, ?, 'in', ?, 'initial', 'Stok awal varian baru', ?)`,
                        [newProductId, newVariantId, stock, req.user.user_id]
                    );

                    if (purchasePrice > 0) {
                        const totalPurchaseCost = stock * purchasePrice;
                        const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
                        if (categories.length > 0) {
                            await connection.query(
                                `INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) 
                                 VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`,
                                [categories[0].category_id, `Pembelian awal: ${trimmedItemName} (${variant.variant_name})`, totalPurchaseCost, `Stok awal varian produk #${newVariantId}`, req.user.user_id]
                            );
                        }
                    }
                }
            }
        } else if (!has_variants) {
            // Logika lama untuk produk tunggal (tanpa varian)
            const stock = parseInt(current_stock) || 0;
            const purchasePrice = parseFloat(purchase_price) || 0;

            if (item_type === 'barang' && stock > 0) {
                await connection.query(
                    `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, notes, user_id) 
                     VALUES (?, 'in', ?, 'initial', 'Stok awal produk baru', ?)`,
                    [newProductId, stock, req.user.user_id]
                );

                if (purchasePrice > 0) {
                    const totalPurchaseCost = stock * purchasePrice;
                    const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
                    if (categories.length > 0) {
                        await connection.query(
                            `INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) 
                             VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`,
                            [categories[0].category_id, `Pembelian awal: ${trimmedItemName}`, totalPurchaseCost, `Stok awal produk baru #${newProductId}`, req.user.user_id]
                        );
                    }
                }
            }
        }
        // --- AKHIR LOGIKA BARU ---

        await connection.commit();
        res.status(201).json({ 
            success: true, 
            message: 'Produk berhasil ditambahkan!', 
            data: { product_id: newProductId } 
        });
    } catch (error) {
        await connection.rollback();
        console.error('Create product error:', error);
        res.status(500).json({ success: false, message: 'Gagal menambah produk!', error: error.message });
    } finally {
        if (connection) connection.release();
    }
};

const updateProduct = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;
        
        // --- MODIFIKASI DIMULAI ---
        const { item_name, is_active, variants } = req.body;
        // Harga dan stok sekarang dikelola di level varian jika has_variants=true
        // --- MODIFIKASI SELESAI ---

        const [products] = await connection.query('SELECT * FROM products WHERE product_id = ? FOR UPDATE', [id]);
        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan!' });
        }
        const product = products[0];

        // Update data produk induk
        await connection.query(
            'UPDATE products SET item_name = ?, is_active = ? WHERE product_id = ?',
            [item_name, is_active, id]
        );

        // --- LOGIKA BARU UNTUK MENGELOLA VARIAN SAAT UPDATE ---
        if (product.has_variants) {
            if (!variants || !Array.isArray(variants)) {
                throw new Error("Data varian tidak valid atau tidak ada.");
            }

            // 1. Ambil ID varian yang ada di database untuk produk ini
            const [existingVariantsResult] = await connection.query('SELECT variant_id FROM product_variants WHERE product_id = ?', [id]);
            const existingVariantIds = new Set(existingVariantsResult.map(v => v.variant_id));

            // 2. Proses varian yang datang dari frontend
            for (const variant of variants) {
                if (variant.variant_id) { // Jika ada ID, berarti UPDATE varian yang ada
                    const variantId = parseInt(variant.variant_id);
                    // Hapus dari Set agar kita tahu ini sudah diproses
                    existingVariantIds.delete(variantId); 

                    // Ambil data lama untuk perbandingan stok
                    const [oldVariant] = await connection.query('SELECT current_stock FROM product_variants WHERE variant_id = ?', [variantId]);

                    await connection.query(
                        'UPDATE product_variants SET variant_name = ?, selling_price = ?, purchase_price = ?, current_stock = ?, min_stock = ?, is_active = ? WHERE variant_id = ?',
                        [variant.variant_name, variant.selling_price, variant.purchase_price || 0, variant.current_stock || 0, variant.min_stock || 10, variant.is_active, variantId]
                    );

                    // Log pergerakan stok jika ada perubahan
                    const stockDiff = (variant.current_stock || 0) - (oldVariant[0].current_stock || 0);
                    if (stockDiff !== 0) {
                         const movementType = stockDiff > 0 ? 'in' : 'out';
                         const quantity = Math.abs(stockDiff);
                         await connection.query(
                             `INSERT INTO stock_movements (product_id, variant_id, movement_type, quantity, reference_type, notes, user_id) 
                              VALUES (?, ?, ?, ?, 'adjustment', 'Update via edit varian', ?)`,
                             [id, variantId, movementType, quantity, req.user.user_id]
                         );
                    }

                } else { // Jika tidak ada ID, berarti TAMBAH varian baru
                     const [newVariantResult] = await connection.query(
                        `INSERT INTO product_variants (product_id, variant_name, selling_price, purchase_price, current_stock, min_stock) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [id, variant.variant_name, variant.selling_price, variant.purchase_price || 0, variant.current_stock || 0, variant.min_stock || 10]
                    );
                    const newVariantId = newVariantResult.insertId;

                    // Generate dan update item_code untuk varian baru
                    const variant_item_code = `${product.item_code}-${newVariantId}`;
                    await connection.query('UPDATE product_variants SET item_code = ? WHERE variant_id = ?', [variant_item_code, newVariantId]);
                }
            }

            // 3. Hapus varian yang tidak ada lagi di data dari frontend
            // Varian yang ID-nya masih tersisa di `existingVariantIds` adalah yang harus dihapus
            for (const variantIdToDelete of existingVariantIds) {
                await connection.query('DELETE FROM product_variants WHERE variant_id = ?', [variantIdToDelete]);
            }
        }
        // --- AKHIR LOGIKA BARU ---
        
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

const getLowStockVariants = async (req, res) => {
    try {
        // PERBAIKAN: Query sekarang membandingkan pv.current_stock dengan pv.min_stock
        const [variants] = await db.query(`
            SELECT 
                pv.variant_id,
                pv.variant_name,
                pv.current_stock,
                pv.min_stock, -- Ambil juga min_stock dari varian
                p.product_id,
                p.item_name
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.product_id
            WHERE 
                p.item_type = 'barang' 
                AND p.is_active = TRUE
                AND pv.is_active = TRUE
                AND pv.current_stock <= pv.min_stock -- <-- PERUBAHAN UTAMA DI SINI
            ORDER BY pv.current_stock ASC
        `);
        res.json({ success: true, data: variants });
    } catch (error) {
        console.error("Error fetching low stock variants:", error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data stok varian rendah!', error: error.message });
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

const importProducts = async (req, res) => {
    console.log('Backend log: importProducts function started.');
    if (!req.file) {
        console.log('Backend log: No file uploaded.');
        return res.status(400).json({ success: false, message: 'Tidak ada file yang diunggah.' });
    }

    const connection = await db.getConnection();
    console.log('Backend log: Database connection obtained for import.');
    try {
        await connection.beginTransaction();
        console.log('Backend log: Database transaction started for import.');

        let productsToImport = [];
        const fileBuffer = req.file.buffer;
        const originalFilename = req.file.originalname.toLowerCase(); //ToLower untuk case-insensitive check extension
        console.log(`Backend log: Processing file: ${req.file.originalname}, Mimetype: ${req.file.mimetype}`);

        if (originalFilename.endsWith('.csv')) {
            console.log('Backend log: Attempting to parse CSV file.');
            // Menggunakan TextDecoder untuk ArrayBuffer jika reader.readAsArrayBuffer digunakan di frontend
            const csvString = Buffer.from(fileBuffer).toString('utf8'); // Lebih aman untuk konversi buffer ke string

            const records = parse(csvString, {
                columns: true, // Baris pertama CSV dianggap header
                skip_empty_lines: true,
                trim: true,
                bom: true, // Untuk menangani Byte Order Mark jika ada
                relax_column_count: true // Lebih toleran jika jumlah kolom per baris bervariasi
            });

            for await (const record of records) {
                // --- SESUAIKAN NAMA KOLOM DI BAWAH INI ---
                // Ini adalah contoh, ganti dengan nama header kolom di file CSV Anda
                const productName = record['Nama Produk'] || record['item_name'] || record['Product Name'];
                const itemType = record['Jenis'] || record['item_type'] || record['Type'];
                const sellingPrice = record['Harga Jual'] || record['selling_price'] || record['Selling Price'];
                const purchasePrice = record['Harga Beli'] || record['purchase_price'] || record['Purchase Price'];
                const currentStock = record['Stok Saat Ini'] || record['current_stock'] || record['Current Stock'];
                const minStock = record['Stok Minimal'] || record['min_stock'] || record['Min Stock'];
                // --- AKHIR PENYESUAIAN NAMA KOLOM ---

                if (productName && itemType && sellingPrice !== undefined) {
                    productsToImport.push({
                        item_name: String(productName).trim(),
                        item_type: String(itemType).trim().toLowerCase(),
                        selling_price: parseFloat(sellingPrice),
                        purchase_price: purchasePrice !== undefined && purchasePrice !== '' ? parseFloat(purchasePrice) : 0,
                        current_stock: currentStock !== undefined && currentStock !== '' ? parseInt(currentStock) : 0,
                        min_stock: minStock !== undefined && minStock !== '' ? parseInt(minStock) : 10
                    });
                } else {
                    console.warn('Backend log: Skipped CSV record due to missing essential data:', record);
                }
            }
        } else if (originalFilename.endsWith('.xlsx') || originalFilename.endsWith('.xls')) {
            console.log('Backend log: Attempting to parse Excel file.');
            const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) {
                throw new Error("Sheet pertama tidak ditemukan di file Excel.");
            }
            const worksheet = workbook.Sheets[sheetName];
            // Menggunakan sheet_to_json untuk langsung mendapatkan array of objects
            // Pastikan header di file Excel Anda tidak mengandung karakter aneh
            const jsonData = xlsx.utils.sheet_to_json(worksheet, { defval: "", rawNumbers: false }); // rawNumbers: false agar angka ter-parse

            jsonData.forEach(record => {
                // --- SESUAIKAN NAMA KOLOM DI BAWAH INI ---
                // Ini adalah contoh, ganti dengan nama header kolom di file Excel Anda
                const productName = record['Nama Produk'] || record['item_name'] || record['Product Name'];
                const itemType = record['Jenis'] || record['item_type'] || record['Type'];
                const sellingPrice = record['Harga Jual'] || record['selling_price'] || record['Selling Price'];
                const purchasePrice = record['Harga Beli'] || record['purchase_price'] || record['Purchase Price'];
                const currentStock = record['Stok Saat Ini'] || record['current_stock'] || record['Current Stock'];
                const minStock = record['Stok Minimal'] || record['min_stock'] || record['Min Stock'];
                // --- AKHIR PENYESUAIAN NAMA KOLOM ---

                if (productName && itemType && sellingPrice !== undefined) {
                    productsToImport.push({
                        item_name: String(productName).trim(),
                        item_type: String(itemType).trim().toLowerCase(),
                        selling_price: parseFloat(sellingPrice),
                        purchase_price: purchasePrice !== undefined && purchasePrice !== '' ? parseFloat(purchasePrice) : 0,
                        current_stock: currentStock !== undefined && currentStock !== '' ? parseInt(currentStock) : 0,
                        min_stock: minStock !== undefined && minStock !== '' ? parseInt(minStock) : 10
                    });
                } else {
                     console.warn('Backend log: Skipped Excel record due to missing essential data:', record);
                }
            });
        } else {
            await connection.rollback();
            console.log('Backend log: Unsupported file format.');
            return res.status(400).json({ success: false, message: 'Format file tidak didukung. Hanya CSV, XLS, atau XLSX.' });
        }

        console.log(`Backend log: Parsed ${productsToImport.length} products from file.`);
        if (productsToImport.length === 0) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Tidak ada data produk yang valid untuk diimpor dari file tersebut.' });
        }

        let importedCount = 0;
        let skippedCount = 0;
        let errors = [];

        for (const product of productsToImport) {
            // Validasi data dasar
            if (!product.item_name || !product.item_type || isNaN(product.selling_price) ||
                (product.item_type !== 'barang' && product.item_type !== 'jasa')) {
                skippedCount++;
                errors.push(`Data tidak lengkap/tipe salah untuk: ${product.item_name || 'N/A (Nama Produk Kosong)'}`);
                console.warn(`Backend log: Skipping product (incomplete/type error): ${product.item_name || 'N/A'}`);
                continue;
            }
            if (product.selling_price < 0 || product.purchase_price < 0 || product.current_stock < 0 || product.min_stock < 0) {
                skippedCount++;
                errors.push(`Nilai negatif tidak diizinkan untuk: ${product.item_name}`);
                console.warn(`Backend log: Skipping product (negative value): ${product.item_name}`);
                continue;
            }

            try {
                const [existingProduct] = await connection.query('SELECT product_id FROM products WHERE LOWER(item_name) = LOWER(?)', [product.item_name.trim()]);
                
                if (existingProduct.length > 0) {
                    skippedCount++;
                    errors.push(`Produk "${product.item_name}" sudah ada, dilewati.`);
                    console.log(`Backend log: Product "${product.item_name}" already exists, skipping.`);
                    continue;
                }

                const item_code = await generateProductCode(connection, product.item_type);
                console.log(`Backend log: Generated item_code ${item_code} for ${product.item_name}`);

                const [result] = await connection.query(
                    `INSERT INTO products (item_code, item_name, item_type, selling_price, purchase_price, current_stock, min_stock, is_active) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
                    [item_code, product.item_name, product.item_type, product.selling_price, 
                     product.item_type === 'barang' ? product.purchase_price : 0, 
                     product.item_type === 'barang' ? product.current_stock : 0, 
                     product.item_type === 'barang' ? product.min_stock : 0]
                );
                const newProductId = result.insertId;
                console.log(`Backend log: Inserted product ${product.item_name} with ID ${newProductId}`);

                // --- BLOK YANG DIPERBAIKI DIMULAI DI SINI ---
                // Logika tambahan untuk stok awal dan expense jika produk adalah 'barang'
                if (product.item_type === 'barang' && product.current_stock > 0) {
                    
                    // 1. Cek apakah ada harga beli untuk dicatat sebagai pengeluaran
                    if (product.purchase_price > 0) {
                        const totalPurchaseCost = product.current_stock * product.purchase_price;
                        
                        // 2. Cari ID kategori 'Pembelian Barang'
                        const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
                        
                        // 3. Jika kategori ditemukan, catat pengeluarannya
                        if (categories.length > 0) {
                            await connection.query(
                                `INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`,
                                [categories[0].category_id, `Pembelian dari import: ${product.item_name}`, totalPurchaseCost, `Stok awal dari import produk #${newProductId}`, req.user.user_id]
                            );
                            console.log(`Backend log: Created expense record for initial stock of ${product.item_name}`);
                        }
                    }

                    // 4. Catat pergerakan stok (ini sudah benar sebelumnya)
                    await connection.query(
                        `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, notes, user_id) VALUES (?, 'in', ?, 'initial', 'Stok awal dari import', ?)`,
                        [newProductId, product.current_stock, req.user.user_id]
                    );
                    console.log(`Backend log: Created stock_movement record for ${product.item_name}`);
                }
                // --- AKHIR BLOK YANG DIPERBAIKI ---

                importedCount++;
            } catch (dbError) {
                console.error(`Backend log: DB error during import for product "${product.item_name}":`, dbError);
                skippedCount++;
                errors.push(`Gagal impor "${product.item_name}": Periksa konsistensi data atau error database.`);
            }
        }

        await connection.commit();
        console.log('Backend log: Database transaction committed for import.');
        res.json({ 
            success: true, 
            message: `Impor selesai. Berhasil: ${importedCount}, Dilewati/Gagal: ${skippedCount}.`,
            data: { importedCount, skippedCount, errors }
        });

    } catch (error) {
        if (connection) await connection.rollback(); // Pastikan rollback jika error terjadi sebelum atau selama transaksi
        console.error('Backend log: Critical error in importProducts function:', error);
        let errorMessage = 'Gagal memproses file import.';
        if (error.message && error.message.toLowerCase().includes('csv')) {
             errorMessage = 'Format CSV tidak valid atau terjadi error saat parsing CSV.';
        } else if (error.message && error.message.toLowerCase().includes('excel')) {
             errorMessage = 'Format Excel tidak valid atau terjadi error saat parsing Excel.';
        } else if (error.message) {
            errorMessage = error.message;
        }
        res.status(500).json({ success: false, message: errorMessage, errorDetails: error.toString() });
    } finally {
        if (connection) {
            connection.release();
            console.log('Backend log: Database connection released after import attempt.');
        }
    }
};

module.exports = {
    getAllProducts,
    getProductById,
    getProductWithVariantsById,
    createProduct,
    updateProduct,
    updateStock,
    getLowStock,
    getLowStockVariants,
    deleteProduct,
    importProducts
};