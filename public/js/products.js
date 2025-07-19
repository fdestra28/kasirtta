// public/js/products.js - KASIRTTA PRO REVAMP VERSION WITH PAGINATION

// ===== GLOBAL STATE FOR PRODUCTS PAGE =====
let allProductsList = [];
let editingProductId = null;
let currentVariants = []; // State untuk menyimpan daftar varian saat ini
let editingVariantIndex = -1; // State untuk melacak varian yang sedang diedit
let currentFilter = "all";
let productCurrentPage = 1;
const productLimit = 10; // Menetapkan 10 item per halaman
let productEventListenersInitialized = false;
let importData = []; // Tetap pertahankan untuk fungsi import
let originalFileForUpload = null; // Menyimpan objek File asli untuk diupload jika backend memproses file mentah

/**
 * Initializes the product page, loads data, and sets up event listeners.
 */
async function initProducts() {
  productCurrentPage = 1; // Reset ke halaman 1 setiap kali init
  if (!productEventListenersInitialized) {
    setupProductPageEvents();
  }
  await loadProducts(); // Ini akan memuat data untuk halaman pertama
}

/**
 * Sets up all event listeners for the product page to prevent re-binding.
 */
function setupProductPageEvents() {
  // Filter tabs
  document.querySelectorAll("#productsPage .filter-tab").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      document
        .querySelectorAll("#productsPage .filter-tab")
        .forEach((t) => t.classList.remove("active"));
      e.currentTarget.classList.add("active");
      currentFilter = e.currentTarget.getAttribute("data-filter");
      productCurrentPage = 1; // Reset ke halaman pertama saat filter berubah
      renderProductTable();
    });
  });

  // Search filter input with debounce
  let searchTimeout;
  document.getElementById("productFilter").addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      productCurrentPage = 1; // Reset ke halaman pertama saat mencari
      renderProductTable();
    }, 300);
  });

  // Main action buttons
  document
    .getElementById("addProductBtn")
    .addEventListener("click", () => openProductModal());
  document
    .getElementById("exportProductBtn")
    .addEventListener("click", exportProducts);
  document
    .getElementById("importProductBtn")
    .addEventListener("click", () =>
      document.getElementById("importFile").click()
    );
  document
    .getElementById("importFile")
    .addEventListener("change", handleImportFile);

  // Pagination buttons
  document.getElementById("productPrevBtn").addEventListener("click", () => {
    if (productCurrentPage > 1) {
      productCurrentPage--;
      renderProductTable();
    }
  });
  document.getElementById("productNextBtn").addEventListener("click", () => {
    productCurrentPage++;
    renderProductTable();
  });

  // Modals (event listener ini sudah ada dari sebelumnya, kita pastikan ada)
  document
    .getElementById("productForm")
    .addEventListener("submit", saveProduct);
  document
    .getElementById("cancelProductModal")
    .addEventListener("click", () => closeModal("productModal"));
  document
    .getElementById("hasVariantsToggle")
    .addEventListener("change", handleVariantToggle);
  document
    .getElementById("addVariantBtn")
    .addEventListener("click", addVariant);
  document
    .getElementById("itemType")
    .addEventListener("change", toggleStockFields);
  document
    .getElementById("confirmImport")
    .addEventListener("click", confirmImport);
  document.getElementById("cancelImport").addEventListener("click", () => {
    closeModal("importModal");
    document.getElementById("importFile").value = "";
  });

  productEventListenersInitialized = true;
}

/**
 * Fetches ALL product data from the API and stores it locally.
 * Pagination will be handled on the client-side for performance.
 */
async function loadProducts() {
  try {
    const response = await apiRequest("/products");
    const data = await response.json();

    if (data.success) {
      allProductsList = data.data;
      renderProductTable(); // Render tabel setelah data dimuat
    } else {
      showNotification("Gagal memuat data produk", "error");
    }
  } catch (error) {
    console.error("Load products error:", error);
  }
}

/**
 * Renders the product table with CLIENT-SIDE filtering and pagination.
 */
