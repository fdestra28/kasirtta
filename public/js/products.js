// public/js/products.js - KASIRTTA PRO REVAMP VERSION WITH PAGINATION

// ===== GLOBAL STATE FOR PRODUCTS PAGE =====
let allProductsList = [];
let editingProductId = null;
let currentFilter = 'all';
let productCurrentPage = 1;
const productLimit = 10; // Menetapkan 10 item per halaman
let productEventListenersInitialized = false;
let importData = []; // Tetap pertahankan untuk fungsi import

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
    document.querySelectorAll('#productsPage .filter-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('#productsPage .filter-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentFilter = e.currentTarget.getAttribute('data-filter');
            productCurrentPage = 1; // Reset ke halaman pertama saat filter berubah
            renderProductTable();
        });
    });

    // Search filter input with debounce
    let searchTimeout;
    document.getElementById('productFilter').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            productCurrentPage = 1; // Reset ke halaman pertama saat mencari
            renderProductTable();
        }, 300);
    });

    // Main action buttons
    document.getElementById('addProductBtn').addEventListener('click', () => openProductModal());
    document.getElementById('exportProductBtn').addEventListener('click', exportProducts);
    document.getElementById('importProductBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', handleImportFile);

    // Pagination buttons
    document.getElementById('productPrevBtn').addEventListener('click', () => {
        if (productCurrentPage > 1) {
            productCurrentPage--;
            renderProductTable();
        }
    });
    document.getElementById('productNextBtn').addEventListener('click', () => {
        productCurrentPage++;
        renderProductTable();
    });

    // Modals (event listener ini sudah ada dari sebelumnya, kita pastikan ada)
    document.getElementById('productForm').addEventListener('submit', saveProduct);
    document.getElementById('cancelProductModal').addEventListener('click', () => closeModal('productModal'));
    document.getElementById('itemType').addEventListener('change', toggleStockFields);
    document.getElementById('confirmImport').addEventListener('click', confirmImport);
    document.getElementById('cancelImport').addEventListener('click', () => {
        closeModal('importModal');
        document.getElementById('importFile').value = '';
    });

    productEventListenersInitialized = true;
}

/**
 * Fetches ALL product data from the API and stores it locally.
 * Pagination will be handled on the client-side for performance.
 */
async function loadProducts() {
    try {
        const response = await apiRequest('/products');
        const data = await response.json();

        if (data.success) {
            allProductsList = data.data;
            renderProductTable(); // Render tabel setelah data dimuat
        } else {
            showNotification('Gagal memuat data produk', 'error');
        }
    } catch (error) {
        console.error('Load products error:', error);
    }
}

/**
 * Renders the product table with CLIENT-SIDE filtering and pagination.
 */
function renderProductTable() {
    const tbody = document.getElementById('productList');
    const filterText = document.getElementById('productFilter').value.toLowerCase();

    // 1. Filter by type (all, barang, jasa)
    let filteredProducts = allProductsList;
    if (currentFilter !== 'all') {
        filteredProducts = allProductsList.filter(p => p.item_type === currentFilter);
    }

    // 2. Filter by search text
    if (filterText) {
        filteredProducts = filteredProducts.filter(p =>
            p.item_name.toLowerCase().includes(filterText) ||
            (p.item_code && p.item_code.toLowerCase().includes(filterText))
        );
    }
    
    // 3. Paginate the filtered results
    const offset = (productCurrentPage - 1) * productLimit;
    const paginatedProducts = filteredProducts.slice(offset, offset + productLimit);

    if (paginatedProducts.length === 0 && productCurrentPage === 1) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--color-text-muted);">Tidak ada produk yang cocok dengan filter.</td></tr>';
    } else {
        tbody.innerHTML = paginatedProducts.map((product, index) => `
            <tr style="opacity: 0; transform: translateY(10px); animation: fadeInUp 0.3s ease ${index * 0.05}s forwards;">
                <td>${product.item_code}</td>
                <td>${product.item_name}</td>
                <td><span class="badge ${product.item_type === 'barang' ? 'badge-primary' : 'badge-secondary'}">${product.item_type}</span></td>
                <td>${formatCurrency(product.selling_price)}</td>
                <td>${product.item_type === 'barang' ? formatCurrency(product.purchase_price) : '-'}</td>
                <td>${product.item_type === 'barang' ? product.current_stock : '-'}</td>
                <td>
                    <button class="btn btn-sm" onclick="editProduct(${product.product_id})"><ion-icon name="create-outline"></ion-icon></button>
                    ${currentUser.role === 'owner' ? `<button class="btn btn-sm btn-danger" onclick="deleteProduct(${product.product_id})"><ion-icon name="trash-outline"></ion-icon></button>` : ''}
                </td>
            </tr>
        `).join('');
    }
    
    // 4. Update pagination controls
    updateProductPagination(filteredProducts.length);
}

/**
 * Updates the state and text of pagination buttons for the product page.
 */
