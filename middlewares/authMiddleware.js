// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

// Middleware untuk verifikasi JWT token
const verifyToken = async (req, res, next) => {
    try {
        // Ambil token dari header
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token tidak ditemukan!'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Get user dari database
        const [users] = await db.query(
            'SELECT user_id, username, full_name, role FROM users WHERE user_id = ? AND is_active = true',
            [decoded.user_id]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'User tidak valid!'
            });
        }

        // Simpan user info di request
        req.user = users[0];
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Token tidak valid!',
            error: error.message
        });
    }
};

// Middleware untuk cek role owner
const ownerOnly = (req, res, next) => {
    if (req.user.role !== 'owner') {
        return res.status(403).json({
            success: false,
            message: 'Akses ditolak! Hanya owner yang bisa mengakses.'
        });
    }
    next();
};

// Middleware untuk cek role admin atau owner
const adminOrOwner = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'owner') {
        return res.status(403).json({
            success: false,
            message: 'Akses ditolak!'
        });
    }
    next();
};

module.exports = { verifyToken, ownerOnly, adminOrOwner };