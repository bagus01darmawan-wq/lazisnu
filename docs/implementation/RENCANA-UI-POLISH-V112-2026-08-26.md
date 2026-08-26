# Rencana Implementasi — Polish UI v1.1.2 (Tugas / Scan / Profil)

**Tanggal:** 2026-08-26 · **Status:** RENCANA — menunggu persetujuan PO · **Disusun oleh:** ox-alpha

> Empat area sentuhan akhir sebelum rilis v1.1.2. Semua **mobile-only**,
> tanpa perubahan backend. Keputusan sudah dikonfirmasi PO pada 2026-08-26.

## 1. Keputusan PO (hasil konfirmasi)

| # | Permintaan | Keputusan |
|---|---|---|
| A | Halaman Tugas: hapus logo atas, susunan seperti Riwayat | Logo dihapus; ikon status sinkronisasi **dibiarkan apa adanya** (tidak disentuh) |
| B | Ukuran font judul diselaraskan semua halaman mengikuti Beranda | `heading1` + `fontSize 23 / lineHeight 29` untuk Tugas, Riwayat, Profil |
| C | Fallback alamat dukuh·RT | **DITOLAK** — biarkan tampil "Alamat belum tersedia"; admin melengkapi master data kaleng via web (data production: hanya 3/79 kaleng beralamat terisi; RT 79/79, dukuh 15/79) |
| D | Tombol "Tidak Dijemput" pindah ke detail kaleng (gantikan "Scan Ulang") | Ya; jalur rescan = tombol kembali (sudah ada) **+ aktifkan tab Scan** agar bisa reset ke kamera dari Detail Kaleng |
| E | Profil: gerbang aman Selesai Periode + Keluar Akun | Gaya **(a)** baris "Opsi Lanjutan ▾" yang membuka kedua aksi |

## 2. Perubahan Detail

### 2.A Halaman Tugas (`screens/TasksScreen.tsx`)
- Hapus `logoContainer` + `Image` logo (import asset ikut dibersihkan).
- Baris topRow tetap: kiri kosong (tanpa logo), kanan ikon sinkronisasi — **tidak diubah**.
- Gradien hero, judul, sub judul, `TaskSearchBar`, `SegmentedControl` urutan tidak berubah.

### 2.B Keselarasan font judul (4 layar)
| Layar | Sekarang | Menjadi |
|---|---|---|
| Beranda (greeting) | heading1 · 23/29 | acuan — tidak diubah |
| Tugas | heading1 · 23/29 | ✓ sudah sama |
| Riwayat | heading1 (24) | + `fontSize: 23, lineHeight: 29` |
| Profil (headerLabel) | heading2 ❌ | `heading1` + `fontSize: 23, lineHeight: 29` |

### 2.C Kartu tugas (`screens/tasks/TaskItem.tsx`)
- Hapus blok tombol "Tidak Dijemput" (+ styles skipButton/skipText) → kartu lebih tipis.
- Teks alamat tetap: `owner_address || 'Alamat belum tersedia'` (keputusan C).
- Props `onSkip` dihapus dari interface; pemanggilan di TasksScreen ikut dibersihkan
  (fungsi `handleSkipPress`/`skipAssignment` di layar tetap ada — dipakai ulang Scan).

### 2.D Detail Kaleng (`screens/scan/ScanResultCard.tsx` + `ScanScreen.tsx`)
- `ScanResultCard`: tombol "Scan Ulang" diganti "Tidak Dijemput"
  (`variant outline`, warna warning, icon `cancel`) → prop baru `onSkip`.
- Prop `onReset` dihapus dari komponen.
- `ScanScreen`:
  - `handleSkip`: Alert konfirmasi ("Tandai kaleng ini sebagai tidak dijemput?")
    → `skipAssignment(task.id)` dari `useTasksStore` → sukses: reset state scan +
    `navigation.navigate('Tasks')` (kembali ke Daftar Tugas).
  - **Aktifkan jalur tab Scan**: listener `tabPress` pada ScanScreen — bila sedang
    menampilkan Detail Kaleng (`scannedData` ada), tekan tab Scan me-reset ke kamera
    (`e.preventDefault()` + `handleReset()`). Menutup keluhan "tombol scan tidak
    berfungsi saat di detail kaleng".
  - Tombol kembali header "Detail Kaleng" (handleReset) tetap — jalur batal salah scan.

### 2.E Halaman Profil (`screens/ProfileScreen.tsx`)
- State lokal `advancedVisible` (default false).
- Baris sendiri "Opsi Lanjutan" + chevron-down/up (TouchableOpacity, accessibilityLabel jelas).
- Saat terbuka: tampilkan kartu berisi **Selesai Periode** dan **Keluar dari Akun**
  dengan perilaku/konfirmasi existing (handleCompletePeriod, handleLogout) tidak berubah.
- Default tertutup = kedua aksi tak mungkin tertekan tak sengaja.

## 3. Yang TIDAK berubah
- Backend / endpoint apa pun.
- Logika skipAssignment, completePeriod, logout (hanya dipindah/dibungkus).
- Tampilan alamat (tetap "Alamat belum tersedia" sampai admin melengkapi data).
- Ikon status sinkronisasi di Tugas.

## 4. Verifikasi
1. `pnpm --filter lazisnu-collector-app typecheck` + lint + prettier + test hijau.
2. Manual checklist per layar (emulator): Tugas tanpa logo & urutan benar;
   kartu tipis tanpa tombol skip; scan → Detail Kaleng → Tidak Dijemput berfungsi
   + tab Scan reset kamera; Profil gerbang tertutap default; ukuran judul seragam
   (screenshot 4 layar berdampingan).
