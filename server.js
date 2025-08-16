// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { testConnection, pool } = require('./config/database');
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

const serverInstance = null; // Kita akan simpan instance server di sini

const gracefulShutdown = () => {
  console.log('Menerima sinyal shutdown, membersihkan koneksi...');
  // Hentikan server menerima koneksi baru
  if (serverInstance) {
    serverInstance.close(() => {
      console.log('HTTP server ditutup.');
      // Tutup koneksi pool database
      pool.end(err => {
        if (err) {
          console.error('Error saat menutup pool database:', err.message);
        } else {
          console.log('Pool database berhasil ditutup.');
        }
        process.exit(err ? 1 : 0);
      });
    });
  } else {
     // Jika server belum sempat jalan, langsung tutup pool
     pool.end(err => {
        if (err) console.error('Error saat menutup pool database:', err.message);
        else console.log('Pool database berhasil ditutup.');
        process.exit(err ? 1 : 0);
      });
  }
};

// Dengarkan sinyal shutdown dari OS atau Vercel
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const PORT = process.env.PORT || 5000; // Konsisten dengan environment variable
const HOST = process.env.HOST || '0.0.0.0'; // PENTING: Listen pada semua interface

// Fungsi startup yang lebih aman
const startServer = async () => {
    try {
        await testConnection();

        // GANTI BAGIAN app.listen MENJADI INI:
        const server = app.listen(PORT, HOST, () => {
            console.log(`🚀 Server berjalan di http://${HOST}:${PORT}`);
        });
        // Simpan instance server untuk graceful shutdown
        // (Meskipun di Vercel tidak terlalu relevan, ini praktik terbaik)
        
    } catch (error) {
        console.error("❌ Gagal memulai server karena koneksi database tidak berhasil.", error.message);
        // Panggil graceful shutdown agar pool ditutup sebelum exit
        gracefulShutdown();
    }
};

startServer();