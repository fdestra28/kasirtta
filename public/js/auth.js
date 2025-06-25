// public/js/auth.js - TOKOATK PRO REVAMP VERSION (REVISED & FIXED)

// --- PERBAIKAN KONSISTENSI ---
// Definisikan API_URL di sini, konsisten dengan yang ada di main.js
// Ini memastikan halaman login yang berdiri sendiri tetap bisa berfungsi.
const API_URL = 'http://localhost:5000/api';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

/**
 * Menangani proses login, termasuk feedback ke user.
 * @param {Event} e - Event submit form
 */
async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessageDiv = document.getElementById('errorMessage');
    const submitButton = e.target.querySelector('button[type="submit"]');

    // Hapus pesan error lama
    errorMessageDiv.textContent = '';
    errorMessageDiv.style.display = 'none';

    if (!username || !password) {
        errorMessageDiv.textContent = 'Username dan password harus diisi!';
        errorMessageDiv.style.display = 'block';
        return;
    }

    submitButton.disabled = true;
    submitButton.innerHTML = `<span class="spinner-sm"></span> Logging in...`;

    try {
        // Gunakan konstanta API_URL yang sudah didefinisikan di atas
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            localStorage.setItem('token', data.data.token);
            localStorage.setItem('user', JSON.stringify(data.data.user));
            sessionStorage.setItem('justLoggedIn', 'true');
            window.location.href = 'index.html';
        } else {
            errorMessageDiv.textContent = data.message || 'Login gagal! Periksa kembali username dan password Anda.';
            errorMessageDiv.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorMessageDiv.textContent = 'Terjadi kesalahan koneksi ke server. Silakan coba lagi nanti.';
        errorMessageDiv.style.display = 'block';
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = 'Login';
    }
}

// Pastikan style spinner ada jika file ini dimuat sendiri
// (Tidak perlu jika style.css sudah memuatnya, tapi ini untuk keamanan)
if (!document.querySelector('#spinner-style')) {
    const spinnerStyle = document.createElement('style');
    spinnerStyle.id = 'spinner-style';
    spinnerStyle.textContent = `
        .spinner-sm {
            width: 1rem;
            height: 1rem;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: white;
            border-radius: 50%;
            display: inline-block;
            vertical-align: middle;
            margin-right: 0.5rem;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .error-message {
             display: none;
             background-color: var(--color-danger-light, #fee2e2);
             color: var(--color-danger, #ef4444);
             padding: 0.75rem 1rem;
             border-radius: var(--radius-md, 8px);
             margin-bottom: 1rem;
             font-size: 0.875rem;
             border: 1px solid var(--color-danger, #ef4444);
        }
    `;
    document.head.appendChild(spinnerStyle);
}