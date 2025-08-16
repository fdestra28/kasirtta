// controllers/productController.js
const { db } = require('../config/database');
const { getFromCache, setInCache, clearCache } = require('../utils/cache'); // 
const { parse } = require('csv-parse'); // Untuk CSV
const xlsx = require('xlsx');           // Untuk Excel

const PRODUCTS_CACHE_KEY = 'all_products_list';

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

        // --- Logika Cache ---
        // Kita hanya akan menggunakan cache jika tidak ada filter pencarian/tipe,
        // dan hanya untuk mengambil produk yang aktif (kasus paling umum di halaman kasir).
        const isCacheable = !search && !type && (active === 'true' || active === undefined);
        
        if (isCacheable) {
            const cachedProducts = getFromCache(PRODUCTS_CACHE_KEY);
            if (cachedProducts) {
                return res.json({ success: true, data: cachedProducts, fromCache: true });
            }
        }
        // --- Akhir Logika Cache ---

        // Query SQL yang sudah disempurnakan (tidak berubah)
        let query = `
            SELECT 
                p.*,
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
                    p.variants = [];
                }
            }
            delete p.variants_json;
        });

        // --- Logika Penyimpanan Cache ---
        // Simpan hasil ke cache HANYA jika query-nya cacheable
        if (isCacheable) {
            setInCache(PRODUCTS_CACHE_KEY, products);
        }
        // --- Akhir Logika Penyimpanan Cache ---

        res.json({ success: true, data: products, fromCache: false });
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
        clearCache(PRODUCTS_CACHE_KEY);
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
        const { item_name, is_active, selling_price, purchase_price, min_stock, has_variants, variants } = req.body;

        const [products] = await connection.query('SELECT * FROM products WHERE product_id = ? FOR UPDATE', [id]);
        if (products.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan!' });
        }
        const product = products[0];

        if (product.has_variants) {
            // Logika untuk PRODUK DENGAN VARIAN (sudah benar, tidak perlu diubah)
            await connection.query(
                'UPDATE products SET item_name = ?, is_active = ? WHERE product_id = ?',
                [item_name, is_active === undefined ? product.is_active : is_active, id]
            );

            if (!variants || !Array.isArray(variants)) {
                throw new Error("Data varian tidak valid atau tidak ada.");
            }
            
            const [existingVariantsResult] = await connection.query('SELECT variant_id FROM product_variants WHERE product_id = ?', [id]);
            const existingVariantIds = new Set(existingVariantsResult.map(v => v.variant_id));

            for (const variant of variants) {
                if (variant.variant_id) { 
                    const variantId = parseInt(variant.variant_id);
                    existingVariantIds.delete(variantId); 

                    const [oldVariantResult] = await connection.query('SELECT current_stock, purchase_price FROM product_variants WHERE variant_id = ?', [variantId]);
                    
                    if (!oldVariantResult || oldVariantResult.length === 0) {
                        throw new Error(`Varian dengan ID ${variantId} yang coba diupdate tidak ditemukan di database.`);
                    }
                    const oldVariant = oldVariantResult[0];

                    await connection.query(
                        'UPDATE product_variants SET variant_name = ?, selling_price = ?, purchase_price = ?, current_stock = ?, min_stock = ?, is_active = ? WHERE variant_id = ?',
                        [variant.variant_name, variant.selling_price, variant.purchase_price || 0, variant.current_stock || 0, variant.min_stock || 10, variant.is_active, variantId]
                    );

                    const stockDiff = (variant.current_stock || 0) - (oldVariant.current_stock || 0);
                    if (stockDiff !== 0) {
                         const movementType = stockDiff > 0 ? 'in' : 'out';
                         const quantity = Math.abs(stockDiff);
                         await connection.query(
                             `INSERT INTO stock_movements (product_id, variant_id, movement_type, quantity, reference_type, notes, user_id) 
                              VALUES (?, ?, ?, ?, 'manual', 'Update via edit varian', ?)`, // Di sini juga kita gunakan 'manual'
                             [id, variantId, movementType, quantity, req.user.user_id]
                         );

                        if (stockDiff > 0 && (variant.purchase_price || 0) > 0) {
                            const totalPurchaseCost = stockDiff * variant.purchase_price;
                            const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
                            if (categories.length > 0) {
                                await connection.query(
                                    `INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) 
                                     VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`,
                                    [categories[0].category_id, `Penambahan stok (edit): ${product.item_name} (${variant.variant_name})`, totalPurchaseCost, `Penambahan stok dari menu edit varian #${variantId}`, req.user.user_id]
                                );
                            }
                        }
                    }
                } else { 
                     const [newVariantResult] = await connection.query(
                        `INSERT INTO product_variants (product_id, variant_name, selling_price, purchase_price, current_stock, min_stock) 
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [id, variant.variant_name, variant.selling_price, variant.purchase_price || 0, variant.current_stock || 0, variant.min_stock || 10]
                    );
                    const newVariantId = newVariantResult.insertId;
                    const variant_item_code = `${product.item_code}-${newVariantId}`;
                    await connection.query('UPDATE product_variants SET item_code = ? WHERE variant_id = ?', [variant_item_code, newVariantId]);
                }
            }
            for (const variantIdToDelete of existingVariantIds) {
                await connection.query('DELETE FROM product_variants WHERE variant_id = ?', [variantIdToDelete]);
            }
        } else {
            // Logika untuk PRODUK TUNGGAL (TANPA VARIAN)
            let updateFields = [];
            let params = [];

            if (item_name !== undefined) {
                updateFields.push('item_name = ?');
                params.push(item_name);
            }
            if (selling_price !== undefined) {
                updateFields.push('selling_price = ?');
                params.push(selling_price);
            }
            const newPurchasePrice = parseFloat(purchase_price) || product.purchase_price;
            if (purchase_price !== undefined) {
                updateFields.push('purchase_price = ?');
                params.push(newPurchasePrice);
            }
            
            const newStockBody = req.body.current_stock;
            if (newStockBody !== undefined && product.item_type === 'barang') {
                const currentStock = parseInt(newStockBody, 10);
                const stockDiff = currentStock - product.current_stock;
                
                if (stockDiff !== 0) {
                    updateFields.push('current_stock = ?');
                    params.push(currentStock);
                    
                    const movementType = stockDiff > 0 ? 'in' : 'out';
                    const quantity = Math.abs(stockDiff);
                    
                    // =================== PERBAIKAN DI SINI ===================
                    // Nilai 'adjustment' diubah menjadi 'manual'
                    await connection.query(
                        `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, notes, user_id) 
                         VALUES (?, ?, ?, 'manual', 'Update via edit produk', ?)`,
                        [id, movementType, quantity, req.user.user_id]
                    );
                    // =========================================================
                    
                    if (stockDiff > 0 && newPurchasePrice > 0) {
                        const totalPurchaseCost = stockDiff * newPurchasePrice;
                        const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
                        if (categories.length > 0) {
                            await connection.query(
                                `INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) 
                                 VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`,
                                [categories[0].category_id, `Penambahan stok (edit): ${product.item_name}`, totalPurchaseCost, `Stok dari edit produk #${id}`, req.user.user_id]
                            );
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
            
            if (updateFields.length > 0) {
                params.push(id);
                await connection.query(`UPDATE products SET ${updateFields.join(', ')} WHERE product_id = ?`, params);
            }
        }
        
        await connection.commit();
        clearCache(PRODUCTS_CACHE_KEY);
        res.json({ success: true, message: 'Produk berhasil diupdate!' });

    } catch (error) {
        await connection.rollback();
        console.error('Update product error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengupdate produk!', error: error.message });
    } finally {
        if (connection) connection.release();
    }
};

