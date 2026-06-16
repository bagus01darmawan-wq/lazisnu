---
trigger: manual
---

# Rule: Sprint Aktif
# Scope: Semua agent — baca ini untuk memahami posisi pengembangan saat ini
# ⚠️ UPDATE file ini setiap kali berganti fase atau sprint

---

## Status Saat Ini

```
FASE AKTIF : Finalization & Learning-Assisted Completion
UPDATED    : 2026-06-13
STATUS     : Mobile Firebase Crashlytics setup SELESAI dan Android debug build PASS. P4 Mobile Secure Token Storage SELESAI. Pembersihan Warning Mobile (12 warning lint) SELESAI. Triage dependensi & mitigasi keamanan SELESAI. Pembersihan `react-native-permissions` SELESAI. Code review 6 tema + perbaikan Sprint A-E SELESAI. Regression checklist masih 19/28 [x] + 9/28 sisa [ ].
FOKUS      : Validasi device/browser/integration yang belum bisa dibuktikan unit test.
```

Catatan untuk agent:
- File ini adalah snapshot aktif. Bagian histori di bawah hanya konteks, bukan bukti final tanpa verifikasi ulang.
- Jangan menganggap semua modul final hanya karena checklist lama selesai.
- Untuk task kecil, jangan memaksa workflow besar. Untuk task lintas modul/berisiko, ikuti `00-workflow-guarantee.md`.
- Developer adalah pemula. Sertakan penjelasan singkat, risiko, cara test, dan latihan kecil setelah perubahan penting.

---

## Bukti Verifikasi Terakhir

### Mobile Android — Verified 2026-06-13

| Command | Hasil | Catatan |
|---|---:|---|
| `pnpm --filter lazisnu-collector-app typecheck` | ✅ PASS | TypeScript mobile lulus. |
| `pnpm --filter lazisnu-collector-app test` | ✅ PASS | 18/18 test, 2 suite: `secureKey` + `encryptedStorage`. |
| `pnpm --filter lazisnu-collector-app lint` | ✅ PASS | 0 error, 0 warning (Bersih total 2026-06-13). |
| `pnpm --filter lazisnu-collector-app build:debug` | ✅ PASS | `BUILD SUCCESSFUL in 14m 24s`, 471 task. |
| `rg "Sentry|@sentry|config/sentry" apps/mobile` | ✅ 0 match | Sentry mobile sudah dihapus dari source aktif. |
| `rg "@react-native-firebase|Crashlytics|google-services" apps/mobile` | ✅ match valid | Firebase/Crashlytics aktif di package, Gradle, index, helper config. |

### Backend/Web — Status Tercatat, Belum Diverifikasi Ulang di Audit Firebase

| Area | Status tercatat | Catatan skeptis |
|---|---:|---|
| Backend unit test | 135 PASS / 10 suite | Angka dari sprint sebelumnya; tidak direrun saat setup Firebase. |
| Mobile unit test | 18 PASS / 2 suite | Sudah direrun 2026-06-13. |
| Regression checklist | 19/28 selesai | 9 item sisa masih perlu device/browser/integration. |
| Web manual/browser checks | Pending | Belum dibuktikan oleh audit Firebase. |

---

## Sprint Aktif — Pekerjaan Tersisa

### P0 — Bukti Manual / Integration yang Belum Selesai

| Item | Status | Kenapa belum selesai |
|---|---|---|
| TC-MOB-01 mobile buka offline | ⬜ Pending | Perlu device/emulator Android + simulasi offline. |
| TC-MOB-03 simpan queue offline | ⬜ Pending | Perlu mode pesawat + MMKV device runtime. |
| TC-MOB-04 auto-sync saat online | ⬜ Pending | Perlu network toggle dan observasi sync end-to-end. |
| TC-WEB-01 CRUD Master | ⬜ Pending | Perlu browser/E2E atau minimal supertest tambahan. |
| TC-WEB-02 date picker | ⬜ Pending | Perlu browser. |
| TC-WEB-03 UI konsistensi | ⬜ Pending | Perlu browser visual check. |
| TC-WEB-05 pagination state | ⬜ Pending | Perlu browser. |
| TC-WA-01 WA worker kirim | ⬜ Pending | Perlu integration mock/WA API sandbox. |

