// routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { verifyToken, adminOrOwner } = require('../middlewares/authMiddleware');
const multer = require('multer');

// Konfigurasi Multer untuk menyimpan file sementara
// const upload = multer({ dest: 'uploads/' }); // GANTI INI
const storage = multer.memoryStorage(); // SIMPAN DI MEMORI
const upload = multer({ storage: storage }); // GUNAKAN MEMORY STORAGE

// Semua rute di file ini hanya bisa diakses oleh owner
router.use(verifyToken, adminOrOwner);

// Rute untuk MENDAPATKAN semua pengaturan
router.get('/', settingsController.getAllSettings);

// Rute untuk MEMPERBARUI pengaturan.
// `upload.single('store_logo_favicon')` adalah middleware dari multer
// yang akan menangani file upload dengan nama field 'store_logo_favicon'.
router.put('/', upload.single('store_logo_favicon'), settingsController.updateSettings);

module.exports = router;