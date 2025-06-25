// public/js/cashier.js - TOKOATK PRO REVAMP VERSION

// ===== GLOBAL STATE FOR CASHIER PAGE =====
let cart = [];
let allProducts = [];
let popularProducts = [];
let searchTimeout;
let debounceTimer; // <-- TAMBAHKAN VARIABEL UNTUK DEBOUNCING
let currentTab = 'all';
let selectedProductIndex = -1;
let cashierEventListenersInitialized = false;

// ===== INITIALIZATION =====
async function initCashier() {
    cart = [];
    selectedProductIndex = -1;
    currentTab = 'all';
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === 'all');
    });
    await loadCashierData();
    if (!cashierEventListenersInitialized) {
        setupCashierEventListeners();
    }
    renderCart();
    renderProductList();
    setTimeout(() => document.getElementById('productSearch').focus(), 100);
}

function setupCashierEventListeners() {
    const productSearchInput = document.getElementById('productSearch');
    const productListDiv = document.getElementById('productListKasir');

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            productSearchInput.value = '';
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentTab = e.currentTarget.getAttribute('data-tab');
            renderProductList();
        });
    });

    productSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            renderProductList(e.target.value.toLowerCase());
        }, 300);
    });

    productSearchInput.addEventListener('keydown', handleKeyboardNavigation);
    productListDiv.addEventListener('keydown', handleKeyboardNavigation);
    document.getElementById('paymentMethod').addEventListener('change', handlePaymentMethodChange);
    
    // --- PERBAIKAN PERFORMA (DEBOUNCING) ---
    // Ganti event listener input yang lama dengan yang baru ini.
    document.getElementById('paymentReceived').addEventListener('input', () => {
        clearTimeout(debounceTimer); // Hapus timer yang ada
        // Set timer baru. Fungsi calculateChange hanya akan jalan setelah 300ms tidak ada ketikan baru.
        debounceTimer = setTimeout(() => {
            calculateChange();
        }, 300); 
    });
    // --- AKHIR PERBAIKAN ---

    document.getElementById('processTransaction').addEventListener('click', processTransaction);
    document.getElementById('clearCart').addEventListener('click', clearCartAction);
    document.getElementById('receiptCloseBtn').addEventListener('click', () => closeModal('receiptPreviewModal'));
    document.querySelector('#receiptPreviewModal .close').addEventListener('click', () => closeModal('receiptPreviewModal'));

    cashierEventListenersInitialized = true;
}

// ... (sisa fungsi di file cashier.js tetap sama, tidak perlu diubah) ...
async function loadCashierData() {
    try {
        const [productsResponse, popularResponse] = await Promise.all([
            apiRequest('/products?active=true'),
            apiRequest('/transactions/popular-products')
        ]);
        const productsData = await productsResponse.json();
        if (productsData.success) {
            allProducts = productsData.data.sort((a, b) => a.item_name.localeCompare(b.item_name));
        }
        const popularData = await popularResponse.json();
        if (popularData.success) {
            popularProducts = popularData.data;
        }
    } catch (error) {
        console.error('Failed to load cashier data:', error);
        showNotification('Gagal memuat data produk', 'error');
    }
}

function renderProductList(searchTerm = '') {
    const productListDiv = document.getElementById('productListKasir');
    selectedProductIndex = -1;
    let productsToShow = [];
    switch (currentTab) {
        case 'barang': productsToShow = allProducts.filter(p => p.item_type === 'barang' && p.is_active); break;
        case 'jasa': productsToShow = allProducts.filter(p => p.item_type === 'jasa' && p.is_active); break;
        case 'popular': productsToShow = popularProducts.filter(p => p.is_active); break;
        default: productsToShow = allProducts.filter(p => p.is_active); break;
    }
    if (searchTerm) {
        productsToShow = productsToShow.filter(p => p.item_name.toLowerCase().includes(searchTerm) || (p.item_code && p.item_code.toLowerCase().includes(searchTerm)));
    }
    if (productsToShow.length === 0) {
        productListDiv.innerHTML = `<p style="text-align: center; padding: 40px; color: var(--color-text-muted);">${searchTerm ? 'Produk tidak ditemukan' : 'Tidak ada produk di kategori ini.'}</p>`;
        return;
    }
    productListDiv.setAttribute('tabindex', '-1');
    productListDiv.innerHTML = productsToShow.map(product => {
        const isOutOfStock = product.item_type === 'barang' && product.current_stock <= 0;
        return `<div class="product-card ${isOutOfStock ? 'out-of-stock' : ''}" onclick="${isOutOfStock ? '' : `quickAddToCart(${product.product_id})`}" data-product-id="${product.product_id}" tabindex="-1"><span class="product-type-badge ${product.item_type}">${product.item_type}</span><div class="product-name" title="${product.item_name}">${product.item_name}</div><div class="product-price">${formatCurrency(product.selling_price)}</div>${product.item_type === 'barang' ? `<div class="product-stock">Stok: ${product.current_stock}</div>` : '<div class="product-stock"> </div>'}</div>`;
    }).join('');
}

