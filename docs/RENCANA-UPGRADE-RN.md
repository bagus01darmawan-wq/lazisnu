# Rencana Upgrade React Native 0.74.1 → 0.88.0 (collector-app)

> Disusun 2026-10-24, **direvisi 2026-10-25 setelah deep-dive proyek + verifikasi
> registry/template**. Semua angka di bawah diverifikasi dari: template resmi
> RN 0.88.0 (repo `react-native-community/template`, tag `0.88.0`), registry npm
> (peerDependencies tiap paket), release notes RNFB/camera-kit/mmkv, dan
> pembacaan langsung konfigurasi proyek (gradle, workflow CI, kode src).
> Dokumen ini adalah rencana eksekusi — perbarui statusnya tiap fase selesai.

## Status eksekusi (2026-10-25 — sesi otomatis)

**Selesai**: Fase 0 (kecuali cek Crashlytics — manual), Fase 1, Fase 2 (typecheck
TS 6 hijau; jest 262/262 + coverage 56% hijau), smoke build
`assembleProductionDebug` **BERHASIL** (20 menit, APK 126 MB, 2 ABI), Fase 4
audit (basis 7 → 3). Uji R8 release lokal DITUNDA — tidak ada signing key di
mesin ini; tertutup oleh dry-run `release.yml` di CI (Fase 3). CI + QA perangkat,
kalibrasi gate APK, deploy staging, dan rilis v1.3.0 = langkah manusia (belum).

**Koreksi terhadap rencana ini yang ditemukan saat eksekusi** (penting dibaca):

1. **`react-test-renderer` TIDAK boleh dihapus** — ternyata dipakai 14+ file test
   (klaim "tidak dipakai" meleset). Di-reinstall `19.3.0` + `@types ^19.1.0` —
   template 0.88 sendiri masih mengirimnya sebagai devDep.
2. **mmkv v4: API tidak "kompatibel penuh"** — instansiasi kini lewat factory
   `createMMKV({id, encryptionKey})` (kelas `MMKV` hanya type-only), dan
   `delete()` diganti `remove()`. Sumber: `lib/index.d.ts` mmkv 4.3.2.
3. **Dua salinan React** — `draggable-flatlist@4.0.3` lupa mendeklarasikan peer
   `react`; resolusinya jatuh ke hidden-hoist `.pnpm/node_modules` yang memuat
   react versi web (19.2.4) → crash `useContext null` di test. Fix baku:
   `packageExtensions` di `pnpm-workspace.yaml` (field `pnpm` di package.json
   sudah TIDAK dibaca pnpm 10.33).
4. **Mock `error-guard` era 0.74 dihapus dari jest moduleNameMapper** — polyfill
   itu wajib utuh di 0.88; mock blank membuat error render menjadi "uncaught"
   dan root test-renderer ter-unmount.
5. **Migrasi test wajib**: `renderer.create()` harus dibungkus `act` async
   (rtr 19 + preset 0.88), fiber membawa tipe INNER komponen ber-memo
   (`findAllByType(Pressable)` tidak pernah cocok — cari per nama fungsi
   internal), RNGH 3.x menegakkan `GestureHandlerRootView` di test, dan jest
   butuh shim `window.dispatchEvent` (sandbox jest node tidak punya EventTarget).
6. **TypeScript**: extends kini `@react-native/typescript-config` (tanpa
   `/tsconfig.json` — paket hanya mengekspor `"."`); `baseUrl` deprecated di
   TS 6 dihapus; `StatusBar backgroundColor` dibuang dari tipe (edge-to-edge).
7. `@parcel/watcher` (baru, via CLI 20) perlu di-allow build-nya.

**Temuan tambahan dari smoke build Android** (berurutan sampai hijau):

8. **AGP 9 melarang `proguard-android.txt`** (berisi `-dontoptimize`) — error
   konfigurasi sejak evaluate; wajib `proguard-android-optimize.txt` (catatan
   "pertimbangkan" di Fase 1 ternyata mengikat).