> Catatan data: status regression masih 19/28 karena daftar lama mencatat 9 pending, tetapi tabel pending eksplisit yang masih relevan berisi 8 item. Agent berikutnya perlu membuka `regression-checklist.md` dan menyelaraskan hitungan final sebelum mengklaim 20/28 atau 19/28.

### P1 — Cleanup Warning Mobile [SELESAI]

`pnpm --filter lazisnu-collector-app lint` pada 2026-06-13 telah bersih sepenuhnya dengan 0 error dan 0 warning. Perbaikan mencakup:
- Menghapus directive `eslint-disable` redundan pada `__tests__/types.d.ts`.
- Menghapus import unused `HistoryScreen` dan komponen `PlaceholderScreen` pada `AppNavigator.tsx`, serta memindahkan `screenOptions` ke luar lingkup komponen untuk mencegah bug remount/unmount.
- Menambahkan dependensi yang hilang pada `useEffect` di `DashboardScreen.tsx` dan `LoginScreen.tsx` guna menghindari stale closures.
- Membungkus callback `handleVerify` di `OTPScreen.tsx` dengan `useCallback` dan memindahkannya sebelum `useEffect` untuk menghindari error TDZ.
- Menghapus import unused `Officer` pada `useOfficerStore.ts`.

### P1 — Dependency dan Security Audit [MITIGATED]

Mitigasi kerentanan keamanan monorepo berhasil diterapkan pada 2026-06-13 menggunakan `pnpm.overrides` ter-scope, serta pembersihan pustaka tidak terpakai:

| Temuan | Status | Solusi | Catatan |
|---|---|---|---|
| `shell-quote` | ✅ Teratasi | Override ke `1.8.4` | Celah Critical teratasi. |
| `minimatch` via `@typescript-eslint/*` | ✅ Teratasi | Override scoped ke `9.0.7` | Celah High ReDoS teratasi tanpa memecah ESLint. |
| `joi` | ✅ Teratasi | Override ke `17.13.4` | Celah Moderate teratasi. |
| `@babel/plugin-transform-modules-systemjs` | ✅ Teratasi | Override ke `7.29.7` | Celah High teratasi. |
| `react-native-permissions` | ✅ Terhapus | Hapus dari `package.json` | Bersih dari dependency tree (autolinking build:debug PASS). |
| RN CLI / `fast-xml-parser` / `react-native` | ⚠️ Ditunda | Defer triage | Hanya resiko tingkat build-time/development; tidak diupgrade untuk menghindari breaking change native. |
| `react-native-get-random-values@2.0.0` | ℹ️ Dibiarkan | Pin/Retain | Tetap dipertahankan untuk crypto polyfill at-rest lokal; peer mismatch diabaikan demi kompatibilitas Hermes. |

### P2 — Warning Build Android yang Perlu Dicatat

`build:debug` PASS, tetapi warning berikut muncul saat build:

| Warning | Sumber | Dampak sementara |
|---|---|---|
| `Path for java installation '/usr/lib/jvm/openjdk-17' ... does not contain a java executable` | Environment Gradle/JDK | Non-blocking; build tetap pakai Java lain. Bersihkan JDK path agar CI tidak rapuh. |
| RNFirebase Legacy Architecture warning | `@react-native-firebase/*` | Non-blocking sekarang; RNFirebase memberi sinyal future modules akan butuh New Architecture. |
| D8 `Invalid stack map table` | `play-services-auth-21.5.0-runtime.jar` | Non-blocking; perlu monitor saat release/proguard. |
| `package="..." found in AndroidManifest.xml` ignored | Banyak native deps: Blur, Camera Kit, NetInfo, RNFirebase, Gesture Handler, Keychain, MMKV, Reanimated, Safe Area, Screens, Vector Icons | Non-blocking AGP 8 warning dari dependency lama. |
| Deprecated API warnings | NetInfo, RNFirebase Crashlytics, Camera Kit, Safe Area, Screens, Permissions, dll. | Non-blocking; sinyal dependency aging. |
| `Unable to strip ... libconceal.so` | Debug packaging | Non-blocking debug build; cek release build bila ukuran/symbol stripping penting. |
| Keychain typedef retention warnings | `react-native-keychain` | Non-blocking; library annotation warning. |

