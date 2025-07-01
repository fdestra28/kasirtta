// public/js/main.js - KASIRTTA PRO REVAMP VERSION (REVISED & HARDENED)

// ===== GLOBAL CONFIGURATION =====
const API_URL = '/api';
let currentUser = null;
let currentPage = 'dashboard';
let appSettings = {};
let historyCurrentPage = 1;
const historyLimit = 10;
let sidebarCollapsed = false;
let stockListProducts = [];
let stockCurrentPage = 1;
const stockLimit = 10;
let stockCurrentFilter = 'all';
// [BARU] Variabel untuk menyimpan instance chart
let revenueTrendChartInstance = null;
let expenseCompositionChartInstance = null;

// Chart.js global configuration
Chart.defaults.font.family = "'Poppins', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#6B7280';

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    loadGlobalSettings();
    initializeUI();

    let initialPage;
    const justLoggedIn = sessionStorage.getItem('justLoggedIn');
    if (justLoggedIn === 'true') {
        initialPage = 'dashboard';
        sessionStorage.removeItem('justLoggedIn');
    } else {
        initialPage = 'cashier';
    }
    navigateToPage(initialPage);
    setupEventListeners();
});

// ===== AUTHENTICATION CHECK =====
function checkAuth() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
        window.location.href = 'login.html';
        return;
    }

    currentUser = JSON.parse(userStr);
    updateUserInterface();
}

// ===== UI INITIALIZATION =====
function initializeUI() {
    // Add fade-in animation to body
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.5s ease-in-out';
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);

    // Initialize sidebar state from localStorage
    const savedSidebarState = localStorage.getItem('sidebarCollapsed');
    sidebarCollapsed = savedSidebarState !== null ? (savedSidebarState === 'true') : true;
    if (window.innerWidth > 768 && sidebarCollapsed) {
        document.body.classList.add('sidebar-collapsed');
    }

    // Setup sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }

    // Setup modal close handlers
    setupModalHandlers();

    // Initialize tooltips
    initializeTooltips();
}

// ===== SIDEBAR FUNCTIONALITY =====
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');

    if (window.innerWidth <= 768) {
        // Logika untuk Mobile/Tablet
        const isOpen = sidebar.classList.toggle('show');
        document.body.classList.toggle('sidebar-open', isOpen);
    } else {
        // Logika untuk Desktop
        sidebarCollapsed = !sidebarCollapsed;
        document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
        localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
    }
}

// INI JUGA PENTING:
// Agar tidak aneh saat resize, kita tambahkan listener
window.addEventListener('resize', () => {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth > 768) {
        // Jika layar menjadi lebar, pastikan overlay mobile tertutup
        sidebar.classList.remove('show');
    }
});

// Mobile sidebar toggle
function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('show');
}

// ===== USER INTERFACE UPDATE =====
function updateUserInterface() {
    document.getElementById('userInfo').textContent = `${currentUser.full_name} (${currentUser.role})`;

    // Show/hide menu items based on role
    if (currentUser.role === 'owner') {
        document.getElementById('productMenu').style.display = 'block';
        document.getElementById('ownerMenu').style.display = 'block';
        document.getElementById('userMenu').style.display = 'block';
        document.getElementById('settingsMenu').style.display = 'block';
        document.getElementById('closingMenu').style.display = 'block';
    } else if (currentUser.role === 'admin') {
        document.getElementById('productMenu').style.display = 'none';
    }
}

// ===== API REQUEST HELPER WITH ENHANCED ERROR HANDLING =====
async function apiRequest(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    try {
        showLoadingState();

        const response = await fetch(`${API_URL}${endpoint}`, {
            ...defaultOptions,
            ...options,
            headers: { ...defaultOptions.headers, ...options.headers }
        });

        hideLoadingState();

        if (response.status === 401) {
            localStorage.clear();
            window.location.href = 'login.html';
            return;
        }

        return response;
    } catch (error) {
        hideLoadingState();
        showNotification('Koneksi ke server gagal. Silakan coba lagi.', 'error');
        throw error;
    }
}

// ===== LOADING STATE MANAGEMENT =====
let loadingCount = 0;

function showLoadingState() {
    loadingCount++;
    const loader = document.getElementById('globalLoader');
    if (!loader) {
        const newLoader = document.createElement('div');
        newLoader.id = 'globalLoader';
        newLoader.className = 'global-loader';
        newLoader.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(newLoader);
        setTimeout(() => newLoader.style.opacity = '1', 10);
    }
}

function hideLoadingState() {
    // *** START OF FIX ***
    // This logic is more robust against race conditions.
    if (loadingCount > 0) {
        loadingCount--;
    }

    if (loadingCount === 0) {
        const loader = document.getElementById('globalLoader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.remove(), 300);
        }
    }
    // *** END OF FIX ***
}

// ===== ENHANCED NOTIFICATION SYSTEM =====
function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationContainer');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icon = type === 'success' ? 'checkmark-circle' : 'alert-circle';
    notification.innerHTML = `
        <ion-icon name="${icon}-outline"></ion-icon>
        <span>${message}</span>
        <div class="notification-progress"></div>
    `;

    container.appendChild(notification);

    // Animate progress bar
    const progressBar = notification.querySelector('.notification-progress');
    progressBar.style.animation = 'progressBar 3s linear';

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);

    // Click to dismiss
    notification.addEventListener('click', () => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    });
}

