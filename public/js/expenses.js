// public/js/expenses.js - KASIRTTA PRO REVAMP VERSION

// ===== GLOBAL STATE FOR EXPENSES PAGE =====
let expenseList = [];
let expenseCategories = [];
let expenseEventListenersInitialized = false;
let expenseCurrentPage = 1;
const expenseLimit = 10; // 10 item per halaman

/**
 * Initializes the expenses page, sets default dates, and loads initial data.
 */
async function initExpenses() {
    // 1. Tentukan tanggal hari ini
    const today = new Date();
    
    // 2. Tentukan tanggal 30 hari yang lalu
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    // 3. Atur nilai input tanggal menggunakan format YYYY-MM-DD
    // Menggunakan toISOString().slice(0, 10) adalah cara yang paling andal
    document.getElementById('expenseFilterDateStart').value = thirtyDaysAgo.toISOString().slice(0, 10);
    document.getElementById('expenseFilterDateEnd').value = today.toISOString().slice(0, 10);

    // 4. Lanjutkan sisa fungsi seperti biasa
    expenseCurrentPage = 1;

    if (!expenseEventListenersInitialized) {
        setupExpensePageEvents();
    }

    await loadExpenseCategories();
    // loadExpenses() akan otomatis mengambil nilai dari input yang sudah kita atur
    await loadExpenses(); 
}

/**
 * Sets up all event listeners for the expenses page to prevent re-binding.
 */
function setupExpensePageEvents() {
    // Action buttons
    document.getElementById('addExpenseBtn').addEventListener('click', () => openExpenseModal());
    document.getElementById('filterExpenseBtn').addEventListener('click', loadExpenses);

    // Expense Modal
    document.getElementById('expenseForm').addEventListener('submit', saveExpense);
    document.getElementById('cancelExpenseModal').addEventListener('click', () => closeModal('expenseModal'));

    document.getElementById('expensePrevBtn').addEventListener('click', () => {
        if (expenseCurrentPage > 1) {
            expenseCurrentPage--;
            renderExpenseTable();
        }
    });

    document.getElementById('expenseNextBtn').addEventListener('click', () => {
        expenseCurrentPage++;
        renderExpenseTable();
    });

    expenseEventListenersInitialized = true;
}

/**
 * Loads expense categories for the dropdown in the modal.
 */
async function loadExpenseCategories() {
    try {
        const response = await apiRequest('/expenses/categories');
        const data = await response.json();
        
        if (data.success) {
            expenseCategories = data.data;
            const select = document.getElementById('expenseCategory');
            select.innerHTML = '<option value="">-- Pilih Kategori --</option>';
            select.innerHTML += expenseCategories.map(cat => 
                `<option value="${cat.category_id}">${cat.category_name}</option>`
            ).join('');
        }
    } catch (error) {
        console.error('Failed to load expense categories:', error);
        showNotification('Gagal memuat kategori pengeluaran', 'error');
    }
}

/**
 * Loads expense data based on the date filters.
 */
async function loadExpenses() {
    const startDate = document.getElementById('expenseFilterDateStart').value;
    const endDate = document.getElementById('expenseFilterDateEnd').value;

    if (!startDate || !endDate) {
        showNotification('Silakan tentukan rentang tanggal filter', 'error');
        return;
    }
    
    // Reset paginasi setiap kali filter baru diterapkan
    expenseCurrentPage = 1;

    try {
        const response = await apiRequest(`/expenses?start_date=${startDate}&end_date=${endDate}`);
        const data = await response.json();
        
        if (data.success) {
            expenseList = data.data; // Simpan data mentah
            renderExpenseTable(); // Panggil fungsi render
        } else {
            showNotification('Gagal memuat data pengeluaran', 'error');
        }
    } catch (error) {
        console.error('Failed to load expenses:', error);
    }
}

/**
 * Renders the expense table from the loaded data with animations.
 */
