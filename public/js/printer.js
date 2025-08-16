// public/js/printer.js - VERSI FINAL DENGAN BATASAN UKURAN LOGO

// ===== HELPER FUNCTIONS =====

function formatRibuan(number) {
    let n = typeof number === 'string' ? parseFloat(number) : number;
    return "Rp " + n.toLocaleString("id-ID"); 
}

function formatSummaryRow(label, value) {
    const lineWidth = 30;
    label = label.toString();
    value = value.toString();
    const spaces = lineWidth - label.length - value.length;
    return label + ' '.repeat(Math.max(0, spaces)) + value;
}

function formatItemRow(name, qty, unitPrice, subtotal) {
    const lineWidth = 30;
    let line1 = name.padEnd(lineWidth);
    let details = `${qty} x ${formatRibuan(unitPrice)}`;
    let subtotalStr = formatRibuan(subtotal);
    let spaces = lineWidth - details.length - subtotalStr.length;
    let line2 = details + ' '.repeat(Math.max(0, spaces)) + subtotalStr;
    return line1 + "\n" + line2;
}

function formatReceiptDate(dateString) {
    const date = new Date(dateString);
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear().toString().slice(-2);
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${d}/${m}/${y} ${h}:${min}`;
}

// [DIUBAH] Fungsi konversi logo sekarang dengan batasan tinggi.
async function createLogoRasterData(base64Image, maxWidth = 384, maxHeight = 120) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = base64Image;

        image.onload = () => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');

            // Logika penskalaan yang lebih canggih untuk membatasi lebar DAN tinggi.
            const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
            
            canvas.width = Math.floor(image.width * scale);
            canvas.height = Math.floor(image.height * scale);

            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;
            const widthInBytes = Math.ceil(canvas.width / 8);
            
            const monochromeData = new Uint8Array(widthInBytes * canvas.height);
            let dataIndex = 0;

            for (let y = 0; y < canvas.height; y++) {
                for (let x = 0; x < canvas.width; x += 8) {
                    let byte = 0;
                    for (let bit = 0; bit < 8; bit++) {
                        if (x + bit < canvas.width) {
                            const pixelIndex = ((y * canvas.width) + (x + bit)) * 4;
                            const r = pixels[pixelIndex];
                            const g = pixels[pixelIndex + 1];
                            const b = pixels[pixelIndex + 2];
                            
                            const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;
                            if (grayscale < 128) {
                                byte |= (1 << (7 - bit));
                            }
                        }
                    }
                    monochromeData[dataIndex++] = byte;
                }
            }
            
            const widthL = widthInBytes & 0xFF;
            const widthH = (widthInBytes >> 8) & 0xFF;
            const heightL = canvas.height & 0xFF;
            const heightH = (canvas.height >> 8) & 0xFF;

            const command = new Uint8Array([29, 118, 48, 0, widthL, widthH, heightL, heightH]);
            const finalData = new Uint8Array(command.length + monochromeData.length);
            finalData.set(command, 0);
            finalData.set(monochromeData, command.length);

            resolve(finalData);
        };

        image.onerror = (err) => {
            reject(new Error("Gagal memuat gambar logo."));
        };
    });
}


async function sendChunks(characteristic, data) {
    const chunkSize = 180;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
        const chunk = data.slice(offset, offset + chunkSize);
        await characteristic.writeValueWithoutResponse(chunk);
    }
}

// ===== OBJECT PRINTER UTAMA =====

const thermalPrinter = {
    bluetoothDevice: null,
    
    isConnected() {
        return this.bluetoothDevice && this.bluetoothDevice.gatt.connected;
    },

    async connect() {
        updatePrinterStatus('Mencari printer...', true);
        try {
            const device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: "RPP" }, { namePrefix: "MTP" },
                    { namePrefix: "Thermal" }, { namePrefix: "POS" }
                ],
                optionalServices: ["000018f0-0000-1000-8000-00805f9b34fb"]
            });

            this.bluetoothDevice = device;
            this.bluetoothDevice.addEventListener('gattserverdisconnected', () => this.onDisconnected());
            
            await this.bluetoothDevice.gatt.connect();

            const printerName = this.bluetoothDevice.name || 'Printer Bluetooth';
            updatePrinterStatus(`Terhubung ke ${printerName}`, false, true);
            showNotification(`Berhasil terhubung ke printer ${printerName}`, 'success');

        } catch (error) {
            updatePrinterStatus('Hubungkan Printer', false, false);
            if (error.name !== 'NotFoundError') {
                showNotification(`Gagal terhubung: ${error.message}`, 'error');
            }
            console.error("Gagal menyambungkan ke printer:", error);
        }
    },
    
    disconnect() {
        if (this.isConnected()) {
            this.bluetoothDevice.gatt.disconnect();
        }
    },

    onDisconnected() {
        showNotification('Koneksi printer terputus.', 'warning');
        this.bluetoothDevice = null;
        updatePrinterStatus('Hubungkan Printer', false, false);
    },

    async print(transactionData, storeSettings) {
        if (!this.isConnected()) {
            showNotification('Printer tidak terhubung. Coba sambungkan ulang.', 'error');
            if (confirm("Printer tidak terhubung. Coba sambungkan sekarang?")) {
                await this.connect();
                if (!this.isConnected()) return false;
            } else {
                return false;
            }
        }
        
        try {
            updatePrinterStatus('Mencetak...', true);

            const server = await this.bluetoothDevice.gatt.connect();
            const service = await server.getPrimaryService("000018f0-0000-1000-8000-00805f9b34fb");
            const characteristic = await service.getCharacteristic("00002af1-0000-1000-8000-00805f9b34fb");

            const encoder = new TextEncoder();
            const cashierName = transactionData.cashier_name || currentUser.full_name;
            
            // Perintah reset di awal
            await sendChunks(characteristic, new Uint8Array([0x1B, 0x40])); 
            
            // Perataan tengah untuk logo dan header
            await sendChunks(characteristic, new Uint8Array([0x1B, 0x61, 0x01]));

            if (storeSettings.store_logo_favicon && storeSettings.store_logo_favicon.startsWith('data:image')) {
                try {
                    // Pemanggilan tidak perlu diubah, karena maxHeight sudah memiliki default 120px
                    const logoBytes = await createLogoRasterData(storeSettings.store_logo_favicon);
                    await sendChunks(characteristic, logoBytes);
                } catch (logoError) {
                    console.error(logoError);
                }
            }

            let receiptText = "";
            receiptText += "\x1B\x21\x10";
            receiptText += storeSettings.store_name + "\n";
            receiptText += "\x1B\x21\x00";
            receiptText += storeSettings.store_address + "\n";
            receiptText += "Telp: " + storeSettings.store_phone + "\n";
            receiptText += "==============================\n";
            receiptText += "\x1B\x61\x00"; // Left align

            receiptText += formatSummaryRow('No:', transactionData.transaction_code) + "\n";
            receiptText += formatSummaryRow('Tgl:', formatReceiptDate(transactionData.transaction_date)) + "\n";
            receiptText += formatSummaryRow('Kasir:', cashierName) + "\n";
            
            receiptText += "==============================\n";
            receiptText += formatSummaryRow("Nama Item", "Total") + "\n";
            receiptText += "------------------------------\n";

            transactionData.items.forEach(item => {
                receiptText += formatItemRow(
                    item.product_name || item.item_name,
                    item.quantity,
                    item.unit_price,
                    item.subtotal
                ) + "\n";
            });
            
            receiptText += "------------------------------\n";
            receiptText += formatSummaryRow("Total", formatRibuan(transactionData.total_amount)) + "\n";
            receiptText += formatSummaryRow("Bayar", formatRibuan(transactionData.payment_received)) + "\n";
            receiptText += formatSummaryRow("Kembali", formatRibuan(transactionData.change_amount)) + "\n";
            receiptText += "==============================\n";
            receiptText += "\x1B\x61\x01"; // Center
            receiptText += "Terima Kasih!\n\n\n";
            
            receiptText += "\x1D\x56\x42\x00"; // Potong kertas

            await sendChunks(characteristic, encoder.encode(receiptText));

            showNotification("Struk berhasil dicetak!", 'success');
            return true;
        } catch (e) {
            showNotification(`Gagal mencetak: ${e.message}`, "error");
            console.error("Gagal mencetak struk thermal:", e);
            return false;
        } finally {
            const printerName = this.bluetoothDevice.name || 'Printer Bluetooth';
            updatePrinterStatus(`Terhubung ke ${printerName}`, false, true);
        }
    }
};

function updatePrinterStatus(text, isLoading, isConnected = false) {
  const btn = document.getElementById('connectPrinterBtn');
  const statusText = document.getElementById('printerStatusText');
  const icon = btn.querySelector('ion-icon');

  if (!btn || !statusText || !icon) return;

  statusText.textContent = text;
  btn.disabled = isLoading;

  if (isConnected) {
    btn.classList.remove('btn-outline');
    btn.classList.add('btn-success');
    icon.setAttribute('name', 'checkmark-circle-outline');
  } else {
    btn.classList.add('btn-outline');
    btn.classList.remove('btn-success');
    icon.setAttribute('name', 'bluetooth-outline');
  }
}