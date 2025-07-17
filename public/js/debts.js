// public/js/debts.js - VERSI DIPERBAIKI

// ===== GLOBAL STATE FOR DEBTS PAGE =====
let allDebts = [];
let debtEventListenersInitialized = false;

/**
 * Initializes the debts page.
 */
async function initDebts() {
    console.log("Inisialisasi halaman Manajemen Piutang..."); // LOG
    if (!debtEventListenersInitialized) {
        setupDebtPageEvents();
    }
    // Reset filter input setiap kali halaman diinisialisasi
    document.getElementById('debtFilter').value = ''; 
    await loadAllDebts();
}

/**
 * Sets up all event listeners for the debts page.
 */
function setupDebtPageEvents() {
    if (debtEventListenersInitialized) return; // Mencegah duplikasi

    console.log("Menyiapkan event listeners untuk halaman piutang."); // LOG
    // Search filter with debounce
    let searchTimeout;
    document.getElementById('debtFilter').addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(renderDebtTable, 300);
    });

    // Debt Payment Modal
    document.getElementById('debtPaymentForm').addEventListener('submit', handlePaymentSubmit);
    document.querySelector('#debtPaymentModal .close').addEventListener('click', () => closeModal('debtPaymentModal'));

    debtEventListenersInitialized = true;
}

/**
 * Loads all active debts from the API.
 */
