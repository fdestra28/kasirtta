// routes/customerRoutes.js
const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { verifyToken, adminOrOwner } = require('../middlewares/authMiddleware');

// Semua rute pelanggan memerlukan user untuk login
router.use(verifyToken, adminOrOwner);

router.get('/search', customerController.searchCustomers);
router.post('/', customerController.createCustomer);

module.exports = router;