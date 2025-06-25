// routes/settingsRoutes.js
const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { verifyToken, adminOrOwner } = require('../middlewares/authMiddleware');
const multer = require('multer');

const path = require('path'); // Tambahkan ini
// ...
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/tmp'); // Simpan ke direktori /tmp
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Konfigurasi Multer untuk menyimpan file sementara
// const upload = multer({ dest: 'uploads/' });

// Semua rute di file ini hanya bisa diakses oleh owner
router.use(verifyToken, adminOrOwner);

// Rute untuk MENDAPATKAN semua pengaturan
router.get('/', settingsController.getAllSettings);

// Rute untuk MEMPERBARUI pengaturan.
// `upload.single('store_logo_favicon')` adalah middleware dari multer
// yang akan menangani file upload dengan nama field 'store_logo_favicon'.
router.put('/', upload.single('store_logo_favicon'), settingsController.updateSettings);

module.exports = router;