function renderExpenseTable() {
    const tbody = document.getElementById('expenseList');
    const totalDiv = document.getElementById('expenseTotal');

    // 1. Paginasi data yang sudah ada di expenseList
    const offset = (expenseCurrentPage - 1) * expenseLimit;
    const paginatedItems = expenseList.slice(offset, offset + expenseLimit);

    if (expenseList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--color-text-muted);">Tidak ada data pengeluaran pada periode ini.</td></tr>';
    } else {
        tbody.innerHTML = paginatedItems.map((expense, index) => `
            <tr style="opacity: 0; transform: translateY(10px); animation: fadeInUp 0.3s ease ${index * 0.05}s forwards;">
                <td>${formatDate(expense.expense_date)}</td> 
                <td>${expense.category_name}</td>
                <td>${expense.description}</td>
                <td>${formatCurrency(expense.amount)}</td>
                <td>${expense.payment_method}</td>
                <td>${expense.created_by_name}</td>
                <td>
                    ${currentUser.role === 'owner' ? 
                        `<button class="btn btn-sm btn-danger" onclick="deleteExpense(${expense.expense_id})"><ion-icon name="trash-outline"></ion-icon></button>` : 
                        '-'
                    }
                </td>
            </tr>
        `).join('');
    }
    
    // 2. Hitung total dari SEMUA data, bukan hanya yang ditampilkan
    const total = expenseList.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    totalDiv.textContent = `Total Pengeluaran: ${formatCurrency(total)}`;
    
    // 3. Update tombol paginasi
    updateExpensePagination();
}

// TAMBAHKAN FUNGSI BARU INI
function updateExpensePagination() {
    const totalItems = expenseList.length;
    document.getElementById('expensePageInfo').textContent = `Halaman ${expenseCurrentPage}`;
    document.getElementById('expensePrevBtn').disabled = (expenseCurrentPage === 1);
    document.getElementById('expenseNextBtn').disabled = (expenseCurrentPage * expenseLimit >= totalItems);
}

/**
 * Opens the modal for adding a new expense.
 */
function openExpenseModal() {
    document.getElementById('expenseModalTitle').textContent = 'Tambah Pengeluaran';
    document.getElementById('expenseForm').reset();
    
    // Set default date to now
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); 
    document.getElementById('expenseDate').value = now.toISOString().slice(0, 16);
    
    openModal('expenseModal');
}

/**
 * Handles the form submission for saving a new expense.
 * @param {Event} e - The form submit event.
 */
async function saveExpense(e) {
    e.preventDefault();
    
    const expenseData = {
        expense_date: document.getElementById('expenseDate').value,
        category_id: document.getElementById('expenseCategory').value,
        description: document.getElementById('expenseDescription').value,
        amount: parseFloat(document.getElementById('expenseAmount').value),
        payment_method: document.getElementById('expensePaymentMethod').value,
        receipt_number: document.getElementById('expenseReceipt').value,
        notes: document.getElementById('expenseNotes').value
    };

    if (!expenseData.category_id) {
        showNotification('Kategori harus dipilih!', 'error');
        return;
    }
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-sm"></span> Menyimpan...';

    try {
        const response = await apiRequest('/expenses', {
            method: 'POST',
            body: JSON.stringify(expenseData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Pengeluaran berhasil ditambahkan', 'success');
            closeModal('expenseModal');
            loadExpenses();
        } else {
            showNotification(data.message || 'Gagal menambah pengeluaran', 'error');
        }
    } catch (error) {
        console.error('Failed to save expense:', error);
        showNotification('Terjadi kesalahan saat menyimpan data', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<ion-icon name="save-outline"></ion-icon> Simpan';
    }
}

/**
 * Deletes an expense after confirmation (owner only).
 * @param {number} expenseId - The ID of the expense to delete.
 */
async function deleteExpense(expenseId) {
    if (currentUser.role !== 'owner') {
        showNotification('Hanya owner yang dapat menghapus data.', 'error');
        return;
    }

    if (!confirm('Apakah Anda yakin ingin menghapus data pengeluaran ini? Aksi ini tidak dapat dibatalkan.')) {
        return;
    }
    
    try {
        const response = await apiRequest(`/expenses/${expenseId}`, { method: 'DELETE' });
        const data = await response.json();
        
        if (data.success) {
            showNotification('Pengeluaran berhasil dihapus', 'success');
            loadExpenses(); 
        } else {
            showNotification(data.message || 'Gagal menghapus', 'error');
        }
    } catch (error) {
        console.error('Failed to delete expense:', error);
        showNotification('Terjadi kesalahan saat menghubungi server', 'error');
    }
}
window.deleteExpense = deleteExpense;