// public/js/cashier.js - KASIRTTA PRO REVAMP VERSION

// ===== GLOBAL STATE FOR CASHIER PAGE =====
let cart = [];
let allProducts = [];
let popularProducts = [];
let currentTab = "all";
let selectedProductIndex = -1;
let cashierEventListenersInitialized = false;
let pendingTransactionData = null;

// ===== INITIALIZATION =====
async function initCashier() {
  cart = [];
  selectedProductIndex = -1;
  currentTab = "all";
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === "all");
  });
  await loadCashierData();
  if (!cashierEventListenersInitialized) {
    setupCashierEventListeners();
  }
  renderCart();
  renderProductList();
  setTimeout(() => document.getElementById("productSearch").focus(), 100);
}

function setupCashierEventListeners() {
  if (cashierEventListenersInitialized) return; // Mencegah duplikasi listener

  const productSearchInput = document.getElementById("productSearch");
  const productListDiv = document.getElementById("productListKasir");

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      productSearchInput.value = "";
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      e.currentTarget.classList.add("active");
      currentTab = e.currentTarget.getAttribute("data-tab");
      renderProductList();
    });
  });

  productSearchInput.addEventListener("input", debounce((e) => {
      renderProductList(e.target.value.toLowerCase());
  }, 300));

  productSearchInput.addEventListener("keydown", handleKeyboardNavigation);
  productListDiv.addEventListener("keydown", handleKeyboardNavigation);
  document
    .getElementById("paymentMethod")
    .addEventListener("change", handlePaymentMethodChange);
  document.getElementById("paymentReceived").addEventListener("input", debounce(calculateChange, 300));
  document
    .getElementById("processTransaction")
    .addEventListener("click", processTransaction);
  document
    .getElementById("clearCart")
    .addEventListener("click", clearCartAction);
  document.getElementById("receiptCloseBtn").addEventListener("click", () => {
    closeModal("receiptPreviewModal");
    resetCashierState(); // Panggil reset di sini
  });
  document
    .querySelector("#receiptPreviewModal .close")
    .addEventListener("click", () => {
      closeModal("receiptPreviewModal");
      resetCashierState(); // Panggil reset di sini juga
    });

  // --- LISTENER BARU UNTUK FITUR HUTANG ---
  document
    .getElementById("debtCustomerForm")
    .addEventListener("submit", handleDebtFormSubmit);
  document
    .getElementById("cancelDebtModal")
    .addEventListener("click", () => closeModal("debtCustomerModal"));
  document
    .querySelector("#debtCustomerModal .close")
    .addEventListener("click", () => closeModal("debtCustomerModal"));

  document.getElementById("debtCustomerSearch").addEventListener("input", debounce((e) => {
      searchCustomers(e.target.value);
  }, 350));

  cashierEventListenersInitialized = true;
}

