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
INSERT INTO expense_categories (category_name, category_type, description)
SELECT * FROM (
    SELECT 'Listrik', 'operational', 'Pembayaran listrik bulanan' UNION ALL
    SELECT 'Air', 'operational', 'Pembayaran air bulanan' UNION ALL
    SELECT 'Internet', 'operational', 'Pembayaran internet bulanan' UNION ALL
    SELECT 'Gaji Karyawan', 'operational', 'Pembayaran gaji karyawan' UNION ALL
    SELECT 'Sewa Tempat', 'operational', 'Pembayaran sewa tempat usaha' UNION ALL
    SELECT 'Pembelian Barang', 'purchase', 'Pembelian stok barang dagangan' UNION ALL
    SELECT 'Transportasi', 'operational', 'Biaya transportasi dan bensin' UNION ALL
    SELECT 'Maintenance', 'operational', 'Biaya perawatan dan perbaikan' UNION ALL
    SELECT 'Marketing', 'operational', 'Biaya promosi dan marketing' UNION ALL
    SELECT 'Lain-lain', 'other', 'Pengeluaran lainnya'
) AS tmp
WHERE NOT EXISTS (
    SELECT 1 FROM expense_categories WHERE category_name = tmp.column1
);

INSERT INTO expense_categories (category_name, category_type, description)
SELECT 'Prive', 'other', 'Pengambilan dana pribadi oleh pemilik untuk keperluan non-bisnis'
WHERE NOT EXISTS (
    SELECT 1 FROM expense_categories WHERE category_name = 'Prive'
);