function renderProductTable() {
    const tbody = document.getElementById('productList');
    const filterText = document.getElementById('productFilter').value.toLowerCase();

    // ... (Logika filter dan paginasi tetap sama)
    let filteredProducts = allProductsList;
    if (currentFilter !== 'all') {
        filteredProducts = allProductsList.filter(p => p.item_type === currentFilter);
    }

    if (filterText) {
        filteredProducts = filteredProducts.filter(p =>
            p.item_name.toLowerCase().includes(filterText) ||
            (p.item_code && p.item_code.toLowerCase().includes(filterText))
        );
    }
    
    const offset = (productCurrentPage - 1) * productLimit;
    const paginatedProducts = filteredProducts.slice(offset, offset + productLimit);

    if (paginatedProducts.length === 0 && productCurrentPage === 1) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--color-text-muted);">Tidak ada produk yang cocok dengan filter.</td></tr>';
    } else {
        tbody.innerHTML = paginatedProducts.map((product, index) => {
            
            // --- LOGIKA BARU UNTUK MENAMPILKAN HARGA DAN STOK ---
            let priceDisplay = '';
            if (product.has_variants) {
                if (product.min_price === product.max_price) {
                    priceDisplay = formatCurrency(product.min_price);
                } else {
                    priceDisplay = `${formatCurrency(product.min_price)} - ${formatCurrency(product.max_price)}`;
                }
            } else {
                priceDisplay = formatCurrency(product.selling_price);
            }

            const stockDisplay = product.item_type === 'barang' ? (product.total_stock || 0) : '-';
            // --- AKHIR LOGIKA BARU ---

            return `
            <tr style="opacity: 0; transform: translateY(10px); animation: fadeInUp 0.3s ease ${index * 0.05}s forwards;">
                <td>${product.item_code}</td>
                <td>${product.item_name}</td>
                <td><span class="badge ${product.item_type === 'barang' ? 'badge-primary' : 'badge-secondary'}">${product.item_type}</span></td>
                <td>${priceDisplay}</td>
                <td>${product.has_variants ? 'Varian' : (product.item_type === 'barang' ? formatCurrency(product.purchase_price) : '-')}</td>
                <td>${stockDisplay}</td>
                <td>
                    <button class="btn btn-sm" onclick="editProduct(${product.product_id})"><ion-icon name="create-outline"></ion-icon></button>
                    ${currentUser.role === 'owner' ? `<button class="btn btn-sm btn-danger" onclick="deleteProduct(${product.product_id})"><ion-icon name="trash-outline"></ion-icon></button>` : ''}
                </td>
            </tr>
        `}).join('');
    }
    
    updateProductPagination(filteredProducts.length);
}

/**
 * Updates the state and text of pagination buttons for the product page.
 */
function updateProductPagination(totalItems) {
  document.getElementById(
    "productPageInfo"
  ).textContent = `Halaman ${productCurrentPage}`;
  document.getElementById("productPrevBtn").disabled = productCurrentPage === 1;
  document.getElementById("productNextBtn").disabled =
    productCurrentPage * productLimit >= totalItems;
}

// ... (Sisa fungsi lain seperti openProductModal, editProduct, saveProduct, deleteProduct, toggleStockFields, dll. tetap sama persis seperti sebelumnya) ...
function openProductModal() {
    editingProductId = null;
    currentVariants = []; // Reset varian
    editingVariantIndex = -1;

    document.getElementById('productModalTitle').textContent = 'Tambah Produk/Jasa';
    document.getElementById('productForm').reset();
    document.getElementById('itemType').disabled = false;
    
    // Set toggle ke posisi off
    document.getElementById('hasVariantsToggle').checked = false;
    handleVariantToggle();
    renderVariantsUI();

    openModal('productModal');
}

async function editProduct(productId) {
    // Gunakan endpoint baru yang kita buat
    const response = await apiRequest(`/products/${productId}/with-variants`);
    const data = await response.json();
    if (!data.success) {
        showNotification('Gagal mengambil data produk', 'error');
        return;
    }
    
    const product = data.data;
    editingProductId = productId;
    currentVariants = product.variants || [];
    editingVariantIndex = -1;

    document.getElementById('productModalTitle').textContent = 'Edit Produk/Jasa';
    document.getElementById('productForm').reset();
    
    document.getElementById('itemName').value = product.item_name;
    document.getElementById('itemType').value = product.item_type;
    document.getElementById('itemType').disabled = true;

    // Set toggle sesuai data dari database
    document.getElementById('hasVariantsToggle').checked = product.has_variants;
    handleVariantToggle();

    if (product.has_variants) {
        renderVariantsUI();
    } else {
        document.getElementById('sellingPrice').value = product.selling_price;
        document.getElementById('purchasePrice').value = product.purchase_price;
        document.getElementById('currentStock').value = product.current_stock;
        document.getElementById('minStock').value = product.min_stock;
    }

    openModal('productModal');
}
window.editProduct = editProduct;

