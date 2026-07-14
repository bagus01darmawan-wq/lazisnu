# Session Handoff: Penyelesaian Tampilan Mobile

Tanggal: 6 Juli 2026  
Repository: `C:\Users\user\Documents\lazisnu`  
Scope aktif: menyelesaikan tampilan aplikasi mobile penjemputan donasi  
Status goal: BELUM SELESAI, lanjutkan pada sesi berikutnya

## 0. Status Goal Codex

Hasil pemeriksaan terakhir melalui status goal:

```text
Objective: menyelesaikan tampilan layar aplikasi.
Status: paused
Thread ID: 019f2af1-2656-7011-a211-0e8fc2898023
```

Goal belum boleh ditandai `complete` karena audit penerimaan belum mencakup seluruh state layar dan masih ada pekerjaan konkret pada Scan/Collection.

Untuk melanjutkan pada sesi baru:

1. Jalankan `/goal resume`.
2. Minta Codex membaca file ini sepenuhnya.
3. Minta Codex memeriksa worktree dan emulator sebelum mengedit.
4. Lanjutkan dari bagian `Pekerjaan Terakhir yang Dibatalkan`.

Perintah yang benar adalah `/goal resume`, bukan `/goal resmue`.
## 1. Instruksi Untuk Sesi Berikutnya

Mulai dengan membaca file ini dan memperlakukan worktree saat ini sebagai sumber kebenaran.

Jangan:

- mengimplementasikan fitur Bekal Petugas;
- menghapus atau me-reset perubahan worktree yang sudah ada;
- melakukan submit penjemputan nyata hanya untuk menguji tampilan;
- menulis password akun petugas ke repository;
- menganggap seluruh tampilan selesai hanya karena test otomatis lulus.

Lanjutkan dari alur:

```text
Scan
  -> Detail Kaleng
  -> Collection / Input Penjemputan
  -> validasi nominal
  -> state sukses
```

## 2. Keputusan Produk dan Desain

- Fokus proyek kembali pada aplikasi penjemputan donasi.
- Konsep Bekal Petugas ditunda dan sudah disimpan di `docs/PRD_BEKAL_PETUGAS.md`.
- Fitur Bekal Petugas tidak boleh diimplementasikan sampai aplikasi penjemputan stabil.
- Foto profil tetap kosong/generic jika petugas belum mengunggah foto.
- Badge notifikasi angka tidak ditampilkan jika tidak ada notifikasi.
- Ikon tugas tetap menggunakan ikon kubus/paket.
- Bahasa visual menggunakan Deep Green, Warm Beige, kartu terang, dan bottom navigation lima tab.
- Dashboard saat ini sudah disederhanakan menjadi header, status sinkronisasi, ringkasan, dan Tugas Berikutnya.

## 3. Layar yang Sudah Diaudit di Emulator

Perangkat:

- Android emulator `emulator-5554`
- resolusi runtime `1080 x 2400`
- package `com.lazisnucollectorapp`

Sudah diperiksa dengan data petugas nyata:

### Login

- Form tampil utuh.
- Status bar tidak menimpa konten.
- Login password berhasil.
- Akun PETUGAS yang valid menggunakan nomor `082134536151`.
- Password sengaja tidak ditulis dalam file ini. Minta kembali kepada pengguna jika sesi emulator hilang.

### Dashboard

- Greeting dan nama petugas tampil.
- Status sinkronisasi tampil.
- Ringkasan Hari Ini tampil.
- Tugas Berikutnya tampil.
- Bottom navigation tidak tertutup.
- Tidak ada overlay Firebase atau Metro setelah perbaikan.

### Tasks

- Header, filter Belum/Selesai/Semua, kartu tugas, QR, periode, dan bottom navigation tampil.
- Data aktif antara lain Ayam Kremes dan Apotik Ady Farma.
- Backend memang mengirim `owner_address` kosong untuk beberapa tugas.
- UI sudah direvisi menjadi `Alamat belum tersedia`.
- Periode teknis `2026-07` sudah direvisi menjadi `Juli 2026`.

### Scan

- Kamera, frame, petunjuk, Tempel Kode, Pilih Gambar QR, dan bottom navigation tampil.
- Manual QR berhasil digunakan.
- QR aktif yang dipakai saat audit: `LAZ-PNG-25-00009-533`.
- QR tersebut membuka detail Ayam Kremes.

### History

- Header, total riwayat, daftar transaksi, status, nominal, metode, QR, dan tombol Koreksi tampil.
- Tidak ditemukan overlay atau error runtime.

### Profile

