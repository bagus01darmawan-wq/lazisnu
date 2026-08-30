/**
 * Konfigurasi aplikasi — SATU SUMBER KEBENARAN untuk nomor versi di layar.
 *
 * Di-mirror oleh `versionName` literal di android/app/build.gradle
 * (keharusan EAS appVersionSource: remote). Tes penjaga
 * __tests__/config/appVersionSync.test.ts memaksa keduanya selalu sama.
 *
 * Untuk menaikkan versi: edit konstanta di bawah DAN `versionName` di
 * android/app/build.gradle, lalu jalankan tes.
 *
 * PERINGATAN (bug 2026-08-25): JANGAN membuat file `appConfig.json` di
 * folder ini. Metro (bundle release) memprioritaskan .json di atas .ts
 * untuk import tanpa ekstensi, sehingga `import {APP_VERSION} from
 * '../config/appConfig'` akan mengambil objek JSON (yang tidak punya
 * APP_VERSION) dan label versi tampil kosong di aplikasi — padahal
 * semua tes Jest hijau (Jest memprioritaskan .ts).
 */
export const APP_VERSION: string = '1.1.7';