async function saveProduct(e) {
    e.preventDefault();
    const hasVariants = document.getElementById('hasVariantsToggle').checked;

    let productData = {
        item_name: document.getElementById('itemName').value,
        item_type: document.getElementById('itemType').value,
        has_variants: hasVariants,
        is_active: true // Asumsi selalu aktif saat dibuat/diedit
    };

    if (hasVariants) {
        if (currentVariants.length === 0) {
            showNotification('Jika varian diaktifkan, minimal harus ada satu varian.', 'error');
            return;
        }
        productData.variants = currentVariants;
    } else {
        productData.selling_price = parseFloat(document.getElementById('sellingPrice').value);
        productData.purchase_price = parseFloat(document.getElementById('purchasePrice').value) || 0;
        productData.current_stock = parseInt(document.getElementById('currentStock').value) || 0;
        productData.min_stock = parseInt(document.getElementById('minStock').value) || 10;
    }
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-sm"></span> Menyimpan...';
    
    try {
        const response = editingProductId
            ? await apiRequest(`/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(productData) })
            : await apiRequest('/products', { method: 'POST', body: JSON.stringify(productData) });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(editingProductId ? 'Produk berhasil diupdate' : 'Produk berhasil ditambahkan', 'success');
            closeModal('productModal');
            loadProducts();
        } else {
            showNotification(data.message || 'Gagal menyimpan produk', 'error');
        }
    } catch (error) {
        console.error('Save product error:', error);
        showNotification('Terjadi kesalahan koneksi', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<ion-icon name="save-outline"></ion-icon> Simpan';
    }
}

async function deleteProduct(productId) {
  const product = allProductsList.find((p) => p.product_id === productId);
  if (!product) return;
  if (
    !confirm(
      `Yakin ingin menghapus produk "${product.item_name}"?\nJika produk sudah pernah transaksi, produk hanya akan dinonaktifkan.`
    )
  ) {
    return;
  }
  try {
    const response = await apiRequest(`/products/${productId}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (data.success) {
      showNotification(data.message, "success");
      loadProducts();
    } else {
      showNotification(data.message || "Gagal menghapus produk", "error");
    }
  } catch (error) {
    console.error("Delete product error:", error);
    showNotification("Terjadi kesalahan saat menghapus produk", "error");
  }
}
window.deleteProduct = deleteProduct;

function toggleStockFields() {
  const itemType = document.getElementById("itemType").value;
  const isBarang = itemType === "barang";
  document.getElementById("stockGroup").style.display = isBarang
    ? "block"
    : "none";
  document.getElementById("minStockGroup").style.display = isBarang
    ? "block"
    : "none";
  document.getElementById("purchasePriceGroup").style.display = isBarang
    ? "block"
    : "none";
}

// ... (Fungsi import/export tetap sama, tidak perlu diubah)
function exportProducts() {
    if (allProductsList.length === 0) {
        showNotification('Tidak ada data untuk di-export', 'error');
        return;
    }

    let csvContent = 'item_name,item_type,variant_name,selling_price,purchase_price,current_stock,min_stock\n';

    allProductsList.forEach(p => {
        if (p.has_variants) {
            // Baris untuk Produk Induk
            csvContent += `"${p.item_name}","${p.item_type}","","",,,"${p.min_stock}"\n`;
            // Baris untuk setiap Varian
            if (p.variants && p.variants.length > 0) {
                p.variants.forEach(v => {
                    csvContent += `,"${p.item_type}","${v.variant_name}","${v.selling_price}","${v.purchase_price}","${v.current_stock}","${v.min_stock}"\n`;
                });
            }
        } else {
            // Baris untuk Produk Tunggal
            csvContent += `"${p.item_name}","${p.item_type}","","${p.selling_price}","${p.purchase_price}","${p.current_stock}","${p.min_stock}"\n`;
        }
    });

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Produk_KASIRTTA_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    showNotification('Data produk berhasil di-export!', 'success');
}

// function handleImportFile(e) { /* Logika tidak berubah */ }
// function showImportPreview() { /* Logika tidak berubah */ }
// async function confirmImport() { /* Logika tidak berubah */ }

/**
 * Dipanggil ketika user memilih file untuk diimpor.
 * Membaca file, mem-parse datanya, dan menampilkan preview.
 * @param {Event} e - Event dari input file.
 */

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) {
    importData = [];
    originalFileForUpload = null;
    return;
  }

  originalFileForUpload = file; // Simpan file asli jika backend yang akan parse
  const reader = new FileReader();

  reader.onload = function (event) {
    const data = event.target.result;
    try {
      if (file.name.endsWith(".csv")) {
        // Parsing CSV sederhana
        const csvText = new TextDecoder().decode(data); // Jika 'data' adalah ArrayBuffer
        // const csvText = data; // Jika 'data' sudah string (tergantung reader.readAs...)
        const lines = csvText.split(/\r\n|\n/);
        if (lines.length < 2)
          throw new Error("File CSV tidak valid atau kosong.");

        const headers = lines[0].split(",").map((h) => h.trim());
        importData = []; // Reset importData
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() === "") continue; // Lewati baris kosong
          const values = lines[i].split(",");
          let obj = {};
          headers.forEach((header, index) => {
            obj[header] = values[index] ? values[index].trim() : "";
          });
          importData.push(obj);
        }
      } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        if (typeof XLSX === "undefined") {
          showNotification(
            "Library XLSX (SheetJS) tidak termuat. Tidak bisa memproses file Excel.",
            "error"
          );
          throw new Error("XLSX library not loaded.");
        }
        const workbook = XLSX.read(data, { type: "array" }); // atau 'binary' jika readAsBinaryString
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        importData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        }); // header:1 agar array of arrays, baris pertama header
        // Jika ingin objek, gunakan: importData = XLSX.utils.sheet_to_json(worksheet, { defval:"" });
      } else {
        throw new Error(
          "Format file tidak didukung. Harap unggah file CSV atau Excel (.xls, .xlsx)."
        );
      }

      if (importData.length === 0) {
        showNotification(
          "File tidak berisi data atau format tidak dikenal.",
          "warning"
        );
        return;
      }
      showImportPreview(); // Tampilkan modal preview
    } catch (error) {
      console.error("Error parsing file:", error);
      showNotification(`Gagal memproses file: ${error.message}`, "error");
      importData = [];
      originalFileForUpload = null;
    }
  };

  reader.onerror = function () {
    showNotification("Gagal membaca file.", "error");
    importData = [];
    originalFileForUpload = null;
  };

  // Pilih cara membaca file berdasarkan tipe atau kebutuhan parsing
  if (file.name.endsWith(".csv")) {
    reader.readAsArrayBuffer(file); // Atau readAsText(file)
  } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
    reader.readAsArrayBuffer(file); // XLSX.read lebih suka ArrayBuffer atau string biner
  } else {
    showNotification(
      "Format file tidak didukung. Harap unggah file CSV atau Excel.",
      "error"
    );
    e.target.value = ""; // Reset input file
    return;
  }

  // Reset input file agar bisa memilih file yang sama lagi jika ada perubahan/kesalahan
  e.target.value = "";
}
window.handleImportFile = handleImportFile; // Jika dipanggil dari HTML onclick