-- Membuat tabel untuk menyimpan semua pengaturan aplikasi
CREATE TABLE IF NOT EXISTS settings (
    setting_key VARCHAR(50) PRIMARY KEY,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- -- Mengisi pengaturan default agar aplikasi tidak error saat pertama kali dijalankan
INSERT INTO settings (setting_key, setting_value)
SELECT 'store_name', 'TokoATK Pro Anda'
WHERE NOT EXISTS (
    SELECT 1 FROM settings WHERE setting_key = 'store_name'
);

INSERT INTO settings (setting_key, setting_value)
SELECT 'store_address', 'Jl. Contoh No. 123, Kota Anda'
WHERE NOT EXISTS (
    SELECT 1 FROM settings WHERE setting_key = 'store_address'
);

INSERT INTO settings (setting_key, setting_value)
SELECT 'store_phone', '0812-3456-7890'
WHERE NOT EXISTS (
    SELECT 1 FROM settings WHERE setting_key = 'store_phone'
);

INSERT INTO settings (setting_key, setting_value)
SELECT 'store_email', 'email@tokoanda.com'
WHERE NOT EXISTS (
    SELECT 1 FROM settings WHERE setting_key = 'store_email'
);

INSERT INTO settings (setting_key, setting_value)
SELECT 'store_logo_favicon', 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛒</text></svg>'
WHERE NOT EXISTS (
    SELECT 1 FROM settings WHERE setting_key = 'store_logo_favicon'
);

SET @sql := IF(
    NOT EXISTS (
        SELECT * 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'transaction_details' 
        AND COLUMN_NAME = 'purchase_price'
    ),
    'ALTER TABLE transaction_details ADD COLUMN purchase_price DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER unit_price;',
    'SELECT "Kolom purchase_price sudah ada";'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS customers (
    customer_id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(150) NOT NULL,
    phone_number VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX(full_name),
    UNIQUE(phone_number)
);

CREATE TABLE IF NOT EXISTS debts (
    debt_id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_id INT NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    amount_due DECIMAL(12, 2) NOT NULL,
    amount_paid DECIMAL(12, 2) DEFAULT 0.00,
    due_date DATE,
    status ENUM('unpaid', 'partially_paid', 'paid') NOT NULL DEFAULT 'unpaid',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(transaction_id),
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

ALTER TABLE transactions
MODIFY COLUMN payment_method ENUM('cash', 'transfer', 'hutang') DEFAULT 'cash';

-- FILE: feature_variants_db_update.sql
-- Deskripsi: Menambahkan struktur tabel untuk mendukung fitur varian produk.

USE tokoatk_db;

-- Langkah 1: Modifikasi tabel `products`
-- Menambahkan kolom 'has_variants' untuk menandai produk induk.
-- Kolom ini akan menjadi FALSE untuk semua produk yang sudah ada, sehingga aman.
ALTER TABLE products
ADD COLUMN has_variants BOOLEAN NOT NULL DEFAULT FALSE AFTER item_type;

-- Langkah 2: Buat tabel baru `product_variants`
-- Tabel ini akan menyimpan semua data varian yang terhubung ke produk induk.
CREATE TABLE IF NOT EXISTS product_variants (
    variant_id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    variant_name VARCHAR(100) NOT NULL,
    item_code VARCHAR(20) UNIQUE,
    selling_price DECIMAL(12,2) NOT NULL,
    purchase_price DECIMAL(12,2) DEFAULT 0,
    current_stock INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Menambahkan constraint foreign key ke tabel products.
    -- ON DELETE CASCADE berarti jika produk induk dihapus, semua variannya akan ikut terhapus.
    FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
);

-- Langkah 3: Modifikasi tabel `transaction_details`
-- Menambahkan kolom 'variant_id' untuk mencatat varian mana yang terjual.
-- Dibuat NULLABLE karena produk tanpa varian tidak akan memiliki variant_id.
ALTER TABLE transaction_details
ADD COLUMN variant_id INT NULL DEFAULT NULL AFTER product_id,
ADD FOREIGN KEY (variant_id) REFERENCES product_variants(variant_id);

-- Langkah 4: Modifikasi tabel `stock_movements`
-- Menambahkan kolom 'variant_id' untuk melacak pergerakan stok per varian.
-- Dibuat NULLABLE karena penyesuaian stok produk lama (tanpa varian) tidak memiliki variant_id.
ALTER TABLE stock_movements
ADD COLUMN variant_id INT NULL DEFAULT NULL AFTER product_id,
ADD FOREIGN KEY (variant_id) REFERENCES product_variants(variant_id);

-- FILE: feature_variants_min_stock.sql
-- Menambahkan kolom min_stock ke tabel product_variants

USE tokoatk_db;

-- Menambahkan kolom 'min_stock' dengan nilai default 10.
-- Ini memastikan varian yang sudah ada memiliki nilai awal yang aman.
ALTER TABLE product_variants
ADD COLUMN min_stock INT NOT NULL DEFAULT 10 AFTER current_stock;

-- FILE: optimization_add_indexes.sql
-- Deskripsi: Menambahkan indeks ke kolom-kolom kunci untuk mempercepat
--            query pencarian, filter, dan join di seluruh aplikasi.

USE tokoatk_db;

-- [1] Indeks untuk tabel `products`
-- Mempercepat pencarian berdasarkan nama dan filter berdasarkan tipe & status.
CREATE INDEX idx_products_item_name ON products(item_name);
CREATE INDEX idx_products_item_type ON products(item_type);
CREATE INDEX idx_products_is_active ON products(is_active);

-- [2] Indeks untuk tabel `product_variants`
-- Mempercepat join ke tabel produk dan filter berdasarkan status.
CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);
CREATE INDEX idx_product_variants_is_active ON product_variants(is_active);

-- [3] Indeks untuk tabel `transactions`
-- Mempercepat filter laporan berdasarkan tanggal dan pencarian berdasarkan kode.
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_code ON transactions(transaction_code);

-- [4] Indeks untuk tabel `transaction_details`
-- Mempercepat join ke tabel transaksi, produk, dan varian. Ini sangat penting.
CREATE INDEX idx_transaction_details_transaction_id ON transaction_details(transaction_id);
CREATE INDEX idx_transaction_details_product_id ON transaction_details(product_id);
CREATE INDEX idx_transaction_details_variant_id ON transaction_details(variant_id);

-- [5] Indeks untuk tabel `stock_movements`
-- Mempercepat pengambilan riwayat stok untuk produk/varian tertentu.
CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_variant_id ON stock_movements(variant_id);

-- [6] Indeks untuk tabel `expenses`
-- Mempercepat filter laporan pengeluaran berdasarkan tanggal.
CREATE INDEX idx_expenses_date ON expenses(expense_date);

-- [7] Indeks untuk tabel `debts` (Piutang)
-- Mempercepat join ke transaksi dan filter berdasarkan status hutang.
CREATE INDEX idx_debts_transaction_id ON debts(transaction_id);
CREATE INDEX idx_debts_status ON debts(status);

-- Menyamakan collation kolom `item_name` di tabel `products`
ALTER TABLE products MODIFY COLUMN item_name VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- Menyamakan collation kolom `variant_name` di tabel `product_variants`
ALTER TABLE product_variants MODIFY COLUMN variant_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- Perbaiki tabel `products`
ALTER TABLE products 
    MODIFY COLUMN item_name VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN item_code VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci UNIQUE;

-- Perbaiki tabel `product_variants`
ALTER TABLE product_variants 
    MODIFY COLUMN variant_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN item_code VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci UNIQUE;

-- db_collation_fix.sql
-- Script untuk menyeragamkan collation di seluruh database untuk mencegah error.

USE tokoatk_db; -- Pastikan Anda menggunakan database yang benar

-- Ubah Collation Database Default
ALTER DATABASE tokoatk_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Perbaiki Tabel: users
ALTER TABLE users
    MODIFY COLUMN username VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
    MODIFY COLUMN password VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN full_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN role ENUM('owner', 'admin') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- Perbaiki Tabel: products
ALTER TABLE products
    MODIFY COLUMN item_code VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci UNIQUE,
    MODIFY COLUMN item_name VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN item_type ENUM('barang', 'jasa') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- Perbaiki Tabel: product_variants
ALTER TABLE product_variants
    MODIFY COLUMN variant_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN item_code VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci UNIQUE;

-- Perbaiki Tabel: transactions
ALTER TABLE transactions
    MODIFY COLUMN transaction_code VARCHAR(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL UNIQUE,
    MODIFY COLUMN payment_method ENUM('cash', 'transfer', 'hutang') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'cash';

-- Perbaiki Tabel: stock_movements
ALTER TABLE stock_movements
    MODIFY COLUMN movement_type ENUM('in', 'out', 'adjustment') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN reference_type ENUM('transaction', 'manual', 'initial') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Perbaiki Tabel: book_closings
ALTER TABLE book_closings
    MODIFY COLUMN period_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    MODIFY COLUMN backup_file VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    
-- Perbaiki Tabel: expense_categories
ALTER TABLE expense_categories
    MODIFY COLUMN category_name VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN category_type ENUM('operational', 'purchase', 'other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'operational',
    MODIFY COLUMN description TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    
-- Perbaiki Tabel: expenses
ALTER TABLE expenses
    MODIFY COLUMN description VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN payment_method ENUM('cash', 'transfer') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'cash',
    MODIFY COLUMN receipt_number VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
    MODIFY COLUMN notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    
-- Perbaiki Tabel: settings
ALTER TABLE settings
    MODIFY COLUMN setting_key VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN setting_value TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    
-- Perbaiki Tabel: customers
ALTER TABLE customers
    MODIFY COLUMN full_name VARCHAR(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    MODIFY COLUMN phone_number VARCHAR(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci UNIQUE,
    MODIFY COLUMN address TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    
-- Perbaiki Tabel: debts
ALTER TABLE debts
    MODIFY COLUMN status ENUM('unpaid', 'partially_paid', 'paid') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
    MODIFY COLUMN notes TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;