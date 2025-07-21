// utils/cache.js

const cache = new Map();
const TTL = 5 * 60 * 1000; // Time-To-Live: 5 Menit (dalam milidetik)

/**
 * Mengambil data dari cache.
 * @param {string} key Kunci cache.
 * @returns {any|null} Data dari cache atau null jika tidak ada atau sudah kedaluwarsa.
 */
function getFromCache(key) {
    if (!cache.has(key)) {
        return null;
    }

    const entry = cache.get(key);
    const isExpired = (Date.now() - entry.timestamp) > TTL;

    if (isExpired) {
        cache.delete(key); // Hapus data yang sudah kedaluwarsa
        return null;
    }

    // console.log(`[Cache] HIT for key: ${key}`);
    return entry.data;
}

/**
 * Menyimpan data ke dalam cache.
 * @param {string} key Kunci cache.
 * @param {any} data Data yang akan disimpan.
 */
function setInCache(key, data) {
    const entry = {
        data: data,
        timestamp: Date.now()
    };
    cache.set(key, entry);
    // console.log(`[Cache] SET for key: ${key}`);
}

/**
 * Menghapus data dari cache berdasarkan kunci.
 * @param {string} key Kunci cache yang akan dihapus.
 */
function clearCache(key) {
    cache.delete(key);
    // console.log(`[Cache] CLEARED for key: ${key}`);
}

module.exports = {
    getFromCache,
    setInCache,
    clearCache
};