// ===== MODAL HANDLERS =====
function setupModalHandlers() {
    // Loop melalui setiap elemen modal di halaman
    document.querySelectorAll('.modal').forEach(modal => {

        // --- PERBAIKAN: NONAKTIFKAN PENUTUPAN VIA BACKDROP ---
        // Blok kode di bawah ini, yang menambahkan event listener ke backdrop,
        // akan kita nonaktifkan dengan memberinya komentar.
        // Dengan begitu, klik pada area luar modal tidak akan melakukan apa-apa.
        /*
        const backdrop = modal.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => closeModal(modal));
        }
        */

        // Fungsi untuk tombol 'close' (ikon X) tetap dipertahankan
        const closeBtn = modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closeModal(modal));
        }
    });

    // Fungsi untuk menutup modal dengan tombol 'Escape' juga tetap dipertahankan
    // Ini adalah praktik aksesibilitas yang baik.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const openModal = document.querySelector('.modal[style*="block"]');
            if (openModal) {
                closeModal(openModal);
            }
        }
    });
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
        setTimeout(() => {
            modal.querySelector('.modal-backdrop').style.opacity = '1';
            modal.querySelector('.modal-content').style.transform = 'translateY(0)';
            modal.querySelector('.modal-content').style.opacity = '1';
        }, 10);

        // Focus first input
        const firstInput = modal.querySelector('input:not([type="hidden"]), select, textarea');
        if (firstInput) setTimeout(() => firstInput.focus(), 300);
    }
}

function closeModal(modal) {
    if (typeof modal === 'string') {
        modal = document.getElementById(modal);
    }

    if (modal) {
        modal.querySelector('.modal-backdrop').style.opacity = '0';
        modal.querySelector('.modal-content').style.transform = 'translateY(-50px)';
        modal.querySelector('.modal-content').style.opacity = '0';

        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }
}

// ===== PAGE NAVIGATION WITH ANIMATIONS =====
function navigateToPage(pageName) {
    // Check permissions
    if ((pageName === 'products' || pageName === 'reports' || pageName === 'users' || pageName === 'closing') && currentUser.role !== 'owner') {
        showNotification('Anda tidak memiliki akses ke halaman ini', 'error');
        return;
    }

    // Hide current page with animation
    const currentPageEl = document.querySelector('.page.active');
    if (currentPageEl) {
        currentPageEl.style.opacity = '0';
        currentPageEl.style.transform = 'translateY(20px)';

        setTimeout(() => {
            currentPageEl.classList.remove('active');

            // Show new page
            const newPageEl = document.getElementById(`${pageName}Page`);
            if (newPageEl) {
                newPageEl.classList.add('active');
                setTimeout(() => {
                    newPageEl.style.opacity = '1';
                    newPageEl.style.transform = 'translateY(0)';
                }, 50);
            }
        }, 300);
    } else {
        // First load
        const newPageEl = document.getElementById(`${pageName}Page`);
        if (newPageEl) {
            newPageEl.classList.add('active');
            setTimeout(() => {
                newPageEl.style.opacity = '1';
                newPageEl.style.transform = 'translateY(0)';
            }, 50);
        }
    }

    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelector(`[data-page="${pageName}"]`)?.classList.add('active');

    currentPage = pageName;

    // Load page specific data
    switch (pageName) {
        case 'dashboard': loadDashboard(); break;
        case 'cashier': initCashier(); break;
        case 'history': initHistory(); break;
        case 'products': initProducts(); break;
        case 'stock': initStock(); break;
        case 'reports': loadReports(); break;
        case 'expenses': initExpenses(); break;
        case 'users': initUsers(); break;
        case 'settings': initSettings(); break;
        case 'closing': initClosing(); break;
    }
}

// ===== EVENT LISTENERS SETUP =====
function setupEventListeners() {
    // Navigation links
    document.addEventListener('keydown', handleGlobalShortcuts);
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage(e.currentTarget.getAttribute('data-page'));
            if (window.innerWidth <= 768 && document.getElementById('sidebar').classList.contains('show')) {
                toggleSidebar();
            }
        });
    });

    document.querySelector('.sidebar-backdrop').addEventListener('click', toggleSidebar);

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('Apakah Anda yakin ingin logout?')) {
            localStorage.clear();
            window.location.href = 'login.html';
        }
    });

    // Generate report button
    const generateBtn = document.getElementById('generateReport');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateReport);
    }

    // Handle window resize for responsive sidebar
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (window.innerWidth > 768) {
                document.getElementById('sidebar').classList.remove('show');
            }
        }, 250);
    });
    

}

// ===== GLOBAL SETTINGS =====
async function loadGlobalSettings() {
    try {
        const response = await apiRequest('/settings');
        const data = await response.json();

        if (data.success) {
            appSettings = data.data;
            applyBranding();
        }
    } catch (error) {
        console.error('Failed to load global settings:', error);
    }
}

function applyBranding() {
    const mainTitle = document.querySelector('.header-title');
    if (mainTitle && appSettings.store_name) {
        mainTitle.textContent = appSettings.store_name;
    }

    document.title = `${appSettings.store_name || 'Kasirtta'} - By Kasirtta`;

    const favicon = document.getElementById('favicon');
    if (favicon && appSettings.store_logo_favicon) {
        favicon.href = appSettings.store_logo_favicon;
    }
}

// ===== UTILITIES =====

/**
 * Menghasilkan warna HSL yang unik berdasarkan posisi/index.
 * @param {number} index - Index item saat ini.
 * @param {number} totalItems - Jumlah total item untuk membagi roda warna.
 * @returns {string} Warna dalam format HSL (e.g., 'hsl(180, 70%, 50%)').
 */
function generateHslColor(index, totalItems) {
    // Bagi roda warna (360 derajat) secara merata berdasarkan jumlah item
    const hue = (index * (360 / totalItems)) % 360;
    // Kita gunakan saturasi dan lightness yang tetap agar warna terlihat serasi
    const saturation = '70%';
    const lightness = '50%';
    return `hsl(${hue}, ${saturation}, ${lightness})`;
}


function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
}

function formatDate(dateString) {
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString('id-ID', options);
}

function formatDateOnly(dateString) {
    const date = new Date(dateString);
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const correctedDate = new Date(date.getTime() + userTimezoneOffset);

    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return correctedDate.toLocaleDateString('id-ID', options);
}

function formatDateShort(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
}