/**
 * Menampilkan data yang akan diimpor dalam modal preview.
 */
function showImportPreview() {
  const previewDiv = document.getElementById("importPreview");
  if (importData.length === 0) {
    previewDiv.innerHTML =
      '<p class="text-muted">Tidak ada data untuk ditampilkan.</p>';
    openModal("importModal");
    // Mungkin disable tombol konfirmasi jika tidak ada data
    document.getElementById("confirmImport").disabled = true;
    return;
  }

  let tableHTML = '<table class="import-preview-table"><thead><tr>';
  // Asumsi importData dari XLSX (header:1) adalah array of arrays, baris pertama adalah header
  // Atau jika CSV, importData adalah array of objects, ambil keys dari objek pertama
  let headers;
  if (Array.isArray(importData[0])) {
    // Untuk XLSX dengan header:1
    headers = importData[0];
  } else if (typeof importData[0] === "object" && importData[0] !== null) {
    // Untuk CSV yang diparse jadi objek
    headers = Object.keys(importData[0]);
  } else {
    previewDiv.innerHTML =
      '<p class="text-danger">Format data preview tidak dikenal.</p>';
    openModal("importModal");
    document.getElementById("confirmImport").disabled = true;
    return;
  }

  headers.forEach((header) => {
    tableHTML += `<th>${header}</th>`;
  });
  tableHTML += "</tr></thead><tbody>";

  const dataRows = Array.isArray(importData[0])
    ? importData.slice(1)
    : importData;

  dataRows.slice(0, 20).forEach((row) => {
    // Tampilkan N baris pertama untuk preview (misal 20)
    tableHTML += "<tr>";
    if (Array.isArray(row)) {
      // Untuk XLSX dengan header:1
      row.forEach((cell) => {
        tableHTML += `<td>${
          cell !== null && cell !== undefined ? cell : ""
        }</td>`;
      });
    } else if (typeof row === "object" && row !== null) {
      // Untuk CSV yang diparse jadi objek
      headers.forEach((header) => {
        tableHTML += `<td>${
          row[header] !== null && row[header] !== undefined ? row[header] : ""
        }</td>`;
      });
    }
    tableHTML += "</tr>";
  });
  tableHTML += "</tbody></table>";
  if (dataRows.length > 20) {
    tableHTML += `<p class="text-muted">Menampilkan 20 dari ${dataRows.length} baris data...</p>`;
  }

  previewDiv.innerHTML = tableHTML;
  document.getElementById("confirmImport").disabled = false;
  openModal("importModal");
}
window.showImportPreview = showImportPreview;

