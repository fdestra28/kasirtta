// controllers/stockController.js
const { db } = require('../config/database');

const getInventory = async (req, res) => {
    try {
        // [PERBAIKAN] Query ini secara eksplisit menyamakan collation
        // untuk kolom-kolom yang akan digabungkan untuk menghindari error
        // 'Illegal mix of collations'.
        const [inventoryItems] = await db.query(`
            SELECT 
                p.product_id,
                NULL AS variant_id,
                p.item_code,
                p.item_name COLLATE utf8mb4_unicode_ci AS item_name, -- [PERBAIKAN] Menyamakan collation
                p.current_stock,
                p.min_stock
            FROM products p
            WHERE p.item_type = 'barang' AND p.is_active = TRUE AND p.has_variants = FALSE

            UNION ALL

            SELECT 
                p.product_id,
                pv.variant_id,
                pv.item_code,
                CONCAT(p.item_name, ' (', pv.variant_name, ')') COLLATE utf8mb4_unicode_ci AS item_name, -- [PERBAIKAN] Menyamakan collation
                pv.current_stock,
                pv.min_stock
            FROM product_variants pv
            JOIN products p ON pv.product_id = p.product_id
            WHERE p.item_type = 'barang' AND p.is_active = TRUE AND pv.is_active = TRUE
            
            ORDER BY item_name ASC
        `);
        
        res.json({ success: true, data: inventoryItems });

    } catch (error) {
        console.error("Error fetching inventory:", error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data inventaris!', error: error.message });
    }
};

module.exports = {
    getInventory
};