// ===== DASHBOARD FUNCTIONALITY =====
async function loadDashboard() {
    try {
        // Animate stat cards on load
        const statCards = document.querySelectorAll('.stat-card');
        statCards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            setTimeout(() => {
                card.style.transition = 'all 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * 100);
        });

        // Load dashboard data
        const response = await apiRequest('/transactions/summary/daily');
        const data = await response.json();

        if (data.success) {
            const summary = data.data.summary;

            // Animate number changes
            animateNumber('todayTransactions', 0, summary.total_transactions, 1000);
            animateNumber('todayRevenue', 0, summary.total_revenue, 1000, true);

            // Top products with animation
            const topProductsHtml = data.data.top_products.slice(0, 5).map((p, index) => `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; opacity: 0; transform: translateX(-20px); animation: slideInFromLeft 0.5s ease ${index * 0.1}s forwards;">
                    <span>${p.item_name}</span>
                    <span class="badge badge-primary">${p.total_quantity}x</span>
                </div>
            `).join('');
            document.getElementById('topProducts').innerHTML = topProductsHtml || '<p class="text-muted">Belum ada data</p>';
        }

        // Load low stock data
        const stockResponse = await apiRequest('/products/low-stock');
        const stockData = await stockResponse.json();

        if (stockData.success) {
            const lowStockHtml = stockData.data.slice(0, 5).map((p, index) => `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; opacity: 0; transform: translateX(-20px); animation: slideInFromLeft 0.5s ease ${index * 0.1}s forwards;">
                    <span>${p.item_name}</span>
                    <span class="badge badge-danger">${p.current_stock} unit</span>
                </div>
            `).join('');
            document.getElementById('lowStock').innerHTML = lowStockHtml || '<p class="text-muted">Stok aman</p>';
        }
    } catch (error) {
        console.error('Dashboard error:', error);
        showNotification('Gagal memuat data dashboard', 'error');
    }
}

// ===== NUMBER ANIMATION =====
function animateNumber(elementId, start, end, duration, isCurrency = false) {
    const element = document.getElementById(elementId);
    if (!element) return; // Add guard clause
    const increment = (end - start) / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if (current >= end) {
            current = end;
            clearInterval(timer);
        }
        element.textContent = isCurrency ? formatCurrency(current) : Math.floor(current);
    }, 16);
}

// ===== REPORTS FUNCTIONALITY =====
async function loadReports() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('startDate').valueAsDate = firstDay;
    document.getElementById('endDate').valueAsDate = today;
}

async function generateReport() {
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    if (!startDate || !endDate) {
        showNotification('Pilih tanggal awal dan akhir', 'error');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Tanggal awal harus lebih kecil dari tanggal akhir', 'error');
        return;
    }

    console.log("MEMULAI generateReport(). Tanggal:", startDate, "s/d", endDate); // <--- LOG AWAL

    try {
        document.getElementById('reportChartsContainer').innerHTML = '';
        document.getElementById('reportContent').innerHTML = '<div class="spinner"></div>';

        const cacheBuster = new Date().getTime(); // Optional: untuk cache busting selama dev
        const response = await apiRequest(`/transactions/report/data?start_date=${startDate}&end_date=${endDate}&v=${cacheBuster}`);
        const result = await response.json();

        // --- LOGGING KRUSIAL ---
        console.log("Full API Response (result):", JSON.stringify(result, null, 2));

        if (result && result.success && result.data) {
            console.log("API Sukses. Data (result.data):", JSON.stringify(result.data, null, 2));
            console.log("Expense Summary dari API (result.data.expense_summary):", JSON.stringify(result.data.expense_summary, null, 2));

            renderReportCharts(result.data);
            renderReportTables(result.data);
        } else {
            console.error("API GAGAL atau data tidak sesuai:", result); // <-- LOG JIKA API TIDAK SUKSES
            document.getElementById('reportContent').innerHTML = '<p class="text-danger">Gagal memuat data laporan atau data tidak lengkap.</p>';
            document.getElementById('reportChartsContainer').innerHTML = '';
        }
    } catch (error) {
        console.error('Generate report error:', error); // <-- LOG ERROR di CATCH
        document.getElementById('reportContent').innerHTML = '<p class="text-danger">Terjadi kesalahan saat memuat laporan</p>';
        showNotification('Terjadi kesalahan', 'error');
    }
}

