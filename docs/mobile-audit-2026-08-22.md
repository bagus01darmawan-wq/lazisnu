# Audit Kode Mobile terhadap `docs/mobile-standards.md`

Tanggal: 2026-08-22 · Cakupan: `apps/mobile` (kode, konfigurasi tooling, CI, rilis)
Status: snapshot temuan — mendasari revisi v2 `docs/mobile-standards.md`.

## Ringkasan

Yang sudah kuat dan layak dijadikan pola standar: refresh token single-flight dengan antrian subscriber, MMKV terenkripsi dengan kunci di Android Keystore (wipe paksa untuk queue finansial), idempotency berlapis (`offline_id` client + `ALREADY_SYNCED` server + recovery ACK), retry backoff persisten dengan quarantine poison-pill, store bersih tanpa logika UI, tidak ada token di log production, tidak ada secret hardcoded.

Empat temuan bersifat **blocking** untuk rilis produksi (lihat tabel), selebihnya pelanggaran standar bertingkat sedang/rendah yang masuk roadmap bertahap.

## Temuan

### Blocking (B)

| # | Temuan | Lokasi | Dampak |
|---|---|---|---|
| B1 | Release build ditandatangani **debug keystore** (`signingConfig signingConfigs.debug`) | `android/app/build.gradle:99-102` | Tidak bisa rilis Play Store; kalau terlanjur terdistribusi, tidak bisa di-upgrade tanpa ganti signature |
| B2 | `versionCode` macet di 1, tidak ada `autoIncrement` di profile EAS mana pun | `android/app/build.gradle:84`, `eas.json` | Submit Play Store berikutnya ditolak / risiko lupa bump |
| B3 | **Play Integrity adalah stub yang selalu `success: true`** dengan token palsu | `services/security.ts:16-35` | Jika backend memakai hasil ini untuk keputusan anti-fraud penyetoran uang → lubang nyata |
| B4 | `targetSdk 34` — kebijakan Play menuntut target API terbaru-minus-satu untuk update (per Agu 2026: API 35) | `android/app/build.gradle` | Update app akan ditolak Play Store sampai RN/SDK dinaikkan |

### Tinggi (T)

| # | Temuan | Lokasi | Standar yang dilanggar |
|---|---|---|---|
| T1 | Screen memanggil API langsung (`resubmitCollection`) | `screens/HistoryScreen.tsx:18, 228` | Bab 1.1/1.4 (layering) |
| T2 | Screen memanggil service langsung + memegang logic resolve task online/offline | `screens/ScanScreen.tsx:19, 119-133` | Bab 1.1/1.4 |
| T3 | Screen memodifikasi queue MMKV langsung (bypass store) | `screens/HistoryScreen.tsx:19, 23-26` | Bab 1.1/1.4 |
| T4 | `offline_id` (idempotency key finansial) dibuat di **screen** dengan `Math.random()` | `screens/CollectionScreen.tsx:78` | Bab 1.1 (crypto RNG di service), 2.2 |
| T5 | `apiRequest` & `refreshAccessToken` **tanpa timeout** (bisa menggantung, memblokir sync lock) | `services/api.ts:152-156, 197-200` | Bab 1.4, 2.3 |
| T6 | **Lint & typecheck mobile tidak pernah jalan di CI** (kondisi `if` mengecualikan mobile) | `.github/workflows/ci.yml:115-121` | Bab 5.4 |
| T7 | Tidak ada test untuk `useAuthStore` (494 baris), `api.ts` (489 baris), dan `sync.ts` (di-mock penuh di regression test — retry/quarantine/lock tak teruji) | `__tests__/` | Bab 4.2 |

### Sedang (S)