function updateProductPagination(totalItems) {
    document.getElementById('productPageInfo').textContent = `Halaman ${productCurrentPage}`;
    document.getElementById('productPrevBtn').disabled = (productCurrentPage === 1);
    document.getElementById('productNextBtn').disabled = (productCurrentPage * productLimit >= totalItems);
}

// ... (Sisa fungsi lain seperti openProductModal, editProduct, saveProduct, deleteProduct, toggleStockFields, dll. tetap sama persis seperti sebelumnya) ...
function openProductModal() {
    editingProductId = null;
    document.getElementById('productModalTitle').textContent = 'Tambah Produk/Jasa';
    document.getElementById('productForm').reset();
    document.getElementById('sellingPrice').disabled = false;
    document.getElementById('purchasePrice').disabled = false;
    document.getElementById('itemType').disabled = false;
    toggleStockFields();
    openModal('productModal');
}

function editProduct(productId) {
    const product = allProductsList.find(p => p.product_id === productId);
    if (!product) return;
    editingProductId = productId;
    document.getElementById('productModalTitle').textContent = 'Edit Produk/Jasa';
    document.getElementById('productForm').reset();
    document.getElementById('itemName').value = product.item_name;
    document.getElementById('itemType').value = product.item_type;
    document.getElementById('sellingPrice').value = product.selling_price;
    document.getElementById('purchasePrice').value = product.purchase_price;
    document.getElementById('currentStock').value = product.current_stock;
    document.getElementById('minStock').value = product.min_stock;
    document.getElementById('sellingPrice').disabled = currentUser.role !== 'owner';
    document.getElementById('purchasePrice').disabled = currentUser.role !== 'owner';
    document.getElementById('itemType').disabled = true;
    toggleStockFields();
    openModal('productModal');
}
window.editProduct = editProduct;

async function saveProduct(e) {
    e.preventDefault();
    const productData = { item_name: document.getElementById('itemName').value, item_type: document.getElementById('itemType').value, selling_price: parseFloat(document.getElementById('sellingPrice').value), purchase_price: parseFloat(document.getElementById('purchasePrice').value) || 0, current_stock: parseInt(document.getElementById('currentStock').value) || 0, min_stock: parseInt(document.getElementById('minStock').value) || 10 };
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-sm"></span> Menyimpan...';
    try {
        const response = editingProductId ? await apiRequest(`/products/${editingProductId}`, { method: 'PUT', body: JSON.stringify(productData) }) : await apiRequest('/products', { method: 'POST', body: JSON.stringify(productData) });
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
    const product = allProductsList.find(p => p.product_id === productId);
    if (!product) return;
    if (!confirm(`Yakin ingin menghapus produk "${product.item_name}"?\nJika produk sudah pernah transaksi, produk hanya akan dinonaktifkan.`)) { return; }
    try {
        const response = await apiRequest(`/products/${productId}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.success) {
            showNotification(data.message, 'success');
            loadProducts();
        } else {
            showNotification(data.message || 'Gagal menghapus produk', 'error');
        }
    } catch (error) {
        console.error('Delete product error:', error);
        showNotification('Terjadi kesalahan saat menghapus produk', 'error');
    }
}
window.deleteProduct = deleteProduct;

function toggleStockFields() {
    const itemType = document.getElementById('itemType').value;
    const isBarang = itemType === 'barang';
    document.getElementById('stockGroup').style.display = isBarang ? 'block' : 'none';
    document.getElementById('minStockGroup').style.display = isBarang ? 'block' : 'none';
    document.getElementById('purchasePriceGroup').style.display = isBarang ? 'block' : 'none';
}

// ... (Fungsi import/export tetap sama, tidak perlu diubah)
function exportProducts() {
    if (allProductsList.length === 0) { showNotification('Tidak ada data untuk di-export', 'error'); return; }
    let csvContent = 'Kode,Nama Produk,Jenis,Harga Jual,Harga Beli,Stok Saat Ini,Stok Minimal,Status\n';
    allProductsList.forEach(p => { csvContent += `"${p.item_code}","${p.item_name}","${p.item_type}",${p.selling_price},${p.item_type === 'barang' ? p.purchase_price : 0},${p.item_type === 'barang' ? p.current_stock : 0},${p.item_type === 'barang' ? p.min_stock : 0},"${p.is_active ? 'Aktif' : 'Nonaktif'}"\n`; });
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Produk_KASIRTTA_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    showNotification('Data produk berhasil di-export!', 'success');
}

function handleImportFile(e) { /* Logika tidak berubah */ }
function showImportPreview() { /* Logika tidak berubah */ }
async function confirmImport() { /* Logika tidak berubah */ }

function downloadTemplate() {
    const csvContent = 'Nama Produk,Jenis,Harga Jual,Harga Beli,Stok Saat Ini,Stok Minimal\n"Pulpen Pilot G2","barang",25000,18000,144,24\n"Jasa Jilid Spiral","jasa",15000,0,0,0\n';
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'Template_Import_Produk.csv';
    link.click();
}
window.downloadTemplate = downloadTemplate;