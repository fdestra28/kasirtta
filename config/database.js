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
    connectionLimit: 10,
    queueLimit: 0
});

// Buat promise wrapper untuk async/await
const db = pool.promise();

// Test koneksi
const testConnection = async () => {
    // Penambahan console.log untuk debugging
    console.log("Mencoba menyambungkan ke database...");
    try {
        const connection = await db.getConnection();
        console.log('✅ Database terhubung!');
        connection.release();
    } catch (error) {
        console.error('❌ Error koneksi database:', error.message);
        throw error; // <-- LEMPAR ERROR AGAR BISA DITANGKAP
    }
};

module.exports = { db, testConnection };