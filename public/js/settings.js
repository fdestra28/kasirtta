// public/js/settings.js - KASIRTTA PRO REVAMP VERSION

let settingsEventListenersInitialized = false;

/**
 * Initializes the settings page.
 */
async function initSettings() {
    if (!settingsEventListenersInitialized) {
        setupSettingsFormListener();
    }
    await loadSettingsData();
}

/**
 * Loads settings data from the API and populates the form.
 */
async function loadSettingsData() {
    try {
        const response = await apiRequest('/settings');
        const data = await response.json();

        if (data.success) {
            const settings = data.data;
            document.getElementById('storeName').value = settings.store_name || '';
            document.getElementById('storeAddress').value = settings.store_address || '';
            document.getElementById('storePhone').value = settings.store_phone || '';
            document.getElementById('storeEmail').value = settings.store_email || '';

            // Update logo preview
            const logoPreview = document.getElementById('logoPreview');
            if (settings.store_logo_favicon) {
                logoPreview.src = settings.store_logo_favicon;
                logoPreview.classList.remove('logo-placeholder');
            } else {
                logoPreview.src = ''; // Kosongkan src
                logoPreview.classList.add('logo-placeholder');
            }
        } else {
            showNotification('Gagal memuat data pengaturan.', 'error');
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showNotification('Terjadi kesalahan saat memuat pengaturan.', 'error');
    }
}

/**
 * Sets up the event listener for the settings form submission.
 */
function setupSettingsFormListener() {
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSettingsSave);
    }

    // Add a listener for the file input to show a local preview before upload
    const logoInput = document.getElementById('storeLogo');
    if (logoInput) {
        logoInput.addEventListener('change', function (event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const logoPreview = document.getElementById('logoPreview');
                    logoPreview.src = e.target.result;
                    logoPreview.style.display = 'block';
                }
                reader.readAsDataURL(file);
            }
        });
    }

    settingsEventListenersInitialized = true;
}

/**
 * Handles the saving of settings data.
 * @param {Event} e - The form submit event.
 */
async function handleSettingsSave(e) {
    e.preventDefault();

    const settingsForm = document.getElementById('settingsForm');
    const formData = new FormData(settingsForm);

    // [DIUBAH] Cari tombol berdasarkan ID-nya di seluruh dokumen
    const submitButton = document.getElementById('saveSettingsBtn'); 
    
    // Tambahkan pengecekan untuk keamanan
    if (!submitButton) {
        console.error("Tombol Simpan tidak ditemukan!");
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-sm"></span> Menyimpan...';

    try {
        const response = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            showNotification('Pengaturan berhasil disimpan!', 'success');
            await loadGlobalSettings(); 
        } else {
            showNotification(data.message || 'Gagal menyimpan pengaturan.', 'error');
        }

    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification('Terjadi kesalahan saat menyimpan pengaturan.', 'error');
    } finally {
        // Pastikan tombol ditemukan sebelum mencoba mengubah propertinya
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = '<ion-icon name="save-outline"></ion-icon> Simpan Pengaturan';
        }
    }
}