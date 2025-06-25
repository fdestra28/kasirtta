// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

// Fungsi untuk generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { 
            user_id: user.user_id,
            username: user.username,
            role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
};

// Login controller
const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validasi input
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username dan password harus diisi!'
            });
        }

        // Cari user
        const [users] = await db.query(
            'SELECT * FROM users WHERE username = ? AND is_active = true',
            [username]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Username atau password salah!'
            });
        }

        const user = users[0];

        // Verifikasi password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Username atau password salah!'
            });
        }

        // Generate token
        const token = generateToken(user);

        // Response
        res.json({
            success: true,
            message: 'Login berhasil!',
            data: {
                token,
                user: {
                    user_id: user.user_id,
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role
                }
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat login!',
            error: error.message
        });
    }
};

// Get current user info
const getProfile = async (req, res) => {
    try {
        res.json({
            success: true,
            data: req.user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan!',
            error: error.message
        });
    }
};

// Create new admin (owner only)
const createAdmin = async (req, res) => {
    try {
        const { username, password, full_name } = req.body;

        // Validasi
        if (!username || !password || !full_name) {
            return res.status(400).json({
                success: false,
                message: 'Semua field harus diisi!'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert user
        const [result] = await db.query(
            'INSERT INTO users (username, password, full_name, role, created_by) VALUES (?, ?, ?, ?, ?)',
            [username, hashedPassword, full_name, 'admin', req.user.user_id]
        );

        res.status(201).json({
            success: true,
            message: 'Admin berhasil dibuat!',
            data: {
                user_id: result.insertId,
                username,
                full_name,
                role: 'admin'
            }
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'Username sudah digunakan!'
            });
        }
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan!',
            error: error.message
        });
    }
};

// Change password
const changePassword = async (req, res) => {
    try {
        const { old_password, new_password } = req.body;

        if (!old_password || !new_password) {
            return res.status(400).json({
                success: false,
                message: 'Password lama dan baru harus diisi!'
            });
        }

        // Get current password
        const [users] = await db.query(
            'SELECT password FROM users WHERE user_id = ?',
            [req.user.user_id]
        );

        // Verify old password
        const isValid = await bcrypt.compare(old_password, users[0].password);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Password lama salah!'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(new_password, 10);

        // Update password
        await db.query(
            'UPDATE users SET password = ? WHERE user_id = ?',
            [hashedPassword, req.user.user_id]
        );

        res.json({
            success: true,
            message: 'Password berhasil diubah!'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan!',
            error: error.message
        });
    }
};

// Get all users (owner only)
const getAllUsers = async (req, res) => {
    try {
        const [users] = await db.query(
            `SELECT u1.user_id, u1.username, u1.full_name, u1.role, u1.created_at, u1.is_active,
                    u2.full_name as created_by_name
             FROM users u1
             LEFT JOIN users u2 ON u1.created_by = u2.user_id
             ORDER BY u1.created_at DESC`
        );
        
        res.json({
            success: true,
            data: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data user!',
            error: error.message
        });
    }
};

// Toggle user status (owner only)
const toggleUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Cannot deactivate self
        if (parseInt(id) === req.user.user_id) {
            return res.status(400).json({
                success: false,
                message: 'Tidak bisa menonaktifkan diri sendiri!'
            });
        }
        
        // Get current status
        const [users] = await db.query(
            'SELECT is_active, role FROM users WHERE user_id = ?',
            [id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan!'
            });
        }
        
        // Cannot deactivate owner
        if (users[0].role === 'owner') {
            return res.status(400).json({
                success: false,
                message: 'Tidak bisa menonaktifkan owner!'
            });
        }
        
        const newStatus = !users[0].is_active;
        
        await db.query(
            'UPDATE users SET is_active = ? WHERE user_id = ?',
            [newStatus, id]
        );
        
        res.json({
            success: true,
            message: `User berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}!`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengubah status user!',
            error: error.message
        });
    }
};

