// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { testConnection } = require('./config/database');
const path = require('path');

// Initialize express
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Menyajikan semua file dari folder 'public' secara statis.
app.use(express.static('public'));

// Routes API (diletakkan SETELAH express.static)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/transactions', require('./routes/transactionRoutes'));
app.use('/api/closing', require('./routes/closingRoutes')); 
app.use('/api/expenses', require('./routes/expenseRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/debts', require('./routes/debtRoutes'));
app.use('/api/stock', require('./routes/stockRoutes'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Terjadi kesalahan server!',
        error: process.env.NODE_ENV === 'production' ? err.message : {}
    });
});

console.log("Memuat rute produk dari ./routes/productRoutes ...");
// HAPUS BARIS INI - sudah didefinisikan di atas
// app.use('/api/products', require('./routes/productRoutes'));
console.log("Rute produk selesai dimuat.");

// Start server
const PORT = process.env.PORT || 3000; // Konsisten dengan environment variable
const HOST = process.env.HOST || '0.0.0.0'; // PENTING: Listen pada semua interface

// Fungsi startup yang lebih aman
const startServer = async () => {
    try {
        console.log("Mencoba menyambungkan ke database...");
        // Test database connection saat startup
        await testConnection();
        console.log("✅ Database terhubung!");

        // Jika koneksi berhasil, baru jalankan server
        // PERBAIKAN KRITIS: Listen pada 0.0.0.0, bukan localhost
        app.listen(PORT, HOST, () => {
            console.log(`🚀 Server berjalan di http://${HOST}:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Error koneksi database:", error.message);
        // Jika koneksi gagal saat startup, baru kita matikan proses
        console.error("Gagal memulai server karena koneksi database tidak berhasil.");
        process.exit(1);
    }
};

startServer();