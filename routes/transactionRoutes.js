// routes/transactionRoutes.js
const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { verifyToken, adminOrOwner, ownerOnly } = require('../middlewares/authMiddleware');

// All routes need authentication
router.use(verifyToken);

router.get('/popular-products', adminOrOwner, transactionController.getPopularProducts);

// Admin & Owner routes
router.post('/', adminOrOwner, transactionController.createTransaction);
router.get('/', adminOrOwner, transactionController.getAllTransactions);
router.get('/summary/daily', adminOrOwner, transactionController.getDailySummary);
router.get('/:id', adminOrOwner, transactionController.getTransactionById);

// Owner only routes
router.get('/report/data', ownerOnly, transactionController.getReportData);

module.exports = router;