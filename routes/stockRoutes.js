// routes/stockRoutes.js
const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const { verifyToken, adminOrOwner } = require('../middlewares/authMiddleware');

// Semua rute di file ini memerlukan autentikasi
router.use(verifyToken, adminOrOwner);

// Rute untuk mengambil semua item inventaris (produk tunggal + varian)
router.get('/inventory', stockController.getInventory);

module.exports = router;