// ... (sisa fungsi di file cashier.js tetap sama, tidak perlu diubah) ...
async function loadCashierData() {
  try {
    const [productsResponse, popularResponse] = await Promise.all([
      apiRequest("/products?active=true"),
      apiRequest("/transactions/popular-products"),
    ]);
    const productsData = await productsResponse.json();
    if (productsData.success) {
      // Logika parsing varian ditambahkan di sini
      allProducts = productsData.data
        .map((p) => {
          // Backend sudah mengirim 'variants' sebagai array, jadi tidak perlu parse lagi
          return p;
        })
        .sort((a, b) => a.item_name.localeCompare(b.item_name));
    }
    const popularData = await popularResponse.json();
    if (popularData.success) {
      popularProducts = popularData.data;
    }
  } catch (error) {
    console.error("Failed to load cashier data:", error);
    showNotification("Gagal memuat data produk", "error");
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
        
        // --- LOGIKA PENYEMPURNAAN TAMPILAN KARTU ---
        let priceDisplay = '';
        let stockDisplay = '<div class="product-stock"> </div>'; // Default kosong untuk jasa
        let isOutOfStock = false;
        let clickAction = '';

        if (product.has_variants && product.variants && product.variants.length > 0) {
            // Logika untuk produk dengan varian
            const minPrice = product.min_price;
            const maxPrice = product.max_price;

            if (minPrice === maxPrice) {
                priceDisplay = formatCurrency(minPrice);
            } else {
                priceDisplay = `${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`;
            }

            if (product.item_type === 'barang') {
                const totalStock = product.total_stock || 0;
                stockDisplay = `<div class="product-stock">Total Stok: ${totalStock}</div>`;
                isOutOfStock = totalStock <= 0;
            }
            
            clickAction = `openVariantSelector(${product.product_id})`;

        } else {
            // Logika untuk produk tunggal (seperti sebelumnya)
            priceDisplay = formatCurrency(product.selling_price);
            if (product.item_type === 'barang') {
                stockDisplay = `<div class="product-stock">Stok: ${product.current_stock}</div>`;
                isOutOfStock = product.current_stock <= 0;
            }
            clickAction = `quickAddToCart(${product.product_id})`;
        }
        
        const finalClickAction = isOutOfStock ? '' : clickAction;
        const variantIndicator = product.has_variants ? `<ion-icon name="git-branch-outline" class="variant-indicator"></ion-icon>` : '';
        // --- AKHIR LOGIKA PENYEMPURNAAN ---

        return `<div class="product-card ${isOutOfStock ? 'out-of-stock' : ''}" onclick="${finalClickAction}" data-product-id="${product.product_id}" tabindex="-1">
                    <span class="product-type-badge ${product.item_type}">${product.item_type}</span>
                    <div class="product-name" title="${product.item_name}">${product.item_name}</div>
                    <div class="product-price">${priceDisplay}</div>
                    ${stockDisplay}
                    ${variantIndicator}
                </div>`;
    }).join('');
}

function quickAddToCart(productId) {
  const card = document.querySelector(
    `.product-card[data-product-id='${productId}']`
  );
  if (card) {
    card.classList.add("adding");
    setTimeout(() => card.classList.remove("adding"), 300);
  }
  addToCart(productId);
}
window.quickAddToCart = quickAddToCart;

function addToCart(productId, variantId = null) {
  const product = allProducts.find((p) => p.product_id === productId);
  if (!product) return;

  let itemToAdd;
  let existingItem;

  if (variantId) {
    // Logika untuk menambahkan Varian
    const variant = product.variants.find((v) => v.variant_id === variantId);
    if (!variant) return;

    existingItem = cart.find((item) => item.variant_id === variantId);

    if (existingItem) {
      if (
        product.item_type === "barang" &&
        existingItem.quantity >= variant.current_stock
      ) {
        showNotification(
          `Stok ${product.item_name} (${variant.variant_name}) tidak mencukupi!`,
          "error"
        );
        return;
      }
      existingItem.quantity++;
    } else {
      if (product.item_type === "barang" && variant.current_stock <= 0) {
        showNotification(
          `Stok ${product.item_name} (${variant.variant_name}) habis!`,
          "error"
        );
        return;
      }
      itemToAdd = {
        product_id: product.product_id,
        variant_id: variant.variant_id,
        item_name: `${product.item_name} (${variant.variant_name})`,
        item_type: product.item_type,
        selling_price: variant.selling_price,
        current_stock: variant.current_stock,
        quantity: 1,
      };
      cart.push(itemToAdd);
    }
  } else {
    // Logika untuk produk tunggal (lama)
    existingItem = cart.find(
      (item) => item.product_id === productId && !item.variant_id
    );
    if (existingItem) {
      if (
        product.item_type === "barang" &&
        existingItem.quantity >= product.current_stock
      ) {
        showNotification(`Stok ${product.item_name} tidak mencukupi!`, "error");
        return;
      }
      existingItem.quantity++;
    } else {
      if (product.item_type === "barang" && product.current_stock <= 0) {
        showNotification(`Stok ${product.item_name} habis!`, "error");
        return;
      }
      itemToAdd = {
        product_id: product.product_id,
        variant_id: null,
        item_name: product.item_name,
        item_type: product.item_type,
        selling_price: product.selling_price,
        current_stock: product.current_stock,
        quantity: 1,
      };
      cart.push(itemToAdd);
    }
  }

  renderCart();
  document.getElementById("productSearch").focus();
}
window.addToCart = addToCart;