/**
 * Mengirim file yang sudah dipilih ke backend untuk diproses.
 */
async function confirmImport() {
  if (!originalFileForUpload) {
    // Kita akan selalu mengirim file asli ke backend
    showNotification(
      "Tidak ada file yang dipilih atau data preview tidak valid.",
      "error"
    );
    return;
  }

  const formData = new FormData();
  formData.append("importFile", originalFileForUpload); // 'importFile' harus sama dengan nama field di multer backend

  const importButton = document.getElementById("confirmImport");
  const originalButtonText = importButton.innerHTML;
  importButton.disabled = true;
  importButton.innerHTML = '<span class="spinner-sm"></span> Mengimpor...';

  try {
    const response = await fetch(`${API_URL}/products/import`, {
      // Pastikan API_URL sudah benar
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
        // 'Content-Type': 'multipart/form-data' TIDAK PERLU DISET MANUAL untuk FormData
      },
      body: formData,
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showNotification(
        data.message || "Proses impor berhasil atau sedang berjalan.",
        "success"
      );
      if (data.data && data.data.errors && data.data.errors.length > 0) {
        let errorMessages = "Detail impor:\n";
        data.data.errors
          .slice(0, 5)
          .forEach((err) => (errorMessages += `- ${err}\n`)); // Tampilkan beberapa error
        if (data.data.errors.length > 5)
          errorMessages += `Dan ${
            data.data.errors.length - 5
          } error lainnya (lihat console).`;
        console.warn("Detail lengkap impor:", data.data);
        // Pertimbangkan untuk menampilkan ini di UI yang lebih baik daripada alert
        alert(errorMessages);
      }
      await loadProducts(); // Muat ulang daftar produk
    } else {
      showNotification(data.message || "Gagal mengimpor produk.", "error");
      if (data.error) console.error("Import error detail:", data.error);
    }
  } catch (error) {
    console.error("Error importing products:", error);
    showNotification(
      "Terjadi kesalahan jaringan saat mengimpor produk.",
      "error"
    );
  } finally {
    importButton.disabled = false;
    importButton.innerHTML = originalButtonText;
    closeModal("importModal");
    importData = []; // Kosongkan setelah proses
    originalFileForUpload = null;
    const fileInput = document.getElementById("importFile"); // Reset input file
    if (fileInput) fileInput.value = "";
  }
}
window.confirmImport = confirmImport;

function downloadTemplate() {
    // Header baru mencakup kolom untuk varian
    let csvContent = 'item_name,item_type,variant_name,selling_price,purchase_price,current_stock,min_stock\n';
    
    // Contoh untuk produk dengan varian
    csvContent += '"Kertas Sukun","barang","","",,,"10"\n'; // Produk Induk
    csvContent += ',"barang","Merah","2000","1000","50","10"\n'; // Varian 1
    csvContent += ',"barang","Kuning","2000","1000","50","10"\n'; // Varian 2
    
    // Contoh untuk produk tunggal
    csvContent += '"Buku Tulis","barang","","4000","3000","100","20"\n';
    
    // Contoh untuk jasa
    csvContent += '"Jasa Jilid Spiral","jasa","","15000","0","0","0"\n';

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Template_Import_Produk_Varian.csv';
    link.click();
}
window.downloadTemplate = downloadTemplate;