---

## Selesai Baru-Baru Ini

### ✅ Firebase Crashlytics Mobile Setup — Selesai 2026-06-13

| Area | Status | Bukti |
|---|---|---|
| Firebase client file | ✅ | `apps/mobile/android/app/google-services.json` sudah ada. |
| Dependency RNFirebase | ✅ | `@react-native-firebase/app@^24.1.1`, `@react-native-firebase/crashlytics@^24.1.1`. |
| Gradle plugin | ✅ | `com.google.gms.google-services:4.4.4`, `com.google.firebase:firebase-crashlytics-gradle:3.0.7`. |
| Runtime helper | ✅ | `apps/mobile/src/config/crashlytics.ts`. |
| Entry point | ✅ | `index.js` memanggil `initCrashlytics()`. |
| Auth observability | ✅ | `setAuthTag`, `captureAuthEvent`, `setAuthenticatedUser`, `clearAuthenticatedUser` dialihkan ke Crashlytics. |
| Sentry mobile cleanup | ✅ | `@sentry/react-native`, `src/config/sentry.ts`, dan mock Sentry dihapus. |
| Verification | ✅ | typecheck/test/lint/build:debug PASS. |

Catatan:
- Crashlytics collection dimatikan saat `__DEV__` lewat `setCrashlyticsCollectionEnabled(!__DEV__)`.
- Untuk muncul di Firebase Console, jalankan app di emulator/device dengan internet; untuk test crash development, aktifkan debug collection sementara dan jangan commit setting debug aktif untuk production.

### ✅ P4 — Mobile Secure Token Storage — Selesai 2026-06-12

Ringkasan final:
- `react-native-keychain@^8.2.0` dipakai untuk menyimpan key via Android Keystore.
- `react-native-mmkv` dipakai dengan `recrypt()` untuk auth token dan offline queue.
- `react-native-get-random-values` masih dibutuhkan sebagai crypto polyfill.
- 18/18 unit test mobile PASS untuk `secureKey` dan `encryptedStorage`.
- Observability P4 sekarang via Crashlytics, bukan Sentry.

Keputusan desain yang masih berlaku:
- Default auth token boleh memakai fallback terbatas saat key gagal, tetapi offline queue finansial tidak boleh plain.
- Jika storage finansial tidak aman, wipe + force re-login lebih aman daripada menyimpan data nominal/donatur secara plain.

### ✅ Code Review 6 Tema + Sprint A-E — Selesai 2026-06-13

Status tercatat selesai, tetapi detail patch per tema tidak diulang di file aktif ini. Agent berikutnya wajib verifikasi source aktual sebelum membuat klaim baru.

### ✅ Regression / Tech Debt Lama — Arsip Ringkas

| Area | Status tercatat | Catatan |
|---|---|---|
| Backend audit logger + POST CREATE audit | ✅ Selesai | Unit test lama mencatat PASS. |
| Backend response/error standardization | ✅ Selesai | `sendSuccess`/`sendError`/`sendInternalError`. |
| Collection immutability / resubmit | ✅ Selesai di test lama | Tetap wajib dijaga. |
| Shared-types validation | ✅ Selesai di sprint lama | Wajib rerun bila API contract berubah. |
| Web lint/typecheck lama | ✅ Selesai di 2026-05-19 | Belum direrun pada audit Firebase. |

---

## Prioritas Sprint Saat Ini

### P0 — Stabilitas dan Bukti Runtime