function quickAddToCart(productId) {
    const card = document.querySelector(`.product-card[data-product-id='${productId}']`);
    if (card) {
        card.classList.add('adding');
        setTimeout(() => card.classList.remove('adding'), 300);
    }
    addToCart(productId);
}
window.quickAddToCart = quickAddToCart;

function addToCart(productId) {
    const product = allProducts.find(p => p.product_id === productId);
    if (!product) return;
    const existingItem = cart.find(item => item.product_id === productId);
    if (existingItem) {
        if (product.item_type === 'barang' && existingItem.quantity >= product.current_stock) {
            showNotification(`Stok ${product.item_name} tidak mencukupi!`, 'error');
            return;
        }
        existingItem.quantity++;
    } else {
        if (product.item_type === 'barang' && product.current_stock <= 0) {
            showNotification(`Stok ${product.item_name} habis!`, 'error');
            return;
        }
        cart.push({ product_id: product.product_id, item_name: product.item_name, item_type: product.item_type, selling_price: product.selling_price, current_stock: product.current_stock, quantity: 1 });
    }
    renderCart();
    document.getElementById('productSearch').focus();
}
window.addToCart = addToCart;

function updateQuantity(productId, newQuantity) {
    const item = cart.find(i => i.product_id === productId);
    if (!item) return;
    newQuantity = parseInt(newQuantity);
    if (newQuantity <= 0) {
        removeFromCart(productId);
        return;
    }
    if (item.item_type === 'barang' && newQuantity > item.current_stock) {
        showNotification(`Stok hanya tersedia ${item.current_stock} unit!`, 'error');
        const input = document.querySelector(`#cartItems input[onchange="updateQuantity(${productId}, this.value)"]`);
        if (input) input.value = item.current_stock;
        item.quantity = item.current_stock;
    } else {
        item.quantity = newQuantity;
    }
    renderCart();
}
window.updateQuantity = updateQuantity;

function removeFromCart(productId) {
    cart = cart.filter(item => item.product_id !== productId);
    renderCart();
}
window.removeFromCart = removeFromCart;

function renderCart() {
    const tbody = document.getElementById('cartItems');
    if (cart.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 48px; color: var(--color-text-muted);">Keranjang kosong</td></tr>';
    } else {
        tbody.innerHTML = cart.map(item => `<tr><td>${item.item_name}</td><td><input type="number" value="${item.quantity}" min="1" max="${item.item_type === 'barang' ? item.current_stock : 999}" class="form-input" style="width: 60px; text-align: center; padding: 4px;" onchange="updateQuantity(${item.product_id}, this.value)"></td><td>${formatCurrency(item.selling_price)}</td><td>${formatCurrency(item.selling_price * item.quantity)}</td><td><button class="btn btn-sm btn-danger" onclick="removeFromCart(${item.product_id})"><ion-icon name="trash-outline"></ion-icon></button></td></tr>`).join('');
    }
    calculateChange();
}

function calculateChange() {
    const totalAmount = cart.reduce((sum, item) => sum + (item.selling_price * item.quantity), 0);
    const paymentReceived = parseFloat(document.getElementById('paymentReceived').value) || 0;
    const change = paymentReceived - totalAmount;
    document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
    document.getElementById('changeAmount').textContent = formatCurrency(Math.max(0, change));
    const processBtn = document.getElementById('processTransaction');
    const paymentMethod = document.getElementById('paymentMethod').value;
    processBtn.disabled = !(cart.length > 0 && (paymentMethod === 'transfer' || paymentReceived >= totalAmount));
}

function handlePaymentMethodChange(e) {
    document.getElementById('cashPaymentGroup').style.display = e.target.value === 'cash' ? 'block' : 'none';
    calculateChange();
}

function clearCartAction() {
    if (cart.length > 0 && confirm('Hapus semua item dari keranjang?')) {
        cart = [];
        document.getElementById('paymentReceived').value = '';
        renderCart();
    }
}

