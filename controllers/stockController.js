// controllers/stockController.js
const { db } = require('../config/database');

const getInventory = async (req, res) => {
    try {
        // Query ini menggunakan UNION ALL untuk menggabungkan dua set data:
        // 1. Produk tunggal yang tidak memiliki varian.
        // 2. Semua varian dari produk yang memiliki varian.
        const [inventoryItems] = await db.query(`
            -- Ambil semua produk tunggal (bukan produk induk)
            SELECT 
                p.product_id,
                NULL AS variant_id,
                p.item_code,
                p.item_name,
                p.current_stock,
                p.min_stock
            FROM products p
            WHERE p.item_type = 'barang' AND p.is_active = TRUE AND p.has_variants = FALSE

            UNION ALL

            -- Ambil semua varian dari produk induk yang aktif
            SELECT 
                p.product_id,
                pv.variant_id,
                pv.item_code,
                CONCAT(p.item_name, ' (', pv.variant_name, ')') AS item_name,
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