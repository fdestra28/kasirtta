// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { verifyToken, adminOrOwner, ownerOnly } = require('../middlewares/authMiddleware');

// All routes need authentication
router.use(verifyToken);

// Owner & Admin routes (read-only for admin)
router.get('/', adminOrOwner, productController.getAllProducts);
router.get('/low-stock', adminOrOwner, productController.getLowStock);
router.get('/:id', adminOrOwner, productController.getProductById);

// Owner only routes (create, update, delete)
router.post('/', ownerOnly, productController.createProduct);  // Changed to ownerOnly
router.put('/:id', ownerOnly, productController.updateProduct);  // Changed to ownerOnly
router.delete('/:id', ownerOnly, productController.deleteProduct);

// Admin can still update stock for inventory management
router.post('/:id/stock', adminOrOwner, productController.updateStock);

module.exports = router;