9. **pnpm: `@react-native/codegen` dan `hermes-compiler` wajib jadi devDep
   eksplisit** — keduanya kini dependensi react-native yang diselesaikan
   path-nya relatif `apps/mobile/node_modules`; pnpm tidak me-link paket
   transitif ke sana. `hermes-compiler@260318099.0.4` (persis versi yang
   diminta RN 0.88) menyediakan `hermesc` — di 0.88 binary prebuilt TIDAK lagi
   dikirim di dalam paket react-native (`sdks/hermesc/` hilang).
10. **Windows + MAX_PATH 260**: ninja 1.10.2 bawaan cmake 3.22.1 SDK tidak
   long-path-aware — gagal `Stat(...): Filename longer than 260 characters`
   pada `.o` codegen gesture-handler. Registry `LongPathsEnabled` mesin ini
   sudah 1; fix = upgrade ninja SDK ke **1.12.1** (manifest longPathAware),
   backup `ninja-1.10.2.exe.bak`. Hanya relevan di Windows — CI (Linux) aman.
11. **Modul QR kustom**: `getCurrentActivity()` pada modul disembunyikan
   (deprecated 0.80, HIDDEN) — ganti `reactContext.currentActivity`.
12. Saat kill proses gradle di tengah build, sisa `.cxx` terkunci (ninja
   "Permission denied") — bersihkan `android/app/.cxx` + `.cxx` library
   terkait sebelum rebuild.

---

## Apa yang berubah di revisi ini (audit trail)

Revisi 2026-10-25 mengoreksi/menambah hal-hal yang salah atau luput di versi
pertama:

1. **`react-native-worklets@0.13.x` WAJIB ditambahkan** — reanimated 4
   memindahkan worklet runtime ke paket terpisah (peer `react-native-worklets:
   0.13.x`), dan plugin babel harus diganti `react-native-worklets/plugin`.
2. **`react-native-nitro-modules` WAJIB ditambahkan** — mmkv v4 adalah rewrite
   penuh di atas Nitro (peer `react-native-nitro-modules`).
3. **CLI harus jadi devDep eksplisit** — `@react-native-community/cli` +
   `cli-platform-android` 20.2.0 tidak lagi datang lewat RN core; skrip
   `react-native run-android/start` dan autolinking baru bergantung padanya.
4. **Jest preset pindah** — `preset: 'react-native'` → `@react-native/jest-preset`
   (devDep baru `@react-native/jest-preset@0.88.0`).
