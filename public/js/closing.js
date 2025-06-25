// public/js/closing.js - TOKOATK PRO REVAMP VERSION

// ===== GLOBAL STATE FOR CLOSING PAGE =====
let currentFinancialReport = null;
let closingEventListenersInitialized = false;

/**
 * Initializes the book closing page.
 */
async function initClosing() {
    // Set default date filters to the previous month
    const today = new Date();
    const firstDayOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfLastMonth = new Date(firstDayOfThisMonth.getTime() - 1);
    const firstDayOfLastMonth = new Date(lastDayOfLastMonth.getFullYear(), lastDayOfLastMonth.getMonth(), 1);

    document.getElementById('periodStartDate').valueAsDate = firstDayOfLastMonth;
    document.getElementById('periodEndDate').valueAsDate = lastDayOfLastMonth;

    // Set default period name
    const monthYear = lastDayOfLastMonth.toLocaleString('id-ID', { month: 'long', year: 'numeric' });
    document.getElementById('periodName').value = `Laporan Keuangan ${monthYear}`;

    if (!closingEventListenersInitialized) {
        setupClosingEvents();
    }
    
    await loadClosingHistory();
}

/**
 * Sets up all event listeners for the closing page to prevent re-binding.
 */
function setupClosingEvents() {
    // Action buttons
    document.getElementById('previewClosingBtn').addEventListener('click', previewFinancialReport);
    document.getElementById('confirmClosingBtn').addEventListener('click', showClosingModal);
    document.getElementById('cancelClosingBtn').addEventListener('click', () => {
        document.getElementById('closingPreview').style.display = 'none';
        currentFinancialReport = null;
    });

    // Closing Confirmation Modal
    document.getElementById('confirmBackup').addEventListener('change', (e) => {
        document.getElementById('executeClosingBtn').disabled = !e.target.checked;
    });
    document.getElementById('cancelClosingModalBtn').addEventListener('click', () => closeModal('closingModal'));
    document.getElementById('executeClosingBtn').addEventListener('click', executeClosing);

    // Historical Report Modal
    document.getElementById('closeHistoricalReportModalBtn').addEventListener('click', () => closeModal('historicalReportModal'));
    document.querySelector('#historicalReportModal .close').addEventListener('click', () => closeModal('historicalReportModal'));

    closingEventListenersInitialized = true;
}

/**
 * Fetches and displays the financial report preview.
 */
async function previewFinancialReport() {
    const periodName = document.getElementById('periodName').value;
    const startDate = document.getElementById('periodStartDate').value;
    const endDate = document.getElementById('periodEndDate').value;

    if (!periodName || !startDate || !endDate) {
        showNotification('Lengkapi semua data periode!', 'error');
        return;
    }
    if (new Date(startDate) > new Date(endDate)) {
        showNotification('Tanggal mulai harus lebih kecil dari tanggal akhir!', 'error');
        return;
    }

    const previewDiv = document.getElementById('closingPreview');
    const reportContentDiv = document.getElementById('closingReportPreview');
    const previewBtn = document.getElementById('previewClosingBtn');

    reportContentDiv.innerHTML = '<div class="spinner"></div>';
    previewDiv.style.display = 'block';
    previewBtn.disabled = true;
    previewBtn.innerHTML = '<span class="spinner-sm"></span> Memuat...';

    try {
        const response = await apiRequest(`/closing/report?start_date=${startDate}&end_date=${endDate}`);
        const data = await response.json();

        if (data.success) {
            currentFinancialReport = data.data;
            renderFinancialReportPreview(data.data, periodName, 'closingReportPreview');
        } else {
            reportContentDiv.innerHTML = `<p class="text-danger">Gagal memuat laporan: ${data.message}</p>`;
            showNotification(data.message || 'Gagal generate laporan', 'error');
        }
    } catch (error) {
        console.error('Preview error:', error);
    } finally {
        previewBtn.disabled = false;
        previewBtn.innerHTML = '<ion-icon name="eye-outline"></ion-icon> Preview Laporan';
    }
}

/**
 * Renders the HTML for the financial report in a specified container.
 * @param {object} report - The financial report data.
 * @param {string} periodName - The name of the reporting period.
 * @param {string} containerId - The ID of the container element to render into.
 */
