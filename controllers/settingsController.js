// controllers/settingsController.js
const { db } = require('../config/database');
const fs = require('fs');
const path = require('path');

// Fungsi untuk mengambil semua pengaturan
const getAllSettings = async (req, res) => {
    try {
        const [settings] = await db.query('SELECT * FROM settings');
        
        // Ubah format dari array menjadi objek agar mudah diakses di frontend
        // Contoh: [{key: 'store_name', value: 'Toko A'}] -> { store_name: 'Toko A' }
        const settingsObject = settings.reduce((obj, item) => {
            obj[item.setting_key] = item.setting_value;
            return obj;
        }, {});

        res.json({ success: true, data: settingsObject });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ success: false, message: 'Gagal mengambil data pengaturan.' });
    }
};

// Fungsi untuk memperbarui pengaturan
const updateSettings = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Proses data teks
        const textSettings = req.body;
        for (const key in textSettings) {
            if (Object.hasOwnProperty.call(textSettings, key)) {
                const value = textSettings[key];
                await connection.query(
                    'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
                    [key, value, value]
                );
            }
        }

        // Proses file logo jika ada
        if (req.file) {
            // Kita akan simpan logo sebagai base64 string di database
            // Ini sederhana dan tidak memerlukan manajemen file statis yang kompleks
            const fileData = fs.readFileSync(req.file.path);
            const base64String = `data:${req.file.mimetype};base64,${fileData.toString('base64')}`;

            await connection.query(
                'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
                ['store_logo_favicon', base64String, base64String]
            );

            // Hapus file sementara setelah dibaca
            fs.unlinkSync(req.file.path);
        }

        await connection.commit();
        res.json({ success: true, message: 'Pengaturan berhasil disimpan!' });

    } catch (error) {
        await connection.rollback();
        console.error('Update settings error:', error);
        res.status(500).json({ success: false, message: 'Gagal menyimpan pengaturan.' });
    } finally {
        connection.release();
    }
};

module.exports = {
    getAllSettings,
    updateSettings
};