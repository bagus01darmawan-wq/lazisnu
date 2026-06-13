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
STATUS     : 135 unit test PASS (10 suite), regression checklist 19/28 [x] + 9/28 sisa [ ] (4 perlu device, 4 perlu browser, 1 perlu integration mock), audit logger middleware + test selesai, POST CREATE audit fix selesai. Patch auth P0–P3 (refresh queue, initializeAuth, logout cleanup, surgical clearToken) + Sprint P4 (MMKV Encryption + Keychain) 6/6 fase SELESAI per 2026-06-12. Fix tsconfig (red squiggles di test file) SELESAI.
FOKUS      : Sisa test case yang butuh device Android (TC-MOB-01/03/04) dan browser (TC-WEB-01/02/03/05), integrasi WhatsApp end-to-end (TC-WA-01). Manual device test P4 di Pixel 6 emulator (TBD). CodePush Gradle error (pre-existing, bukan P4).
```

Catatan untuk agent:
- Jangan menganggap semua modul sudah final hanya karena ada checklist lama yang selesai.
- Verifikasi kondisi aktual codebase sebelum menyimpulkan fitur sudah lengkap.
- Untuk task kecil, jangan memaksa workflow besar. Untuk task lintas modul atau berisiko, ikuti `00-workflow-guarantee.md`.
- Developer adalah pemula yang sedang belajar dari project ini. Sertakan penjelasan singkat dan latihan kecil setelah perubahan penting.

## Sprint SELESAI: P4 — Mobile Secure Token Storage (MMKV Encryption + Keychain)

**Asal:** Temuan dari review [auth-verdict #1 & #5] (kategori: Auth & Keamanan Token Mobile). Severity: Medium. Review selesai 2026-06-12; sprint dibuka setelah patch P0–P3 masuk.

### 🎯 Tujuan

Mengenkripsi payload MMKV di `apps/mobile` (instance default untuk token + instance `@lazisnu/offline-queue`) dengan kunci simetris yang disimpan di Android Keystore via `react-native-keychain`. Tujuannya: menurunkan risiko leakage pada perangkat rooted / forensic access / backup tidak aman. **Bukan** untuk mitigasi remote exploit (tidak ada bedanya dengan HTTPS).

### 🧩 Dependency Baru (Android-only)

| Library | Versi Aman | Alasan |
|---|---|---|
| `react-native-keychain` | `^8.2.0` | v8 stabil untuk RN 0.74 (old arch). **JANGAN v9.x** — butuh new architecture (RN 0.76+). minSdk 23+ (cocok dengan project). |
| (tetap) `react-native-mmkv` | `^2.12.2` | Sudah support `encryptionKey` saat konstruktor. Tidak ada upgrade. |
| (tetap) `@sentry/react-native` | `^5.20.0` | Akan di-uncomment di `index.js` untuk monitoring error auth. |

> ⚠️ Inkonsistensi terdeteksi: rule `06-pedoman-mobile.md` menyatakan `Min SDK: Android 8.0 (API 26)`, tetapi `apps/mobile/android/build.gradle` saat ini `minSdkVersion = 23`. Sebelum sprint ini dimulai, **klarifikasi** dengan user apakah minSdk akan dinaikkan ke 26. `react-native-keychain` 8.x mendukung API 23+ jadi tidak blocker, namun `Keystore` semantics berbeda di bawah 23.

### ⚠️ Risiko & Mitigasi

| Risiko | Severity | Mitigasi |
|---|---|---|
| **MMKV butuh init synchronous**, tapi `Keychain.get` async → race saat cold start | High | Pakai **lazy proxy**: `getToken()` await key siap dulu; tampilkan Splash sampai ready. Atau generate + simpan key saat install pertama kali (proactive bootstrap di `App.tsx`). |
| **User uninstall/reinstall** → key hilang → token tidak bisa di-decrypt | Medium | Anggap sebagai "wipe" — paksa logout. Tambah fallback di `initializeAuth`: jika decrypt gagal → `clearToken()` + reset state. |
| **Key hilang di Keychain** (factory reset sebagian) | Medium | Sama seperti di atas: trigger force logout. |
| **Boot time regression** (+~100–300ms untuk key retrieval) | Low | Tampilkan Splash dengan branding (sudah ada di P1 patch). Ukur dengan `performance.now()` di dev. |
| **Test mock complexity** — Keychain native module harus di-mock di Jest | Medium | Setup `jest.setup.js` mock: `react-native-keychain` → return dummy key string. |
| **Encrypted MMKV tidak bisa diinspeksi via ADB** untuk debugging | Low | Tambah dev-only flag `__DEV__ && MMKV_DEBUG=plain` yang skip encryption (tidak boleh masuk release). |
| **iOS** out of scope (project rule) — Keychain 8.x support iOS otomatis, tapi kita tidak test | Low | Disable Keychain import di iOS via `Platform.OS` check atau `.npmrc` platform restriction. |
| **Multiple MMKV instance** harus pakai key yang sama (atau kunci terpisah) | Medium | Gunakan **satu key** untuk semua instance MMKV (sesuai best practice MMKV — beda instance dengan kunci beda akan menambah kompleksitas). |

### 📐 Arsitektur Usulan

```
┌──────────────────────────────────────────────────────────┐
│  App.tsx (boot)                                          │
│  └─ useSecureStorage()  ← tunggu Keychain siap           │
│      └─ encryptionKey = base64(16 bytes random)         │
│         (generate on first run, reuse on next runs)     │
│                                                          │
│  services/api.ts                                         │
│  └─ storage = new MMKV({ encryptionKey })               │
│  └─ services/offline/mmkv.ts                             │
│     └─ offlineStorage = new MMKV({                       │
│          id: '@lazisnu/offline-queue',                   │
│          encryptionKey: SAME KEY,                        │
│        })                                                │
│                                                          │
│  services/secureKey.ts  (file baru)                      │
│  └─ getOrCreateEncryptionKey()                          │
│  └─ clearEncryptionKey()  ← dipanggil saat forceLogout   │
└──────────────────────────────────────────────────────────┘
```

### 🪜 Langkah Kerja (6 tahap)

1. **P4.1 — Setup dependency** (~30 menit) ✅ SELESAI 2026-06-12
   - `pnpm --filter lazisnu-collector-app add react-native-keychain@^8.2.0` — terinstall di package.json baris 35
   - Autolinking terdeteksi: `react-native config` confirm `sourceDir: node_modules/react-native-keychain/android`, package `com.oblador.keychain.KeychainPackage`
   - `pnpm typecheck` lulus
   - Library compatible: `peerDependencies.react-native = ^0.69.0` (project: 0.74.1 ✓), `minSdk fallback 21` (project: 23 ✓)
   - Manifest permission auto-merge: `USE_BIOMETRIC` & `USE_FINGERPRINT` (silent — tidak trigger UI untuk non-biometric usage)
   - `allowBackup="false"` di app manifest — bonus: Keychain tidak ikut ADB backup
   - **Catatan terpisah (bukan blocker P4):** `react-native-code-push@^9.0.1` punya pre-existing Gradle error (`Could not find method android()`) saat gradle sync. **✅ FIXED 2026-06-12.** Detail:
     - **Root Cause:** `android/build.gradle` adalah top-level project build file (punya `buildscript`, `allprojects { android {} }`), bukan library module. RN 0.74 autolinking menyertakan direktori ini sebagai module → `allprojects { android {} }` dipanggil di project tanpa Android plugin → error. Masalah kedua: Java source di `app/src/main/java/` bukan `src/main/java/` (standar autolinker).
     - **Fix:** (1) Ganti `android/build.gradle` dengan library module build.gradle + `sourceSets` mengarah ke `app/src/`. (2) Tambah `sourceDir: "app"` di `react-native.config.js`. (3) Install `patch-package` + buat patch + `postinstall` script. Verified: Gradle `BUILD SUCCESSFUL`.

2. **P4.2 — Buat helper `secureKey.ts`** (~45 menit) ✅ SELESAI 2026-06-12
   - File baru: [secureKey.ts](file:///home/bagus01darmawan/lazisnu/apps/mobile/src/services/secureKey.ts)
   - Install polyfill: `react-native-get-random-values@^2.0.0` (untuk `crypto.getRandomValues` di RN)
   - API surface: `getOrCreateEncryptionKey()`, `generateEphemeralKey()`, `clearEncryptionKey()`, `getCachedEncryptionKey()`
   - Return type `GetKeyResult` (discriminated union) — caller eksplisit handle ok/!ok, tidak ada silent failure
   - In-memory cache + Keychain persistent — query Keychain hanya 1x per boot
   - `Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK` (background task aman) + `STORAGE_TYPE.AES` (Android Keystore)
   - `pnpm typecheck` & `pnpm lint` lulus

3. **P4.3 — Refactor MMKV ke encrypted** (~45 menit) ✅ SELESAI 2026-06-12
   - File baru: [secureStorage.ts](file:///home/bagus01darmawan/lazisnu/apps/mobile/src/services/secureStorage.ts) (orchestrator)
   - Pakai `MMKV.recrypt(key)` API untuk atomic re-encrypt existing data — tidak ada data loss
   - 3 fallback path sesuai Design Decision:
     - `none` — Keychain OK, semua encrypted
     - `ephemeral_default` — Keychain gagal, default pakai ephemeral + offline-queue di-wipe
     - `wiped` — bahkan ephemeral gagal, wipe total
   - **Temuan kritis saat eksekusi:** MMKV constructor limit `encryptionKey ≤ 16 chars` (lihat MmkvHostObject.cpp:34). Base64 16 bytes = 24 chars → throw. **Fix:** turunkan `KEY_LENGTH_BYTES` dari 16 ke 12 (base64 = 16 chars, pas di limit). 12 bytes = 96-bit entropy, masih cukup kuat untuk at-rest.
   - `initEncryptedStorage()` idempotent — aman dipanggil berulang
   - `teardownEncryptedStorage()` untuk logout path
   - `pnpm typecheck` & `pnpm lint` lulus

### 🧭 Design Decision — Strategi Fallback saat Key Gagal (Diisi 2026-06-12 oleh user)

**Keputusan:** Opsi **B (Fallback ke plain MMKV)**, dengan **pemisahan tegas** antara dua instance MMKV.

**Justifikasi konteks (Lazisnu):**
- Petugas lapangan sering pakai device bersama / device lama dengan kondisi Keychain tidak stabil.
- Sinyal putus-nyambung → `getOrCreateEncryptionKey()` bisa gagal saat offline.
- Memilih "fail-fast" (opsi A) berarti petugas tidak bisa kerja sama sekali di device yang Keychain-nya bermasalah — unacceptable untuk operasional donasi harian.

**Implementasi yang Diterima:**

| Instance MMKV | Data | Fallback jika key gagal | Alasan |
|---|---|---|---|
| Default (`services/api.ts`) | `access_token`, `refresh_token` | **Boleh plain** + Sentry tag `auth.encryption_key_missing` + UI banner kuning "Mode tidak aman" | Token JWT short-lived, server-side bisa revoke. Damage = sesi dipercepat expire, bukan data bocor. |
| `@lazisnu/offline-queue` (`services/offline/mmkv.ts`) | `collection_queue`, `collection_queue_failed`, `offline_tasks` | **TIDAK BOLEH plain** — auto-wipe + force re-login | Berisi data finansial (nominal, identitas donatur) yang **immutable dan sensitif**. Lebih baik kosong daripada bocor ke shared device. |

**Aturan tambahan:**
- Fallback plain hanya untuk `__DEV__ === true` ATAU saat user secara eksplisit tap "Lanjut tanpa enkripsi" di dialog konfirmasi.
- Di production build, default behavior = wipe + logout (gagal tertutup).
- Setiap fallback harus menulis ke Sentry dengan tag `auth.fallback_to_plain` + `user.id` (untuk monitoring).

4. **P4.4 — Wire ke App.tsx + Splash** (~30 menit) ✅ SELESAI 2026-06-12
   - File diubah: [App.tsx](file:///home/bagus01darmawan/lazisnu/apps/mobile/App.tsx) — boot sequence 6 langkah
   - Urutan: `initEncryptedStorage()` → Sentry tag → `forceLogout(jika wiped)` → `initializeAuth()` → `setEncryptionWarning(jika ephemeral)` → `startNetworkListener()`
   - Splash dari P1 (`isInitializing=true`) otomatis cover init phase
   - Module-level `networkUnsubscribe` untuk cleanup pattern yang benar
   - Tambah `setEncryptionWarning` ke useAuthStore + state `encryptionWarning: string | null`
   - Sentry `setTag` dipanggil via dynamic `require` dengan try-catch — aman saat Sentry belum di-init
   - `pnpm typecheck` & `pnpm lint` lulus

5. **P4.5 — Sentry uncomment + custom tag** (~20 menit) ✅ SELESAI 2026-06-12
   - File baru: [sentry.ts](file:///home/bagus01darmawan/lazisnu/apps/mobile/src/config/sentry.ts) — centralized config
   - [index.js](file:///home/bagus01darmawan/lazisnu/apps/mobile/index.js) — uncomment, pakai helper `initSentry()`
   - [App.tsx](file:///home/bagus01darmawan/lazisnu/apps/mobile/App.tsx) — pakai `setAuthTag()` helper (hapus inline `require` + try-catch)
   - [api.ts](file:///home/bagus01darmawan/lazisnu/apps/mobile/src/services/api.ts) — `notifySessionExpired()` sekarang juga `captureAuthEvent('session_expired', {source: 'refresh_failed'})`
   - [useAuthStore.ts](file:///home/bagus01darmawan/lazisnu/apps/mobile/src/stores/useAuthStore.ts) — `forceLogout` sekarang tag `auth.force_logout=true` + clear user context
   - DSN placeholder (`https://PLACEHOLDER_KEY@sentry.io/0000000`) — `__DEV__` = no-op, production = real (replace sebelum release)
   - `beforeSend` strip PII: email, ip_address, username, plus auto-filter `phone/address/nominal` di breadcrumb data
   - `pnpm typecheck` & `pnpm lint` lulus