/**
 * Menangani logika show/hide saat toggle varian diaktifkan/dinonaktifkan.
 */
function handleVariantToggle() {
    const isChecked = document.getElementById('hasVariantsToggle').checked;
    document.getElementById('singleProductFields').style.display = isChecked ? 'none' : 'block';
    document.getElementById('variantSection').style.display = isChecked ? 'block' : 'none';

    // Membuat field harga jual produk tunggal tidak required jika varian aktif
    document.getElementById('sellingPrice').required = !isChecked;
}

/**
 * Merender daftar varian dari state `currentVariants` ke dalam UI.
 */
function renderVariantsUI() {
    const listContainer = document.getElementById('variantList');
    if (currentVariants.length === 0) {
        listContainer.innerHTML = '<p class="text-muted text-center">Belum ada varian ditambahkan.</p>';
        return;
    }

    listContainer.innerHTML = currentVariants.map((v, index) => `
        <div class="variant-item">
            <div class="variant-item-details">
                <span><strong>${v.variant_name}</strong></span>
                <span class="text-success">${formatCurrency(v.selling_price)}</span>
                <span>Stok: ${v.current_stock || 0}</span>
            </div>
            <div class="variant-item-actions">
                <button type="button" class="btn btn-sm" onclick="editVariant(${index})"><ion-icon name="create-outline"></ion-icon></button>
                <button type="button" class="btn btn-sm btn-danger" onclick="deleteVariant(${index})"><ion-icon name="trash-outline"></ion-icon></button>
            </div>
        </div>
    `).join('');
}

/**
 * Menambahkan atau mengupdate varian ke dalam state `currentVariants`.
 */
function addVariant() {
    const name = document.getElementById('variantName').value.trim();
    const sellingPrice = parseFloat(document.getElementById('variantSellingPrice').value);
    const purchasePrice = parseFloat(document.getElementById('variantPurchasePrice').value) || 0;
    const stock = parseInt(document.getElementById('variantStock').value) || 0;
    const minStock = parseInt(document.getElementById('variantMinStock').value) || 10;

    if (!name || isNaN(sellingPrice)) {
        showNotification('Nama varian dan harga jual harus diisi!', 'error');
        return;
    }

    const newVariant = {
        variant_name: name,
        selling_price: sellingPrice,
        purchase_price: purchasePrice,
        current_stock: stock,
        min_stock: minStock,
        is_active: true
    };
    
    if (editingVariantIndex > -1) {
        // Update
        currentVariants[editingVariantIndex] = {...currentVariants[editingVariantIndex], ...newVariant};
    } else {
        // Add new
        currentVariants.push(newVariant);
    }

    // Reset form
    editingVariantIndex = -1;
    document.getElementById('variantName').value = '';
    document.getElementById('variantSellingPrice').value = '';
    document.getElementById('variantPurchasePrice').value = '';
    document.getElementById('variantStock').value = '';
    document.getElementById('variantMinStock').value = '10';
    document.getElementById('addVariantBtn').innerHTML = '<ion-icon name="add-outline"></ion-icon> Tambah Varian';
    document.getElementById('variantName').focus();

    renderVariantsUI();
}

/**
 * Menyiapkan form untuk mengedit varian yang ada.
 * @param {number} index - Index varian di array `currentVariants`.
 */
function editVariant(index) {
    const variant = currentVariants[index];
    if (!variant) return;

    editingVariantIndex = index;
    document.getElementById('variantName').value = variant.variant_name;
    document.getElementById('variantSellingPrice').value = variant.selling_price;
    document.getElementById('variantPurchasePrice').value = variant.purchase_price;
    document.getElementById('variantStock').value = variant.current_stock;
    document.getElementById('variantMinStock').value = variant.min_stock;
    document.getElementById('addVariantBtn').innerHTML = '<ion-icon name="save-outline"></ion-icon> Update Varian';
    document.getElementById('variantName').focus();
}
window.editVariant = editVariant;

/**
 * Menghapus varian dari state `currentVariants`.
 * @param {number} index - Index varian di array `currentVariants`.
 */
function deleteVariant(index) {
    if (confirm(`Yakin ingin menghapus varian "${currentVariants[index].variant_name}"?`)) {
        currentVariants.splice(index, 1);
        renderVariantsUI();
    }
}
window.deleteVariant = deleteVariant;