async function processTransaction() {
    const processBtn = document.getElementById('processTransaction');
    if (processBtn.disabled) return;
    const transactionData = { items: cart.map(item => ({ product_id: item.product_id, quantity: item.quantity })), payment_method: document.getElementById('paymentMethod').value, payment_received: document.getElementById('paymentMethod').value === 'cash' ? parseFloat(document.getElementById('paymentReceived').value) : cart.reduce((s, i) => s + (i.selling_price * i.quantity), 0) };
    processBtn.disabled = true;
    processBtn.innerHTML = '<span class="spinner-sm"></span> Memproses...';
    try {
        const response = await apiRequest('/transactions', { method: 'POST', body: JSON.stringify(transactionData) });
        const data = await response.json();
        if (data.success) {
            showReceiptPreview(data.data);
            cart = [];
            document.getElementById('productSearch').value = '';
            document.getElementById('paymentReceived').value = '';
            renderCart();
            await loadCashierData();
            renderProductList();
        } else {
            showNotification(data.message || 'Transaksi gagal!', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan saat memproses transaksi', 'error');
    } finally {
        processBtn.innerHTML = '<ion-icon name="checkmark-circle-outline"></ion-icon> Proses Transaksi';
        calculateChange();
    }
}

function showReceiptPreview(transaction) {
    const contentDiv = document.getElementById('receiptPreviewContent');
    const storeName = appSettings.store_name || 'TokoATK Pro';
    const storeAddress = appSettings.store_address || '';
    const receiptHtml = `<div class="receipt-preview"><h3>${storeName}</h3><p>${storeAddress}</p><div class="receipt-info"><div><span>No:</span><span>${transaction.transaction_code}</span></div><div><span>Tgl:</span><span>${formatDate(transaction.transaction_date)}</span></div><div><span>Kasir:</span><span>${currentUser.full_name}</span></div></div><div class="receipt-items"><div class="item-line item-header"><span>Nama Item</span><span>Total</span></div>${transaction.items.map(item => `<div><div class="item-line"><span>${item.product_name}</span><span>${formatCurrency(item.subtotal)}</span></div><div class="item-details">${item.quantity} x ${formatCurrency(item.unit_price)}</div></div>`).join('')}</div><div class="receipt-total"><div><span>Total</span><span>${formatCurrency(transaction.total_amount)}</span></div><div><span>Bayar</span><span>${formatCurrency(transaction.payment_received)}</span></div><div><span>Kembali</span><span>${formatCurrency(transaction.change_amount)}</span></div></div><div class="receipt-footer"><p>Terima kasih!</p></div></div>`;
    contentDiv.innerHTML = receiptHtml;
    document.getElementById('receiptPrintBtn').onclick = () => printReceipt(transaction);
    openModal('receiptPreviewModal');
}

function handleKeyboardNavigation(e) {
    const productGrid = document.getElementById('productListKasir');
    const products = productGrid.querySelectorAll('.product-card:not(.out-of-stock)');
    if (products.length === 0) return;
    const gridStyle = window.getComputedStyle(productGrid);
    const gridTemplateColumns = gridStyle.getPropertyValue('grid-template-columns');
    const columnCount = gridTemplateColumns.split(' ').length;
    let nextIndex = selectedProductIndex;
    switch (e.key) {
        case 'ArrowRight': e.preventDefault(); nextIndex = (selectedProductIndex < products.length - 1) ? selectedProductIndex + 1 : selectedProductIndex; break;
        case 'ArrowLeft': e.preventDefault(); nextIndex = (selectedProductIndex > 0) ? selectedProductIndex - 1 : 0; break;
        case 'ArrowDown': e.preventDefault(); nextIndex = (selectedProductIndex === -1) ? 0 : Math.min(selectedProductIndex + columnCount, products.length - 1); break;
        case 'ArrowUp': e.preventDefault(); if (e.target.id === 'productSearch' && selectedProductIndex === -1) return; nextIndex = (selectedProductIndex >= columnCount) ? selectedProductIndex - columnCount : selectedProductIndex; break;
        case 'Enter': e.preventDefault(); if (selectedProductIndex !== -1 && products[selectedProductIndex]) { products[selectedProductIndex].click(); } return;
        case 'Escape': e.preventDefault(); if (selectedProductIndex !== -1) { products[selectedProductIndex].classList.remove('selected'); selectedProductIndex = -1; } document.getElementById('productSearch').focus(); return;
    }
    if (nextIndex !== selectedProductIndex) {
        if (selectedProductIndex !== -1 && products[selectedProductIndex]) {
            products[selectedProductIndex].classList.remove('selected');
        }
        if (products[nextIndex]) {
            products[nextIndex].classList.add('selected');
            products[nextIndex].focus();
            products[nextIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
        selectedProductIndex = nextIndex;
    }
}
window.quickAddToCart = quickAddToCart;
window.addToCart = addToCart;
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;