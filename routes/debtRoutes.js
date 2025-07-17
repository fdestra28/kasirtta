// routes/debtRoutes.js
const express = require('express');
const router = express.Router();
const debtController = require('../controllers/debtController');
const { verifyToken, ownerOnly } = require('../middlewares/authMiddleware');

// Fitur piutang hanya untuk Owner
router.use(verifyToken, ownerOnly);

router.get('/', debtController.getActiveDebts);
router.post('/:debt_id/pay', debtController.makePayment);

module.exports = router;