6. **P4.6 — Testing** (~1 jam) ✅ SELESAI 2026-06-12
   - **18/18 test PASS**, 2 suite: `secureKey.test.ts` (10) + `encryptedStorage.test.ts` (8)
   - Infrastruktur test baru:
     - [jest.config.js](file:///home/bagus01darmawan/lazisnu/apps/mobile/jest.config.js) — preset RN + moduleNameMapper untuk Flow syntax module
     - [jest.setup.js](file:///home/bagus01darmawan/lazisnu/apps/mobile/jest.setup.js) — mock `global.crypto.getRandomValues()`
     - [__tests__/types.d.ts](file:///home/bagus01darmawan/lazisnu/apps/mobile/__tests__/types.d.ts) — ambient declarations untuk test helpers (pakai `import type` sebelum `declare module` = AUGMENT bukan REPLACE)
     - `__mocks__/react-native-mmkv.ts` — Map-backed fake dengan `__setStorage`/`__getStorage`/`__getCurrentKey`/`__resetMock`
     - `__mocks__/react-native-keychain.ts` — controllable mock dengan `__setMockValue`/`__setMockError`/`__getCalls`
     - `__mocks__/error-guard-mock.js` — bypass Flow type syntax di `@react-native/js-polyfills/error-guard`
     - `__mocks__/react-native-get-random-values.ts` — no-op polyfill mock
     - `__mocks__/sentry-mock.ts` — stub semua method Sentry
   - **Bug ditemukan & fixed saat testing:**
     - PNPM symlink break `transformIgnorePatterns` untuk `error-guard.js` → `moduleNameMapper`
     - `react-native-get-random-values` Flow conflict → mock kosong + `crypto` di `jest.setup.js`
     - `__resetCacheForTest()` tidak dipanggil di `encryptedStorage.test.ts` → cross-test cache leak → tambah import
     - `@types/jest@30` incompatible → downgrade ke `@types/jest@^29.5.12`
   - **Fix red squiggles VSCode (2026-06-12):**
     - Root cause: `tsconfig.json` tidak include `__tests__/` & `__mocks__/`, VSCode TypeScript server tidak bisa resolve Jest globals
     - `__tests__/types.d.ts`: `declare module` tanpa `import` dulu = REPLACE type asli → type error di `api.ts`. Fix: tambah `import type * as _Mkp from 'react-native-mmkv'` sebelum `declare module`
     - `__mocks__/react-native-keychain.ts:77`: `value: false` (boolean) tapi type `{ service, username, password } | null` → fix ke `null`
     - `__mocks__/react-native-mmkv.ts:83-85`: `module.exports` (CJS) tidak dikenali TS tanpa `@types/node` → konversi ke `export const`
     - Final: `pnpm typecheck` exit 0, `pnpm test` 18/18 PASS, 0 diagnostic di VSCode
   - `pnpm typecheck` & `pnpm lint` 0 error 0 warning

### 🚦 Strategi Rollout

| Tahap | Target | Kriteria Sukses |
|---|---|---|
| **Canary** | 1 device internal (developer) | 1 minggu tanpa crash, decrypt OK, key persistent |
| **Staged** | 5 petugas (via Firebase Internal Testing) | Tidak ada laporan "token rusak" / logout mendadak |
| **Full rollout** | Semua user | Wipe-on-upgrade sudah ter-handle (existing user logout 1x lalu login ulang) |

> Catatan: existing user di device akan kehilangan sesi setelah update — ini **expected**. Tambahkan release note.

### 🧠 Learning Checkpoint

| Konsep | Penjelasan |
|---|---|
| **Two-tier key storage** | Data encryption key disimpan di OS-level secure storage (Android Keystore), bukan di app sandbox. Compromised app ≠ compromised key. |
| **Encryption ≠ Authentication** | MMKV encryption hanya confidentiality. Integritas & auth-token masih tergantung HTTPS + server signature. |
| **Symmetric vs Asymmetric** | MMKV pakai AES (symmetric). Token JWT pakai RSA/ECDSA (asymmetric). Berbeda konteks. |
| **Wipe-on-fail** | Saat decrypt gagal (key corrupt / missing), defaultnya BUKAN retry — defaultnya wipe + re-login. Lebih aman daripada render data ambigu. |

### 📎 File Terdampak (Sprint)

- `apps/mobile/package.json` (tambah keychain)
- `apps/mobile/src/services/secureKey.ts` **(baru)**
- `apps/mobile/src/services/api.ts` (encrypted MMKV)
- `apps/mobile/src/services/offline/mmkv.ts` (encrypted MMKV)
- `apps/mobile/App.tsx` (init sequence)
- `apps/mobile/index.js` (uncomment Sentry)
- `apps/mobile/jest.setup.js` **(baru/extend)** — mock keychain
- `apps/mobile/__tests__/secureKey.test.ts` **(baru)**
- `apps/mobile/__tests__/encryptedStorage.test.ts` **(baru)**
- `.agents/rules/10-sprint-aktif.md` (update setelah sprint selesai)

---

## Progress Terbaru — Sprint 2026-05-21
### ✅ Selesai — Regression Checklist Check & New Unit Tests

| Task | Status | Bukti Verifikasi |
|---|---|---|
| Validasi shared-types contract | ✅ Selesai | `npx ts-node scripts/validate-shared-types.ts` dijalankan, diff report dianalisis (false positives dari regex, not real issues) |
| Update checklist: TC-AUTH-05, TC-AUTH-06, TC-DB-01..05 | ✅ Selesai | Semua `[ ]` → `[x]` di `regression-checklist.md`, total 14 item |
| TC-AUDIT-01: Fix POST CREATE audit | ✅ Selesai | 8 handler POST CREATE (cans, bulk cans, officers, branches, dukuhs, assignments, bulk assignments) kini set `request.auditContext = { newData }` |
| Unit test: `audit-logger.test.ts` | ✅ Selesai | 20 test case PASS |
| Unit test: `scan-qr.test.ts` (TC-QR-01/02) | ✅ Selesai | 13 test case PASS — verifikasi data pemilik bocor/tidak |
| Unit test: `sync-errors.test.ts` (TC-MOB-06) | ✅ Selesai | 16 test case PASS — validation error `can_retry=false`, server error `can_retry=true` |
| Unit test: `whatsapp-queue.test.ts` (TC-WA-02/03) | ✅ Selesai | 13 test case PASS — exponential backoff 3 attempts, DLQ config |
| Assigned TC-MOB-02 checklist | ✅ Selesai | `qr.test.ts` (6) + `scan-qr.test.ts` (8) = QR invalid + bukan penugasan |
| Assigned TC-WEB-04 checklist | ✅ Selesai | `assignmentGenerator.test.ts` sudah ada (10 test PASS) — Round-Robin verified |
| **Total unit test** | **117 PASS** | **8 suite, 100% PASS** |

### ⬜ Pending — Perlu Device / Browser / Integration

| Item | Alasan |
|---|---|
| TC-MOB-01 (mobile buka offline) | Perlu device Android + MMKV |
| TC-MOB-03 (simpan ke queue offline) | Perlu mode pesawat + MMKV |
| TC-MOB-04 (auto-sync saat online) | Perlu network toggle |
| TC-WEB-01 (CRUD Master) | Perlu supertest / browser test |
| TC-WEB-02 (date picker) | Perlu browser |
| TC-WEB-03 (UI konsistensi) | Perlu browser |
| TC-WEB-05 (pagination state) | Perlu browser |
| TC-WA-01 (WA worker kirim) | Perlu mock WA API + integration test |

---

## Progress Terakhir (Updated: 2026-05-19)

### ✅ Selesai — Tech Debt Refactor Backend

| Task | Status | Bukti Verifikasi |
|---|---|---|
| Password hash petugas baru | ✅ Selesai | `hashPassword` ada di `auth.ts` dan `officers.ts` |
| Ekstrak `latestCollectionCondition` | ✅ Selesai | Fungsi ditemukan di `reportService.ts` dan dipakai di beberapa route |
| Hapus Nodemailer | ✅ Selesai | Tidak ada referensi di `src/` (hanya di `node_modules/.ignored`) |
| Standarisasi response API | ✅ Selesai | `sendSuccess`/`sendError`/`sendInternalError` di `utils/response.ts` |
| Error category di response (backend) | ✅ Selesai | Error pakai `code` string standar (`INTERNAL_ERROR`, dll.) di `sendError` |
| Tampilkan error type di mobile | ✅ Selesai | `permanentFailedCount` dari `useSyncStore()` ditampilkan sebagai banner merah di `DashboardScreen.tsx` (baris 54–68), lengkap dengan navigasi ke History |
| Ganti `tx: any` (type safety transaction) | ✅ Selesai | Tidak ada `tx: any` di `src/` backend |
| Sinkronisasi scheduler route & worker | ✅ Selesai | `scheduler.ts` (route) dan `scheduler.worker.ts` (worker) sudah terpisah |
| Pisah `bendahara.ts` — route & service | ✅ Selesai | `bendahara.ts` = 118 baris (routing saja), logic ada di `reportService.ts` |

### ✅ Selesai — ESLint & TypeScript — Semua App (2026-05-19)

| App | Lint | TypeCheck | Catatan |
|---|---|---|---|
| **Web** | 0 error, 0 warning ✅ | 0 error ✅ | Fix 7 error + 8 warning; tambah `typecheck` script |
| **Mobile** | 0 error, 0 warning ✅ | 0 error ✅ | Auto-fix 14 warning; buat `tsconfig.json`; fix 12 type errors |
| **Backend** | — | 0 error ✅ | Tambah `typecheck` script |

### ✅ Selesai — Regression Testing Backend (2026-05-19)

| Prioritas | File | Tests | Status |
|---|---|---|---|
| P0 | [p0-regression.test.ts](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/__tests__/p0-regression.test.ts) | 19 | ✅ PASS |
| P1 | [p1-regression.test.ts](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/__tests__/p1-regression.test.ts) | 14 | ✅ PASS |
| Existing | auth, schemas, assignment generator, qr, serializer | 75 | ✅ PASS |
| **Total** | **9 suites** | **108** | **100% PASS** |

**P0 Covered:** TC-AUTH-06 (403 petugas), TC-AUTH-05 (role-scope), TC-DB-01 (INSERT + increment), TC-DB-02 (resubmit INSERT + sequence)  
**P1 Covered:** TC-DB-04 (latestCollectionCondition), TC-DB-05 (can delete guard), TC-MOB-05 (offline_id idempotency), TC-DB-03 (activity log)

### ✅ Selesai — Infrastruktur Development (2026-05-19)

| Task | Status | Bukti Verifikasi |
|---|---|---|
| Pre-commit hook 5 langkah (web lint + typecheck + backend typecheck + mobile lint + typecheck) | ✅ Selesai | `.git/hooks/pre-commit` — seluruh validasi lulus otomatis tiap `git commit` |
| Perbaiki deskripsi skill code-review | ✅ Selesai | Sinkronisasi frontmatter `description` dengan 8 review dimensions aktual |
| Perbaiki GlassDatePicker props (min/max) untuk web typecheck | ✅ Selesai | `GlassDatePickerProps` ditambah `min?: string; max?: string;` + logic disable di DayPicker |
| Regression checklist 28 test case | ✅ Selesai | 6 section, tambah TC-QR-01, TC-QR-02, TC-AUDIT-01 |
| Commit ke GitHub | ✅ Selesai | `git push origin main` — commit `ee8e764` |

---

## Prioritas Sprint Saat Ini

### P0 — Stabilitas dan Bugfix

- Pastikan project bisa dijalankan, dibuild, dan dilint untuk area yang sedang dikerjakan.
- Perbaiki error yang memblokir login, dashboard, submit collection, sync mobile, laporan, atau build.
- Jangan melakukan refactor besar tanpa alasan kuat dan tanpa rencana test.
- **Jadwal Migrasi Pagination:** Backend akan menambahkan `items` tanpa menghapus key lama (`collections`, `tasks`, dll). Jadwalkan update web/mobile secara bertahap untuk membaca `items`. Hapus key lama hanya setelah semua client termigrasi.

### P1 — Contract Consistency

- Pastikan `packages/shared-types` menjadi acuan kontrak lintas app.
- Pastikan perubahan backend response/request dicek dampaknya ke `apps/web` dan `apps/mobile`.
- Hindari duplikasi type yang bisa membuat web/mobile berbeda dari backend.

### P2 — Testing dan Deploy Readiness

- Buat test plan untuk flow kritis.
- Tambahkan regression checklist sebelum merge/deploy.
- Siapkan rollback plan untuk perubahan database, auth, API contract, dan deploy.

### P3 — Learning-Oriented Maintenance

- Setiap bantuan agent harus membantu user memahami minimal satu konsep baru.
- Prioritaskan task kecil yang bisa dikerjakan user sendiri dengan review AI.
- Gunakan skill `.agents/skills/` sesuai konteks: debug, code review, testing, architecture, tech debt, deploy checklist.

---

## Konteks Teknis Aktual yang Harus Diingat

```
Repo      : lazisnu
Monorepo  : PNPM workspace apps/* dan packages/*
Backend   : Fastify + TypeScript + Drizzle ORM + PostgreSQL + Redis/BullMQ + Zod
Web       : Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4
Mobile    : React Native Android-first + MMKV + offline-first
Shared    : packages/shared-types untuk kontrak data lintas app
```

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

## Riwayat Penting yang Masih Relevan

```
- Project sudah memakai monorepo PNPM.
- Database menggunakan nama domain Inggris seperti collections, cans, assignments, districts, branches.
- Rule visual dashboard memakai tema Earthy & Premium.
- Agent rules dan skills mulai difokuskan untuk mentor-mode agar developer pemula ikut berkembang.
```

Detail historis lama boleh dijadikan referensi, tetapi jangan dianggap sebagai kondisi final tanpa verifikasi codebase aktual.

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
*Last updated: 2026-06-12 (P4 sprint plan + Design Decision fallback key)