- Nama Ahmad Bagus Hidayatullah, nomor telepon, peran, status Aktif, tombol logout, dan versi tampil.
- Avatar generic digunakan karena foto belum tersedia.
- Tidak ditemukan overlay atau error runtime.

## 4. Perubahan yang Sudah Diselesaikan

### Design system dan screen migration

Worktree sudah memuat migrasi visual untuk:

- Login;
- OTP;
- Dashboard;
- Tasks;
- Scan;
- Collection;
- History;
- Profile;
- bottom tab navigator;
- token theme dan reusable UI components.

Jangan mengulang migrasi dari nol.

### Crashlytics

File: `apps/mobile/src/config/crashlytics.ts`

- Helper sudah dimigrasikan dari API namespaced deprecated ke API modular.
- Overlay LogBox `setUserId` deprecated sudah hilang.

### Dependency random values

File: `apps/mobile/package.json`

- `react-native-get-random-values` dipin ke `1.11.0`.
- Versi `2.0.0` mensyaratkan React Native `>=0.81`, sedangkan proyek memakai React Native `0.74.1`.
- Versi tidak kompatibel sebelumnya menyebabkan native module `RNGetRandomValues` tidak ditemukan dan layar startup kosong.

### Build script

File: `apps/mobile/package.json`

- `build:debug` dan `build:android` sudah memakai `react-native build-android`.
- Perintah sekarang dapat dijalankan di Windows.

### Cold-start session

File terkait:

- `apps/mobile/src/services/api.ts`
- `apps/mobile/src/services/offline/mmkv.ts`
- `apps/mobile/src/services/offline/queue.ts`
- `apps/mobile/src/services/offline/tasks.ts`
- `apps/mobile/src/services/secureKey.ts`
- `apps/mobile/src/services/secureStorage.ts`
- `apps/mobile/__tests__/services/secureKey.test.ts`

Masalah lama:

- MMKV dibuka tanpa encryption key.
- Setelah itu baru dipanggil `recrypt(key)`.
- Pada cold start, file encrypted dibuka dalam mode salah, berubah/reset, dan token hilang.

Perbaikan:

- Auth MMKV dan offline MMKV dibuat secara lazy.
- Jika key sudah ada, instance langsung dibuat dengan `encryptionKey`.
- Jika key baru dibuat, data versi lama dimigrasikan sekali melalui `recrypt`.
- Queue dan token tidak lagi dibuka tanpa key pada cold start.

Bukti runtime:

- checksum file auth MMKV identik sebelum dan sesudah force-stop;
- setelah force-stop aplikasi langsung kembali ke Dashboard;
- tidak meminta login ulang;
- tidak ada overlay/error.

### Tasks

File: `apps/mobile/src/screens/TasksScreen.tsx`

- unused navigation import/variable sudah dihapus;
- alamat kosong memakai fallback `Alamat belum tersedia`;
- periode `YYYY-MM` diformat menjadi nama bulan Indonesia.

## 5. Quality Gate Terakhir

Semua lulus setelah perubahan storage dan Tasks:

```powershell
pnpm --filter lazisnu-collector-app lint
pnpm --filter lazisnu-collector-app typecheck
pnpm --filter lazisnu-collector-app test -- --runInBand
pnpm --filter lazisnu-collector-app build:debug
```

Hasil:

- lint: lulus;
- typecheck: lulus;
- test: 7 suite, 33 test lulus;
- build debug: `BUILD SUCCESSFUL`.

Peringatan `console.warn` pada test secure key berasal dari skenario keychain corrupt yang disengaja.

## 6. Pekerjaan Terakhir yang Dibatalkan

Perintah edit terakhir dibatalkan pengguna sebelum sempat menulis perubahan.

Rencana edit tersebut:

1. Pada `ScanScreen.tsx`, ganti:

```tsx
{scannedData.owner_address}
```

menjadi:

```tsx
{scannedData.owner_address || 'Alamat belum tersedia'}
```

2. Pada `CollectionScreen.tsx`, ganti:

```tsx
{task.owner_address}
```

menjadi:

```tsx
{task.owner_address || 'Alamat belum tersedia'}
```

3. Pada `CollectionScreen.tsx`, area nominal terlalu sempit karena `AppTextInput` berada dalam row tanpa wrapper yang memiliki `flex: 1`.

Struktur yang direncanakan:

```tsx
<View style={styles.nominalRow}>
  <Text style={styles.currencyPrefix}>Rp</Text>
  <View style={styles.nominalInputContainer}>
    <AppTextInput
      placeholder={'0'}
      value={formatCurrency(nominal)}
      onChangeText={text => setNominal(text.replace(/\D/g, ''))}
      keyboardType={'numeric'}
      returnKeyType={'done'}
      style={styles.nominalInput}
    />
  </View>
</View>
```

