# Dokumentasi Eksekusi: Audit Penugasan & Upgrade React Native 0.88

**Tanggal:** 2026-10-25
**Aktor:** ZCode (sesi otomatis, atas arahan Bagus Darmwan)
**Ruang lingkup:** (1) audit + perbaikan hasil eksekusi rencana redesign halaman
penugasan; (2) eksekusi rencana upgrade React Native 0.74.1 → 0.88.0
(`docs/RENCANA-UPGRADE-RN.md`).
**Jejak di git (branch `staging`):**

| Commit | Isi |
|---|---|
| `52f6ead` | `fix(penugasan): kunci race assignment ganda + rapikan hasil audit redesign` (14 file, +902/−186) |
| `836dcc0` | `feat(mobile): upgrade react-native 0.74.1 -> 0.88.0 (new architecture)` (47 file, +2039/−3065) |
| `3fc5711` | `style(mobile): prettier untuk file hasil migrasi upgrade RN 0.88` (8 file) |
| Tag `pre-upgrade-rn-0.88` | Titik rollback sebelum upgrade RN (di-push ke origin) |

---

## Bagian 1 — Audit & perbaikan redesign halaman penugasan

### 1.1 Konteks

Rencana redesign halaman penugasan (`docs/rencana-redesign-halaman-penugasan-2026-10-24.md`)
sudah di-commit di `e506472`. Audit eksekusi dilakukan dengan dua agent paralel
(backend & web) membandingkan kode terhadap rencana poin-per-poin, ditambah
verifikasi ulang (typecheck, test, next build). Hasil audit: struktur sesuai
rencana, tetapi ada **2 bug backend** dan beberapa penyimpangan kecil — semuanya
diperbaiki di commit `52f6ead`.

### 1.2 Bug #1 — angka work-queue menggelembung saat kaleng pernah di-transfer

