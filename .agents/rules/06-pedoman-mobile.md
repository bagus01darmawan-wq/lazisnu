---
trigger: manual
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
LoginScreen        → form nomor HP + OTP
```

### MainStack (setelah login)
```
DashboardScreen    → ringkasan tugas + progress + nominal hari/minggu ini
ScanScreen         → kamera scanner QR + detail info kaleng (jika terdeteksi)
CollectionScreen   → input nominal infaq + metode penerimaan (Tunai/Transfer) + detail kaleng
SuccessScreen      → status sukses penjemputan + notifikasi WA
HistoryScreen      → daftar riwayat penjemputan (termasuk status pending sync lokal)
TasksScreen        → list tugas (ACTIVE & COMPLETED) dengan filter segmented control
ProfileScreen      → profil petugas + tombol logout
```

---

## Kebijakan Offline-First & Alur Sinkronisasi (Wajib Dipatuhi)

```typescript
// 1. DATA INVARIANT FINANSIAL:
// Dilarang keras menghapus queued collection tanpa konfirmasi sukses dari server (ACK).
// Tidak boleh ada fungsi clearQueue() atau tombol "Hapus Data Lokal".
// Saat logout, data pending/failed tidak boleh dihapus (simpan berdasarkan officerId).

// 2. Pemisahan payload batch transaksi dengan metadata lokal:
interface BatchCollectionRequestItem {
  offline_id: string;
  assignment_id: string;
  can_id: string;
  nominal: number;
  collected_at: string;
  latitude?: number;
  longitude?: number;
  device_info?: DeviceInfo;
}

// Gunakan mapper allowlist untuk membuang metadata lokal sebelum dikirim ke API:
function toBatchPayload(item: QueuedCollection): BatchCollectionRequestItem {
  return {
    offline_id: item.offline_id,
    assignment_id: item.assignment_id,
    can_id: item.can_id,
    nominal: item.nominal,
    collected_at: item.collected_at,
    latitude: item.latitude,
    longitude: item.longitude,
  };
}

// 3. Logika Retrying dan Rekonsiliasi Refresh:
// - Coba kirim ulang 1x per event perubahan konektivitas.
// - Gunakan exponential backoff dan simpan `next_retry_at`.
// - HTTP 5xx/network error harus tetap di active queue (tidak dibuang).
// - Validation error (HTTP 400) masuk karantina/needs-review untuk diulas, bukan dihapus.
// - Saat reload/refresh, data server digabungkan dengan queue lokal (active & quarantine) 
//   berdasarkan offline_id agar data transaksi lokal tetap tampil dan tidak hilang/double-count.
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