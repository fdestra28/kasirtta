// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { verifyToken, adminOrOwner, ownerOnly } = require('../middlewares/authMiddleware');

const multer = require('multer');

const importStorage = multer.memoryStorage();
const uploadImport = multer({ storage: importStorage });

// All routes need authentication
router.use(verifyToken);

// Owner & Admin routes (read-only for admin)
router.get('/', adminOrOwner, productController.getAllProducts);
router.get('/low-stock', adminOrOwner, productController.getLowStock);
router.get('/low-stock-variants', adminOrOwner, productController.getLowStockVariants);
router.get('/:id/with-variants', adminOrOwner, productController.getProductWithVariantsById);
router.get('/:id', adminOrOwner, productController.getProductById);

// Owner only routes (create, update, delete)
router.post('/', ownerOnly, productController.createProduct);  // Changed to ownerOnly
router.put('/:id', ownerOnly, productController.updateProduct);  // Changed to ownerOnly
router.delete('/:id', ownerOnly, productController.deleteProduct);
router.post('/import', verifyToken, ownerOnly, uploadImport.single('importFile'), productController.importProducts);
// Admin can still update stock for inventory management
router.post('/:id/stock', adminOrOwner, productController.updateStock);

module.exports = router;