// setup_owner.js
const bcrypt = require('bcryptjs');
const { db } = require('./config/database');

const setupOwner = async () => {
    try {
        // Hash password
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        // Insert owner
        await db.query(
            'INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
            ['owner', hashedPassword, 'Pemilik Toko', 'owner']
        );
        
        console.log('✅ Owner berhasil dibuat!');
        console.log('Username: owner');
        console.log('Password: admin123');
        process.exit(0);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            console.log('Owner sudah ada!');
        } else {
            console.error('Error:', error);
        }
        process.exit(1);
    }
};

setupOwner();