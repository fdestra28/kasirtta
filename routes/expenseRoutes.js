// routes/expenseRoutes.js
const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
// Import ownerOnly dari middleware
const { verifyToken, adminOrOwner, ownerOnly } = require('../middlewares/authMiddleware');

// Semua rute di file ini memerlukan autentikasi
router.use(verifyToken); // Kita ubah agar semua user terautentikasi bisa lewat sini dulu

// Rute yang bisa diakses admin dan owner
router.get('/categories', adminOrOwner, expenseController.getCategories);
router.get('/', adminOrOwner, expenseController.getExpenses);
router.post('/', adminOrOwner, expenseController.createExpense);
router.get('/summary', adminOrOwner, expenseController.getExpenseSummary);

// ================== TAMBAHKAN RUTE BARU INI ==================
// Rute ini hanya bisa diakses oleh owner
router.delete('/:id', ownerOnly, expenseController.deleteExpense);
// =============================================================

module.exports = router;