5. **Angka toolchain Android di-pin dari template** (bukan lagi "lihat diff
   nanti"): Gradle **9.4.1**, Kotlin **2.2.0**, compileSdk **37**, targetSdk
   **36**, minSdk **24**, buildTools **37.0.0**, NDK **27.1.12297006**, plus flag
   baru `edgeToEdgeEnabled=true`, `android.builtInKotlin=false`,
   `android.newDsl=false` (era AGP 9; versi AGP sendiri dikelola
   react-native-gradle-plugin 0.88.0).
6. **settings.gradle & app/build.gradle berubah bentuk total** — autolinking
   via `autolinkLibrariesFromCommand()`/`autolinkLibrariesWithApp()`; dua baris
   `apply from: .../.pnpm/@react-native-community+cli-platform-android@13.6.6/...`
   yang di-hardcode **dihapus** (bukan sekadar re-path).
7. **MainApplication.kt dirombak** — tanpa `ReactNativeHost`/`SoLoader`; modul
   native kustom `QrImageScannerPackage` dipindah ke blok `packageList` di
   `getDefaultReactHost`.
8. **Modul native kustom QrImageScanner** teridentifikasi sebagai risiko new-arch
   (modul old-arch klasik; jalan via interop layer — QA wajib).
9. **Fase 4 salah hitung**: baseline audit 7 → **4** (bukan 7 → 6) — node-forge
   **dan dua GHSA image-size** hilang sekaligus karena metro 0.87 membuang
   image-size.
10. **Gate ukuran APK di release.yml mungkin gagal** setelah upgrade (APK RN 0.88
    + Firebase 35 lebih besar; gate 25–35 MiB arm64 / 18–28 MiB armv7 perlu
    kalibrasi ulang).
11. Tambahan peta: **netinfo 11 → 12**, **typescript 5 → 6** (template; JANGAN 7),
    hapus **react-test-renderer** (React 19 menghapusnya; kode tidak memakainya),
    navigasi per-paket (native 7.5.1 / stack+tabs 7.21.0, bukan seragam 7.5.x).
12. Hapus `force androidx.core 1.12.0` di root build.gradle (berbahaya dengan
    pustaka era compileSdk 37).

## Mengapa upgrade ini

1. **Keamanan**: `node-forge` (high, tanpa patch) masuk lewat
   `@react-native/community-cli-plugin → @react-native/dev-middleware →
   selfsigned`. Di RN 0.88, `dev-middleware@0.88.0` **tidak lagi bergantung
   pada selfsigned** (diverifikasi dari deps lengkapnya) — alert high terakhir
   tertutup permanen. Bonus: metro 0.87 **tidak lagi memakai `image-size`**
   (diverifikasi) — dua advisory image-size yang di-dismiss jadi moot.
2. **Dukungan**: 0.74 (Mei 2024) sudah unsupported; kebijakan resmi hanya
   merawat latest + 2 minor sebelumnya (0.88/0.87/0.86).
3. **Ekosistem**: reanimated 4, navigation 7, firebase 27 hanya menarget garis
   0.8x; menunggu lebih lama = jurang makin lebar.

## Kondisi saat ini (baseline — hasil deep-dive 2026-10-25)

| Aspek | Nilai |
|---|---|
| react-native / react | 0.74.1 / 18.2.0, **old architecture** (`newArchEnabled=false`) |
| Toolchain | Gradle 8.6, Kotlin 1.9.22, compile/target SDK 34, minSdk 23, NDK 26.1.10909125 |
| JDK CI | temurin 17 (ci.yml ×2 job + release.yml; Gradle 9.4 masih jalan di JDK 17 — bila AGP 9 menolak, naikkan ke 21 di 3 titik itu) |
| Platform | **Android-only** (tidak ada folder ios) |
| Versi rilis | versionCode **28**, versionName **1.2.0** — disinkronkan 3 file oleh `scripts/release-bump.mjs` (build.gradle, appConfig.ts, backend mobileRelease.json) |
| Distribusi | **Tanpa Play Store**: APK per-ABI diunggah ke R2 → `apk.lazisnu.site`, disebar via WA; petugas update lewat **modal update in-app** (unduh APK via blob-util → install via `REQUEST_INSTALL_PACKAGES`) |
| Modul native kustom | `QrImageScannerModule.kt` + `QrImageScannerPackage.kt` — modul old-arch klasik (`ReactContextBaseJavaModule`, promise, ML Kit barcode) untuk **decode QR dari galeri**; didaftarkan manual di `MainApplication.getPackages()` |
| Flavor | `staging` (applicationIdSuffix `.staging`, **tanpa Firebase** — `-PdisableFirebase=true` meng-compile-out plugin) & `production`; gate APK per-ABI + gate ukuran di `release.yml` |
| R8 | `minifyEnabled` + `shrinkResources` ON; proguard-rules.pro ekstensif (mmkv, keychain, reanimated, mlkit, firebase, …) |
| patch-package | terpasang + `postinstall`, folder `patches/` TIDAK ADA → aman dilepas |
| Pemakaian risiko di kode | reanimated hanya `FadeInUp`/`Layout` (2 file); **nol** `LayoutAnimation`; **nol** `defaultProps`/`propTypes` (React 19 aman); **nol** deep import `react-native/Libraries`; camera-kit hanya `<Camera cameraType scanBarcode onReadCode showFrame>` + permission dikelola sendiri; mmkv hanya `new MMKV({id, encryptionKey})` + `recrypt()` |
| Test | jest preset `react-native` + mock manual reanimated (proxy) di jest.setup.js; **react-test-renderer TIDAK dipakai** di test (hanya devDep); `jest.worktree.js` menurunkan jest.config (ikut berubah otomatis) |
| CI mobile | `verify` (lint/format/typecheck `pnpm -r`) → `test-mobile` (coverage, threshold 50/35/45/50) → `build-android-debug` (assembleProductionDebug) + `build-staging-apk` (assembleStagingDebug, `-PabiFilter=arm64-v8a -PdisableFirebase=true`, `API_URL` staging di-inline babel) |
| Audit | baseline `security/audit-baseline.json` = **7 advisory** (node-forge high-tanpa-patch, 2× image-size high, esbuild, fast-xml-parser, ip-address, uuid) |

## Target & angka kunci (RN 0.88.0 — dipin dari template resmi)

| Item | Dari → Ke |
|---|---|
| react-native / react / @types/react | 0.74.1 / 18.2.0 / ^18 → **0.88.0 / 19.3.x / ^19.2** (peer RN: `react ^19.3.0`, `@types/react ^19.1.1`) |
| New Architecture | false → **true** (wajib; interop layer tetap ada untuk lib lama) |
| Gradle wrapper | 8.6 → **9.4.1** |
| Kotlin | 1.9.22 → **2.2.0** |
| compileSdk / targetSdk / minSdk / buildTools | 34/34/23/34.0.0 → **37 / 36 / 24 / 37.0.0** |
| NDK | 26.1.10909125 → **27.1.12297006** |
| AGP | dikelola `@react-native/gradle-plugin` 0.88.0 (classpath tetap tanpa versi) + opt-out AGP9: `android.builtInKotlin=false`, `android.newDsl=false` |
| gradle.properties baru | `edgeToEdgeEnabled=true`; **hapus** `android.enableJetifier` |
| Node | engines RN: `^22.13.0 \|\| ^24.3.0 \|\| >=26` — CI Node 24 ✓ |
| JDK | 17 tetap cukup untuk Gradle 9.4; siapkan eskalasi ke 21 bila AGP 9 memprotes |

## Peta versi library (current → target; semua diverifikasi npm 2026-10-25)

| Paket | Sekarang | Target | Catatan |
|---|---|---|---|
| react-native | 0.74.1 | **0.88.0** | + new arch |
| react / @types/react | 18.2.0 / ^18 | **19.3.x / ^19.2** | React 19; kode bersih dari API yang dihapus |
| @react-native/babel-preset · eslint-config · eslint-plugin · metro-config · typescript-config · gradle-plugin | 0.74.81 / ^0.74.83 | **0.88.0** | |
| @react-native-community/cli · cli-platform-android | (transitif) | **20.2.0 (devDep eksplisit)** | CLI tidak lagi dibawa RN core |
| @react-native/jest-preset | — | **0.88.0 (devDep baru)** | ganti `preset: 'react-native'` |
| **react-native-worklets** | — | **0.13.0 (BARU)** | wajib peer reanimated 4.7.1 (`0.13.x`) |
| **react-native-nitro-modules** | — | **^0.37.1 (BARU)** | wajib peer mmkv 4 |
| react-native-reanimated | 3.12.0 | **4.7.1** | peer RN `0.86–0.88` ✓; babel: `react-native-worklets/plugin` menggantikan `react-native-reanimated/plugin` |
| react-native-gesture-handler | 2.16.1 | **3.4.0** | dipakai app hanya `GestureHandlerRootView` |
| react-native-screens | 3.31.1 | **4.30.0** | |
| react-native-safe-area-context | 4.10.1 | **5.10.1** | makin penting: edge-to-edge |
| react-native-webview | 13.17.0 | **14.0.1** | tidak dipakai langsung (via signature-canvas) |
| react-native-mmkv | 2.12.2 | **4.3.2** | v3: rewrite C++ TurboModule; v4: **Nitro** + `set()` kini melempar error, `remove()` return bool, `getBuffer` pakai ArrayBuffer (tidak kita pakai). API `{id, encryptionKey}` + `recrypt()` kompatibel; format data on-device tidak berubah |
| react-native-camera-kit | 13.0.0 | **18.0.1** | v14 menghapus `CameraScreen` + auto-permission — **tidak menyentuh kita** (pakai `Camera` + kelola izin sendiri); v15–18 tanpa breaking yang relevan |
| react-native-signature-canvas | 4.7.4 | **5.1.1** | peer `webview >=13` ✓ |
| @react-native-firebase/app · crashlytics | 24.1.1 | **27.1.0** | breaking v27 iOS-only (SPM); kita Android — fokus: Firebase Android SDK 35; `expo` peer-nya optional (aman untuk pnpm) |
| @react-navigation/native | 6.1.17 | **7.5.1** | |
| @react-navigation/native-stack · bottom-tabs | 6.9.26 / 6.5.20 | **7.21.0 / 7.21.0** | butuh screens ≥4 ✓, safe-area ≥4 ✓ |
| @react-native-community/netinfo | 11.5.2 | **12.0.1** | (luput dari rencana lama) |
| react-native-blob-util | 0.24.9 | **0.25.1** | latest ✓ |
| react-native-vector-icons / svg | 10.1.0 / 15.2.0 | **10.3.0 / 15.16.0** | latest ✓ |
| react-native-keychain / device-info / linear-gradient / get-random-values / zustand | 10.0.0 / 15.0.2 / 2.8.3 / 1.11.0 / 4.5.2 | **tetap** | sudah latest; kompatibel React 19 |
| typescript | ^5.4.5 | **^6.0.x** (sesuai template; JANGAN 7) | TS 6 = lonjakan mayor; siap perbaiki error type baru |
| react-test-renderer + @types | 18.2.0 / ^19.1.0 | **HAPUS** | tidak dipakai test; deprecated di React 19 |

## Risiko utama & mitigasi (diurut ulang dari bukti deep-dive)

1. **Toolchain Gradle 8.6→9.4.1 + Kotlin 1.9→2.2 + era AGP 9** — lonjakan
   terbesar, bukan new-arch-nya. Mitigasi: terapkan diff template file-per-file
   (daftar di Fase 1); `gradle/actions/setup-gradle@v6` di CI sudah mendukung
   Gradle 9; kalau AGP 9 menuntut JDK 21, naikkan `setup-java` di 3 titik
   (ci.yml ×2, release.yml).
2. **New Architecture + modul native kustom `QrImageScanner`** — modul old-arch
   (promise-based) jalan lewat interop layer, tapi registrasinya dipindah ke
   `getDefaultReactHost(..., packageList)` dan **QA decode-QR-dari-galeri wajib**
   (alur `ScanScreen → pilih gambar → ML Kit`).
3. **reanimated 4 + draggable-flatlist** — draggable-flatlist 4.0.3 masih latest
   (peer reanimated `>=2.8` longgar) tapi belum dirilis khusus reanimated 4;
   app hanya pakai `ScaleDecorator` + reorder daftar tugas. Mitigasi: QA reorder
   di emulator+HP; bila patah → patch kecil via patch-package (pasang kembali
   mekanismenya) atau fallback UI non-drag sementara.
4. **mmkv v4 (Nitro)** — dependensi native baru + semantik `set()` melempar.
   Mitigasi: nitro dipasang sebelum mmkv; tes unit offline-queue hijau; QA cache
   offline + jalur `recrypt` di HP dengan data lama.
5. **targetSdk 36: edge-to-edge & predictive back** — UI digambar di balik
   status/navbar bar (flag `edgeToEdgeEnabled=true`), back gesture beranimasi.
   Mitigasi: QA layar dengan header/form/keyboard (login, OTP, input manual,
   tanda tangan) + tab bar vs gesture bar; safe-area-context 5 menutup inset.
6. **minSdk 23→24 (membuang Android 6)** — TANPA Play Console; sumber data pangsa
   = dashboard Crashlytics (distribusi OS versi perangkat petugas). Konfirmasi
   dulu sebelum merge.
7. **Rilis & gate** — APK RN 0.88 (Firebase 35 + lib baru) hampir pasti lebih
   besar → **gate ukuran release.yml (25–35 / 18–28 MiB) harus dikalibrasi
   ulang** setelah build pertama; versionCode naik via `release-bump.mjs`
   (28 → ≥29); **uji jalur update in-app dari v1.2.0 (RN 0.74) → v baru**:
   unduh, install overwrite, data MMKV/Keychain utuh.
8. **Flake NDK** (pernah 2026-10-23) — ndkVersion di-pin `27.1.12297006` di root
   ext; bila CI masih flaky, pre-install NDK via sdkmanager di workflow sebelum
   gradle.

## Fase eksekusi

### Fase 0 — persiapan (±½ hari)
- [x] Tag rollback: `git tag pre-upgrade-rn-0.88` di commit staging saat ini.
- [x] Lepas `patch-package`: hapus devDep + skrip `postinstall` (folder patches
      memang tidak ada).
- [x] Artefak pembanding: pakai APK staging terakhir dari job
      `build-staging-apk` (artifact CI) — tidak perlu build lokal.
- [x] Proyek pembanding: `npx @react-native-community/cli@latest init bench --version 0.88.0 --skip-install`
      (template kini hidup di repo `react-native-community/template`).
- [ ] Cek dashboard Crashlytics: pangsa perangkat Android 6 (minSdk 23→24).

### Fase 1 — inti RN (±1–1,5 hari)
- [x] `package.json` mobile: RN 0.88.0, react 19.3.x, @types/react ^19.2,
      naikkan semua `@react-native/*` 0.74.81→0.88.0, gradle-plugin 0.88.0,
      **tambah** devDep `@react-native-community/cli@20.2.0`,
      `cli-platform-android@20.2.0`, `@react-native/jest-preset@0.88.0`,
      typescript ^6.0.x; **hapus** react-test-renderer + @types-nya.
- [x] `android/gradle/wrapper`: 9.4.1. `android/build.gradle` ext: buildTools
      37.0.0, minSdk 24, compileSdk 37, targetSdk 36, ndk 27.1.12297006,
      kotlin 2.2.0; **hapus blok `force androidx.core 1.12.0`**; pertahankan
      classpath google-services 4.4.x + crashlytics-gradle 3.0.x (cek patch
      terbarunya saat eksekusi).
- [x] `android/settings.gradle` → bentuk baru template:
      `pluginManagement { includeBuild(...) }` + `plugins { id("com.facebook.react.settings") }`
      + `autolinkLibrariesFromCommand()`; **hapus** baris `apply from` .pnpm
      cli-platform-android 13.6.6.
- [x] `android/app/build.gradle`: tambah `autolinkLibrariesWithApp()` di blok
      `react {}`; **hapus** baris `applyNativeModulesAppBuildGradle` (.pnpm);
      **pertahankan**: flavors staging/production, blok `-PdisableFirebase`,
      `abiFilter` param, signing release, minify+shrinkResources+proguard
      (catat: template memakai `proguard-android-optimize.txt` & minify false —
      keputusan kita: tetap minify true, pertimbangkan pindah ke
      `-optimize.txt`), baris `fonts.gradle` vector-icons, dep mlkit + material.
- [x] `android/gradle.properties`: `newArchEnabled=true`,
      `edgeToEdgeEnabled=true`, `android.builtInKotlin=false`,
      `android.newDsl=false`, hapus `enableJetifier`; `reactNativeArchitectures`
      tetap `armeabi-v7a,arm64-v8a`.
- [x] `MainApplication.kt` → bentuk baru (hapus `ReactNativeHost`/`SoLoader`;
      `reactHost by lazy { getDefaultReactHost(context, PackageList(this).packages.apply { add(QrImageScannerPackage()) }) }`;
      `loadReactNative(this)` di onCreate). `MainActivity.kt` tidak berubah
      (sudah bentuk baru; custom `FLAG_SECURE` tetap).
- [x] `AndroidManifest.xml` (main): tambah
      `android:usesCleartextTraffic="${usesCleartextTraffic}"` +
      `android:supportsRtl="true"`; **hapus** `app/src/debug/AndroidManifest.xml`
      (cleartext kini via placeholder per buildType).
- [x] `babel.config.js`: plugin terakhir `react-native-worklets/plugin`
      (menggantikan `react-native-reanimated/plugin`);
      `transform-inline-environment-variables` TETAP sebelumnya (API_URL).
- [x] `metro.config.js`: hapus `unstable_enableSymlinks` (symlink kini default
      ON; opsinya sudah dibuang dari metro 0.87); pertahankan `watchFolders` +
      `nodeModulesPaths` monorepo.
- [x] `jest.config.js`: `preset: '@react-native/jest-preset'`; sesuaikan
      `transformIgnorePatterns` bila ada paket baru yang gagal transform
      (mock reanimated/mmkv di jest.setup sudah melindungi dari worklets/nitro).
- [x] `pnpm install` → selesaikan peer konflik SEBELUM lanjut; build
      `assembleProductionDebug` lokal/emulator untuk smoke awal.

### Fase 2 — library native (±1 hari)
- [x] Urutan: screens → safe-area → gesture-handler → svg → webview →
      **nitro-modules** → mmkv 4 → **worklets** → **reanimated 4** → netinfo 12
      → blob-util → vector-icons → signature-canvas → navigation 7 (native
      7.5.1; stack+tabs 7.21.0) → camera-kit 18 → firebase 27.
- [x] `pnpm -r typecheck` (siap hadapi error TS 6 / types React 19) + `pnpm
      --filter lazisnu-collector-app test:coverage` hijau lokal (mock proxy
      reanimated di jest.setup.js seharusnya tetap aman — verifikasi).
- [ ] R8: build release lokal DITUNDA (tak ada signing key lokal; ditutup oleh
      dry-run release.yml di CI)
      (nitro/mmkv/firebase 35 membawa consumer-rules sendiri; rules lama kita
      tetap).

### Fase 3 — arbitrase CI + QA perangkat (±1 hari)
- [ ] CI hijau: `Test mobile` + `Build Android Debug` + `Build Staging APK`
      (ci.yml) — perhatikan apakah AGP 9 minta JDK 21 (naikkan `setup-java`
      di 3 titik bila perlu).
- [ ] **Kalibrasi gate ukuran APK** di `release.yml` dari ukuran aktual build
      baru (min/max MiB per ABI), lalu **dry-run release.yml**
      (`workflow_dispatch` + `dry_run=true`) sampai hijau.
- [ ] Emulator (arm64): login/OTP, daftar tugas + **reorder (draggable)**,
      kamera scan, **QR dari galeri (modul native kustom!)**, tanda tangan,
      history, update modal.
- [ ] QA perangkat fisik (checklist): login/OTP; FCM masuk; crashlytics
      terkirim; scan kamera; **decode QR galeri**; tanda tangan 2-HP; cache
      offline mmkv (termasuk device dengan data lama → jalur `recrypt`);
      background sync; navigasi dalam; **edge-to-edge** (header/tab bar/keyboard
      di Android 15+); **back gesture/predictive back**.
- [ ] **Uji jalur rilis aktual**: install v1.2.0 produksi → trigger modal
      update → unduh APK baru → install overwrite → data (MMKV offline queue,
      keychain token) utuh.
- [ ] Deploy staging (sebar APK staging ke petugas uji) → pantau crashlytics
      24–48 jam bebas crash baru.

### Fase 4 — penutupan keamanan & rilis
- [x] `pnpm why node-forge` → kosong; `pnpm audit` → **3 temuan** (esbuild,
      ip-address, uuid — semua moderate; fast-xml-parser ikut hilang).
- [x] `node scripts/audit-baseline.mjs --update` → basis 7 → **3** (node-forge
      GHSA-86w9-cpqp-85rv + image-size GHSA-5p2g-fcmc-qvqq & GHSA-w3rx-r6r6-pgpr
      terpangkas); alert GitHub tertutup oleh rescan.
- [ ] Hapus catatan moot (image-size, node-forge) dari dokumen terkait;
      perbarui skill ci-cd-investigation dengan pelajaran upgrade.
- [ ] Rilis: `node scripts/release-bump.mjs 1.3.0 --version-code 29
      --changelog "..." --publish` → tag v1.3.0 → release.yml (2 APK per-ABI →
      R2 → verifikasi URL → dispatch ci.yml) — **setelah** QA + masa pantau
      staging lolos.

## Rollback
Tag `pre-upgrade-rn-0.88` + APK pembanding = revert ke state lama kapan pun
selama staging belum dirilis ke produksi. Produksi hanya setelah QA lolos dan
pemantauan crashlytics bersih. Produksi v1.2.0 tetap hidup di
`apk.lazisnu.site`; backend tidak berubah (upgrade murni client).
