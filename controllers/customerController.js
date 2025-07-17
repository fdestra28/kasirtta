// controllers/customerController.js
const { db } = require('../config/database');

// Fungsi untuk mencari customer berdasarkan nama atau no. telp
const searchCustomers = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.json({ success: true, data: [] });
        }

        const [customers] = await db.query(
            "SELECT * FROM customers WHERE (full_name LIKE ? OR phone_number LIKE ?) AND is_active = true LIMIT 10",
            [`%${query}%`, `%${query}%`]
        );

        res.json({ success: true, data: customers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal mencari pelanggan!', error: error.message });
    }
};

// Fungsi untuk membuat customer baru
const createCustomer = async (req, res) => {
    try {
        const { full_name, phone_number, address } = req.body;
        if (!full_name) {
            return res.status(400).json({ success: false, message: 'Nama lengkap pelanggan harus diisi!' });
        }

        const [result] = await db.query(
            "INSERT INTO customers (full_name, phone_number, address) VALUES (?, ?, ?)",
            [full_name, phone_number, address]
        );

        const newCustomerId = result.insertId;
        res.status(201).json({
            success: true,
            message: 'Pelanggan baru berhasil ditambahkan!',
            data: {
                customer_id: newCustomerId,
                full_name,
                phone_number,
                address
            }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'Nomor telepon sudah terdaftar.' });
        }
        res.status(500).json({ success: false, message: 'Gagal membuat pelanggan!', error: error.message });
    }
};

module.exports = {
    searchCustomers,
    createCustomer
};