function updateQuantity(productId, newQuantity, variantId = null) {
  const item = cart.find(
    (i) => i.product_id === productId && i.variant_id === variantId
  );
  if (!item) return;
  newQuantity = parseInt(newQuantity);
  if (newQuantity <= 0) {
    removeFromCart(productId, variantId);
    return;
  }
  if (item.item_type === "barang" && newQuantity > item.current_stock) {
    showNotification(
      `Stok hanya tersedia ${item.current_stock} unit!`,
      "error"
    );
    const input = document.querySelector(
      `#cartItems input[onchange*="updateQuantity(${productId}, this.value, ${variantId})"]`
    );
    if (input) input.value = item.current_stock;
    item.quantity = item.current_stock;
  } else {
    item.quantity = newQuantity;
  }
  renderCart();
}
window.updateQuantity = updateQuantity;

function removeFromCart(productId, variantId = null) {
  cart = cart.filter(
    (item) => !(item.product_id === productId && item.variant_id === variantId)
  );
  renderCart();
}
window.removeFromCart = removeFromCart;

function renderCart() {
  const tbody = document.getElementById("cartItems");
  if (cart.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align: center; padding: 80px; color: var(--color-text-muted);">Keranjang kosong</td></tr>';
  } else {
    tbody.innerHTML = cart
      .map((item) => {
        const variantIdParam = item.variant_id ? item.variant_id : "null";
        return `<tr>
                        <td>${item.item_name}</td>
                        <td><input type="number" value="${
                          item.quantity
                        }" min="1" max="${
          item.item_type === "barang" ? item.current_stock : 999
        }" class="form-input" style="width: 60px; text-align: center; padding: 4px;" onchange="updateQuantity(${
          item.product_id
        }, this.value, ${variantIdParam})"></td>
                        <td>${formatCurrency(item.selling_price)}</td>
                        <td>${formatCurrency(
                          item.selling_price * item.quantity
                        )}</td>
                        <td><button class="btn btn-sm btn-danger" onclick="removeFromCart(${
                          item.product_id
                        }, ${variantIdParam})"><ion-icon name="trash-outline"></ion-icon></button></td>
                    </tr>`;
      })
      .join("");
  }
  calculateChange();
}

function calculateChange() {
  const totalAmount = cart.reduce(
    (sum, item) => sum + item.selling_price * item.quantity,
    0
  );
  const paymentReceivedInput = document.getElementById("paymentReceived");
  const paymentReceived = parseFloat(paymentReceivedInput.value) || 0;

  // Hitung kembalian hanya jika metode pembayaran 'cash'
  const paymentMethod = document.getElementById("paymentMethod").value;
  const change =
    paymentMethod === "cash" && paymentReceived > 0
      ? paymentReceived - totalAmount
      : 0;

  document.getElementById("totalAmount").textContent =
    formatCurrency(totalAmount);
  document.getElementById("changeAmount").textContent = formatCurrency(
    Math.max(0, change)
  );

  const processBtn = document.getElementById("processTransaction");

  // --- INI ADALAH LOGIKA YANG DIPERBAIKI ---
  const isCartNotEmpty = cart.length > 0;

  const isPaymentValid =
    (paymentMethod === "cash" && paymentReceived >= totalAmount) || // Kondisi untuk tunai
    paymentMethod === "transfer" || // Kondisi untuk transfer
    paymentMethod === "hutang"; // Kondisi untuk hutang (BARU)

  processBtn.disabled = !(isCartNotEmpty && isPaymentValid);
}

function handlePaymentMethodChange(e) {
  const isCash = e.target.value === "cash";
  document.getElementById("cashPaymentGroup").style.display = isCash
    ? "block"
    : "none";

  // Reset input bayar jika bukan cash
  if (!isCash) {
    document.getElementById("paymentReceived").value = "";
  }

  calculateChange();
}

function clearCartAction() {
  if (cart.length > 0 && confirm("Hapus semua item dari keranjang?")) {
    cart = [];
    document.getElementById("paymentReceived").value = "";
    renderCart();
  }
}