- Pastikan flow login, dashboard, submit collection, offline queue, sync, laporan, dan build tetap berjalan setelah perubahan observability.
- Jalankan manual Android test untuk offline-first sebelum klaim release-ready.
- Jangan mengubah database/collection flow tanpa test yang menjaga immutability.

### P1 — Dependency Hygiene dan Security

- Triage 17 vulnerability dari `npm audit` mobile.
- Cari versi aman `react-native-get-random-values` yang kompatibel RN 0.74, atau dokumentasikan alasan pin saat ini.
- Validasi apakah `react-native-permissions` benar-benar unused sebelum remove.
- Jangan upgrade React Native major hanya untuk meredam audit tanpa sprint upgrade khusus.

### P2 — Contract Consistency

- Sebelum mengubah API/shared type, cek `packages/shared-types`, backend route, web usage, dan mobile usage.
- Jadwal migrasi pagination masih berlaku: backend boleh menambah `items` tanpa menghapus key lama (`collections`, `tasks`, dll). Hapus key lama hanya setelah semua client termigrasi.

### P3 — Learning-Oriented Maintenance

- Bantu developer memahami konsep, bukan hanya menerima patch.
- Untuk warning hook React, jelaskan risiko stale closure sebelum mengubah dependency array.
- Untuk audit dependency, bedakan runtime risk, dev-tooling risk, dan major-upgrade risk.

---

## Konteks Teknis Aktual

```
Repo      : lazisnu
Monorepo  : PNPM workspace apps/* dan packages/*
Backend   : Fastify + TypeScript + Drizzle ORM + PostgreSQL + Redis/BullMQ + Zod
Web       : Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4
Mobile    : React Native 0.74.1 Android-first + MMKV + Keychain + Firebase Crashlytics
Shared    : packages/shared-types untuk kontrak data lintas app
```

Catatan mismatch yang belum diputuskan:
- `.agents/rules/06-pedoman-mobile.md` menyatakan Min SDK Android 8/API 26.
- `apps/mobile/android/build.gradle` masih `minSdkVersion = 23`.
- `react-native-keychain` mendukung API 23+, tetapi keputusan produk harus diselaraskan sebelum release.

---

## Aturan Domain Paling Penting

### Collections Immutable

- `collections` adalah data finansial/audit.
- Jangan UPDATE/DELETE data transaksi untuk mengubah nominal, metode bayar, petugas, atau identitas transaksi.
- Koreksi dilakukan dengan re-submit: INSERT record baru + sequence bertambah + flag latest/versioning yang diizinkan.

### WhatsApp Async

- Notifikasi WhatsApp setelah submit collection harus diproses async melalui queue.
- Kegagalan WhatsApp tidak boleh membatalkan collection yang sudah valid tersimpan.

### Mobile Offline-first

- Mobile fokus Android.
- Gunakan MMKV/offline queue untuk data yang perlu bertahan saat sinyal buruk.
- Sync harus aman terhadap retry dan duplikasi.
- Data finansial offline tidak boleh turun ke plain storage.

---

## Checklist untuk Agent Sebelum Mengubah Kode

```txt
1. Apakah task ini kecil atau lintas modul?
2. File/folder mana yang terdampak?
3. Apakah shared-types perlu dicek?
4. Apakah API contract berubah?
5. Apakah mobile/web/backend ikut terdampak?
6. Apakah ada risiko database atau data finansial?
7. Command test/build/lint apa yang relevan?
8. Learning checkpoint apa yang akan diberikan ke user?
```

---

## Konteks Teknis UI

```css
/* Acuan Warna Utama Dashboard: */
/* Layout Header/Bg : #2C473E (Deep Green) */
/* Card & Sidebar   : #F4F1EA (Warm Beige) */
/* Title & Icon     : #EAD19B (Muted Sand) */
/* Brand Positive   : #1F8243 (Emerald) */
```

---

*Lazisnu Infaq Collection System — rules/10-sprint-aktif.md*
*⚠️ Update file ini setiap berganti sprint/fase*
*Last updated: 2026-06-13 (Firebase Crashlytics setup + sprint cleanup + build/audit findings)*