Tambahkan style:

```tsx
nominalInputContainer: {flex: 1},
```

Hasil pemeriksaan setelah pembatalan:

- fallback Scan BELUM diterapkan;
- fallback Collection BELUM diterapkan;
- `nominalInputContainer` BELUM diterapkan;
- tidak ada edit parsial dari perintah yang dibatalkan.

## 7. Kondisi Emulator Saat Handoff

Emulator sedang berada pada:

```text
Input Penjemputan
Donatur: Ayam Kremes
QR: LAZ-PNG-25-00009-533
Nominal uji: 10.000.001
Metode: Transfer
```

Nominal tersebut hanya dipakai untuk menguji batas maksimum.

Validasi yang sudah terbukti:

- tombol disabled saat nominal `0`;
- nominal diformat dengan pemisah ribuan;
- `10.000.001` memunculkan alert `Nominal Terlalu Besar`;
- pesan maksimum Rp10.000.000 tampil;
- pilihan Tunai/Transfer berubah state dengan benar;
- transaksi BELUM disimpan.

Jangan menekan Simpan dengan nominal valid kecuali pengguna mengizinkan transaksi uji.

## 8. Langkah Lanjutan yang Direkomendasikan

1. Terapkan tiga revisi pada bagian 6.
2. Jalankan lint dan typecheck.
3. Kembali ke Scan lalu buka Detail Kaleng untuk memastikan fallback alamat tampil.
4. Buka Collection dan pastikan area nominal melebar, tidak lagi hanya selebar teks.
5. Uji nominal panjang, keyboard, Tunai/Transfer, dan alert maksimum.
6. Jangan submit transaksi nyata.
7. Audit state success Collection melalui unit/component test atau mock navigation/data.
8. Audit modal Koreksi pada History:
   - layout keyboard;
   - nominal;
   - alasan minimal lima karakter;
   - tombol batal/kirim;
   - jangan benar-benar resubmit transaksi tanpa izin.
9. Audit loading, empty, error, offline, dan disabled state pada layar utama.
10. Setelah seluruh state visual selesai, buat laporan testing bertanggal.

## 8.1 Syarat Goal Boleh Ditandai Selesai

Jangan menandai goal `complete` sebelum seluruh bukti berikut tersedia:

- fallback alamat tampil pada Detail Kaleng;
- fallback alamat tampil pada kartu donor Collection;
- input nominal memiliki lebar yang benar dan nominal panjang tidak terpotong;
- keyboard tidak menutup input atau tombol Collection;
- validasi nominal kosong, nol, dan di atas batas telah diverifikasi;
- pilihan Tunai dan Transfer tampil serta berubah state dengan benar;
- state sukses Collection sudah diverifikasi tanpa membuat transaksi tak diizinkan;
- modal Koreksi History sudah diverifikasi untuk nominal, alasan, keyboard, batal, dan submit disabled;
- loading, empty, error, offline, dan disabled state layar utama sudah diaudit;
- cold start tetap membuka Dashboard dengan sesi valid;
- lint, typecheck, seluruh test, dan build debug lulus setelah revisi terakhir;
- laporan testing bertanggal sudah dibuat;
- tidak ada requirement eksplisit pengguna yang masih belum diperiksa.
## 9. Catatan Worktree

Worktree sangat kotor dan berisi banyak perubahan pengguna/sesi sebelumnya.

Aturan:

- jangan `git reset --hard`;
- jangan `git checkout --`;
- jangan menghapus file untracked;
- jangan merapikan perubahan Android `.gradle` tanpa persetujuan;
- batasi edit pada file yang memang diperlukan;
- selalu baca diff target sebelum dan sesudah perubahan.

## 10. File Referensi

- `docs/mobile-design-system/README.md`
- `docs/mobile-design-system/01-design-tokens.md`
- `docs/mobile-design-system/02-reusable-components.md`
- `docs/mobile-design-system/03-migrasi-auth-screens.md`
- `docs/mobile-design-system/04-migrasi-main-screens.md`
- `docs/mobile-design-system/05-testing-dan-acceptance.md`
- `docs/mobile-design-system/06-execution-checklist.md`
- `docs/PRD_BEKAL_PETUGAS.md`
- `apps/mobile/src/screens/CollectionScreen.tsx`
- `apps/mobile/src/screens/ScanScreen.tsx`
- `apps/mobile/src/screens/TasksScreen.tsx`
- `apps/mobile/src/services/secureStorage.ts`

