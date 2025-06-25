// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, ownerOnly } = require('../middlewares/authMiddleware');

// Public routes
router.post('/login', authController.login);

// Protected routes
router.get('/profile', verifyToken, authController.getProfile);
router.post('/change-password', verifyToken, authController.changePassword);

// Owner only routes
router.post('/create-admin', verifyToken, ownerOnly, authController.createAdmin);
router.get('/users', verifyToken, ownerOnly, authController.getAllUsers);
router.get('/users/:id', verifyToken, ownerOnly, authController.getUserById);  // Tambah ini
router.put('/users/:id', verifyToken, ownerOnly, authController.updateUser);   // Tambah ini
router.delete('/users/:id', verifyToken, ownerOnly, authController.deleteUser); // Tambah ini
router.put('/users/:id/toggle-status', verifyToken, ownerOnly, authController.toggleUserStatus);

module.exports = router;