- **Akar:** `assignmentWorkQueueService.ts` menghitung `count(*)` di atas LEFT
  JOIN assignments. Endpoint transfer membuat **2 baris assignment untuk kaleng
  yang sama pada periode yang sama** (baris lama `REASSIGNED` + baris baru
  `ACTIVE`), sehingga kaleng tersebut terhitung dua kali — muncul sebagai
  "belum ditugaskan" phantom di queue, padahal `bulk-branch` akan melewatinya.
  Ini melanggar janji inti rencana §3/§14 ("angka belum ditugaskan sama dengan
  hasil assign massal") dan membuat kartu wilayah vs work-queue bisa berbeda.
- **Perbaikan:** semua agregat summary & grup diganti
  `count(DISTINCT cans.id) FILTER (...)`.
- **File:** `apps/backend/src/services/assignmentWorkQueueService.ts`.
- **Test regresi:** fixture kaleng hasil transfer (2 baris, REASSIGNED + ACTIVE)
  ditambahkan ke
  `apps/backend/src/services/__tests__/assignmentWorkQueueService.integration.test.ts`
  — mengunci `assignableCans=5, assigned=2, unassigned=3`.

### 1.3 Bug #2 — assignment ganda pada periode yang sama

- **Akar:** unique index hanya `(can_id, officer_id, period)`, dan semua endpoint
  massal melakukan check-then-insert tanpa transaksi/lock. Dua request bersamaan
  dengan petugas **berbeda** menghasilkan 2 assignment untuk kaleng yang sama;
  dengan petugas **sama** malah 500 (unique violation).
- **Perbaikan (transaksi + lock baris kaleng):** semua **enam jalur penulisan**
  kini mengunci baris kaleng `SELECT ... FOR UPDATE` di dalam transaksi, lalu
  memeriksa ulang assignment pada snapshot yang sama sebelum insert:
  1. `POST /admin/assignments` (tunggal) — 409 bila sudah ada;
  2. `POST /admin/assignments/bulk-branch` — kandidat dikunci urut `id`
     (urutan lock konsisten antar-request), yang kedua melewati;
  3. `POST /admin/assignments/bulk-cans` — pola sama;
  4. `POST /admin/assignments/:id/transfer` — cek duplikat & status `ACTIVE`
     pindah ke dalam transaksi;
  5. `PUT /admin/assignments/:id` — **baru**: menolak menghidupkan baris
     `REASSIGNED` saat penugasan berjalan lain ada (409 `CONFLICT`);
  6. `POST /scheduler/generate-tasks` — dulu hanya mengandalkan
     `onConflictDoNothing` (tidak menutup race lintas petugas); kini ikut pola lock.
- **Keputusan desain yang didokumentasikan:** indeks unik parsial
  `(can_id, period)` sengaja **TIDAK** ditambahkan — data produksi lama bisa
  melanggar dan migrasi akan gagal (preseden: migrasi `0015` dengan 27 baris
  melanggar). Lock transaksi menutup semua jalur aplikasi; indeks bisa jadi
  tindak lanjut setelah dedup data.
- **File:** `apps/backend/src/routes/admin/assignments.ts`,
  `apps/backend/src/routes/scheduler.ts`,
  `apps/backend/src/services/assignmentGenerator.ts` (fungsi `insertAssignments`
  kini menerima parameter `tx` agar bisa jalan di dalam transaksi; chunk
  dijalankan berurutan).
- **Test baru:** `apps/backend/src/routes/__tests__/assignments-integrity.integration.test.ts`
  — POST duplikat 409; hasil transfer tidak bisa "dihidupkan" lewat PUT;
  bulk-cans menolak kaleng hasil transfer.

### 1.4 Penyimpangan kecil dari rencana yang diperbaiki

| # | Temuan | Perbaikan | File |
|---|---|---|---|
| 1 | `GET /admin/assignments` mem-parse `year`/`month` tanpa guard (`?year=abc` → 500 NaN) | Validasi zod (400) + rentang 2020–2100 / 1–12 | `routes/admin/assignments.ts` |
| 2 | Periode default memakai `new Date()` waktu server (berisiko mundur 1 bulan bila server UTC, 00:00–07:00 WIB tgl 1) | Helper baru `currentOperationalPeriod()` (Asia/Jakarta via `Intl`) di file kebijakan TZ terpusat; dipakai work-queue + bulk-branch + bulk-cans | `utils/operationalTimeZone.ts` |
| 3 | `parsePeriod` tidak membatasi rentang tahun | Batas 2020–2100 | `assignmentWorkQueueService.ts` |
| 4 | `prefers-reduced-motion` tidak dihormati (rencana §12) | Blok CSS global menonaktifkan animasi/transisi dekoratif | `apps/web/src/app/globals.css` |
| 5 | Bottom sheet tanpa handle bar; sheet konfirmasi bisa tertutup Escape/overlay saat submit | Handle bar di `Modal` `position="bottom"`; prop baru `dismissible` (menutup jalur implisit Escape/overlay/X); `AssignmentConfirmSheet` memakai `dismissible={!submitting}` | `components/ui/Modal.tsx`, `components/assignments/AssignmentConfirmSheet.tsx` |
| 6 | Tombol back tidak menutup sheet lebih dulu (rencana §9) | Entri history ditumpuk saat sheet terbuka, `popstate` menutup sheet; penutup normal membersihkan entri; back saat submit mengembalikan entri | `app/dashboard/assignments/[id]/page.tsx` |
| 7 | Race condition `fetchHistory` (out-of-order overwrite, search tanpa debounce) | Stale-guard berbasis nomor fetch + debounce 300 ms | `app/dashboard/assignments/[id]/page.tsx` |
| 8 | Kegagalan parsial `bulk-branch`+`bulk-cans` hanya pesan generik | Toast peringatan yang menyebut jumlah berhasil; grup yang **gagal tetap terpilih** (yang berhasil otomatis ter-prune refetch) agar bisa diulang | `app/dashboard/assignments/[id]/page.tsx` |
| 9 | Dead export `Loader2` di `RegionCards` | Dihapus | `components/region/RegionCards.tsx` |
| 10 | Test `regionCardService` tidak meng-assert field assignable baru | Fixture diberi kaleng NON_AKTIF; field `assignableCans`/`assignedAssignableCans`/`unassignedAssignableCans`/`nonAssignableCans` dikunci test | `__tests__/regionCardService.integration.test.ts` |

### 1.5 Verifikasi Bagian 1

Typecheck backend ✅, typecheck web ✅, jest backend 4 suite **19/19** ✅,
vitest web **45/45** ✅, `next build` ✅. Catatan status ditambahkan ke bagian 18
dokumen rencana.

### 1.6 File yang disentuh (commit `52f6ead`)

- Backend: `routes/admin/assignments.ts`, `routes/scheduler.ts`,
  `services/assignmentWorkQueueService.ts`, `services/assignmentGenerator.ts`,
  `utils/operationalTimeZone.ts`, test `assignmentWorkQueueService.integration.test.ts`,
  `regionCardService.integration.test.ts`, test baru
  `assignments-integrity.integration.test.ts`.
- Web: `app/dashboard/assignments/[id]/page.tsx`, `app/globals.css`,
  `components/ui/Modal.tsx`, `components/assignments/AssignmentConfirmSheet.tsx`,
  `components/region/RegionCards.tsx`.
- Dokumen: `docs/rencana-redesign-halaman-penugasan-2026-10-24.md` (bagian 18 +
  sub-bagian "Penindaklanjutan hasil audit").

---

## Bagian 2 — Upgrade React Native 0.74.1 → 0.88.0 (collector-app)

Eksekusi `docs/RENCANA-UPGRADE-RN.md` Fase 0 → 4. Semua angka versi diverifikasi
dari template resmi 0.88.0 (proyek pembanding dibuat via
`npx @react-native-community/cli@latest init bench --version 0.88.0 --skip-install`
di folder TEMP) dan registry npm.

### 2.1 Fase 0 — persiapan

- Tag rollback `pre-upgrade-rn-0.88` dibuat di commit sebelum upgrade (dan di-push).
- `patch-package` dilepas (devDep + skrip `postinstall`) — folder `patches/`
  memang tidak pernah ada.
- **Tidak dikerjakan (manual):** cek dashboard Crashlytics untuk pangsa Android 6.

### 2.2 Fase 1 — inti RN & toolchain Android

| File | Perubahan |
|---|---|
| `apps/mobile/package.json` | RN 0.88.0, react 19.3.0, `@types/react ^19.2`, semua `@react-native/*` 0.88.0; **devDep eksplisit baru**: `@react-native-community/cli@20.2.0`, `cli-platform-android@20.2.0`, `@react-native/jest-preset@0.88.0`, `@react-native/codegen@0.88.0`, `hermes-compiler@260318099.0.4` (dua terakhir wajib di pnpm — lihat §2.6); `typescript ^6.0.3`; `react-test-renderer 19.3.0` (rencana semula mau menghapus — ternyata dipakai 14+ file test); `patch-package` & versi lama dilepas; engines `^22.13.0 \|\| ^24.3.0 \|\| >=26` |
| `android/build.gradle` | ext: buildTools 37.0.0, minSdk 24, compileSdk 37, targetSdk 36, NDK 27.1.12297006, Kotlin 2.2.0; **blok `force androidx.core 1.12.0` dihapus**; google-services 4.4.4 + crashlytics-gradle 3.0.7 dipertahankan |
| `android/gradle.properties` | `newArchEnabled=true`, `edgeToEdgeEnabled=true`, `android.builtInKotlin=false`, `android.newDsl=false`; `android.enableJetifier` dihapus; `reactNativeArchitectures` tetap 2 ABI arm |
| `android/gradle/wrapper/gradle-wrapper.properties` | Gradle **9.4.1** (mengikuti bentuk `-bin.zip` template) |
| `android/settings.gradle` | Bentuk baru: `pluginManagement { includeBuild }` + plugin `com.facebook.react.settings` + `autolinkLibrariesFromCommand()`; **dua baris hardcoded `.pnpm/...cli-platform-android@13.6.6` dihapus** |
| `android/app/build.gradle` | `autolinkLibrariesWithApp()` di blok `react {}`; baris `applyNativeModulesAppBuildGradle` (.pnpm) dihapus; `jscFlavor` bentuk baru; **`proguard-android-optimize.txt`** (AGP 9 melarang `proguard-android.txt` — lihat §2.5); flavor staging/production, `-PdisableFirebase`, `abiFilter`, minify+shrink+proguard-rules, fonts.gradle, mlkit+material semuanya dipertahankan |
| `MainApplication.kt` | Bentuk baru: tanpa `ReactNativeHost`/`SoLoader`; `reactHost by lazy { getDefaultReactHost(context, packageList) }` dengan `QrImageScannerPackage()` ditambahkan manual ke packageList; `loadReactNative(this)` di onCreate |
| `MainActivity.kt` | Tidak berubah (sudah bentuk baru; `FLAG_SECURE` tetap) |
| `AndroidManifest.xml` (main) | + `android:usesCleartextTraffic="${usesCleartextTraffic}"` (placeholder kini disetel plugin gradle 0.88: debug=true, release=false) + `android:supportsRtl="true"`; **`app/src/debug/AndroidManifest.xml` dihapus** |
| `babel.config.js` | Plugin terakhir `react-native-worklets/plugin` (menggantikan `react-native-reanimated/plugin`); `transform-inline-environment-variables` (API_URL) tetap sebelumnya |
| `metro.config.js` | `unstable_enableSymlinks` dihapus (symlink default ON di metro 0.87+); `watchFolders` + `nodeModulesPaths` monorepo dipertahankan |
| `jest.config.js` | `preset: '@react-native/jest-preset'`; mapper `@react-native/js-polyfills/error-guard` era 0.74 **dihapus** (polyfill wajib utuh di 0.88 — lihat §2.7) |
| `tsconfig.json` | extends `@react-native/typescript-config` (tanpa `/tsconfig.json` — paket 0.88 hanya mengekspor `"."`); `baseUrl` dihapus (deprecated TS 6, tak terpakai) |

### 2.3 Fase 2 — library native & migrasi kode

Semua versi persis sesuai peta rencana: screens 4.30.0, safe-area 5.10.1,
gesture-handler 3.4.0, svg 15.16.0, webview 14.0.1, nitro-modules 0.37.1,
mmkv 4.3.2, worklets 0.13.0, reanimated 4.7.1, netinfo 12.0.1, blob-util 0.25.1,
vector-icons 10.3.0, signature-canvas 5.1.1, navigation native 7.5.1 /
stack+tabs 7.21.0, camera-kit 18.0.1, firebase app+crashlytics 27.1.0.
`draggable-flatlist 4.0.3`, keychain, device-info, linear-gradient,
get-random-values, zustand tetap.

Migrasi kode sumber yang diperlukan:

- **mmkv v4 (Nitro):** `new MMKV({id, encryptionKey})` → `createMMKV(...)`
  (kelas `MMKV` kini type-only), `.delete(k)` → `.remove(k)` (Map.delete tidak
  disentuh). File: `services/api.ts`, `services/offline/mmkv.ts`,
  `services/updates/storage.ts`, `offline/cache.ts`, `offline/queue.ts`,
  `offline/tasks.ts`, `stores/useAuthStore.ts`; mock `__mocks__/react-native-mmkv.ts`
  diekspor ulang sebagai `createMMKV` + `remove()`.
- **StatusBar:** prop `backgroundColor` dibuang dari tipe RN 0.88 (era
  edge-to-edge memaksa bar transparan) — `App.tsx` ×2, `LoginScreen.tsx`.
- **StyleSheet:** `absoluteFillObject` dibuang dari tipe — diganti objek
  eksplisit `{position:'absolute', top:0, left:0, right:0, bottom:0}`
  (DashboardScreen, ScanOverlay, ScanManualModal).
- **Navigation 7:** opsi `unmountOnBlur` → `popToTopOnBlur` (AppNavigator);
  `List*Component` tidak lagi menerima `null` → `undefined` (HistoryScreen ×2,
  TasksScreen).
- **Tipe lain:** ref TextInput OTPScreen → `React.ComponentRef<typeof TextInput>`;
  `AppState.currentState` perlu cast (`string | null | undefined` di 0.88);
  callback progress `blob-util` 0.25 kini `(received: number, total: number)`.

### 2.4 Migrasi test (jest 29 + @react-native/jest-preset 0.88 + rtr 19.3)

Hasil akhir: **262/262 test lulus, 35/35 suite, coverage 56.24%/46.19%/52.67%/56.28%**
(semua di atas threshold CI 50/35/45/50). Migrasi yang dilakukan:

1. **`act` async wajib:** di rtr 19 + preset 0.88, `renderer.create()`/`update()`
   di luar `act` membuat root ter-unmount sebelum asersi. 6 suite
   (`ui/AppButton`, `ui/StatusBadge`, `ui/SegmentedControl`, `ui/SyncBanner`,
   `ui/AppTextInput`, `repro-crash-icon`) diberi helper `createAsync` yang
   membungkus create dalam `renderer.act(async ...)`, dan `it()` menjadi async.
   (`AppPressable` dan `AuthenticatedScreens` sudah act-wrapped sejak awal.)
2. **Fiber membawa tipe INNER komponen ber-memo:** React 19 meng-unwrap `memo`
   — `findAllByType(Pressable)` (diekspor sebagai `react.memo`) tidak pernah
   cocok. Diganti pencarian berdasarkan nama fungsi internal
   (`node.type?.name === 'Pressable'`) — AppPressable, AppTextInput.
3. **GestureHandlerRootView wajib:** RNGH 3.x menegakkan GestureDetector harus
   berada di dalam root view (dulu hanya warning) — smoke test layar
   (`AuthenticatedScreens`) membungkus elemen dengan `GestureHandlerRootView`,
   meniru `App.tsx`.
4. **Mock `error-guard` era 0.74 dihapus** dari `jest.config.js` moduleNameMapper
   (dan file `__mocks__/error-guard-mock.js` dihapus): polyfill itu wajib utuh
   di 0.88 — mock blank membuat error render menjadi "uncaught", root
   ter-unmount, dan pesan error asli tertelan.
5. **Shim `window.dispatchEvent`** di `jest.setup.js`: jest-preset 0.88 menyetel
   `window = global`, tetapi sandbox jest (testEnvironment node) tidak punya
   EventTarget — rtr 19.3 melaporkan error tak tertangkap lewat
   `window.dispatchEvent` sehingga tanpa shim pesan asli tertelan TypeError.
6. Prettier dijalankan atas semua file hasil migrasi (commit `3fc5711`) agar
   gerbang `format:check` CI hijau.

### 2.5 Smoke build Android (Fase 2/3) — berurutan sampai hijau

`assembleProductionDebug` lokal (semua kegagalan ini tidak terlihat di typecheck/test):

1. **AGP 9 melarang `proguard-android.txt`** (memuat `-dontoptimize`) — error
   saat evaluasi proyek. → `proguard-android-optimize.txt`.
2. **Codegen tidak ketemu** (`@react-native/codegen` dicari di
   `apps/mobile/node_modules` — pnpm tidak me-link paket transitif ke sana) →
   devDep eksplisit `@react-native/codegen@0.88.0`.
3. **Hermesc tidak ketemu** — di 0.88 binary prebuilt tidak lagi dikirim di
   dalam paket react-native (`sdks/hermesc/` hilang); plugin mencari
   `node_modules/hermes-compiler/hermesc/%OS-BIN%/hermesc.exe` → devDep
   eksplisit `hermes-compiler@260318099.0.4` (versi persis yang diminta RN 0.88).
4. **Kotlin: modul QR kustom** — `getCurrentActivity()` pada
   `ReactContextBaseJavaModule` disembunyikan (deprecated 0.80, level HIDDEN) →
   `reactContext.currentActivity` di `QrImageScannerModule.kt`.
5. **ninja "failed recompaction: Permission denied"** di `.cxx` nitro — sisa
   lock proses gradle yang di-kill; bersihkan `.cxx` + `./gradlew --stop`.
6. **Windows MAX_PATH 260** — `Stat(...RNGestureHandlerDetectorShadowNode.cpp.o):
   Filename longer than 260 characters` saat kompilasi C++ codegen
   gesture-handler. Registry `LongPathsEnabled` mesin ini sudah `1`; penyebabnya
   **ninja 1.10.2 bawaan cmake 3.22.1 SDK tidak long-path-aware** → ninja SDK
   di-upgrade ke **1.12.1** (backup: `ninja-1.10.2.exe.bak` di folder yang
   sama). Hanya relevan di Windows; CI (Linux) tidak terdampak.

Hasil: **BUILD SUCCESSFUL in 20m 15s** — `app-production-debug.apk` (126 MB,
2 ABI, debug). Uji **R8/release lokal ditunda**: tidak ada signing key di mesin
ini; tertutup oleh dry-run `release.yml` di CI (Fase 3).

### 2.6 Perbaikan monorepo pnpm

- **Dua salinan React:** `draggable-flatlist@4.0.3` tidak mendeklarasikan peer
  `react` (cacat manifestnya), sehingga `require('react')` jatuh ke hidden-hoist
  `node_modules/.pnpm/node_modules` yang memuat react **19.2.4** (milik web) —
  app mobile memakai 19.3.0 → crash `useContext null` saat test. Fix baku:
  **`packageExtensions`** di `pnpm-workspace.yaml` menambahkan peer `react`
  untuk paket itu (terverifikasi symlink `react → 19.3.0` di instance-nya).
  Catatan: field `pnpm` di package.json **sudah tidak dibaca pnpm 10.33** —
  setting harus di `pnpm-workspace.yaml`.
- `onlyBuiltDependencies: ['@parcel/watcher']` (dep baru CLI 20) ikut
  dipindah ke `pnpm-workspace.yaml`.
- `pnpm-lock.yaml` diperbarui menyeluruh (−293 paket lama, +152 baru).

### 2.7 Fase 4 — keamanan & penutupan

- `pnpm why node-forge` → kosong; `pnpm audit` → **3 temuan** (esbuild,
  ip-address, uuid — semua moderate; lebih baik dari prediksi rencana "4",
  fast-xml-parser ikut hilang).
- `security/audit-baseline.json` diperbarui via `--update`: **7 → 3 advisory**
  (node-forge GHSA-86w9-cpqp-85rv, image-size GHSA-5p2g-fcmc-qvqq &
  GHSA-w3rx-r6r6-pgpr, fast-xml-parser GHSA-gh4j-gqv2-49f6 terpangkas).
- `docs/RENCANA-UPGRADE-RN.md` diperbarui: checklist fase dicentang, bagian
  "Status eksekusi (2026-10-25)" + 12 temuan/koreksi terhadap rencana ditulis.
- Skill `ci-cd-investigation` (di luar repo) ditambah pelajaran upgrade:
  diagnosa dua salinan React lewat realpath, baseline audit basi dua arah,
  warning bin pnpm di Windows yang kosmetik, artefak `.cxx` lama.

### 2.8 Hasil CI setelah push (Fase 3 — bagian otomatis)

| Job | Hasil |
|---|---|
| Verify (lint · format · typecheck) | ✅ (setelah perbaikan prettier) |
| Test mobile (262 test + coverage) | ✅ |
| Build Android Debug (assembleProductionDebug) | ✅ 18m21s |
| Build Staging APK (arm64, disableFirebase, API_URL staging) | ✅ 18m02s |
| Security: CodeQL + gerbang pnpm-audit (basis 3) | ✅ |

### 2.9 Perubahan di luar repo (mesin lokal ini)

- **Android SDK:** `cmake/3.22.1/bin/ninja.exe` di-upgrade 1.10.2 → 1.12.1
  (backup `ninja-1.10.2.exe.bak` di tempat yang sama) — WAJIB untuk build
  native di Windows ini; mesin lain dengan Windows perlu langkah yang sama bila
  kena MAX_PATH.
- Proyek pembanding template 0.88.0 di `%TEMP%/rn-bench-0.88/bench` (sekadar
  referensi, dapat dihapus).
- NDK 27.1.12297006 + platform/build-tools 37 diunduh otomatis oleh Gradle ke
  SDK lokal.

### 2.10 Sisa langkah manusia (belum dieksekusi, sesuai rencana)

1. Cek dashboard Crashlytics: pangsa perangkat Android 6 (minSdk 23→24).
2. QA emulator + perangkat fisik — checklist di dokumen rencana Fase 3
   (login/OTP, reorder draggable, kamera, **decode QR dari galeri** — modul
   native kustom jalan via interop layer, tanda tangan 2-HP, cache offline
   mmkv termasuk perangkat dengan data lama → jalur `recrypt`, background sync,
   edge-to-edge di Android 15+, back gesture/predictive back).
3. Uji jalur update in-app: v1.2.0 produksi → modal update → unduh & install
   APK baru → data MMKV/Keychain utuh.
4. Kalibrasi gate ukuran APK `release.yml` dari ukuran build baru, lalu
   dry-run `workflow_dispatch` (`dry_run=true`) sampai hijau.
5. Deploy APK staging ke petugas uji → pantau Crashlytics 24–48 jam.
6. Rilis: `node scripts/release-bump.mjs 1.3.0 --version-code 29 --changelog
   "..." --publish` → tag v1.3.0 → release.yml → R2.
7. Rollback kapan pun selama staging belum dirilis: tag `pre-upgrade-rn-0.88`.

---

## Lampiran — verifikasi menyeluruh yang dijalankan

- Backend: `tsc --noEmit` ✅; jest `assignmentWorkQueue` + `bulk-cans` +
  `assignments-integrity` + `regionCardService` **19/19** ✅.
- Web: `tsc --noEmit` ✅; `eslint` 0 error ✅; `vitest` **45/45** ✅;
  `next build` ✅.
- Mobile: `tsc --noEmit` (TS 6) ✅; `eslint .` 0 error ✅; `prettier --check .` ✅;
  `jest --ci --coverage` **262/262** ✅; `pnpm -r typecheck` ✅;
  `assembleProductionDebug` ✅ lokal dan di CI.
- Root: `pnpm audit` → 3 temuan, semuanya ter-cover basis ✅.