function renderFinancialReportPreview(report, periodName, containerId) {
    const { profit_loss_statement: pl, cash_flow_statement: cf, equity_statement: eq } = report;
    const reportContainerDiv = document.getElementById(containerId);

    if (!reportContainerDiv) {
        console.error(`Container with ID "${containerId}" not found!`);
        return;
    }

    // --- PERBAIKAN DI SINI ---
    // Tambahkan ID unik ke konten laporan untuk target cetak/export
    const reportContentId = `${containerId}-content`;
    
    const html = `
        <div class="accounting-report" id="${reportContentId}">
            <div style="text-align: center; margin-bottom: 2rem; border-bottom: 2px solid #333; padding-bottom: 1rem;">
                <h2 style="margin: 0;">${appSettings.store_name || 'Toko Anda'}</h2>
                <p style="margin: 0.25rem 0;">${appSettings.store_address || ''}</p>
                <p style="margin: 0.25rem 0;">Telp: ${appSettings.store_phone || ''}</p>
            </div>
            <h3 style="text-align: center; margin-bottom: 2rem;">${periodName}</h3>

            <h4>Laporan Laba Rugi</h4>
            <table class="accounting-table">
                <tr><td>Pendapatan Penjualan</td><td class="text-right">${formatCurrency(pl.total_revenue)}</td></tr>
                <tr><td>(-) Harga Pokok Penjualan (HPP)</td><td class="text-right">${formatCurrency(pl.total_cogs)}</td></tr>
                <tr class="total-row"><td><strong>Laba Kotor</strong></td><td class="text-right"><strong>${formatCurrency(pl.gross_profit)}</strong></td></tr>
                <tr><td colspan="2"><strong>Biaya Operasional:</strong></td></tr>
                ${pl.operational_expenses.details.map(exp => `
                    <tr><td style="padding-left: 20px;">- ${exp.category_name}</td><td class="text-right">${formatCurrency(exp.total_amount)}</td></tr>
                `).join('')}
                <tr class="total-row"><td style="padding-left: 20px;"><strong>Total Biaya Operasional</strong></td><td class="text-right"><strong>(${formatCurrency(pl.operational_expenses.total)})</strong></td></tr>
                <tr class="grand-total"><td><strong>LABA BERSIH</strong></td><td class="text-right"><strong>${formatCurrency(pl.net_profit)}</strong></td></tr>
            </table>

            <h4>Laporan Perubahan Modal</h4>
            <table class="accounting-table">
                <tr><td>Modal Awal Periode</td><td class="text-right">${formatCurrency(eq.beginning_capital)}</td></tr>
                <tr><td>(+) Laba Bersih Periode Ini</td><td class="text-right">${formatCurrency(eq.net_profit)}</td></tr>
                <tr><td>(-) Prive (Pengambilan Pribadi)</td><td class="text-right">${formatCurrency(eq.owner_draw)}</td></tr>
                <tr class="grand-total"><td><strong>MODAL AKHIR PERIODE</strong></td><td class="text-right"><strong>${formatCurrency(eq.ending_capital)}</strong></td></tr>
            </table>
        </div>
        <div class="report-actions" style="justify-content: flex-end; margin-top: 1rem;">
            <button class="btn btn-success" onclick="exportFinancialReportToCSV(currentFinancialReport, '${periodName.replace(/'/g, "\\'")}')">
                <ion-icon name="download-outline"></ion-icon> Export
            </button>
            <button class="btn btn-secondary" onclick="printReportElement('${reportContentId}')">
                <ion-icon name="print-outline"></ion-icon> Cetak
            </button>
        </div>
    `;
    reportContainerDiv.innerHTML = html;
}

/**
 * Shows the confirmation modal for closing the books.
 */
function showClosingModal() {
    if (!currentFinancialReport) {
        showNotification('Silakan preview laporan terlebih dahulu!', 'error');
        return;
    }
    const { net_profit, ending_capital } = currentFinancialReport.equity_statement;
    document.getElementById('closingConfirmDetails').innerHTML = `
        <div class="confirm-details">
            <p><strong>Nama Periode:</strong> ${document.getElementById('periodName').value}</p>
            <p><strong>Laba Bersih:</strong> <span class="text-success">${formatCurrency(net_profit)}</span></p>
            <p><strong>Modal Akhir:</strong> <span class="text-primary">${formatCurrency(ending_capital)}</span></p>
        </div>
        <p class="text-danger" style="margin-top: 1rem;"><strong>PERINGATAN:</strong> Semua data transaksi dan pengeluaran akan direset dan diarsipkan. Proses ini tidak dapat dibatalkan.</p>
    `;
    document.getElementById('closingPassword').value = '';
    document.getElementById('confirmBackup').checked = false;
    document.getElementById('executeClosingBtn').disabled = true;
    openModal('closingModal');
}

/**
 * Executes the book closing process after confirmation.
 */