// ===== CHART RENDERING =====
function renderReportCharts(reportData) {
    // Hancurkan (destroy) instance chart yang sudah ada sebelum membuat yang baru
    if (revenueTrendChartInstance) {
        revenueTrendChartInstance.destroy();
    }
    if (expenseCompositionChartInstance) {
        expenseCompositionChartInstance.destroy();
    }

    const chartContainers = document.getElementById('reportChartsContainer');
    chartContainers.innerHTML = `
        <div class="stat-card">
            <h3>Tren Pendapatan</h3>
            <div style="position: relative; height: 300px;">
                <canvas id="revenueTrendChart"></canvas>
            </div>
        </div>
        <div class="stat-card">
            <h3>Komposisi Pengeluaran</h3>
            <div style="position: relative; height: 300px;">
                <canvas id="expenseCompositionChart"></canvas>
            </div>
        </div>
    `;

    // --- Render Revenue Trend Chart ---
    const revenueCtx = document.getElementById('revenueTrendChart').getContext('2d');
    if (reportData.revenue_trend && reportData.revenue_trend.length > 0) {
        revenueTrendChartInstance = new Chart(revenueCtx, { // Simpan instance ke variabel global
            type: 'line',
            data: {
                labels: reportData.revenue_trend.map(item => formatDateShort(item.period)),
                datasets: [{
                    label: 'Pendapatan',
                    data: reportData.revenue_trend.map(item => parseFloat(item.total_revenue)),
                    borderColor: '#14B8A6',
                    backgroundColor: 'rgba(20, 184, 166, 0.1)',
                    fill: true,
                    tension: 0.4
                    // ... properti lain sudah bagus
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // <-- Ini SANGAT PENTING
                plugins: { /* ... opsi plugins ... */ },
                scales: { /* ... opsi scales ... */ }
            }
        });
    } else {
        revenueCtx.canvas.parentNode.innerHTML = '<p style="text-align: center; padding-top: 50px; color: var(--color-text-muted);">Tidak ada data pendapatan untuk periode ini.</p>';
    }

    // --- Render Expense Composition Chart ---
    const expenseCtx = document.getElementById('expenseCompositionChart').getContext('2d');
    const expenseSummaryForChart = reportData.expense_summary;

    if (expenseSummaryForChart && expenseSummaryForChart.by_category && expenseSummaryForChart.by_category.length > 0) {
        const categories = expenseSummaryForChart.by_category;
        const totalCategories = categories.length;
        const dynamicColors = categories.map((_, index) => generateHslColor(index, totalCategories));

        expenseCompositionChartInstance = new Chart(expenseCtx, { // Simpan instance ke variabel global
            type: 'doughnut',
            data: {
                labels: categories.map(item => item.category_name),
                datasets: [{
                    data: categories.map(item => parseFloat(item.total_amount)),
                    backgroundColor: dynamicColors,
                    borderWidth: 2,
                    borderColor: '#F9FAFB'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // <-- Ini SANGAT PENTING
                plugins: { /* ... opsi plugins ... */ }
            }
        });
    } else {
        expenseCtx.canvas.parentNode.innerHTML = '<p style="text-align: center; padding-top: 50px; color: var(--color-text-muted);">Tidak ada data pengeluaran untuk periode ini.</p>';
    }
}

// ===== REPORT TABLES RENDERING =====
// [DIUBAH] Fungsi ini sekarang hanya butuh satu argumen
function renderReportTables(reportData) {
    console.log("MEMULAI renderReportTables. Menerima reportData:", JSON.stringify(reportData, null, 2)); // <-- LOG AWAL FUNGSI
    const { product_performance, cashier_performance, expense_summary } = reportData;
    const totalRevenue = reportData.revenue_trend.reduce((sum, item) => sum + parseFloat(item.total_revenue), 0);
    const totalTransactions = reportData.revenue_trend.reduce((sum, item) => sum + parseInt(item.total_transactions), 0);
    console.log("Expense Summary untuk tabel (expense_summary):", JSON.stringify(expense_summary, null, 2));
    const totalExpense = (expense_summary && expense_summary.summary) ? parseFloat(expense_summary.summary.total_expense) || 0 : 0;
    console.log("Total Expense dihitung:", totalExpense); // <-- LOG totalExpense
    const grossProfit = totalRevenue - totalExpense;

    // --- PERBAIKAN DI SINI ---
    const reportHTML = `
        <div class="report-container glass-card" id="mainReportContainer">
            <div class="report-summary">
                <div class="summary-card">
                    <h4>Total Pendapatan</h4>
                    <p class="summary-value text-success">${formatCurrency(totalRevenue)}</p>
                </div>
                <div class="summary-card">
                    <h4>Total Pengeluaran</h4>
                    <p class="summary-value text-danger">${formatCurrency(totalExpense)}</p>
                </div>
                <div class="summary-card">
                    <h4>Laba Kotor</h4>
                    <p class="summary-value ${grossProfit >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(grossProfit)}</p>
                </div>
                <div class="summary-card">
                    <h4>Total Transaksi</h4>
                    <p class="summary-value">${totalTransactions}</p>
                </div>
            </div>
            
            <div class="report-section">
                <h3>Performa Produk</h3>
                <table class="report-table">
                    <thead><tr><th>Nama Produk</th><th>Jenis</th><th>Qty Terjual</th><th>Total Pendapatan</th></tr></thead>
                    <tbody>
                        ${product_performance.map(item => `
                            <tr>
                                <td>${item.item_name}</td>
                                <td><span class="badge ${item.item_type === 'barang' ? 'badge-primary' : 'badge-secondary'}">${item.item_type}</span></td>
                                <td>${item.total_quantity}</td>
                                <td>${formatCurrency(item.total_revenue)}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="4" class="text-center text-muted">Tidak ada data</td></tr>'}
                    </tbody>
                </table>
            </div>
            
            <div class="report-section">
                <h3>Performa Kasir</h3>
                <table class="report-table">
                    <thead><tr><th>Nama Kasir</th><th>Jumlah Transaksi</th><th>Total Pendapatan</th></tr></thead>
                    <tbody>
                        ${cashier_performance.map(item => `
                            <tr>
                                <td>${item.full_name}</td>
                                <td>${item.total_transactions}</td>
                                <td>${formatCurrency(item.total_revenue)}</td>
                            </tr>
                        `).join('') || '<tr><td colspan="3" class="text-center text-muted">Tidak ada data</td></tr>'}
                    </tbody>
                </table>
            </div>
            
            <div class="report-actions">
                <button class="btn btn-success" onclick="exportToExcel('mainReportContainer', 'Laporan_KASIRTTA')">
                    <ion-icon name="download-outline"></ion-icon>
                    Export
                </button>
                <button class="btn btn-secondary" onclick="printReportElement('mainReportContainer')">
                    <ion-icon name="print-outline"></ion-icon>
                    Cetak
                </button>
            </div>
        </div>
    `;

    document.getElementById('reportContent').innerHTML = reportHTML;
}

// ===== EXPORT FUNCTIONALITY =====
function exportToExcel(tableContainerId, filename) {
    const container = document.getElementById(tableContainerId);
    if (!container) {
        showNotification('Elemen laporan tidak ditemukan!', 'error');
        return;
    }

    let csvContent = `"${container.querySelector('h1, h2, h3')?.textContent || 'Laporan'}"\n`;
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;

    if (startDate && endDate) {
        csvContent += `"Periode: ${startDate} sampai ${endDate}"\n`;
    }

    csvContent += `\n`;

    const tables = container.querySelectorAll('.report-table');
    tables.forEach(table => {
        const sectionHeader = table.previousElementSibling;
        if (sectionHeader && (sectionHeader.tagName === 'H3' || sectionHeader.tagName === 'H4')) {
            csvContent += `"${sectionHeader.textContent}"\n`;
        }

        const headers = Array.from(table.querySelectorAll('thead th')).map(th => `"${th.textContent.trim()}"`).join(',');
        csvContent += headers + '\n';

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('td')).map(td => {
                let cellData = td.textContent.trim().replace(/,/g, '');
                if (cellData.startsWith('Rp')) {
                    cellData = cellData.replace(/Rp\s?|\./g, '');
                }
                return `"${cellData.trim()}"`;
            }).join(',');
            csvContent += cells + '\n';
        });
        csvContent += '\n';
    });

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();

    showNotification('Laporan berhasil di-export!');
}

// ===== TRANSACTION HISTORY =====
function initHistory() {
    historyCurrentPage = 1;
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    document.getElementById('historyStartDate').valueAsDate = firstDayOfMonth;
    document.getElementById('historyEndDate').valueAsDate = today;

    loadHistory(historyCurrentPage);

    // Setup event listeners
    const filterBtn = document.getElementById('filterHistoryBtn');
    if (!filterBtn._listener) {
        filterBtn.addEventListener('click', () => {
            historyCurrentPage = 1;
            loadHistory(historyCurrentPage);
        });

        document.getElementById('historyPrevBtn').addEventListener('click', () => {
            if (historyCurrentPage > 1) {
                historyCurrentPage--;
                loadHistory(historyCurrentPage);
            }
        });

        document.getElementById('historyNextBtn').addEventListener('click', () => {
            historyCurrentPage++;
            loadHistory(historyCurrentPage);
        });

        // Detail modal handlers
        document.querySelector('#historyDetailModal .close').addEventListener('click', () => {
            closeModal('historyDetailModal');
        });

        document.getElementById('historyCloseDetailBtn').addEventListener('click', () => {
            closeModal('historyDetailModal');
        });

        filterBtn._listener = true;
    }
}

async function loadHistory(page) {
    const tbody = document.getElementById('historyList');
    tbody.innerHTML = `<tr><td colspan="5"><div class="spinner"></div></td></tr>`;

    const startDate = document.getElementById('historyStartDate').value;
    const endDate = document.getElementById('historyEndDate').value;
    const offset = (page - 1) * historyLimit;

    try {
        const response = await apiRequest(`/transactions?start_date=${startDate}&end_date=${endDate}&limit=${historyLimit}&offset=${offset}`);
        const data = await response.json();

        if (data.success) {
            renderHistoryTable(data.data);
            updateHistoryPagination(page, data.data.length);
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-danger">Gagal memuat riwayat.</td></tr>';
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-danger">Terjadi kesalahan koneksi.</td></tr>';
    }
}

async function loadStockData() {
    const tbody = document.getElementById('stockList');
    tbody.innerHTML = `<tr><td colspan="6"><div class="spinner"></div></td></tr>`;

    try {
        const response = await apiRequest('/products?type=barang&active=true');
        const data = await response.json();

        if (data.success) {
            stockListProducts = data.data; // Simpan data master
            renderStockTable(); // Panggil fungsi render
        } else {
            tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Gagal memuat data stok.</td></tr>`;
        }
    } catch (error) {
        console.error('Failed to load stock data:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-danger text-center">Gagal memuat data stok.</td></tr>`;
    }
}

// TAMBAHKAN FUNGSI BARU INI
function initStock() {
    // Reset state setiap kali halaman dibuka
    stockCurrentPage = 1;
    stockCurrentFilter = 'all';

    // Reset UI
    document.getElementById('stockFilterSearch').value = '';
    document.querySelectorAll('#stockFilterTabs .filter-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.filter === 'all');
    });

    // Setup event listeners HANYA SEKALI
    if (!initStock.initialized) {
        // Filter tabs
        document.querySelectorAll('#stockFilterTabs .filter-tab').forEach(tab => {
            tab.addEventListener('click', e => {
                stockCurrentFilter = e.currentTarget.dataset.filter;
                stockCurrentPage = 1;
                document.querySelectorAll('#stockFilterTabs .filter-tab').forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                renderStockTable();

            });
        });

        // Search input (dengan debounce)
        let searchTimeout;
        document.getElementById('stockFilterSearch').addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                stockCurrentPage = 1;
                renderStockTable();
            }, 300);
        });



        // Pagination buttons
        document.getElementById('stockPrevBtn').addEventListener('click', () => {
            if (stockCurrentPage > 1) {
                stockCurrentPage--;
                renderStockTable();
            }
        });
        document.getElementById('stockNextBtn').addEventListener('click', () => {
            stockCurrentPage++;
            renderStockTable();
        });

        initStock.initialized = true;
        document.getElementById('stockForm').addEventListener('submit', updateStock);
        document.getElementById('cancelStockModal').addEventListener('click', () => closeModal('stockModal'));

        initStock.initialized = true;
    }

    loadStockData();
}

