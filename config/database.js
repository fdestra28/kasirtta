// config/database.js
const mysql = require('mysql2');
require('dotenv').config();

// Buat connection pool untuk performa lebih baik
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 4, 
    queueLimit: 0,
    timezone: '+08:00'  // <-- TAMBAHKAN BARIS INI
});

// Buat promise wrapper untuk async/await
const db = pool.promise();

// Test koneksi
const testConnection = async () => {
    console.log("Mencoba menyambungkan ke database...");
    try {
        const connection = await db.getConnection();
        console.log('✅ Database terhubung!');
        connection.release();
    } catch (error) {
        console.error('❌ Error koneksi database:', error.message);
        throw error;
    }
};

// Pastikan kita mengekspor pool asli untuk bisa memanggil .end()
module.exports = { db, testConnection, pool };