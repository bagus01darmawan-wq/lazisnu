# Rencana Implementasi: Fitur Update-In-App Tingkat 1 (Modal Versi + Download APK)

Tanggal: 2026-08-25
Status: DALAM PENGERJAAN
Target: Petugas mendapat pemberitahuan versi baru **di dalam aplikasi** (modal), mengunduh APK **di dalam modal** (progress bar), dan memasangnya tanpa keluar ke browser.

---

## 1. Latar Belakang & Keputusan

Update senyap (expo-updates/OTA) sudah dibatalkan (lihat `TUNDA-EXPO-UPDATES-2026-08-25.md`). Jalur distribusi: APK via WA grup. Fitur Tingkat 1 menggantikan peran "pemberitahuan manual di WA" dengan modal otomatis.

Keputusan user 2026-08-25:

| # | Keputusan | Pilihan |
|---|---|---|
| 1 | Hosting APK | **Cloudflare R2** (bucket publik, nama file berversi — TIDAK ditimpa; rollback dimungkinkan), fallback GitHub Releases |
| 2 | Endpoint versi | **Backend baru** `GET /v1/mobile/version` (publik) |
| 3 | Alur modal | Unduh + progress DI DALAM modal; tombol "Pasang" → layar sistem Android (tidak bisa diganti — gerbang keamanan OS); tombol "Nanti" (sekali per versi); `minimum_version_code` untuk paksa-update; tombol "Periksa Pembaruan" + label versi di Profil |
| 4 | Waktu | Satu sesi kerja; rilis v1.1.1 |

**Catatan bootstrap (penting, jujur):** modal ini BARU ada di aplikasi mulai v1.1.1. Petugas yang masih memegang v1.1.0 **tidak akan melihat modal apa pun** — v1.1.1 disebar via WA seperti biasa, dan mulai v1.1.2 (dan seterusnya) modal otomatis bekerja. Fitur Tingkat 1 mulai membantu mulai rilis kedua.

---

## 2. Kontrak API

`GET /v1/mobile/version` (publik, tanpa auth, di-ikat rate-limit global yang sudah ada):

```json
{
  "success": true,
  "data": {
    "version": "1.1.1",
    "version_code": 18,
    "apk_url": "https://apk.lazisnu.site/lazisnu-1.1.1.apk",
    "changelog": "- Label versi tampil di Profil\n- Modal pemberitahuan versi baru",
    "minimum_version_code": 0
  }
}
```

- Sumber data: `apps/backend/src/routes/mobile/mobileRelease.json` (di-commit tiap rilis; tsc menyalinnya ke dist otomatis — resolveJsonModule sudah aktif).
- Validasi zod saat boot (fail-fast bila JSON rusak).
- `minimum_version_code` = ambang paksa-update; `0` = tidak ada paksaan.

## 3. Perubahan Kode

### Fase A — Backend
- `packages/shared-types`: tambah `MobileVersionInfo` (snake_case, sesuai konvensi).
- `apps/backend/src/routes/mobile/version.ts` + `mobileRelease.json` (zod-validated).
- Registrasi di `app.ts` (prefix `/v1/mobile`, publik — di luar `mobileRoutes` yang ber-auth).
- Tes integrasi self-contained di `src/routes/__tests__/mobile-version.integration.test.ts` (Fastify minimal, tanpa DB).
- Verifikasi: lint/typecheck/test backend → deploy staging (main → otomatis) → curl.

### Fase B — Mobile
- Dependensi baru: `react-native-blob-util` (unduh + progress), `react-native-device-info` (membaca versionCode asli APK dari sistem — sumber kebenaran perbandingan, karena versionCode dikelola EAS remote dan tidak bisa di-hardcode di JS).
- `AndroidManifest.xml`: izin `REQUEST_INSTALL_PACKAGES` (pertama kali, Android minta izin pasang dari aplikasi ini — satu tap, lalu otomatis).
- Service `versionCheck`: fetch endpoint (timeout 5 detik) → bandingkan `version_code` dengan DeviceInfo.
- Service `apkDownload`: unduh ke folder aplikasi sendiri (tanpa izin penyimpanan), progress callback, `android.actionViewIntent` untuk buka layar pemasangan sistem.
- Modal `UpdateModal`: changelog + progress + "Pasang"/"Nanti"; "Nanti" menyimpan versi yang dilewati di MMKV (muncul lagi hanya untuk versi lebih baru); paksa-update (tanpa Nanti) bila `version_code` terpasang < `minimum_version_code`.
- Trigger: sekali per buka-aplikasi setelah login (senyap saat gagal/offline — prinsip offline-first terjaga).
- Profil: tombol "Periksa Pembaruan" + label versi (label sudah diperbaiki — `d040ca3`).
- Tes Jest: logika perbandingan versi, perilaku "Nanti"/paksa-update (MMKV mock), render modal (pola VisualStateAudit).

### Fase C — Rilis v1.1.1
1. Bump versi: `appConfig.ts` → `'1.1.1'` + `versionName` build.gradle → `"1.1.1"` (tes penjaga `appVersionSync` memaksa sinkron).
2. Setup R2: bucket publik + unggah APK (`lazisnu-1.1.1.apk`, nama berversi — menumpuk, tidak ditimpa). Subdomain `apk.lazisnu.site` bila DNS memungkinkan; fallback URL `*.r2.dev` publik.
3. Build EAS production → unduh → unggah R2 → perbarui `mobileRelease.json` (versionCode EAS aktual) → commit + `git tag v*` → deploy prod otomatis.
4. Smoke test 2 HP: (a) install v1.1.1 — Profil "Versi 1.1.1", tombol Periksa Pembaruan → "sudah terbaru"; (b) endpoint publik benar.

## 4. Runbook Rilis Permanen (mulai v1.1.2)

1. Bump versi di 2 tempat mobile (`appConfig.ts`, `versionName`) + tes penjaga.
2. Build EAS → catat versionCode hasil.
3. Unggah APK ke R2 dengan nama berversi.
4. Perbarui `mobileRelease.json` (version, versionCode, apkUrl, changelog, minimumVersionCode).
5. Commit + `git tag v*` → deploy prod otomatis (CI).
6. Kabari WA grup (pelengkap modal, bukan pengganti).

## 5. Batas & Risiko

- Modal tidak bisa menampilkan layar pemasangan Android sendiri (kebijakan OS) — hanya konfirmasi terakhir lewat sistem.
- Unduhan gagal (sinyal putus) → tombol coba-ulang di modal, tanpa meninggalkan aplikasi.
- Endpoint mati/offline → aplikasi diam total (tidak menghalangi penjemputan offline).
- versi lama tanpa fitur modal TIDAK mendapat pemberitahuan (bootstrap) — butuh disebar manual sekali lagi.
