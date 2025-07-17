// controllers/debtController.js
const { db } = require('../config/database');

// Mendapatkan semua hutang yang belum lunas
const getActiveDebts = async (req, res) => {
    try {
        const { search } = req.query;
        let query = `
            SELECT 
                d.debt_id, d.transaction_id, d.amount_due, d.amount_paid, d.due_date, d.status,
                c.full_name as customer_name, c.phone_number,
                t.transaction_code
            FROM debts d
            JOIN customers c ON d.customer_id = c.customer_id
            JOIN transactions t ON d.transaction_id = t.transaction_id
            WHERE d.status IN ('unpaid', 'partially_paid')
        `;
        const params = [];

        if (search) {
            query += ' AND (c.full_name LIKE ? OR c.phone_number LIKE ? OR t.transaction_code LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        query += ' ORDER BY d.due_date ASC, d.created_at ASC';

        const [debts] = await db.query(query, params);
        res.json({ success: true, data: debts });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Gagal mengambil data piutang', error: error.message });
    }
};

// Mencatat pembayaran hutang
const makePayment = async (req, res) => {
    const { debt_id } = req.params;
    const { amount, payment_date } = req.body; // payment_date belum kita gunakan, tapi biarkan untuk pengembangan nanti
    const admin_id = req.user.user_id;

    if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: 'Jumlah pembayaran tidak valid.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [debts] = await connection.query('SELECT * FROM debts WHERE debt_id = ? FOR UPDATE', [debt_id]);
        if (debts.length === 0) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: 'Data hutang tidak ditemukan.' });
        }
        
        const debt = debts[0];
        const remaining_due = parseFloat(debt.amount_due) - parseFloat(debt.amount_paid);
        
        // Gunakan parseFloat juga di sini untuk perbandingan yang akurat
        if (parseFloat(amount) > remaining_due) {
            await connection.rollback();
            // Memberi toleransi kecil untuk masalah pembulatan floating point
            if (parseFloat(amount) - remaining_due > 0.01) {
                return res.status(400).json({ success: false, message: 'Jumlah pembayaran melebihi sisa hutang.' });
            }
        }

        // --- BLOK PERBAIKAN TIPE DATA ---
        const current_paid_amount = parseFloat(debt.amount_paid);
        const payment_amount = parseFloat(amount);
        const total_amount_due = parseFloat(debt.amount_due);

        const new_paid_amount = current_paid_amount + payment_amount;
        // Pastikan perbandingan juga menggunakan angka
        const new_status = new_paid_amount >= total_amount_due ? 'paid' : 'partially_paid';
        // --- AKHIR BLOK PERBAIKAN ---

        // Update tabel debts
        await connection.query(
            'UPDATE debts SET amount_paid = ?, status = ? WHERE debt_id = ?',
            [new_paid_amount, new_status, debt_id]
        );
        
        await connection.commit();
        res.json({ success: true, message: 'Pembayaran berhasil dicatat!' });

    } catch (error) {
        await connection.rollback();
        console.error("Payment Error:", error); // Tambahkan log error untuk debugging
        res.status(500).json({ success: false, message: 'Gagal mencatat pembayaran', error: error.message });
    } finally {
        connection.release();
    }
};


module.exports = {
    getActiveDebts,
    makePayment
};