function openStockModal(productId, productName) {
    document.getElementById('stockProductId').value = productId;
    document.querySelector('#stockModal h3').textContent = `Update Stok: ${productName}`;
    document.getElementById('stockForm').reset();
    openModal('stockModal');
}
window.openStockModal = openStockModal;

async function updateStock(e) {
    e.preventDefault();
    const productId = document.getElementById('stockProductId').value;
    const formData = { type: document.getElementById('movementType').value, quantity: parseInt(document.getElementById('stockQuantity').value), notes: document.getElementById('stockNotes').value };
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-sm"></span> Mengupdate...';
    try {
        const response = await apiRequest(`/products/${productId}/stock`, { method: 'POST', body: JSON.stringify(formData) });
        const data = await response.json();
        if (data.success) {
            showNotification('Stok berhasil diupdate', 'success');
            closeModal('stockModal');
            if (currentPage === 'stock') {
                loadStockData();
            } else if (currentPage === 'products') {
                loadProducts();
            }
        } else {
            showNotification(data.message || 'Gagal update stok', 'error');
        }
    } catch (error) {
        console.error('Update stock error:', error);
        showNotification('Terjadi kesalahan', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<ion-icon name="checkmark-outline"></ion-icon> Update';
    }
}

// TAMBAHKAN DUA FUNGSI BARU INI

function renderStockTable() {
    const tbody = document.getElementById('stockList');
    const filterText = document.getElementById('stockFilterSearch').value.toLowerCase();

    // 1. Filter berdasarkan Tab (Stok Aman/Menipis)
    let filtered = stockListProducts;
    if (stockCurrentFilter === 'menipis') {
        filtered = stockListProducts.filter(p => p.current_stock <= p.min_stock);
    } else if (stockCurrentFilter === 'aman') {
        filtered = stockListProducts.filter(p => p.current_stock > p.min_stock);
    }

    // 2. Filter berdasarkan Pencarian
    if (filterText) {
        filtered = filtered.filter(p =>
            p.item_name.toLowerCase().includes(filterText) ||
            p.item_code.toLowerCase().includes(filterText)
        );
    }

    // 3. Paginasi
    const offset = (stockCurrentPage - 1) * stockLimit;
    const paginatedItems = filtered.slice(offset, offset + stockLimit);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px;">Tidak ada barang yang cocok dengan filter.</td></tr>`;
    } else {
        tbody.innerHTML = paginatedItems.map((p, index) => {
            const isLowStock = p.current_stock <= p.min_stock;
            const statusBadge = isLowStock
                ? `<span class="badge badge-danger">Menipis</span>`
                : `<span class="badge badge-success">Aman</span>`;

            return `
                <tr style="opacity: 0; transform: translateY(10px); animation: fadeInUp 0.3s ease ${index * 0.05}s forwards;">
                    <td>${p.item_code}</td>
                    <td>${p.item_name}</td>
                    <td>${p.current_stock}</td>
                    <td>${p.min_stock}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="btn btn-sm" onclick="openStockModal(${p.product_id}, '${p.item_name.replace(/'/g, "\\'")}')">
                            <ion-icon name="create-outline"></ion-icon>
                            Update Stok
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    updateStockPagination(filtered.length);
}

function updateStockPagination(totalItems) {
    document.getElementById('stockPageInfo').textContent = `Halaman ${stockCurrentPage}`;
    document.getElementById('stockPrevBtn').disabled = (stockCurrentPage === 1);
    document.getElementById('stockNextBtn').disabled = (stockCurrentPage * stockLimit >= totalItems);
}

function renderHistoryTable(transactions) {
    const tbody = document.getElementById('historyList');

    if (transactions.length === 0 && historyCurrentPage === 1) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Tidak ada transaksi pada periode ini.</td></tr>';
        return;
    }

    tbody.innerHTML = transactions.map((t, index) => `
        <tr style="opacity: 0; transform: translateY(10px); animation: fadeInUp 0.3s ease ${index * 0.05}s forwards;">
            <td>${t.transaction_code}</td>
            <td>${formatDate(t.transaction_date)}</td>
            <td>${t.cashier_name}</td>
            <td>${formatCurrency(t.total_amount)}</td>
            <td>
                <button class="btn btn-sm" onclick="viewTransactionDetail(${t.transaction_id})">
                    <ion-icon name="eye-outline"></ion-icon>
                    Detail
                </button>
                <button class="btn btn-sm btn-primary" onclick="reprintReceipt(${t.transaction_id})">
                    <ion-icon name="print-outline"></ion-icon>
                    Cetak
                </button>
            </td>
        </tr>
    `).join('');
}

function updateHistoryPagination(page, count) {
    document.getElementById('historyPageInfo').textContent = `Halaman ${page}`;
    document.getElementById('historyPrevBtn').disabled = (page === 1);
    document.getElementById('historyNextBtn').disabled = (count < historyLimit);
}

async function viewTransactionDetail(transactionId) {
    openModal('historyDetailModal');
    const contentDiv = document.getElementById('historyDetailContent');
    contentDiv.innerHTML = '<div class="spinner"></div>';

    try {
        const response = await apiRequest(`/transactions/${transactionId}`);
        const data = await response.json();

        if (data.success) {
            const trx = data.data;
            document.getElementById('historyDetailTitle').textContent = `Detail Transaksi ${trx.transaction_code}`;

            contentDiv.innerHTML = `
                <div class="transaction-detail">
                    <div class="detail-info">
                        <div class="info-row">
                            <span class="info-label">
                                <ion-icon name="calendar-outline"></ion-icon>
                                Tanggal:
                            </span>
                            <span class="info-value">${formatDate(trx.transaction_date)}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">
                                <ion-icon name="person-outline"></ion-icon>
                                Kasir:
                            </span>
                            <span class="info-value">${trx.cashier_name}</span>
                        </div>
                    </div>
                    
                    <h4>Item Dibeli:</h4>
                    <table class="report-table">
                        <thead>
                            <tr>
                                <th>Produk</th>
                                <th>Qty</th>
                                <th>Harga</th>
                                <th>Subtotal</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${trx.details.map(d => `
                                <tr>
                                    <td>${d.item_name}</td>
                                    <td>${d.quantity}</td>
                                    <td>${formatCurrency(d.unit_price)}</td>
                                    <td>${formatCurrency(d.subtotal)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    
                    <div class="transaction-summary">
                        <div class="summary-row">
                            <span>Total:</span>
                            <span class="text-primary">${formatCurrency(trx.total_amount)}</span>
                        </div>
                        <div class="summary-row">
                            <span>Bayar (${trx.payment_method}):</span>
                            <span>${formatCurrency(trx.payment_received)}</span>
                        </div>
                        <div class="summary-row">
                            <span>Kembali:</span>
                            <span class="text-success">${formatCurrency(trx.change_amount)}</span>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('historyReprintBtn').onclick = () => reprintReceipt(transactionId);
        } else {
            contentDiv.innerHTML = `<p class="text-danger">${data.message}</p>`;
        }
    } catch (error) {
        contentDiv.innerHTML = `<p class="text-danger">Gagal memuat detail.</p>`;
    }
}

async function reprintReceipt(transactionId) {
    try {
        const response = await apiRequest(`/transactions/${transactionId}`);
        const data = await response.json();

        if (data.success) {
            const transactionDataForPrinting = { ...data.data, items: data.data.details };
            printReceipt(transactionDataForPrinting);
        } else {
            showNotification('Gagal mengambil data untuk dicetak!', 'error');
        }
    } catch (error) {
        showNotification('Terjadi kesalahan koneksi!', 'error');
    }
}

// ===== PRINT RECEIPT =====
function printReceipt(transaction) {
    const receiptWindow = window.open('', 'Receipt', 'width=300,height=600');
    const cashierName = transaction.cashier_name || currentUser.full_name;

    // [BARU] Logika untuk menampilkan logo (sama seperti di cashier.js)
    const logoHtml = appSettings.store_logo_favicon
        ? `<img src="${appSettings.store_logo_favicon}" alt="Logo Toko" class="receipt-logo">`
        : '';
        
    // [DIUBAH] Template HTML untuk jendela cetak, disisipkan logoHtml dan CSS-nya
    const receiptHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Struk</title>
            <style>
                body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 10px; width: 280px; }
                .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
                .receipt-logo { display: block; max-width: 120px; max-height: 60px; object-fit: contain; margin: 0 auto 5px auto; }
                h2 { margin: 0; font-size: 16px; }
                p { margin: 2px 0; }
                .info, .items, .total { margin-bottom: 10px; }
                .item { display: flex; justify-content: space-between; margin-bottom: 3px; }
                .total { font-weight: bold; border-top: 1px dashed #000; padding-top: 5px; }
                .footer { text-align: center; margin-top: 15px; font-size: 10px; }
                @media print { body { margin: 0; } }
            </style>
        </head>
        <body>
            <div class="header">
                ${logoHtml}
                <h2>${appSettings.store_name || 'Kasirtta'}</h2>
                <p>${appSettings.store_address || ''}<br>${appSettings.store_phone || ''}</p>
            </div>
            <div class="info">
                <div>No: ${transaction.transaction_code}</div>
                <div>Tgl: ${formatDate(transaction.transaction_date)}</div>
                <div>Kasir: ${cashierName}</div>
            </div>
            <div class="items">
                ${transaction.items.map(item => `
                    <div>${item.item_name || item.product_name}</div>
                    <div class="item">
                        <span>${item.quantity} x ${formatCurrency(item.unit_price)}</span>
                        <span>${formatCurrency(item.subtotal)}</span>
                    </div>
                `).join('')}
            </div>
            <div class="total">
                <div class="item"><span>Total</span><span>${formatCurrency(transaction.total_amount)}</span></div>
                <div class="item"><span>Bayar</span><span>${formatCurrency(transaction.payment_received)}</span></div>
                <div class="item"><span>Kembali</span><span>${formatCurrency(transaction.change_amount)}</span></div>
            </div>
            <div class="footer">
                <p>Terima kasih!</p>
            </div>
            <script>
                window.onload = function() { 
                    window.print(); 
                    setTimeout(function(){ window.close(); }, 500); 
                }
            </script>
        </body>
        </html>
    `;

    receiptWindow.document.write(receiptHTML);
    receiptWindow.document.close();
}

// ===== TOOLTIPS =====
function initializeTooltips() {
    // Add tooltip functionality for elements with title attribute
    document.querySelectorAll('[title]').forEach(element => {
        element.addEventListener('mouseenter', showTooltip);
        element.addEventListener('mouseleave', hideTooltip);
    });
}

function showTooltip(e) {
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = e.target.getAttribute('title');
    tooltip.style.position = 'absolute';
    tooltip.style.zIndex = '1080';

    document.body.appendChild(tooltip);

    const rect = e.target.getBoundingClientRect();
    tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
}

function hideTooltip() {
    const tooltip = document.querySelector('.tooltip');
    if (tooltip) tooltip.remove();
}

// ===== ADDITIONAL ANIMATIONS =====
// Add custom animation CSS
const animationStyles = document.createElement('style');
animationStyles.textContent = `
    @keyframes fadeInUp {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    @keyframes slideInFromLeft {
        from {
            opacity: 0;
            transform: translateX(-20px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
    
    @keyframes progressBar {
        from { width: 100%; }
        to { width: 0%; }
    }
    
    .notification-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 4px;
        background: rgba(255, 255, 255, 0.3);
        width: 100%;
    }
    
    .global-loader {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        transition: opacity 0.3s;
        opacity: 0;
    }
    
    .tooltip {
        background: var(--color-text);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        pointer-events: none;
        animation: fadeIn 0.2s;
    }
    
    .transaction-detail .info-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 12px;
        padding: 8px;
        background: var(--color-bg-secondary);
        border-radius: 8px;
    }
    
    .transaction-detail .info-label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--color-text-secondary);
    }
    
    .transaction-detail .info-value {
        font-weight: 500;
        color: var(--color-text);
    }
    
    .transaction-summary {
        margin-top: 24px;
        padding: 16px;
        background: var(--color-bg-secondary);
        border-radius: 12px;
    }
    
    .transaction-summary .summary-row {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 16px;
    }
    
    .transaction-summary .summary-row:last-child {
        margin-bottom: 0;
        font-weight: 600;
    }
`;
document.head.appendChild(animationStyles);

// --- TAMBAHKAN FUNGSI BARU INI UNTUK MENCETAK ---
// Fungsi ini akan mencetak konten dari elemen tertentu saja.
// GANTI FUNGSI LAMA DENGAN VERSI BARU INI
function printReportElement(elementId) {
    const elementToPrint = document.getElementById(elementId);
    if (!elementToPrint) {
        showNotification('Konten laporan tidak ditemukan!', 'error');
        return;
    }

    const printWindow = window.open('', '', 'height=800,width=1000');
    printWindow.document.write('<html><head><title>Cetak Laporan</title>');

    // --- STRATEGI BARU YANG LEBIH AMAN ---
    // Loop melalui semua stylesheet di dokumen utama
    Array.from(document.styleSheets).forEach(styleSheet => {
        // Jika stylesheet ditautkan via <link href="...">, buat ulang tag link-nya
        if (styleSheet.href) {
            const link = printWindow.document.createElement('link');
            link.rel = 'stylesheet';
            link.href = styleSheet.href;
            printWindow.document.head.appendChild(link);
        }
        // Jika stylesheet adalah inline <style>...</style>, salin isinya
        else {
            try {
                const style = printWindow.document.createElement('style');
                const rules = Array.from(styleSheet.cssRules).map(rule => rule.cssText).join('\n');
                style.appendChild(printWindow.document.createTextNode(rules));
                printWindow.document.head.appendChild(style);
            } catch (e) {
                console.warn('Gagal menyalin style inline:', e);
            }
        }
    });
    // --- AKHIR STRATEGI BARU ---

    printWindow.document.write('</head><body style="background: white;">');
    printWindow.document.write(elementToPrint.innerHTML);
    printWindow.document.write('</body></html>');

    printWindow.document.close();

    // Beri sedikit waktu untuk semua stylesheet eksternal (font, ikon) dimuat di jendela baru
    printWindow.onload = () => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
    };
}

window.printReportElement = printReportElement; // Ekspos fungsi ke global scope

/**
 * Handles all global keyboard shortcuts for the application.
 * REVISED VERSION 2 (F10 & Print Fix)
 * @param {KeyboardEvent} e - The keyboard event object.
 */
function handleGlobalShortcuts(e) {
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

    // [FIX] Perbaikan untuk F-Keys: Izinkan F-keys lolos walaupun sedang mengetik.
    // Aturan baru: Abaikan shortcut jika sedang mengetik, KECUALI untuk 'Escape' dan F-Keys.
    if (isTyping && e.key !== 'Escape' && !e.key.startsWith('F')) {
        return;
    }

    // --- Shortcut Navigasi Halaman (Alt + Key) ---
    if (e.altKey) {
        e.preventDefault();
        switch (e.key.toLowerCase()) {
            case 'd': navigateToPage('dashboard'); break;
            case 'k': navigateToPage('cashier'); break;
            case 's': navigateToPage('stock'); break;
            case 'h': navigateToPage('history'); break;
            case 'p': if (currentUser.role === 'owner') navigateToPage('products'); break;
            case 'r': if (currentUser.role === 'owner') navigateToPage('reports'); break;
            case 'u': if (currentUser.role === 'owner') navigateToPage('users'); break;
        }
        return; // Selesaikan setelah handle Alt
    }

    // --- Shortcut Fungsional (Ctrl, F-Keys, etc.) ---

    // Ctrl + Key shortcuts
    if (e.ctrlKey) {
        switch (e.key.toLowerCase()) {
            case 'f':
                e.preventDefault();
                const searchInput = document.querySelector('.page.active input[type="text"][placeholder*="Cari"]');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
                break;
            
            case 'a':
                if (currentPage === 'cashier') {
                    e.preventDefault();
                    const firstQtyInput = document.querySelector('#cartItems input[type="number"]');
                    if (firstQtyInput) {
                        firstQtyInput.focus();
                        firstQtyInput.select();
                    }
                }
                break;

            // [BARU] Shortcut Cetak Ulang: Ctrl + P
            case 'p':
                e.preventDefault(); // Mencegah dialog print default browser
                reprintLastTransaction(); // Panggil fungsi cetak ulang
                break;
            
            case 'backspace':
                if (currentPage === 'cashier') {
                    e.preventDefault();
                    window.removeLastCartItem?.();
                }
                break;
            
            case 'delete':
                if (currentPage === 'cashier') {
                    e.preventDefault();
                    window.clearCartAction?.();
                }
                break;
        }
        return; // Selesaikan setelah handle Ctrl
    }

    // F-Keys and other single key shortcuts
    switch (e.key) {
        case 'F3':
            e.preventDefault();
            showNotification('Shortcut F3 (Cari Berikutnya) belum diimplementasikan.', 'info');
            break;

        case 'F9':
            e.preventDefault();
            if (currentPage === 'cashier') {
                document.getElementById('paymentReceived').focus();
            }
            break;

        case 'F10':
            e.preventDefault();
            if (currentPage === 'cashier') {
                const processBtn = document.getElementById('processTransaction');
                if (!processBtn.disabled) {
                    processBtn.click();
                }
            }
            break;

        // [DIHAPUS] Shortcut F11 dihapus dari sini untuk mengembalikan fungsi fullscreen browser.
        // case 'F11': ...

        case 'F12':
            e.preventDefault();
            showNotification('Membuka laci kasir (simulasi)...', 'success');
            break;

        case 'Escape':
            const openModalEl = document.querySelector('.modal[style*="block"]');
            const searchInputEl = document.querySelector('.page.active input[type="text"][placeholder*="Cari"]:focus');

            if (openModalEl) {
                e.preventDefault();
                closeModal(openModalEl);
            } else if (searchInputEl && searchInputEl.value !== '') {
                e.preventDefault();
                searchInputEl.value = '';
                searchInputEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            break;
    }
}

/**
 * Fetches the last transaction and reprints the receipt.
 */
async function reprintLastTransaction() {
    try {
        // Ambil 1 transaksi terakhir
        const response = await apiRequest(`/transactions?limit=1&offset=0`);
        const data = await response.json();
        
        if (data.success && data.data.length > 0) {
            const lastTransactionId = data.data[0].transaction_id;
            await reprintReceipt(lastTransactionId); // Gunakan fungsi reprint yang sudah ada
            showNotification(`Mencetak ulang transaksi terakhir: ${data.data[0].transaction_code}`, 'success');
        } else {
            showNotification('Tidak ada transaksi terakhir yang bisa dicetak ulang.', 'warning');
        }
    } catch (error) {
        showNotification('Gagal mengambil data transaksi terakhir.', 'error');
    }
}