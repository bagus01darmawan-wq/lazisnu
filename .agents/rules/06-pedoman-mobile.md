---
trigger: model_decision
---

# Rule: Pedoman Mobile App
# Scope: Mobile agent — semua task yang menyentuh apps/mobile/

---

## Platform Target

```
Platform  : Android (prioritas utama)
Framework : React Native + TypeScript
Min SDK   : Android 8.0 (API 26)
Testing   : Emulator Pixel 6, API 34

iOS: SKIP untuk saat ini. Jangan tambahkan iOS-specific code.
```

---

## Daftar Layar & Navigasi

### AuthStack (sebelum login)
```
SplashScreen       → cek token → redirect ke MainStack atau LoginScreen
LoginScreen        → form ID petugas + password
```

### MainStack (setelah login)
```
DashboardScreen    → list task + progress bar + tombol Mulai Trip
  ↓ tap task
DetailTaskScreen   → info kaleng: nama pemilik, alamat, status periode ini
  ↓ tap Scan QR
QRScannerScreen    → kamera scan + validasi
  ↓ QR valid
InputNominalScreen → keyboard angka + pilih Cash/Transfer
  ↓ lanjut
KonfirmasiScreen   → review ringkasan + tombol konfirmasi (tidak bisa batal)
  ↓ submit
SuksesScreen       → animasi sukses + status WA
ResubmitFormScreen → input nominal baru + alasan wajib (dari list task selesai)
ProfilScreen       → nama, wilayah, logout
```

---

## Alur Offline yang Harus Diimplementasikan

```typescript
// 1. Petugas tap "Mulai Trip" → app switch ke offline mode
//    (data mulai di-queue lokal meski ada sinyal — untuk konsistensi)

// 2. Setiap submit koleksi:
const isOnline = await NetInfo.fetch().then(s => s.isConnected)

if (isOnline) {
  try {
    await koleksiService.submit(record)
    // sukses → update status task ke 'selesai' di local state
  } catch {
    offlineQueueStore.addToQueue(record)
    // tampil indikator "Menunggu Sinkronisasi"
  }
} else {
  offlineQueueStore.addToQueue(record)
  // tampil indikator "Menunggu Sinkronisasi"
}

// 3. NetInfo event listener:
NetInfo.addEventListener(state => {
  if (state.isConnected && state.isInternetReachable) {
    syncService.syncPendingQueue()
  }
})

// 4. syncService.syncPendingQueue():
async function syncPendingQueue() {
  const queue = offlineQueueStore.getQueue()
  if (queue.length === 0) return

  const result = await koleksiService.batchSync(queue)
  // Hapus dari queue hanya yang berhasil di-sync
  offlineQueueStore.removeSubmitted(result.successIds)
}
```

---

## QR Scanner

```typescript
// Gunakan react-native-camera-kit
// Scan area: fullscreen dengan overlay kotak di tengah
// Setelah QR terbaca → SEGERA disable scanner (cegah double scan)
// Tampilkan loading indicator saat validasi ke server

// Handle semua kasus error dengan pesan yang jelas untuk petugas lapangan:
const ERROR_MESSAGES: Record<string, string> = {
  QR_INVALID          : 'Kode QR tidak valid. Pastikan scan kaleng yang benar.',
  QR_ALREADY_SUBMITTED: 'Kaleng ini sudah diambil bulan ini.',
  QR_NOT_ASSIGNED     : 'Kaleng ini bukan tugas Anda bulan ini.',
  NETWORK_ERROR       : 'Tidak ada sinyal. Data disimpan dan akan sync otomatis.',
}
```

---

## Input Nominal

```typescript
// WAJIB: Gunakan keyboard angka, bukan keyboard default
<TextInput
  keyboardType="number-pad"
  placeholder="0"
  value={formatRupiah(nominal)}  // tampilkan dengan format Rp
  onChangeText={(text) => setNominal(parseRupiahInput(text))}
/>

// Format rupiah:
function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0
  }).format(value)
}

// PENTING: Simpan sebagai integer (BIGINT), bukan float
// 50000 bukan 50000.00
```

---

## Push Notification (FCM)

```typescript
// Jenis notifikasi yang dikirim server:
// 1. ASSIGNMENT_NEW      → "Assignment bulan baru tersedia" (tiap tanggal 1)
// 2. SYNC_FAILED         → "Beberapa data gagal sync, buka app untuk review"
// 3. ANNOUNCEMENT        → Pengumuman dari admin

// Setup: google-services.json harus ada di apps/mobile/android/app/
// Handle notifikasi saat app di foreground DAN background
```

---

## OTA Update (CodePush)

```typescript
// Wrap App component:
import CodePush from 'react-native-code-push'

const codePushOptions = {
  checkFrequency: CodePush.CheckFrequency.ON_APP_RESUME,
  installMode   : CodePush.InstallMode.ON_NEXT_RESUME,
  // Silent update — petugas tidak terganggu saat sedang trip
}

export default CodePush(codePushOptions)(App)

// Deployment keys (dari .env):
// STAGING    → CODEPUSH_KEY_STAGING
// PRODUCTION → CODEPUSH_KEY_PRODUCTION
```

---

## UI/UX Guidelines Mobile

```
Prinsip utama: Petugas pakai HP outdoor, mungkin pakai sarung tangan.
→ Tombol utama minimal tinggi 56px
→ Font minimal 16sp untuk teks penting
→ Hindari aksi yang membutuhkan presisi tinggi (tap area kecil)
→ Feedback visual dan haptic setiap aksi penting (scan berhasil, submit berhasil)
→ Loading state harus selalu ada untuk aksi yang butuh waktu

Warna status task:
  pending  → abu-abu atau putih
  selesai  → hijau
  error/gagal → merah

Indikator offline: banner kuning/oranye di bagian atas layar
Indikator sync   : badge angka pada icon di header
```

---

## Keamanan Mobile

```
Google Play Integrity API:
- Panggil saat login (bukan setiap request)
- Kirim integrity token ke backend untuk diverifikasi
- Jika device tidak lolos: tampilkan pesan error, blokir akses

MMKV Encryption:
- Semua data sensitif (token, profil) wajib disimpan di MMKV dengan enkripsi
- Jangan gunakan AsyncStorage untuk data sensitif

Jangan log data sensitif:
- Jangan console.log token, nominal, atau data pribadi petugas/pemilik kaleng
```

---

*Lazisnu Infaq Collection System — rules/06-pedoman-mobile.md*