const updateStock = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { id } = req.params;
        const { quantity, type, notes, variant_id } = req.body;
        
        if (!quantity || !type || !['in', 'out', 'adjustment'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Quantity dan type (in/out/adjustment) harus diisi dengan benar!' });
        }
        const parsedQuantity = parseInt(quantity);
        if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
            return res.status(400).json({ success: false, message: 'Quantity harus berupa angka positif.' });
        }
        
        await connection.beginTransaction();

        if (variant_id) {
            // Skenario 1: Update stok varian
            const [variants] = await connection.query(
                `SELECT v.variant_id, v.variant_name, v.current_stock, v.purchase_price, p.item_name 
                 FROM product_variants v
                 JOIN products p ON v.product_id = p.product_id
                 WHERE v.variant_id = ? FOR UPDATE`, 
                [variant_id]
            );
            if (variants.length === 0) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'Varian produk tidak ditemukan!' });
            }
            const variant = variants[0];
            let newStock = variant.current_stock;

            if (type === 'in') newStock += parsedQuantity;
            else if (type === 'out') newStock -= parsedQuantity;
            else newStock = parsedQuantity;

            if (newStock < 0) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Stok tidak boleh negatif!' });
            }

            await connection.query('UPDATE product_variants SET current_stock = ? WHERE variant_id = ?', [newStock, variant_id]);
            await connection.query(
                `INSERT INTO stock_movements (product_id, variant_id, movement_type, quantity, reference_type, notes, user_id) 
                 VALUES (?, ?, ?, ?, 'manual', ?, ?)`, 
                [id, variant_id, type, parsedQuantity, notes || `Stok ${type} manual`, req.user.user_id]
            );
            
            // --- BLOK BARU UNTUK MENCATAT PENGELUARAN ---
            if (type === 'in' && variant.purchase_price > 0) {
                const totalPurchaseCost = parsedQuantity * variant.purchase_price;
                const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
                if (categories.length > 0) {
                    await connection.query(
                        `INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) 
                         VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`,
                        [categories[0].category_id, `Penambahan stok: ${variant.item_name} (${variant.variant_name})`, totalPurchaseCost, notes || `Stok masuk manual varian #${variant_id}`, req.user.user_id]
                    );
                }
            }
            // --- AKHIR BLOK BARU ---

        } else {
            // Skenario 2: Update stok produk tunggal
            const [products] = await connection.query('SELECT product_id, item_name, current_stock, purchase_price FROM products WHERE product_id = ? AND item_type = "barang" AND has_variants = FALSE FOR UPDATE', [id]);
            if (products.length === 0) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'Produk tunggal tidak ditemukan atau memiliki varian!' });
            }
            const product = products[0];
            let newStock = product.current_stock;
            
            if (type === 'in') newStock += parsedQuantity;
            else if (type === 'out') newStock -= parsedQuantity;
            else newStock = parsedQuantity;

            if (newStock < 0) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: 'Stok tidak boleh negatif!' });
            }
            
            await connection.query('UPDATE products SET current_stock = ? WHERE product_id = ?', [newStock, id]);
            await connection.query(
                `INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, notes, user_id) 
                 VALUES (?, ?, ?, 'manual', ?, ?)`, 
                [id, type, parsedQuantity, notes || `Stok ${type} manual`, req.user.user_id]
            );

            // --- BLOK BARU UNTUK MENCATAT PENGELUARAN ---
            if (type === 'in' && product.purchase_price > 0) {
                const totalPurchaseCost = parsedQuantity * product.purchase_price;
                const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
                if (categories.length > 0) {
                    await connection.query(
                        `INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) 
                         VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`,
                        [categories[0].category_id, `Penambahan stok: ${product.item_name}`, totalPurchaseCost, notes || `Stok masuk manual produk #${id}`, req.user.user_id]
                    );
                }
            }
            // --- AKHIR BLOK BARU ---
        }
        
        await connection.commit();
        clearCache(PRODUCTS_CACHE_KEY);
        res.json({ success: true, message: 'Stok berhasil diupdate!' });

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
            clearCache(PRODUCTS_CACHE_KEY); 
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
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Tidak ada file yang diunggah.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        let rawRecords = [];
        const fileBuffer = req.file.buffer;
        const originalFilename = req.file.originalname.toLowerCase();

        if (originalFilename.endsWith('.csv')) {
            const csvString = Buffer.from(fileBuffer).toString('utf8');
            const parser = parse(csvString, { columns: true, skip_empty_lines: true, trim: true, bom: true });
            for await (const record of parser) {
                rawRecords.push(record);
            }
        } else if (originalFilename.endsWith('.xlsx') || originalFilename.endsWith('.xls')) {
            const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            rawRecords = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
        } else {
            throw new Error('Format file tidak didukung. Hanya CSV, XLS, atau XLSX.');
        }

        if (rawRecords.length === 0) {
            return res.status(400).json({ success: false, message: 'Tidak ada data produk yang valid untuk diimpor.' });
        }

        let importedCount = 0;
        let skippedCount = 0;
        let errors = [];
        let lastParentProductId = null;

        for (let i = 0; i < rawRecords.length; i++) {
            const record = rawRecords[i];
            
            const itemName = (record['item_name'] || record['Nama Produk'] || '').trim();
            const itemType = (record['item_type'] || record['Jenis'] || '').trim();
            const variantName = (record['variant_name'] || record['Nama Varian'] || '').trim();
            const sellingPrice = record['selling_price'] || record['Harga Jual'];
            const purchasePrice = parseFloat(record['purchase_price'] || record['Harga Beli'] || 0);
            const currentStock = parseInt(record['current_stock'] || record['Stok Saat Ini'] || 0);
            const minStock = parseInt(record['min_stock'] || record['Stok Minimal'] || 10);

            if (itemName) { // Ini adalah baris Produk Induk atau Produk Tunggal
                const [existingProduct] = await connection.query('SELECT product_id FROM products WHERE item_name = ?', [itemName]);
                if (existingProduct.length > 0) {
                    skippedCount++;
                    errors.push(`Produk "${itemName}" sudah ada, dilewati.`);
                    lastParentProductId = null;
                    continue;
                }

                let hasVariants = false;
                if (i + 1 < rawRecords.length) {
                    const nextRecord = rawRecords[i + 1];
                    const nextItemName = (nextRecord['item_name'] || nextRecord['Nama Produk'] || '').trim();
                    const nextVariantName = (nextRecord['variant_name'] || nextRecord['Nama Varian'] || '').trim();
                    if (!nextItemName && nextVariantName) {
                        hasVariants = true;
                    }
                }

                const item_code = await generateProductCode(connection, itemType);
                const [parentResult] = await connection.query(
                    `INSERT INTO products (item_code, item_name, item_type, has_variants, selling_price, purchase_price, current_stock, min_stock) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [item_code, itemName, itemType, hasVariants, hasVariants ? 0 : (sellingPrice || 0), hasVariants ? 0 : (purchasePrice || 0), hasVariants ? 0 : (currentStock || 0), minStock || 10]
                );
                lastParentProductId = parentResult.insertId;
                importedCount++;
                
                // --- BLOK BARU: CATAT PENGELUARAN UNTUK PRODUK TUNGGAL ---
                if (!hasVariants && itemType === 'barang' && currentStock > 0 && purchasePrice > 0) {
                    const totalPurchaseCost = currentStock * purchasePrice;
                    const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
                    if (categories.length > 0) {
                        await connection.query(
                            `INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) 
                             VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`,
                            [categories[0].category_id, `Pembelian dari import: ${itemName}`, totalPurchaseCost, `Stok awal dari import produk #${lastParentProductId}`, req.user.user_id]
                        );
                    }
                }
                // --- AKHIR BLOK BARU ---

            } else if (variantName && lastParentProductId) { // Ini adalah baris Varian
                const [variantResult] = await connection.query(
                    `INSERT INTO product_variants (product_id, variant_name, selling_price, purchase_price, current_stock, min_stock) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [lastParentProductId, variantName, sellingPrice || 0, purchasePrice || 0, currentStock || 0, minStock || 10]
                );
                const newVariantId = variantResult.insertId;
                
                const [parentCodeResult] = await connection.query('SELECT item_code, item_name FROM products WHERE product_id = ?', [lastParentProductId]);
                if (parentCodeResult && parentCodeResult.length > 0) {
                    const parent = parentCodeResult[0];
                    const variant_item_code = `${parent.item_code}-${newVariantId}`;
                    await connection.query('UPDATE product_variants SET item_code = ? WHERE variant_id = ?', [variant_item_code, newVariantId]);
                    
                    // --- BLOK BARU: CATAT PENGELUARAN UNTUK VARIAN ---
                    if (itemType === 'barang' && currentStock > 0 && purchasePrice > 0) {
                         const totalPurchaseCost = currentStock * purchasePrice;
                         const [categories] = await connection.query(`SELECT category_id FROM expense_categories WHERE category_name = 'Pembelian Barang' LIMIT 1`);
                         if (categories.length > 0) {
                             await connection.query(
                                 `INSERT INTO expenses (expense_date, category_id, description, amount, payment_method, notes, created_by) 
                                  VALUES (NOW(), ?, ?, ?, 'cash', ?, ?)`,
                                 [categories[0].category_id, `Pembelian dari import: ${parent.item_name} (${variantName})`, totalPurchaseCost, `Stok awal dari import varian #${newVariantId}`, req.user.user_id]
                             );
                         }
                    }
                    // --- AKHIR BLOK BARU ---
                }
            }
        }

        await connection.commit();
        clearCache(PRODUCTS_CACHE_KEY);
        res.json({ 
            success: true, 
            message: `Impor selesai. Berhasil: ${importedCount} produk induk, Dilewati/Gagal: ${skippedCount}.`,
            data: { importedCount, skippedCount, errors }
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Import product error:', error);
        res.status(500).json({ success: false, message: 'Gagal memproses file import.', errorDetails: error.toString() });
    } finally {
        if (connection) connection.release();
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