# Changelog - LAZISNU Collector Mobile App

Semua perubahan penting pada aplikasi mobile LAZISNU didokumentasikan di berkas ini.

Format berkas ini mengacu pada [Keep a Changelog](https://keepachangelog.com/id/1.0.0/)
dan proyek ini menganut prinsip [Semantic Versioning (SemVer 2.0.0)](https://semver.org/).

---

## [Unreleased]

### Added

- Integrasi CI mobile GitHub Actions: lint + typecheck otomatis dan alur uji coba perakitan APK Android debug di cloud.
- Konfigurasi Minify/R8 dan pemangkasan resource aset (`shrinkResources`) untuk rilis produksi yang lebih ramping.

---

## [1.0.0] - 2026-08-23

### Added

- **Otentikasi Ganda**: Login berbasis Kata Sandi dan Kode OTP WhatsApp dengan dukungan pembaruan tiket akses otomatis (_single-flight token refresh_).
- **Keamanan Biometrik**: Integrasi sensor sidik jari / Face ID dengan penyimpanan refresh token terenkripsi di _Android Keystore_.
- **Brankas Data Offline (MMKV)**: Penyimpanan antrean infaq terenkripsi MMKV (kunci acak kriptografis di Android Keystore) saat perangkat tidak memiliki koneksi internet.
- **Pemindai Kode QR Cepat**: Integrasi kamera Google ML Kit untuk identifikasi kaleng donatur secara otomatis.
- **Pencatatan & Riwayat Donasi**: Antarmuka ringkasan capaian petugas, filter riwayat transaksi, dan dialog koreksi nominal.
- **Sinkronisasi Cerdas**: Mekanisme auto-sync berkala, deteksi jaringan NetInfo, batas percobaan maksimal 3x (_retry limit_), dan karantina data gagal (_poison-pill quarantine_).
- **Pengujian Otomatis Menyeluruh**: 17 berkas uji coba dengan 136 pengujian unit yang mencakup seluruh alur kritis aplikasi.

### Changed

- **Pembersihan Arsitektur Tampilan**: Pemecahan berkas layar besar (`TasksScreen`, `HistoryScreen`, `ScanScreen`) dari >600 baris menjadi subkomponen ringan terisolasi (<300 baris).
- **Standardisasi Desain**: Penggunaan palet warna hijau NU yang harmonis dan terstandardisasi (`theme/colors.ts`).
- **Peningkatan Ambang Uji Kualitas**: Penetapan batas kelulusan minimal _code coverage_ ke 50%.

### Fixed

- Pencegahan duplikasi data saat sinkronisasi data offline ke server.
- Penanganan batas waktu tunggu jaringan (_timeout_) menggunakan `AbortController`.
- Pembersihan total sesi lokal (_clean logout_) saat masa berlaku akun berakhir.

### Security

- Perlindungan kunci enkripsi lokal menggunakan kunci acak kriptografis 96-bit (batas panjang kunci API react-native-mmkv) yang tersimpan aman di Android Keystore.
- Pemblokiran total penyimpanan kredensial terbuka (_plain text_) di memori perangkat.
