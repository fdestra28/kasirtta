// routes/closingRoutes.js
const express = require('express');
const router = express.Router();
const closingController = require('../controllers/closingController');
const { verifyToken, ownerOnly } = require('../middlewares/authMiddleware');

// Semua rute di file ini memerlukan otentikasi owner
router.use(verifyToken, ownerOnly);

// ================== UBAH BARIS INI ==================
// Menggunakan nama fungsi yang baru dan lebih deskriptif
router.get('/report', closingController.generateFinancialReport);
// ====================================================

router.post('/execute', closingController.executeClosing);
router.get('/history', closingController.getClosingHistory);
router.get('/backup/:filename', closingController.downloadBackup);
router.get('/history/:id', closingController.getHistoricalReport)

module.exports = router;