async function loadAllDebts() {
    const tbody = document.getElementById('debtList');
    tbody.innerHTML = `<tr><td colspan="8" class="text-center"><div class="spinner"></div></td></tr>`;
    console.log("Memuat data piutang dari API..."); // LOG

    try {
        const response = await apiRequest('/debts'); // Tidak perlu parameter search di sini, filter di client
        const data = await response.json();
        
        console.log("Data diterima dari API:", data); // LOG: PENTING UNTUK MELIHAT RESPON SERVER

        if (data.success) {
            allDebts = data.data || []; // Pastikan allDebts adalah array
            console.log(`Berhasil memuat ${allDebts.length} data piutang.`); // LOG
            renderDebtTable();
        } else {
            console.error("API call gagal:", data.message); // LOG
            showNotification('Gagal memuat data piutang: ' + data.message, 'error');
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Gagal memuat data.</td></tr>`;
        }
    } catch (error) {
        console.error("Terjadi error saat memuat data piutang:", error); // LOG
        showNotification('Terjadi kesalahan koneksi saat memuat data piutang.', 'error');
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Terjadi kesalahan koneksi.</td></tr>`;
    }
}

/**
 * Renders the debts table based on the search filter.
 */
/**
 * Renders the debts table based on the search filter and calculates total.
 */
function renderDebtTable() {
    const tbody = document.getElementById('debtList');
    const totalDiv = document.getElementById('debtTotal'); // <-- Ambil elemen total
    const filterText = document.getElementById('debtFilter').value.toLowerCase();
    
    console.log(`Mulai merender tabel dengan filter: "${filterText}"`);

    let filteredDebts = allDebts;
    if (filterText) {
        filteredDebts = allDebts.filter(d =>
            (d.customer_name && d.customer_name.toLowerCase().includes(filterText)) ||
            (d.phone_number && d.phone_number.includes(filterText)) ||
            (d.transaction_code && d.transaction_code.toLowerCase().includes(filterText))
        );
    }
    
    console.log(`${filteredDebts.length} data piutang akan dirender.`);

    if (filteredDebts.length === 0) {
        if (allDebts.length > 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 40px; color: var(--color-text-muted);">Tidak ada data piutang yang cocok dengan pencarian Anda.</td></tr>';
        } else {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding: 40px; color: var(--color-text-muted);">Belum ada data piutang yang aktif.</td></tr>';
        }
    } else {
        // ... (kode untuk mengisi tbody tetap sama) ...
        tbody.innerHTML = filteredDebts.map(debt => {
            const remaining = parseFloat(debt.amount_due) - parseFloat(debt.amount_paid);
            const dueDate = debt.due_date ? new Date(debt.due_date) : null;
            const formattedDueDate = dueDate ? new Date(dueDate.getTime() + dueDate.getTimezoneOffset() * 60000).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric'}) : 'N/A';
            const isOverdue = dueDate && dueDate < new Date() && remaining > 0;

            return `
                <tr>
                    <td>
                        <strong>${debt.customer_name}</strong><br>
                        <small class="text-muted">${debt.phone_number || 'No. HP tidak ada'}</small>
                    </td>
                    <td>${debt.transaction_code}</td>
                    <td>${formatCurrency(debt.amount_due)}</td>
                    <td>${formatCurrency(debt.amount_paid)}</td>
                    <td class="text-danger" style="font-weight: 600;">${formatCurrency(remaining)}</td>
                    <td class="${isOverdue ? 'text-danger' : ''}">${formattedDueDate}</td>
                    <td><span class="badge ${debt.status === 'unpaid' ? 'badge-danger' : 'badge-warning'}">${debt.status.replace(/_/g, ' ')}</span></td>
                    <td>
                        <button class="btn btn-sm btn-success" onclick="openPaymentModal(${debt.debt_id})">
                            <ion-icon name="cash-outline"></ion-icon> Bayar
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // --- BLOK BARU UNTUK MENGHITUNG DAN MENAMPILKAN TOTAL PIUTANG ---
    // Penting: Total dihitung dari SEMUA hutang aktif, bukan hanya yang difilter.
    const totalPiutang = allDebts.reduce((sum, debt) => {
        const remaining = parseFloat(debt.amount_due) - parseFloat(debt.amount_paid);
        return sum + remaining;
    }, 0);
    
    totalDiv.innerHTML = `Total Piutang Aktif: <span class="text-danger">${formatCurrency(totalPiutang)}</span>`;
    // --- AKHIR BLOK BARU ---
}

/**
 * Opens the payment modal for a specific debt.
 * @param {number} debtId - The ID of the debt.
 */
function openPaymentModal(debtId) {
    const debt = allDebts.find(d => d.debt_id === debtId);
    if (!debt) return;

    const remaining = debt.amount_due - debt.amount_paid;

    document.getElementById('paymentDebtId').value = debtId;
    document.getElementById('debtPaymentModalTitle').textContent = `Bayar Hutang: ${debt.customer_name}`;
    document.getElementById('debtPaymentInfo').innerHTML = `
        <p style="margin:0;">Sisa Hutang: <strong class="text-danger">${formatCurrency(remaining)}</strong></p>
    `;
    document.getElementById('paymentAmount').value = '';
    document.getElementById('paymentAmount').max = remaining;
    // Set tanggal hari ini
    document.getElementById('paymentDate').valueAsDate = new Date();

    openModal('debtPaymentModal');
}
window.openPaymentModal = openPaymentModal;

/**
 * Handles the submission of the payment form.
 * @param {Event} e - The form submit event.
 */
async function handlePaymentSubmit(e) {
    e.preventDefault();
    const debtId = document.getElementById('paymentDebtId').value;
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const paymentDate = document.getElementById('paymentDate').value;
    
    if (!debtId || !amount || !paymentDate || amount <= 0) {
        showNotification('Semua field harus diisi dan jumlah harus lebih dari nol!', 'error');
        return;
    }

    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-sm"></span> Menyimpan...';
    
    try {
        const response = await apiRequest(`/debts/${debtId}/pay`, {
            method: 'POST',
            body: JSON.stringify({ amount, payment_date: paymentDate })
        });
        const data = await response.json();

        if (data.success) {
            showNotification('Pembayaran berhasil dicatat!', 'success');
            closeModal('debtPaymentModal');
            loadAllDebts(); // Muat ulang data untuk memperbarui tabel
        } else {
            showNotification(data.message || 'Gagal mencatat pembayaran.', 'error');
        }
    } catch (error) {
        console.error("Error making payment:", error);
        showNotification('Terjadi kesalahan koneksi saat menyimpan pembayaran.', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<ion-icon name="checkmark-circle-outline"></ion-icon> Simpan Pembayaran';
    }
}