// Update user (owner only)
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, full_name, password } = req.body;
        
        // Cannot edit self
        if (parseInt(id) === req.user.user_id) {
            return res.status(400).json({
                success: false,
                message: 'Tidak bisa mengedit diri sendiri! Gunakan menu ganti password.'
            });
        }
        
        // Check if user exists
        const [users] = await db.query(
            'SELECT role FROM users WHERE user_id = ?',
            [id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan!'
            });
        }
        
        // Cannot edit owner
        if (users[0].role === 'owner') {
            return res.status(400).json({
                success: false,
                message: 'Tidak bisa mengedit owner!'
            });
        }
        
        // Build update query
        let updateFields = [];
        let params = [];
        
        if (username) {
            // Check if username already exists
            const [existing] = await db.query(
                'SELECT user_id FROM users WHERE username = ? AND user_id != ?',
                [username, id]
            );
            
            if (existing.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Username sudah digunakan!'
                });
            }
            
            updateFields.push('username = ?');
            params.push(username);
        }
        
        if (full_name) {
            updateFields.push('full_name = ?');
            params.push(full_name);
        }
        
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateFields.push('password = ?');
            params.push(hashedPassword);
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Tidak ada data yang diupdate!'
            });
        }
        
        // Update user
        params.push(id);
        await db.query(
            `UPDATE users SET ${updateFields.join(', ')} WHERE user_id = ?`,
            params
        );
        
        res.json({
            success: true,
            message: 'User berhasil diupdate!'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengupdate user!',
            error: error.message
        });
    }
};

// Delete user (owner only)
const deleteUser = async (req, res) => {
    const connection = await db.getConnection(); // Gunakan koneksi untuk transaksi
    try {
        const { id } = req.params;

        // Tidak bisa menghapus diri sendiri
        if (parseInt(id) === req.user.user_id) {
            return res.status(400).json({
                success: false,
                message: 'Tidak bisa menghapus diri sendiri!'
            });
        }
        
        await connection.beginTransaction();

        // Cek apakah user ada dan bukan owner
        const [users] = await connection.query(
            'SELECT role FROM users WHERE user_id = ?',
            [id]
        );
        
        if (users.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'User tidak ditemukan!' });
        }
        
        if (users[0].role === 'owner') {
            await connection.rollback();
            return res.status(400).json({ success: false, message: 'Tidak bisa menghapus owner!' });
        }
        
        // --- BLOK PEMERIKSAAN AKTIVITAS YANG DISEMPURNAKAN ---
        const [transactions] = await connection.query('SELECT 1 FROM transactions WHERE admin_id = ? LIMIT 1', [id]);
        const [expenses] = await connection.query('SELECT 1 FROM expenses WHERE created_by = ? LIMIT 1', [id]);
        const [stockMovements] = await connection.query('SELECT 1 FROM stock_movements WHERE user_id = ? LIMIT 1', [id]);
        const [bookClosings] = await connection.query('SELECT 1 FROM book_closings WHERE closed_by = ? LIMIT 1', [id]);
        const [createdUsers] = await connection.query('SELECT 1 FROM users WHERE created_by = ? LIMIT 1', [id]);

        const hasActivity = transactions.length > 0 || expenses.length > 0 || stockMovements.length > 0 || bookClosings.length > 0 || createdUsers.length > 0;

        if (hasActivity) {
            // Soft delete - hanya nonaktifkan
            await connection.query(
                'UPDATE users SET is_active = false WHERE user_id = ?',
                [id]
            );
            await connection.commit();
            
            res.json({
                success: true,
                message: 'User dinonaktifkan karena memiliki riwayat aktivitas di sistem.'
            });

        } else {
            // Hard delete - Hapus permanen jika benar-benar tidak ada aktivitas
            // Karena kita sudah cek semua relasi, ini aman dilakukan.
            await connection.query('DELETE FROM users WHERE user_id = ?', [id]);
            await connection.commit();
            
            res.json({
                success: true,
                message: 'User berhasil dihapus permanen.'
            });
        }

    } catch (error) {
        await connection.rollback();
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal menghapus user!',
            error: error.message
        });
    } finally {
        if (connection) connection.release();
    }
};


// Get single user (for edit)
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [users] = await db.query(
            'SELECT user_id, username, full_name, role FROM users WHERE user_id = ?',
            [id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan!'
            });
        }
        
        res.json({
            success: true,
            data: users[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data user!',
            error: error.message
        });
    }
};

module.exports = {
    login,
    getProfile,
    createAdmin,
    changePassword,
    getAllUsers,
    toggleUserStatus,
    updateUser,
    deleteUser, // Fungsi yang baru kita perbaiki
    getUserById
};