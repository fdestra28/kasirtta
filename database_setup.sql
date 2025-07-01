-- database_setup.sql
-- Buat database
CREATE DATABASE IF NOT EXISTS tokoatk_db;
USE tokoatk_db;

-- Tabel users
CREATE TABLE IF NOT EXISTS users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role ENUM('owner', 'admin') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (created_by) REFERENCES users(user_id)
);

-- Insert default owner (password: admin123)
INSERT INTO users (username, password, full_name, role) VALUES 
('owner', '$2a$10$YourHashedPasswordHere', 'Pemilik Toko', 'owner');

-- Tabel products
CREATE TABLE IF NOT EXISTS products (
    product_id INT PRIMARY KEY AUTO_INCREMENT,
    item_code VARCHAR(20) UNIQUE,
    item_name VARCHAR(200) NOT NULL,
    item_type ENUM('barang', 'jasa') NOT NULL,
    selling_price DECIMAL(12,2) NOT NULL,
    current_stock INT DEFAULT 0,
    min_stock INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- Tabel transactions
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_code VARCHAR(30) UNIQUE NOT NULL,
    admin_id INT NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('cash', 'transfer') DEFAULT 'cash',
    payment_received DECIMAL(12,2),
    change_amount DECIMAL(12,2),
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(user_id)
);

-- Tabel transaction_details
CREATE TABLE IF NOT EXISTS transaction_details (
    detail_id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
    FOREIGN KEY (product_id) REFERENCES products(product_id)
);

-- Tabel stock_movements
CREATE TABLE IF NOT EXISTS stock_movements (
    movement_id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    movement_type ENUM('in', 'out', 'adjustment') NOT NULL,
    quantity INT NOT NULL,
    reference_type ENUM('transaction', 'manual', 'initial') NOT NULL,
    reference_id INT,
    notes TEXT,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(product_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- Tambahkan di database_setup.sql atau jalankan manual
-- Di file database_setup.sql, ubah definisi tabel book_closings menjadi:
CREATE TABLE IF NOT EXISTS book_closings (
    closing_id INT PRIMARY KEY AUTO_INCREMENT,
    period_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    notes TEXT,
    backup_file VARCHAR(255),
    beginning_capital DECIMAL(15,2) DEFAULT 0, -- DITAMBAHKAN
    ending_capital DECIMAL(15,2) DEFAULT 0,    -- DITAMBAHKAN
    closed_by INT NOT NULL,
    closing_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (closed_by) REFERENCES users(user_id)
);

-- 1. Tambah kolom harga beli di products
ALTER TABLE products 
ADD COLUMN purchase_price DECIMAL(12,2) DEFAULT 0 AFTER selling_price,
ADD COLUMN last_purchase_date DATE NULL AFTER updated_at;

-- 2. Tabel kategori pengeluaran
CREATE TABLE IF NOT EXISTS expense_categories (
    category_id INT PRIMARY KEY AUTO_INCREMENT,
    category_name VARCHAR(100) NOT NULL,
    category_type ENUM('operational', 'purchase', 'other') DEFAULT 'operational',
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabel pengeluaran
CREATE TABLE IF NOT EXISTS expenses (
    expense_id INT PRIMARY KEY AUTO_INCREMENT,
    expense_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Diubah ke DATETIME
    category_id INT NOT NULL,
    description VARCHAR(255) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_method ENUM('cash', 'transfer') DEFAULT 'cash',
    receipt_number VARCHAR(50),
    notes TEXT,
    created_by INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Diubah ke DATETIME
    FOREIGN KEY (category_id) REFERENCES expense_categories(category_id),
    FOREIGN KEY (created_by) REFERENCES users(user_id),
    INDEX idx_expense_date (expense_date)
);

-- 4. Insert kategori pengeluaran default
-- INSERT INTO expense_categories (category_name, category_type, description) VALUES
-- ('Listrik', 'operational', 'Pembayaran listrik bulanan'),
-- ('Air', 'operational', 'Pembayaran air bulanan'),
-- ('Internet', 'operational', 'Pembayaran internet bulanan'),
-- ('Gaji Karyawan', 'operational', 'Pembayaran gaji karyawan'),
-- ('Sewa Tempat', 'operational', 'Pembayaran sewa tempat usaha'),
-- ('Pembelian Barang', 'purchase', 'Pembelian stok barang dagangan'),
-- ('Transportasi', 'operational', 'Biaya transportasi dan bensin'),
-- ('Maintenance', 'operational', 'Biaya perawatan dan perbaikan'),
-- ('Marketing', 'operational', 'Biaya promosi dan marketing'),
-- ('Lain-lain', 'other', 'Pengeluaran lainnya');

-- INSERT INTO expense_categories (category_name, category_type, description) 
-- VALUES ('Prive', 'other', 'Pengambilan dana pribadi oleh pemilik untuk keperluan non-bisnis');

-- Membuat tabel untuk menyimpan semua pengaturan aplikasi
CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- -- Mengisi pengaturan default agar aplikasi tidak error saat pertama kali dijalankan
-- INSERT INTO settings (setting_key, setting_value) VALUES
-- ('store_name', 'TokoATK Pro Anda')
-- ON DUPLICATE KEY UPDATE setting_key=setting_key; -- Jangan timpa jika sudah ada

-- INSERT INTO settings (setting_key, setting_value) VALUES
-- ('store_address', 'Jl. Contoh No. 123, Kota Anda')
-- ON DUPLICATE KEY UPDATE setting_key=setting_key;

-- INSERT INTO settings (setting_key, setting_value) VALUES
-- ('store_phone', '0812-3456-7890')
-- ON DUPLICATE KEY UPDATE setting_key=setting_key;

-- INSERT INTO settings (setting_key, setting_value) VALUES
-- ('store_email', 'email@tokoanda.com')
-- ON DUPLICATE KEY UPDATE setting_key=setting_key;

-- -- Logo default menggunakan SVG sederhana (placeholder)
-- INSERT INTO settings (setting_key, setting_value) VALUES
-- ('store_logo_favicon', 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛒</text></svg>')
-- ON DUPLICATE KEY UPDATE setting_key=setting_key;

-- ALTER TABLE transaction_details
-- ADD COLUMN purchase_price DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER unit_price;