| # | Temuan | Lokasi | Standar yang dilanggar |
|---|---|---|---|
| S1 | **Prettier efektif tidak berfungsi**: tidak ada file config, rule `prettier/prettier` dimatikan, tidak ada script/CI check | `.eslintrc.js`, package.json | Bab 1.6 |
| S2 | ESLint longgar: `no-explicit-any` tidak aktif sama sekali, `exhaustive-deps` diturunkan dari error ke warn | `.eslintrc.js` | Bab 1.3, 1.6 |
| S3 | `formatCurrency` duplikat inline di 5 screen, tanpa util bersama & tanpa test | History:28, Dashboard:21, Collection:25, Tasks:26, Scan:402 | Bab 1.1, 4.3 |
| S4 | Screen jauh di atas 300 baris: Tasks 839, Scan 652, History 640, Collection 404 | `screens/` | Bab 3.6 |
| S5 | Minify/R8 mati di release + `proguard-rules.pro` kosong; submit Play tidak terkonfigurasi (`submit.production: {}`) | `android/app/build.gradle:59`, `eas.json` | Bab 5.2 |
| S6 | Coverage tidak diukur; `testMatch` hanya `__tests__/` — test co-located di `src/` tak dijalankan | `jest.config.js` | Bab 4.1 |
| S7 | Kunci enkripsi MMKV 96-bit (< AES-128); deviasi terdokumentasi | `services/secureKey.ts:38` | Bab 2.1 |
| S8 | `useCollectionStore.ts` (386 baris) campur dua store + orkestrasi lintas 4 store + `setTimeout` refetch (race) | `stores/useCollectionStore.ts:52-139` | Bab 1.4 |
| S9 | Circular dependency store↔service dipatahkan dengan `require()` dinamis di beberapa titik | `useAuthStore.ts:263,329`, `queue.ts:5`, `sync.ts:171` | Bab 1.4 |
| S10 | Validasi domain (maks nominal Rp10.000.000, konfirmasi Rp0) hanya di screen | `screens/CollectionScreen.tsx:42-65` | Bab 1.1 |
| S11 | Tidak ada CHANGELOG rilis; checklist `06-execution-checklist.md` kosong padahal Fase B/C/E sudah terimplementasi (basi) | root, `docs/mobile-design-system/` | Bab 1.5, 3.4 |

### Rendah (R)

| # | Temuan | Lokasi |
|---|---|---|
| R1 | Warna hardcoded di luar theme (StatusBadge — komponen reusable; TasksScreen amber) | `components/ui/StatusBadge.tsx:33`, `screens/TasksScreen.tsx:813,818,831` |
| R2 | `console.log` migrasi tanpa guard `__DEV__` (bocor metadata ke logcat produksi) | `services/offline/queue.ts:244-246` |
| R3 | `SyncBanner` dead code (dashboard membangun banner inline sendiri) | `components/ui/SyncBanner.tsx` |
| R4 | `utils/device.ts` me-`require` package.json seluruhnya ke bundle | `utils/device.ts:5` |
| R5 | UUID `device_id` pakai `Math.random()` padahal polyfill crypto tersedia; `authService.refresh` menyisipkan header yang tak perlu | `services/api.ts:83-89, 335-343` |
| R6 | Magic number progress sync palsu (50/90) untuk UI | `stores/useSyncStore.ts:71,82` |
| R7 | Asersi test lemah (pencocokan string source code) | `__tests__/screens/VisualStateAudit.test.tsx` |
| R8 | Tidak ada `.editorconfig`, pre-commit hook, CODEOWNERS; Node version tidak seragam (root `>=20.9`, mobile `>=18`, CI Node 24); tanpa cache pnpm di CI | repo root |
| R9 | Artefak scaffolding kosong ter-commit (`apps/mobile/apps/mobile/android/`) | `apps/mobile/apps/` |
| R10 | Blok alias warna "sementara untuk screen lama" masih hidup di dalam theme | `theme/colors.ts:62-88` |

## Keputusan produk yang perlu dikonfirmasi pemilik produk

1. Logout dengan biometrik aktif **tidak me-revoke** refresh token server (`useAuthStore.ts:341-351`) — siapa pun dengan biometrik device bisa masuk kembali; ini by-design tapi refresh token tetap hidup di server.
2. Sesi offline memakai cache profil (`useAuthStore.ts:211-224`) — akun yang baru di-disable admin masih bisa submit offline (masuk queue lokal, ditolak saat sync).

Keduanya boleh dipertahankan, tetapi wajib tercatat sebagai keputusan sadar (Bab 2.5 standar).
