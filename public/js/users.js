// public/js/users.js - TOKOATK PRO REVAMP VERSION

// ===== GLOBAL STATE FOR USERS PAGE =====
let users = [];
let editingUserId = null;
let userEventListenersInitialized = false;

/**
 * Initializes the user management page.
 */
async function initUsers() {
    if (!userEventListenersInitialized) {
        setupUserPageEvents();
    }
    await loadUsers();
}

/**
 * Sets up all event listeners for the user page to prevent re-binding.
 */
function setupUserPageEvents() {
    // Main action buttons
    document.getElementById('addUserBtn').addEventListener('click', () => openUserModal());

    // User Modal
    document.getElementById('userForm').addEventListener('submit', saveUser);
    document.getElementById('cancelUserModal').addEventListener('click', () => closeModal('userModal'));
    
    userEventListenersInitialized = true;
}

/**
 * Fetches user data from the API and triggers rendering.
 */
async function loadUsers() {
    try {
        const response = await apiRequest('/auth/users');
        const data = await response.json();
        
        if (data.success) {
            users = data.data;
            renderUserTable();
        } else {
            showNotification('Gagal memuat data pengguna', 'error');
        }
    } catch (error) {
        console.error('Load users error:', error);
    }
}

/**
 * Renders the user data into the HTML table with animations.
 */
function renderUserTable() {
    const tbody = document.getElementById('userList');
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--color-text-muted);">Tidak ada data pengguna.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map((user, index) => `
        <tr style="opacity: 0; transform: translateY(10px); animation: fadeInUp 0.3s ease ${index * 0.05}s forwards;">
            <td>${user.user_id}</td>
            <td>${user.username}</td>
            <td>${user.full_name}</td>
            <td><span class="badge ${user.role === 'owner' ? 'badge-primary' : 'badge-secondary'}">${user.role}</span></td>
            <td>${formatDate(user.created_at)}</td>
            <td>
                <span class="badge ${user.is_active ? 'badge-success' : 'badge-danger'}">
                    ${user.is_active ? 'Aktif' : 'Nonaktif'}
                </span>
            </td>
            <td>
                ${user.role !== 'owner' && user.user_id !== currentUser.user_id ? `
                    <div class="action-buttons-group" style="display: flex; gap: 8px;">
                        <button class="btn btn-sm" onclick="editUser(${user.user_id})"><ion-icon name="create-outline"></ion-icon></button>
                        <button class="btn btn-sm ${user.is_active ? 'btn-warning' : 'btn-success'}" 
                                onclick="toggleUserStatus(${user.user_id})">
                            <ion-icon name="${user.is_active ? 'eye-off-outline' : 'eye-outline'}"></ion-icon>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.user_id})"><ion-icon name="trash-outline"></ion-icon></button>
                    </div>
                ` : '-'}
            </td>
        </tr>
    `).join('');
}

/**
 * Opens the user modal for adding a new admin.
 */
function openUserModal() {
    editingUserId = null;
    document.getElementById('userModalTitle').textContent = 'Tambah Admin';
    document.getElementById('userForm').reset();
    document.getElementById('editingUserId').value = '';
    
    // Password is required for new users
    document.getElementById('userPassword').required = true;
    document.getElementById('userPasswordConfirm').required = true;
    document.getElementById('passwordHint').style.display = 'none';
    
    openModal('userModal');
}

/**
 * Fetches user data and opens the modal for editing.
 * @param {number} userId - The ID of the user to edit.
 */
async function editUser(userId) {
    try {
        const response = await apiRequest(`/auth/users/${userId}`);
        const data = await response.json();
        
        if (data.success) {
            editingUserId = userId;
            document.getElementById('userModalTitle').textContent = 'Edit Admin';
            document.getElementById('editingUserId').value = userId;
            
            // Fill form
            document.getElementById('userUsername').value = data.data.username;
            document.getElementById('userFullName').value = data.data.full_name;
            document.getElementById('userPassword').value = '';
            document.getElementById('userPasswordConfirm').value = '';
            
            // Password is optional for editing
            document.getElementById('userPassword').required = false;
            document.getElementById('userPasswordConfirm').required = false;
            document.getElementById('passwordHint').style.display = 'inline';
            
            openModal('userModal');
        } else {
            showNotification('Gagal mengambil data pengguna', 'error');
        }
    } catch (error) {
        console.error('Get user error:', error);
    }
}
window.editUser = editUser;

/**
 * Handles the form submission for creating or updating a user.
 * @param {Event} e - The form submit event.
 */
async function saveUser(e) {
    e.preventDefault();
    
    const password = document.getElementById('userPassword').value;
    const passwordConfirm = document.getElementById('userPasswordConfirm').value;
    const userId = document.getElementById('editingUserId').value;
    
    if (password !== passwordConfirm) {
        showNotification('Password dan konfirmasi password tidak cocok!', 'error');
        return;
    }
    
    if (!userId && !password) {
        showNotification('Password harus diisi untuk pengguna baru!', 'error');
        return;
    }
    
    const formData = {
        username: document.getElementById('userUsername').value,
        full_name: document.getElementById('userFullName').value
    };
    
    if (password) {
        formData.password = password;
    }
    
    const submitButton = e.target.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="spinner-sm"></span> Menyimpan...';

    try {
        const response = userId 
            ? await apiRequest(`/auth/users/${userId}`, { method: 'PUT', body: JSON.stringify(formData) })
            : await apiRequest('/auth/create-admin', { method: 'POST', body: JSON.stringify({ ...formData, password: password }) });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(userId ? 'Pengguna berhasil diupdate' : 'Admin berhasil ditambahkan', 'success');
            closeModal('userModal');
            loadUsers();
        } else {
            showNotification(data.message || 'Gagal menyimpan pengguna', 'error');
        }
    } catch (error) {
        console.error('Save user error:', error);
        showNotification('Terjadi kesalahan koneksi', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = '<ion-icon name="save-outline"></ion-icon> Simpan';
    }
}

/**
 * Deletes or deactivates a user after confirmation.
 * @param {number} userId - The ID of the user.
 */
async function deleteUser(userId) {
    const user = users.find(u => u.user_id === userId);
    if (!user) return;
    
    if (!confirm(`Yakin ingin menghapus pengguna "${user.full_name}"?\nJika pengguna memiliki riwayat aktivitas, akunnya hanya akan dinonaktifkan.`)) {
        return;
    }
    
    try {
        const response = await apiRequest(`/auth/users/${userId}`, { method: 'DELETE' });
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            loadUsers();
        } else {
            showNotification(data.message || 'Gagal menghapus pengguna', 'error');
        }
    } catch (error) {
        console.error('Delete user error:', error);
    }
}
window.deleteUser = deleteUser;

/**
 * Toggles the active status of a user.
 * @param {number} userId - The ID of the user.
 */
async function toggleUserStatus(userId) {
    const user = users.find(u => u.user_id === userId);
    if (!user) return;
    
    const action = user.is_active ? 'menonaktifkan' : 'mengaktifkan';
    if (!confirm(`Yakin ingin ${action} pengguna "${user.full_name}"?`)) {
        return;
    }
    
    try {
        const response = await apiRequest(`/auth/users/${userId}/toggle-status`, { method: 'PUT' });
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.message, 'success');
            loadUsers();
        } else {
            showNotification(data.message || 'Gagal mengubah status pengguna', 'error');
        }
    } catch (error) {
        console.error('Toggle user error:', error);
    }
}

window.editUser = editUser;
window.deleteUser = deleteUser;
window.toggleUserStatus = toggleUserStatus;