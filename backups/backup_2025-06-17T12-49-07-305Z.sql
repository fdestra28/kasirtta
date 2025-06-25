-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: tokoatk_db
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `book_closings`
--

DROP TABLE IF EXISTS `book_closings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `book_closings` (
  `closing_id` int(11) NOT NULL AUTO_INCREMENT,
  `period_name` varchar(100) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `notes` text DEFAULT NULL,
  `backup_file` varchar(255) DEFAULT NULL,
  `closed_by` int(11) NOT NULL,
  `closing_date` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`closing_id`),
  KEY `closed_by` (`closed_by`),
  CONSTRAINT `book_closings_ibfk_1` FOREIGN KEY (`closed_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `book_closings`
--

LOCK TABLES `book_closings` WRITE;
/*!40000 ALTER TABLE `book_closings` DISABLE KEYS */;
/*!40000 ALTER TABLE `book_closings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `expense_categories`
--

DROP TABLE IF EXISTS `expense_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `expense_categories` (
  `category_id` int(11) NOT NULL AUTO_INCREMENT,
  `category_name` varchar(100) NOT NULL,
  `category_type` enum('operational','purchase','other') DEFAULT 'operational',
  `description` text DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`category_id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `expense_categories`
--

LOCK TABLES `expense_categories` WRITE;
/*!40000 ALTER TABLE `expense_categories` DISABLE KEYS */;
INSERT INTO `expense_categories` VALUES (1,'Listrik','operational','Pembayaran listrik bulanan',1,'2025-06-17 11:32:07'),(2,'Air','operational','Pembayaran air bulanan',1,'2025-06-17 11:32:07'),(3,'Internet','operational','Pembayaran internet bulanan',1,'2025-06-17 11:32:07'),(4,'Gaji Karyawan','operational','Pembayaran gaji karyawan',1,'2025-06-17 11:32:07'),(5,'Sewa Tempat','operational','Pembayaran sewa tempat usaha',1,'2025-06-17 11:32:07'),(6,'Pembelian Barang','purchase','Pembelian stok barang dagangan',1,'2025-06-17 11:32:07'),(7,'Transportasi','operational','Biaya transportasi dan bensin',1,'2025-06-17 11:32:07'),(8,'Maintenance','operational','Biaya perawatan dan perbaikan',1,'2025-06-17 11:32:07'),(9,'Marketing','operational','Biaya promosi dan marketing',1,'2025-06-17 11:32:07'),(10,'Lain-lain','other','Pengeluaran lainnya',1,'2025-06-17 11:32:07'),(11,'Listrik','operational','Pembayaran listrik bulanan',1,'2025-06-17 11:32:09'),(12,'Air','operational','Pembayaran air bulanan',1,'2025-06-17 11:32:09'),(13,'Internet','operational','Pembayaran internet bulanan',1,'2025-06-17 11:32:09'),(14,'Gaji Karyawan','operational','Pembayaran gaji karyawan',1,'2025-06-17 11:32:09'),(15,'Sewa Tempat','operational','Pembayaran sewa tempat usaha',1,'2025-06-17 11:32:09'),(16,'Pembelian Barang','purchase','Pembelian stok barang dagangan',1,'2025-06-17 11:32:09'),(17,'Transportasi','operational','Biaya transportasi dan bensin',1,'2025-06-17 11:32:09'),(18,'Maintenance','operational','Biaya perawatan dan perbaikan',1,'2025-06-17 11:32:09'),(19,'Marketing','operational','Biaya promosi dan marketing',1,'2025-06-17 11:32:09'),(20,'Lain-lain','other','Pengeluaran lainnya',1,'2025-06-17 11:32:09');
/*!40000 ALTER TABLE `expense_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `expenses`
--

DROP TABLE IF EXISTS `expenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `expenses` (
  `expense_id` int(11) NOT NULL AUTO_INCREMENT,
  `expense_date` date NOT NULL,
  `category_id` int(11) NOT NULL,
  `description` varchar(255) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` enum('cash','transfer') DEFAULT 'cash',
  `receipt_number` varchar(50) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`expense_id`),
  KEY `category_id` (`category_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_expense_date` (`expense_date`),
  CONSTRAINT `expenses_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `expense_categories` (`category_id`),
  CONSTRAINT `expenses_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `expenses`
--

LOCK TABLES `expenses` WRITE;
/*!40000 ALTER TABLE `expenses` DISABLE KEYS */;
/*!40000 ALTER TABLE `expenses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `products`
--

DROP TABLE IF EXISTS `products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `products` (
  `product_id` int(11) NOT NULL AUTO_INCREMENT,
  `item_code` varchar(20) DEFAULT NULL,
  `item_name` varchar(200) NOT NULL,
  `item_type` enum('barang','jasa') NOT NULL,
  `selling_price` decimal(12,2) NOT NULL,
  `purchase_price` decimal(12,2) DEFAULT 0.00,
  `current_stock` int(11) DEFAULT 0,
  `min_stock` int(11) DEFAULT 10,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_purchase_date` date DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`product_id`),
  UNIQUE KEY `item_code` (`item_code`)
) ENGINE=InnoDB AUTO_INCREMENT=43 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `products`
--

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT INTO `products` VALUES (39,'P001','Map Kertas','barang',2000.00,0.00,99,20,'2025-06-17 12:34:36','2025-06-17 12:35:34',NULL,1),(40,'J001','Jilid','jasa',4000.00,0.00,0,0,'2025-06-17 12:34:36','2025-06-17 12:34:36',NULL,1),(41,'P002','Pulpen','barang',4000.00,0.00,4,2,'2025-06-17 12:34:43','2025-06-17 12:35:27',NULL,1),(42,'J002','Fotokopi','jasa',400.00,0.00,0,0,'2025-06-17 12:34:43','2025-06-17 12:34:43',NULL,1);
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_details`
--

DROP TABLE IF EXISTS `purchase_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_details` (
  `detail_id` int(11) NOT NULL AUTO_INCREMENT,
  `purchase_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `purchase_price` decimal(12,2) NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  PRIMARY KEY (`detail_id`),
  KEY `purchase_id` (`purchase_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `purchase_details_ibfk_1` FOREIGN KEY (`purchase_id`) REFERENCES `purchases` (`purchase_id`),
  CONSTRAINT `purchase_details_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_details`
--

LOCK TABLES `purchase_details` WRITE;
/*!40000 ALTER TABLE `purchase_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_details` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchases`
--

DROP TABLE IF EXISTS `purchases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchases` (
  `purchase_id` int(11) NOT NULL AUTO_INCREMENT,
  `purchase_date` date NOT NULL,
  `supplier_name` varchar(100) DEFAULT NULL,
  `invoice_number` varchar(50) DEFAULT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `payment_method` enum('cash','transfer','credit') DEFAULT 'cash',
  `notes` text DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`purchase_id`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `purchases_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchases`
--

LOCK TABLES `purchases` WRITE;
/*!40000 ALTER TABLE `purchases` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchases` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stock_movements`
--

DROP TABLE IF EXISTS `stock_movements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `stock_movements` (
  `movement_id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `movement_type` enum('in','out','adjustment') NOT NULL,
  `quantity` int(11) NOT NULL,
  `reference_type` enum('transaction','manual','initial') NOT NULL,
  `reference_id` int(11) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`movement_id`),
  KEY `product_id` (`product_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `stock_movements_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`),
  CONSTRAINT `stock_movements_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=183 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stock_movements`
--

LOCK TABLES `stock_movements` WRITE;
/*!40000 ALTER TABLE `stock_movements` DISABLE KEYS */;
INSERT INTO `stock_movements` VALUES (174,39,'in',100,'initial',NULL,'Stok awal',3,'2025-06-17 12:34:36'),(175,41,'in',10,'initial',NULL,'Stok awal',3,'2025-06-17 12:34:43'),(176,41,'out',1,'transaction',41,NULL,3,'2025-06-17 12:35:13'),(177,41,'out',1,'transaction',42,NULL,3,'2025-06-17 12:35:16'),(178,41,'out',1,'transaction',43,NULL,3,'2025-06-17 12:35:19'),(179,41,'out',1,'transaction',44,NULL,3,'2025-06-17 12:35:22'),(180,41,'out',1,'transaction',45,NULL,3,'2025-06-17 12:35:25'),(181,41,'out',1,'transaction',46,NULL,3,'2025-06-17 12:35:27'),(182,39,'out',1,'transaction',48,NULL,3,'2025-06-17 12:35:34');
/*!40000 ALTER TABLE `stock_movements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transaction_details`
--

DROP TABLE IF EXISTS `transaction_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transaction_details` (
  `detail_id` int(11) NOT NULL AUTO_INCREMENT,
  `transaction_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_price` decimal(12,2) NOT NULL,
  `subtotal` decimal(12,2) NOT NULL,
  PRIMARY KEY (`detail_id`),
  KEY `transaction_id` (`transaction_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `transaction_details_ibfk_1` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`transaction_id`),
  CONSTRAINT `transaction_details_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`product_id`)
) ENGINE=InnoDB AUTO_INCREMENT=104 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transaction_details`
--

LOCK TABLES `transaction_details` WRITE;
/*!40000 ALTER TABLE `transaction_details` DISABLE KEYS */;
INSERT INTO `transaction_details` VALUES (95,40,42,10,400.00,4000.00),(96,41,41,1,4000.00,4000.00),(97,42,41,1,4000.00,4000.00),(98,43,41,1,4000.00,4000.00),(99,44,41,1,4000.00,4000.00),(100,45,41,1,4000.00,4000.00),(101,46,41,1,4000.00,4000.00),(102,47,40,1,4000.00,4000.00),(103,48,39,1,2000.00,2000.00);
/*!40000 ALTER TABLE `transaction_details` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `transactions`
--

DROP TABLE IF EXISTS `transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `transactions` (
  `transaction_id` int(11) NOT NULL AUTO_INCREMENT,
  `transaction_code` varchar(30) NOT NULL,
  `admin_id` int(11) NOT NULL,
  `total_amount` decimal(12,2) NOT NULL,
  `payment_method` enum('cash','transfer') DEFAULT 'cash',
  `payment_received` decimal(12,2) DEFAULT NULL,
  `change_amount` decimal(12,2) DEFAULT NULL,
  `transaction_date` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`transaction_id`),
  UNIQUE KEY `transaction_code` (`transaction_code`),
  KEY `admin_id` (`admin_id`),
  CONSTRAINT `transactions_ibfk_1` FOREIGN KEY (`admin_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=49 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `transactions`
--

LOCK TABLES `transactions` WRITE;
/*!40000 ALTER TABLE `transactions` DISABLE KEYS */;
INSERT INTO `transactions` VALUES (40,'TRX-20250617-001',3,4000.00,'transfer',4000.00,0.00,'2025-06-17 12:35:00'),(41,'TRX-20250617-002',3,4000.00,'transfer',4000.00,0.00,'2025-06-17 12:35:13'),(42,'TRX-20250617-003',3,4000.00,'transfer',4000.00,0.00,'2025-06-17 12:35:16'),(43,'TRX-20250617-004',3,4000.00,'transfer',4000.00,0.00,'2025-06-17 12:35:19'),(44,'TRX-20250617-005',3,4000.00,'transfer',4000.00,0.00,'2025-06-17 12:35:22'),(45,'TRX-20250617-006',3,4000.00,'transfer',4000.00,0.00,'2025-06-17 12:35:25'),(46,'TRX-20250617-007',3,4000.00,'transfer',4000.00,0.00,'2025-06-17 12:35:27'),(47,'TRX-20250617-008',3,4000.00,'transfer',4000.00,0.00,'2025-06-17 12:35:30'),(48,'TRX-20250617-009',3,2000.00,'transfer',2000.00,0.00,'2025-06-17 12:35:34');
/*!40000 ALTER TABLE `transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `user_id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `role` enum('owner','admin') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `created_by` int(11) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  KEY `created_by` (`created_by`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (3,'owner','$2b$10$uXf5QuLRpC4TS.gWxMXnruCkA0KhzUqhaRe9Wtw86w88C9HwghQpa','Pemilik Toko','owner','2025-06-14 15:28:28',NULL,1),(9,'ADMIN01','$2b$10$Qmrz/73g0eZE5SqKC//BHu8.SRlDdYNsesVUy2tbEHEKxfJ6lHx9C','ADMIN01','admin','2025-06-16 10:55:59',3,1);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-06-17 20:49:16