async function processTransaction() {
  const processBtn = document.getElementById("processTransaction");
  if (processBtn.disabled) return;

  const paymentMethod = document.getElementById("paymentMethod").value;

  // Kumpulkan data transaksi
  const transactionData = {
    items: cart.map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id, // <-- KIRIM INI KE BACKEND
      quantity: item.quantity,
    })),
    payment_method: paymentMethod,
    payment_received:
      paymentMethod === "cash"
        ? parseFloat(document.getElementById("paymentReceived").value)
        : cart.reduce((s, i) => s + i.selling_price * i.quantity, 0),
  };

  // Jika metode adalah hutang, buka modal. Jika tidak, proses seperti biasa.
  if (paymentMethod === "hutang") {
    pendingTransactionData = transactionData; // Simpan data transaksi untuk nanti
    openDebtCustomerModal();
  } else {
    await finalizeTransaction(transactionData); // Proses transaksi langsung
  }
}

function showReceiptPreview(transaction) {
  const contentDiv = document.getElementById("receiptPreviewContent");
  const storeName = appSettings.store_name || "KASIRTTA";
  const storeAddress = appSettings.store_address || "";

  // [BARU] Logika untuk menampilkan logo jika ada
  const logoHtml = appSettings.store_logo_favicon
    ? `<img src="${appSettings.store_logo_favicon}" alt="Logo Toko" class="receipt-logo">`
    : "";

  // [DIUBAH] Sisipkan logoHtml ke dalam template
  const receiptHtml = `
        <div class="receipt-preview">
            ${logoHtml}
            <h3>${storeName}</h3>
            <p>${storeAddress}</p>
            <div class="receipt-info">
                <div><span>No:</span><span>${
                  transaction.transaction_code
                }</span></div>
                <div><span>Tgl:</span><span>${formatDate(
                  transaction.transaction_date
                )}</span></div>
                <div><span>Kasir:</span><span>${
                  currentUser.full_name
                }</span></div>
            </div>
            <div class="receipt-items">
                <div class="item-line item-header"><span>Nama Item</span><span>Total</span></div>
                ${transaction.items
                  .map(
                    (item) => `
                    <div>
                        <div class="item-line">
                            <span>${item.product_name}</span>
                            <span>${formatCurrency(item.subtotal)}</span>
                        </div>
                        <div class="item-details">${
                          item.quantity
                        } x ${formatCurrency(item.unit_price)}</div>
                    </div>`
                  )
                  .join("")}
            </div>
            <div class="receipt-total">
                <div><span>Total</span><span>${formatCurrency(
                  transaction.total_amount
                )}</span></div>
                <div><span>Bayar</span><span>${formatCurrency(
                  transaction.payment_received
                )}</span></div>
                <div><span>Kembali</span><span>${formatCurrency(
                  transaction.change_amount
                )}</span></div>
            </div>
            <div class="receipt-footer">
                <p>Terima kasih!</p>
            </div>
        </div>`;

  contentDiv.innerHTML = receiptHtml;

    document.getElementById("receiptPrintBtn").onclick = async () => {
        // Langsung panggil fungsi print yang baru
        await thermalPrinter.print(transaction, appSettings);
    };
    
    openModal("receiptPreviewModal");
}