async function executeClosing() {
    const password = document.getElementById('closingPassword').value;
    if (!password) {
        showNotification('Masukkan password Anda untuk konfirmasi!', 'error');
        return;
    }
    if (!currentFinancialReport) {
        showNotification('Data laporan tidak ditemukan, silakan preview ulang.', 'error');
        return;
    }

    const closingData = {
        period_name: document.getElementById('periodName').value,
        start_date: document.getElementById('periodStartDate').value,
        end_date: document.getElementById('periodEndDate').value,
        notes: document.getElementById('periodNotes').value,
        password: password,
        financial_report: currentFinancialReport
    };

    const execButton = document.getElementById('executeClosingBtn');
    execButton.disabled = true;
    execButton.innerHTML = '<span class="spinner-sm"></span> Memproses...';

    try {
        const response = await apiRequest('/closing/execute', { method: 'POST', body: JSON.stringify(closingData) });
        const data = await response.json();

        if (data.success) {
            showNotification(data.message, 'success');
            showNotification('Sistem akan logout dalam 5 detik...', 'info');
            setTimeout(() => {
                localStorage.clear();
                window.location.href = 'login.html';
            }, 5000);
        } else {
            showNotification(data.message || 'Gagal melakukan tutup buku', 'error');
            execButton.disabled = false;
            execButton.innerHTML = '<ion-icon name="lock-closed-outline"></ion-icon> Tutup Buku Sekarang';
        }
    } catch (error) {
        console.error('Execute closing error:', error);
        execButton.disabled = false;
        execButton.innerHTML = '<ion-icon name="lock-closed-outline"></ion-icon> Tutup Buku Sekarang';
    }
}

/**
 * Loads the history of closed books.
 */
async function loadClosingHistory() {
    try {
        const response = await apiRequest('/closing/history');
        const data = await response.json();
        if (data.success) {
            const tbody = document.getElementById('closingHistory');
            if (data.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding: 40px; color: var(--color-text-muted);">Belum ada riwayat tutup buku</td></tr>';
            } else {
                tbody.innerHTML = data.data.map(c => `
                    <tr>
                        <td>${c.period_name}</td>
                        <td>${formatDate(c.closing_date)}</td>
                        <td>${c.closed_by_name}</td>
                        <td><a href="${API_URL}/closing/backup/${c.backup_file}?token=${localStorage.getItem('token')}" class="btn btn-sm btn-primary" download><ion-icon name="archive-outline"></ion-icon></a></td>
                        <td><button class="btn btn-sm" onclick="viewHistoricalReport('${c.closing_id}')"><ion-icon name="eye-outline"></ion-icon></button></td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Load history error:', error);
    }
}

/**
 * Displays a historical financial report in a modal.
 * @param {string} closingId - The ID of the closing history entry.
 */
async function viewHistoricalReport(closingId) {
    const contentDiv = document.getElementById('historicalReportContent');
    const title = document.getElementById('historicalReportTitle');

    title.textContent = 'Laporan Keuangan Historis';
    contentDiv.innerHTML = '<div class="spinner"></div>';
    openModal('historicalReportModal');

    try {
        const response = await apiRequest(`/closing/history/${closingId}`);
        const data = await response.json();

        if (data.success) {
            renderFinancialReportPreview(data.data.report, data.data.period_name, 'historicalReportContent');
            title.textContent = `Laporan Keuangan - ${data.data.period_name}`;
        } else {
            contentDiv.innerHTML = `<p class="text-danger">Gagal memuat laporan: ${data.message}</p>`;
        }
    } catch (error) {
        console.error('View historical report error:', error);
        contentDiv.innerHTML = '<p class="text-danger">Terjadi kesalahan saat mengambil data laporan.</p>';
    }
}
window.viewHistoricalReport = viewHistoricalReport;

/**
 * Exports the financial report data to a CSV file.
 * @param {object} report - The financial report data object.
 * @param {string} periodName - The name of the period.
 */
function exportFinancialReportToCSV(report, periodName) {
    if (!report) {
        showNotification('Tidak ada data laporan untuk diekspor.', 'error');
        return;
    }

    const { profit_loss_statement: pl, equity_statement: eq } = report;

    let csvContent = `Laporan Keuangan\n`;
    csvContent += `Periode,${periodName}\n\n`;

    csvContent += `Laporan Laba Rugi\n`;
    csvContent += `Keterangan,Jumlah\n`;
    csvContent += `Pendapatan Penjualan,${pl.total_revenue}\n`;
    csvContent += `Harga Pokok Penjualan (HPP),${pl.total_cogs}\n`;
    csvContent += `Laba Kotor,${pl.gross_profit}\n`;
    csvContent += `\nBiaya Operasional\n`;
    pl.operational_expenses.details.forEach(exp => {
        csvContent += `${exp.category_name},${exp.total_amount}\n`;
    });
    csvContent += `Total Biaya Operasional,${pl.operational_expenses.total}\n`;
    csvContent += `LABA BERSIH,${pl.net_profit}\n\n`;
    
    csvContent += `Laporan Perubahan Modal\n`;
    csvContent += `Keterangan,Jumlah\n`;
    csvContent += `Modal Awal Periode,${eq.beginning_capital}\n`;
    csvContent += `Laba Bersih,${eq.net_profit}\n`;
    csvContent += `Prive,${eq.owner_draw}\n`;
    csvContent += `MODAL AKHIR PERIODE,${eq.ending_capital}\n`;

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Laporan_Keuangan_${periodName.replace(/ /g, '_')}.csv`;
    link.click();
    showNotification('Laporan berhasil di-export!', 'success');
}
// Ekspos fungsi ke global scope
window.exportFinancialReportToCSV = exportFinancialReportToCSV;