function handleKeyboardNavigation(e) {
  const productGrid = document.getElementById("productListKasir");
  const products = productGrid.querySelectorAll(
    ".product-card:not(.out-of-stock)"
  );
  if (products.length === 0) return;

  const gridStyle = window.getComputedStyle(productGrid);
  const gridTemplateColumns = gridStyle.getPropertyValue(
    "grid-template-columns"
  );
  const columnCount = gridTemplateColumns.split(" ").length;
  let nextIndex = selectedProductIndex;

  // Gunakan e.key untuk karakter dan navigasi
  switch (e.key) {
    case "ArrowRight":
      e.preventDefault();
      nextIndex =
        selectedProductIndex < products.length - 1
          ? selectedProductIndex + 1
          : selectedProductIndex;
      break;
    case "ArrowLeft":
      e.preventDefault();
      nextIndex = selectedProductIndex > 0 ? selectedProductIndex - 1 : 0;
      break;
    case "ArrowDown":
      e.preventDefault();
      nextIndex =
        selectedProductIndex === -1
          ? 0
          : Math.min(selectedProductIndex + columnCount, products.length - 1);
      break;
    case "ArrowUp":
      e.preventDefault();
      if (e.target.id === "productSearch" && selectedProductIndex === -1)
        return;
      nextIndex =
        selectedProductIndex >= columnCount
          ? selectedProductIndex - columnCount
          : selectedProductIndex;
      break;
    case "Enter":
      e.preventDefault();
      if (selectedProductIndex !== -1 && products[selectedProductIndex]) {
        products[selectedProductIndex].click(); // Menambahkan produk ke keranjang
      }
      return;
    case "`": // 'backtick' key
      e.preventDefault();
      if (selectedProductIndex !== -1 && products[selectedProductIndex]) {
        const productId = products[selectedProductIndex].dataset.productId;
        showProductPreview(parseInt(productId)); // Tampilkan preview detail
      }
      return;
    case "PageDown":
      e.preventDefault();
      productGrid.scrollTop += productGrid.clientHeight * 0.9; // Scroll 90% dari tinggi terlihat
      break;
    case "PageUp":
      e.preventDefault();
      productGrid.scrollTop -= productGrid.clientHeight * 0.9;
      break;
    case "Escape":
      e.preventDefault();
      if (selectedProductIndex !== -1) {
        products[selectedProductIndex].classList.remove("selected");
        selectedProductIndex = -1;
      }
      document.getElementById("productSearch").focus(); // Kembali ke pencarian
      return;
  }

  if (nextIndex !== selectedProductIndex) {
    if (selectedProductIndex !== -1 && products[selectedProductIndex]) {
      products[selectedProductIndex].classList.remove("selected");
    }
    if (products[nextIndex]) {
      products[nextIndex].classList.add("selected");
      products[nextIndex].focus({ preventScroll: true });
      products[nextIndex].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
    selectedProductIndex = nextIndex;
  }
}

/**
 * Shows a modal with product details.
 * @param {number} productId
 */
function showProductPreview(productId) {
  const product = allProducts.find((p) => p.product_id === productId);
  if (!product) return;

  const modal = document.getElementById("productPreviewModal");
  document.getElementById("previewProductName").textContent = product.item_name;
  document.getElementById("previewProductCode").textContent =
    product.item_code || "-";
  document.getElementById("previewProductType").textContent = product.item_type;
  document.getElementById("previewSellingPrice").textContent = formatCurrency(
    product.selling_price
  );

  const stockInfo = document.getElementById("previewStockInfo");
  if (product.item_type === "barang") {
    stockInfo.style.display = "block";
    document.getElementById(
      "previewCurrentStock"
    ).textContent = `${product.current_stock} unit`;
  } else {
    stockInfo.style.display = "none";
  }

  openModal("productPreviewModal");
}

/**
 * Shows a modal with product details.
 * @param {number} productId
 */
function showProductPreview(productId) {
  const product = allProducts.find((p) => p.product_id === productId);
  if (!product) return;

  const modal = document.getElementById("productPreviewModal");
  document.getElementById("previewProductName").textContent = product.item_name;
  document.getElementById("previewProductCode").textContent =
    product.item_code || "-";
  document.getElementById("previewProductType").textContent = product.item_type;
  document.getElementById("previewSellingPrice").textContent = formatCurrency(
    product.selling_price
  );

  const stockInfo = document.getElementById("previewStockInfo");
  if (product.item_type === "barang") {
    stockInfo.style.display = "block";
    document.getElementById(
      "previewCurrentStock"
    ).textContent = `${product.current_stock} unit`;
  } else {
    stockInfo.style.display = "none";
  }

  openModal("productPreviewModal");
}

function removeLastCartItem() {
  if (cart.length > 0) {
    const removedItem = cart.pop(); // Hapus item terakhir dari array
    showNotification(
      `Item "${removedItem.item_name}" dihapus dari keranjang.`,
      "info"
    );
    renderCart(); // Render ulang keranjang
  }
}

// --- KUMPULAN FUNGSI BARU UNTUK MANAJEMEN HUTANG ---

/**
 * Membuka dan mereset modal pelanggan hutang.
 */

function openDebtCustomerModal() {
  document.getElementById("debtCustomerForm").reset();
  document.getElementById("selectedCustomerId").value = "";
  document.getElementById("debtCustomerSearchResults").innerHTML = "";

  // --- BLOK BARU UNTUK TANGGAL JATUH TEMPO DEFAULT ---
  const today = new Date();
  // Tambahkan 7 hari ke tanggal hari ini
  const oneWeekFromNow = new Date(today.setDate(today.getDate() + 7));

  // Format tanggal ke dalam format YYYY-MM-DD yang diterima oleh input type="date"
  const formattedDate = oneWeekFromNow.toISOString().slice(0, 10);

  // Atur nilai default input
  document.getElementById("debtDueDate").value = formattedDate;
  // --- AKHIR BLOK BARU ---

  openModal("debtCustomerModal");
}

/**
 * Mencari pelanggan di server dan menampilkan hasilnya.
 * @param {string} query - Kata kunci pencarian.
 */
async function searchCustomers(query) {
  const resultsDiv = document.getElementById("debtCustomerSearchResults");
  if (!query || query.length < 2) {
    resultsDiv.innerHTML = "";
    return;
  }

  try {
    const response = await apiRequest(`/customers/search?query=${query}`);
    const data = await response.json();
    if (data.success && data.data.length > 0) {
      resultsDiv.innerHTML = data.data
        .map(
          (cust) =>
            `<div class="search-result-item" data-id="${
              cust.customer_id
            }" data-name="${cust.full_name}" data-phone="${
              cust.phone_number || ""
            }" data-address="${cust.address || ""}">
                    <strong>${cust.full_name}</strong> (${
              cust.phone_number || "No. HP tidak ada"
            })
                </div>`
        )
        .join("");

      // Tambahkan event listener untuk setiap hasil
      document.querySelectorAll(".search-result-item").forEach((item) => {
        item.addEventListener("click", selectCustomer);
      });
    } else {
      resultsDiv.innerHTML =
        '<p class="text-muted">Pelanggan tidak ditemukan. Isi form di bawah untuk membuat baru.</p>';
    }
  } catch (error) {
    console.error("Error searching customers:", error);
    resultsDiv.innerHTML =
      '<p class="text-danger">Gagal mencari pelanggan.</p>';
  }
}

/**
 * Dipanggil saat pelanggan dari hasil pencarian diklik.
 * @param {Event} e - Event klik.
 */
function selectCustomer(e) {
  const item = e.currentTarget;
  document.getElementById("selectedCustomerId").value = item.dataset.id;
  document.getElementById("debtCustomerName").value = item.dataset.name;
  document.getElementById("debtCustomerPhone").value = item.dataset.phone;
  document.getElementById("debtCustomerAddress").value = item.dataset.address;
  document.getElementById("debtCustomerSearch").value = item.dataset.name;
  document.getElementById("debtCustomerSearchResults").innerHTML = "";
}

/**
 * Menangani submit form data pelanggan dan hutang.
 * @param {Event} e - Event submit form.
 */
async function handleDebtFormSubmit(e) {
  e.preventDefault();
  let customerId = document.getElementById("selectedCustomerId").value;

  // Jika tidak ada customer yg dipilih, buat baru
  if (!customerId) {
    const newCustomerData = {
      full_name: document.getElementById("debtCustomerName").value,
      phone_number: document.getElementById("debtCustomerPhone").value,
      address: document.getElementById("debtCustomerAddress").value,
    };

    try {
      const response = await apiRequest("/customers", {
        method: "POST",
        body: JSON.stringify(newCustomerData),
      });
      const data = await response.json();
      if (!data.success) {
        showNotification(
          data.message || "Gagal membuat pelanggan baru.",
          "error"
        );
        return;
      }
      customerId = data.data.customer_id;
    } catch (error) {
      showNotification("Error saat membuat pelanggan baru.", "error");
      return;
    }
  }

  // Tambahkan detail hutang ke data transaksi yang tertunda
  pendingTransactionData.debt_details = {
    customer_id: customerId,
    due_date: document.getElementById("debtDueDate").value,
    notes: document.getElementById("debtNotes").value,
  };

  closeModal("debtCustomerModal");
  await finalizeTransaction(pendingTransactionData);
}

/**
 * Fungsi final yang mengirim data transaksi ke API.
 * Bisa menangani transaksi biasa maupun hutang.
 * @param {object} transactionData - Objek data transaksi lengkap.
 */
async function finalizeTransaction(transactionData) {
  const processBtn = document.getElementById("processTransaction");
  processBtn.disabled = true;
  processBtn.innerHTML = '<span class="spinner-sm"></span> Memproses...';

  transactionData.client_timestamp = new Date().toISOString(); 
  
  try {
    const response = await apiRequest("/transactions", {
      method: "POST",
      body: JSON.stringify(transactionData),
    });
    const data = await response.json();

    if (data.success) {
      if (transactionData.payment_method === "hutang") {
        showNotification("Transaksi hutang berhasil dicatat!", "success");
        // Untuk hutang, kita reset langsung tanpa menampilkan struk
        await resetCashierState();
      } else {
        showReceiptPreview(data.data);
        // Untuk tunai/transfer, kita reset SETELAH struk ditampilkan
        // Kita akan memanggil resetCashierState saat modal struk ditutup
      }
    } else {
      showNotification(data.message || "Transaksi gagal!", "error");
    }
  } catch (error) {
    showNotification("Terjadi kesalahan saat memproses transaksi", "error");
  } finally {
    processBtn.disabled = false; // Tombol diaktifkan kembali di sini
    processBtn.innerHTML =
      '<ion-icon name="checkmark-circle-outline"></ion-icon> Proses Transaksi';
    calculateChange(); // Kalkulasi ulang untuk memastikan tombol disable/enable dengan benar
    pendingTransactionData = null;
  }
}

function openVariantSelector(productId) {
  const product = allProducts.find((p) => p.product_id === productId);
  if (!product || !product.variants) return;

  const modalList = document.getElementById("variantModalList");
  document.getElementById(
    "variantModalTitle"
  ).textContent = `Pilih Varian: ${product.item_name}`;

  modalList.innerHTML = product.variants
    .map((v) => {
      const isOutOfStock =
        product.item_type === "barang" && v.current_stock <= 0;
      return `
            <div class="variant-selector-item ${
              isOutOfStock ? "out-of-stock" : ""
            }" 
                 onclick="${
                   isOutOfStock
                     ? ""
                     : `selectVariant(${product.product_id}, ${v.variant_id})`
                 }">
                <div>
                    <strong>${v.variant_name}</strong>
                    <small>Stok: ${v.current_stock}</small>
                </div>
                <span class="text-success">${formatCurrency(
                  v.selling_price
                )}</span>
            </div>
        `;
    })
    .join("");

  openModal("variantSelectorModal");
}
window.openVariantSelector = openVariantSelector; // Pastikan fungsi ini tetap terekspos

function selectVariant(productId, variantId) {
  addToCart(productId, variantId);
  closeModal("variantSelectorModal");
}
window.selectVariant = selectVariant;

/**
 * Mereset state halaman kasir ke kondisi awal setelah transaksi berhasil.
 * Ini termasuk mengosongkan keranjang, mereset input, dan memuat ulang data produk.
 */
async function resetCashierState() {
  // 1. Kosongkan state keranjang di JavaScript
  cart = [];

  // 2. Reset input pembayaran dan metode pembayaran ke default
  document.getElementById("paymentReceived").value = "";
  document.getElementById("paymentMethod").value = "cash";
  handlePaymentMethodChange({ target: { value: "cash" } }); // Panggil handler untuk menyembunyikan/menampilkan input tunai

  // 3. Render ulang keranjang (yang sekarang kosong)
  renderCart();

  // 4. Muat ulang data produk dari server untuk mendapatkan stok terbaru
  await loadCashierData();

  // 5. Render ulang daftar produk dengan data yang sudah diupdate
  renderProductList();

  // 6. Fokus kembali ke input pencarian produk
  document.getElementById("productSearch").focus();
}

// Expose functions to be called by global shortcuts
window.clearCartAction = clearCartAction;
window.removeLastCartItem = removeLastCartItem;
window.quickAddToCart = quickAddToCart;
window.addToCart = addToCart;
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;
