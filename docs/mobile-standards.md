# Standar Aplikasi Mobile (Lazisnu Collector App)

Dokumen ini adalah **standar resmi** pengembangan aplikasi mobile `apps/mobile` (React Native + TypeScript, target Android). Berlaku untuk semua kontribusi baru; kode lama diselaraskan secara bertahap (lihat [Roadmap Penerapan](#6-roadmap-penerapan-bertahap)).

Dokumen ini menggunakan kata kewajiban ala **RFC 2119**: **WAJIB** (MUST), **JANGAN** (MUST NOT), **SEBAIKNYA** (SHOULD), **BOLEH** (MAY).

Revisi:
- 2026-08-22 (v1): standar awal.
- 2026-08-22 (v2): hasil audit kode — ditambah Bab 2 (Keamanan, mengacu OWASP MASVS), standar TS/ESLint/Prettier dinaikkan, standar rilis diperketat (signing, autoIncrement, targetSdk), ditambah Lampiran referensi eksternal. Temuan konkret audit ada di `docs/mobile-audit-2026-08-22.md`.
- 2026-08-22 (v3): keputusan distribusi — **sideload APK** (bukan Play Store / repo resmi F-Droid), build tetap lewat EAS. Butir Play-spesifik disesuaikan: Play Integrity dihapus total (anti-fraud sepenuhnya di backend), kebijakan targetSdk Play dicabut (turun jadi SEBAIKNYA), signing memakai keystore produksi sendiri di EAS credentials (tanpa Play App Signing), ditambah Bab 5.6 (Distribusi sideload).

Dokumen terkait yang menjadi satu paket standar:
- `docs/mobile-design-system/00-audit-dan-aturan.md` s/d `06-execution-checklist.md` — standar UI & komponen
- `docs/API_DOCUMENTATION.md` — kontrak API backend
- `packages/shared-types` — sumber tipe data API bersama
- `docs/mobile-audit-2026-08-22.md` — snapshot temuan audit terhadap standar ini

Urutan bab mengikuti prioritas: kode & arsitektur fondasi, lalu keamanan (aplikasi finansial), sisanya membangun di atasnya.

---

## 1. Kode & Arsitektur (Fondasi)

### 1.1 Struktur folder & aturan penempatan kode

```
src/
├── assets/        # gambar, font, file statis
├── components/    # komponen reusable lintas screen
├── config/        # konfigurasi runtime (env, konstanta app)
├── navigation/    # definisi navigator & routing
├── screens/       # satu file per screen, hanya menyusun komponen
├── services/      # semua I/O: API, storage, scanner, keamanan, offline
├── stores/        # state global Zustand, satu store per domain
├── theme/         # design tokens (satu-satunya sumber nilai visual)
└── utils/         # fungsi murni tanpa side-effect & tanpa dependensi RN berat
```

Aturan penempatan kode baru:

| Kode | Letak | Ciri |
|---|---|---|
| Fungsi murni (format, hitung, validasi) | `utils/` | Tidak memanggil API/storage, mudah di-unit-test |
| Akses API / native / storage | `services/` | Satu file per concern (mis. `api.ts`, `secureStorage.ts`) |
| State yang dibaca lintas screen | `stores/` | Zustand, prefiks `use...Store` |
| UI dipakai ≥ 2 screen | `components/` | Tidak tahu cara mendapatkan data (menerima props) |
| UI hanya untuk satu screen | di dalam file screen, atau subfolder `screens/<Nama>/` | Boleh diangkat ke `components/` saat terpakai kedua kalinya |

Larangan:
- Screen **JANGAN** memanggil `services/` API atau memodifikasi storage/queue secara langsung; wajib lewat aksi `stores/`, yang memanggil `services/`.
- `stores/` **JANGAN** berisi logika UI (stylesheet, navigasi). Store hanya data + aksi.
- `utils/` **JANGAN** mengimpor dari `services/` atau `stores/`.
- **Aturan domain finansial**: `offline_id` (idempotency key transaksi) WAJIB dibuat di layer service menggunakan sumber acak kriptografis (`crypto.getRandomValues` / `react-native-get-random-values`), JANGAN `Math.random()`, dan JANGAN dibuat di screen.
- **Validasi domain** (batas nominal, aturan konfirmasi) WAJIB berada di store/service, bukan hanya di screen — agar tidak terduplikasi bila ada jalur input lain.
- Fungsi bersama yang dipakai ≥ 2 screen (mis. format mata uang) WAJIB diekstrak ke satu util (`src/utils/format.ts`) — JANGAN duplikasi inline per screen.
- Komponen/ekspor yang tidak terpakai (dead code) JANGAN dibiarkan di `components/` — hapus atau pakai.

### 1.2 Konvensi penamaan

- Komponen/Screen: `PascalCase.tsx` (`DashboardScreen.tsx`, `CollectionCard.tsx`).
- Util/service/store: `camelCase.ts` (`formatCurrency.ts`), store dengan prefiks `use` (`useAuthStore.ts`).
- Konstanta: `SCREAMING_SNAKE_CASE`.
- Tipe/interface: `PascalCase`, prefiks `I` **tidak dipakai**.
- File test: `NamaFile.test.ts(x)`, boleh co-located di `src/` atau di `__tests__/` (keduanya WAJIB tertangkap runner — lihat Bab 4).

### 1.3 TypeScript — standar diperketat (v2)

- `strict` WAJIB aktif. `any` eksplisit **DILARANG** — rule `@typescript-eslint/no-explicit-any` WAJIB berstatus `error` di ESLint (lihat 1.6).
- Flag tambahan WAJIB ditambahkan ke `tsconfig.json` selagi tidak menghalangi build:
  - `noUncheckedIndexedAccess` (akses elemen array jadi `T | undefined`)
  - `noFallthroughCasesInSwitch`
  - `noImplicitOverride`
  Ditambahkan bertahap bila jumlah error besar; `exactOptionalPropertyTypes` BOLEH ditunda.
- Tipe request/response API **WAJIB** dari `@lazisnu/shared-types` — dilarang mendeklarasikan ulang tipe API di `apps/mobile`.
- `tsc --noEmit` harus lolos tanpa error sebelum merge.

### 1.4 Alur data standar

```
Screen → stores (aksi) → services (I/O) → backend/MMKV/Keychain
Screen ← stores (subscribe)
```

- **API**: semua lewat `src/services/api.ts` (satu klien, satu tempat error mapping & refresh token). Setiap request WAJIB punya **timeout** (`AbortController`) — request yang menggantung akan memblokir sync loop.
- **Kredensial**: hanya lewat `secureStorage.ts` / Keychain — JANGAN menyimpan token di MMKV biasa.
- **Offline**: operasi tulis saat offline WAJIB lewat `src/services/offline/`, dengan idempotency key (`offline_id`) yang divalidasi server (`ALREADY_SYNCED`).
- **Dependensi antar-store SEBAIKNYA** searah (auth → domain store); pemutusan circular dependency dengan `require()` dinamis adalah utang teknis yang WAJIB dicatat dan SEBAIKNYA dihapus saat refactoring.
- **State global**: Zustand saja; dilarang menambah library state lain.

### 1.5 Commit, PR, dan CHANGELOG

- **Commit**: Conventional Commits — `feat|fix|docs|chore|refactor|test(mobile): deskripsi`. Scope wajib agar mudah difilter di monorepo.
- **PR**: satu PR satu maksud; WAJIB lulus `lint`, `typecheck`, dan `test` (dijalankan CI — lihat Bab 5).
- **CHANGELOG**: riwayat rilis WAJIB dicatat di `CHANGELOG.md` root (atau `apps/mobile/CHANGELOG.md`) mengikuti format **Keep a Changelog 1.1**; entri ditambah per rilis (bukan per commit).

### 1.6 Tooling kode — standar diperketat (v2)

Status audit menemukan Prettier tidak berfungsi dan lint longgar. Standar berikut WAJIB:

1. **Prettier aktif**: file `.prettierrc.json` ada di `apps/mobile`, script `format` + `format:check` ada, dan `format:check` berjalan di CI. Rule `prettier/prettier` di ESLint BOLEH tetap off selama Prettier dijalankan terpisah (dua tool, dua tugas).
2. **ESLint diperketat** dari default `@react-native`:
   - `@typescript-eslint/no-explicit-any`: `error`
   - `react-hooks/exhaustive-deps`: kembalikan ke `error` (default base; jangan diturunkan ke `warn`)
   - `react-native/no-inline-styles`: aktif kembali selaras dengan aturan token (Bab 3)
   - Type-aware linting (`no-floating-promises`) SEBAIKNYA diaktifkan setelah parser project diaktifkan — penting untuk kode async RN.
3. **Pre-commit**: SEBAIKNYA pasang `lint-staged` (lint + format pada file yang diubah) — full check tetap di CI.
4. **`.editorconfig`** WAJIB ada di root repo (editor dasar konsisten sebelum Prettier bekerja).
5. **Versi Node** WAJIB konsisten antara `engines` root, `engines` mobile, dan CI (satu angka, mis. `>=20.9.0`).
6. **Hygiene**: artefak scaffolding kosong (mis. `apps/mobile/apps/`) JANGAN di-commit.

---

## 2. Keamanan (standar baru v2 — mengacu OWASP MASVS)

Aplikasi ini menangani **transaksi keuangan (infaq)**, sehingga keamanannya mengacu pada **OWASP MASVS** (Mobile Application Security Verification Standard) sebagai kerangka minimal. Standar berikut mengikat:

### 2.1 Penyimpanan data (MASVS-STORAGE)
- Token & data transaksi WAJIB tersimpan terenkripsi: MMKV terenkripsi dengan kunci di Android Keystore (pola `secureKey.ts`/`secureStorage.ts` saat ini) atau Keychain — pola ini adalah standar, JANGAN digantikan penyimpanan plain.
- Panjang kunci enkripsi data finansial SEBAIKNYA ≥ 128-bit (FIPS 197 AES-128). Deviasi 96-bit saat ini terdokumentasi; WAJIB dicabut saat upgrade dependensi memungkinkan.
- Wipe paksa saat Keychain gagal (pola saat ini untuk queue finansial) WAJIB dipertahankan.

### 2.2 Kriptografi (MASVS-CRYPTO)
- Penghasil acak untuk ID transaksi/token WAJIB kriptografis (`crypto.getRandomValues`), JANGAN `Math.random()`.

### 2.3 Jaringan (MASVS-NETWORK)
- Semua trafik produksi WAJIB HTTPS; cleartext hanya boleh di build debug (`usesCleartextTraffic` di manifest debug — pola saat ini sudah benar).
- Setiap request API WAJIB memiliki timeout.
- **Play Integrity tidak dipakai** (keputusan v3, jalur distribusi sideload): API proprietary Google, dan stub yang selalu sukses lebih berbahaya daripada tidak ada sama sekali. Verifikasi anti-fraud dilakukan sepenuhnya di backend; backend **JANGAN** menjadikan field integritas device sebagai syarat request.

### 2.4 Logging & data bocor (MASVS-PRIVACY / CODE)
- Log berisi metadata transaksi WAJIB di-belakang guard `__DEV__` (pola `devLog`); JANGAN ada `console.log` tanpa guard di jalur production.
- Token/refresh token JANGAN pernah masuk log — standar saat ini sudah benar, dipertahankan.

### 2.5 Autentikasi & sesi (MASVS-AUTH)
- Refresh token biometrik di Keychain dengan `BIOMETRY_ANY` + `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (pola saat ini) WAJIB dipertahankan.
- Keputusan desain yang melemahkan keamanan demi UX (logout biometrik tidak revoke token server; sesi offline memakai cache profil) BOLEH dipertahankan, tetapi WAJIB terdokumentasi eksplisit sebagai keputusan produk di dokumen ini atau threat model, dengan risikonya tertulis.

---

## 3. UI & Design System

`docs/mobile-design-system/` adalah **standar tunggal** UI. Aturan intinya:

1. **Design tokens adalah satu-satunya sumber nilai visual** (konsep design tokens ala W3C Design Tokens CG). Warna, spacing, radius, typography, shadow, dan ukuran komponen hanya boleh dari `src/theme/`. **DILARANG** hardcode warna/angka visual di StyleSheet — termasuk di dalam komponen reusable (pelanggar yang ada di audit WAJIB dibersihkan).
2. Blok alias "sementara" di `theme/colors.ts` untuk screen lama adalah utang yang WAJIB dihapus saat migrasi selesai — tidak boleh menambah alias baru.
3. **Komponen reusable** wajib dipakai bila tersedia — tidak membuat komponen sejenis yang baru.
4. **Migrasi screen lama** mengikuti urutan `03-migrasi-auth-screens.md` dan `04-migrasi-main-screens.md`; checklist di `06-execution-checklist.md` WAJIB dicentang saat pekerjaannya selesai (jangan dibiarkan basi).
5. Ikon hanya dari `react-native-vector-icons` set yang sudah dipakai; aset gambar hanya di `src/assets/`.
6. Ukuran file screen SEBAIKNYA ≤ 300 baris; lebih dari itu ekstrak subkomponen ke folder screen.
7. **Komponen sentuh BARU** WAJIB memakai `AppPressable` (`src/components/ui/AppPressable.tsx` — `Pressable` + feedback opacity; keputusan 2026-08-29). `TouchableOpacity` hanya untuk kode lama yang sudah ada; pemakaian baru di `src/components/ui/` kena warning lint (`no-restricted-syntax`).
8. **Daftar dinamis berpotensi >50 item** WAJIB memakai `FlatList` (virtualized), JANGAN `ScrollView`+`.map()`. Contoh referensi: `SyncIssuesSheet.tsx` — satu FlatList induk (baris interleave judul section → kartu → catatan sisa), batas tampilan 50 item per jenis + footer "…dan X lainnya".

---

## 4. Testing — standar diperketat (v2)

Runner: Jest + react-test-renderer. Aturan:

### 4.1 Konfigurasi (WAJIB)
- `testMatch` WAJIB menangkap test co-located di `src/` **dan** di `__tests__/`.
- Coverage WAJIB diukur: aktifkan `collectCoverage` + `coverageDirectory` di `jest.config.js`, dengan `coverageThreshold` global sederhana (mulai rendah, mis. lines 40%, naik bertahap) agar terlihat, bukan langsung mematok angka tinggi.

### 4.2 Kewajiban per lapisan

| Target | Kewajiban |
|---|---|
| `utils/` | 100% file punya unit test (fungsi murni, murah dites) |
| `stores/` | setiap store: minimal test happy-path + error-path per aksi. `useAuthStore` saat ini **belum** punya test — wajib ditambahkan (login/OTP/refresh/logout) |
| `services/` | `api.ts` (refresh single-flight, mapping error, timeout) dan `services/offline/sync.ts` (retry cap, quarantine, lock) WAJIB punya test — saat ini `sync.ts` di-mock penuh di regression test |
| `components/` | komponen reusable: render + interaksi dasar (sudah berjalan, dipertahankan) |
| `screens/` | opsional; prioritaskan screen dengan logika kompleks (Scan, Collection) |

### 4.3 Kasus wajib dites (dampak uang & data)
- **Format & konversi nominal infaq** — SEKALI di util bersama (`src/utils/format.ts`), bukan lima salinan per screen. Angka besar, desimal, nol.
- Flow offline: antrean tertulis saat offline → tersinkron saat online → tidak ada duplikat (pola `offlineFlowRegression.test.ts` adalah standar emas — test modul nyata dengan mock MMKV in-memory, bukan mock semua).
- Auth: penyimpanan/penghapusan token, kedaluwarsa sesi, path biometrik.

### 4.4 Kualitas asersi
- Test WAJIB memverifikasi perilaku (render output, pemanggilan aksi, state akhir). **DILARANG** asersi lemah berupa pencocokan string terhadap source code komponen.
- Test WAJIB deterministik (mock network/timer), tidak bergantung urutan eksekusi.

---

## 5. Proses Rilis & CI/CD — standar diperketat (v2)

### 5.1 Versioning
- `versionName` mengikuti **SemVer 2.0.0**: MAJOR = breaking, MINOR = fitur, PATCH = perbaikan. Naikkan di `apps/mobile/package.json` **dan** `android/app/build.gradle`.
- `versionCode` WAJIB naik setiap build rilis — ini **syarat Android untuk update** (berlaku di channel distribusi mana pun, termasuk sideload), bukan kebijakan toko. Mekanisme: `autoIncrement: true` di setiap profile `eas.json` (eas-cli 22+ hanya menerima boolean; notasi string `"versionCode"` dari dokumentasi EAS lama ditolak).

### 5.2 Build & signing
- **Release build DILARANG ditandatangani debug keystore** (kondisi saat ini). WAJIB: keystore produksi milik sendiri — dibuat satu kali, diunggah ke EAS credentials — dan `signingConfig` release tidak lagi menunjuk `signingConfigs.debug`. Tanpa Play App Signing, keystore ini adalah **identitas permanen aplikasi**: WAJIB dicadangkan terenkripsi di luar repo dan di luar EAS (lihat 5.6).
- **`targetSdk` SEBAIKNYA dijaga tidak terlalu tua** — jalur sideload tidak terikat kebijakan target API level Google Play. Android versi baru menolak memasang aplikasi dengan target sangat lama (Android 14 menolak target < API 23); naikkan `targetSdk` mengikuti upgrade React Native, bukan sebagai syarat rilis.
- **Minify/R8 WAJIB aktif untuk release** (`enableProguardInReleaseBuilds true`) dengan keep-rule yang diperlukan, dan hasilnya diverifikasi lewat smoke test pada APK/AAB rilis (bukan debug).

### 5.3 Checklist rilis (wajib berurutan)
1. `main` up-to-date, semua check CI hijau.
2. `lint`, `typecheck`, `test` lolos lokal.
3. Build release via EAS sukses; `versionCode` bertambah dari rilis sebelumnya. **File distribusi sideload WAJIB APK** — pakai profile yang menghasilkan APK (`internal-prod` saat ini). Catatan: profile `production` masih menghasilkan AAB (format Play Store yang tidak bisa dipasang langsung) dan perlu disesuaikan — lihat roadmap Fase 0.
4. Smoke test pada APK/AAB **rilis** (dengan minify aktif): login → OTP → dashboard → scan → catat koleksi → history → sinkron offline→online.
5. Verifikasi Crashlytics menerima event dari build tersebut (test crash).
6. Tambah entri `CHANGELOG.md` (format Keep a Changelog) berisi ringkasan perubahan sejak rilis terakhir.

### 5.4 CI (standar target — beberapa gap saat ini)
Job mobile di `.github/workflows/ci.yml` saat ini hanya menjalankan Jest. Standar WAJIB:
- Step **lint** dan **typecheck** ikut berjalan untuk perubahan mobile (kondisi `if` sekarang mengecualikan mobile — dua gerbang kualitas utama hilang).
- Tambah job **build android debug** (verifikasi Gradle build sehat; artifact tidak perlu di-upload).
- Aktifkan **cache pnpm** (`cache: 'pnpm'` di setup-node) untuk semua job.
- SEBAIKNYA: integrasi `eas build --non-interactive --profile preview` untuk PR besar (boleh manual trigger).

### 5.5 Environment & signing secrets
- Signing key hanya via EAS credentials — DILARANG menyimpan keystore/password di repo. Keystore produksi WAJIB juga punya cadangan terenkripsi di luar EAS (lihat 5.6).
- Konfigurasi lingkungan lewat env vars per profile EAS (`eas.json`); profil menjadi satu-satunya tempat nilai per lingkungan (prinsip Twelve-Factor Config).

### 5.6 Distribusi sideload (keputusan v3)

Aplikasi didistribusikan sebagai **APK yang dipasang langsung oleh kolektor** (sideload), bukan lewat toko aplikasi. Konsekuensi yang mengikat:

1. **File distribusi WAJIB APK, bukan AAB** — AAB adalah format Play Store dan tidak bisa dipasang langsung.
2. **Keystore produksi = identitas permanen aplikasi.** Tanpa Play App Signing, tidak ada pihak ketiga yang menyimpan kunci cadangan. WAJIB: cadangkan keystore + password di minimal 2 lokasi terpisah dan terenkripsi (mis. password manager + salinan offline), tercatat siapa yang dapat mengaksesnya. Keystore hilang = aplikasi tidak bisa di-update — kolektor harus uninstall (data antrean offline ikut terhapus) lalu memasang ulang sebagai aplikasi baru.
3. **Strategi Pembaruan Aplikasi (Update)**:
   - **Distribusi Awal**: File APK dibagikan langsung ke grup komunikasi kolektor/petugas (WhatsApp Group) untuk instalasi pertama kali.
   - **Pemberitahuan Versi APK Baru (In-App Update)**: SEBAIKNYA sediakan mekanisme pengecekan versi (endpoint `GET /v1/app/version` di backend + banner download APK di dashboard aplikasi) agar petugas tahu saat ada file APK rilis baru.
   - **Pembaruan Instan OTA (EAS Update)**: BOLEH memanfaatkan EAS Update (Over-The-Air) untuk perbaikan bug cepat (*hotfix*) dan penyempurnaan kode JavaScript/tampilan tanpa mengharuskan pengguna mengunduh ulang file APK.
4. **Panduan pemasangan** untuk kolektor (termasuk mengizinkan "install aplikasi dari sumber tidak dikenal") WAJIB tersedia sebagai dokumentasi.
5. **Keputusan sadar**: Crashlytics dan ML Kit (barcode) dipertahankan meskipun proprietary — tidak menjadi masalah untuk sideload karena HP kolektor umumnya punya Google Play Services. Konsekuensinya, aplikasi tidak akan lolos ke repo resmi F-Droid tanpa mengganti komponen ini; dicatat agar tidak dikira kelalaian.

---

## 6. Roadmap Penerapan Bertahap

**Fase 0 — Perbaikan blocking rilis (prioritas tertinggi, hasil audit)**
- [x] Ganti release signing dari debug keystore → keystore produksi sendiri di EAS credentials + cadangan terenkripsi (lihat 5.6).
- [x] Aktifkan `autoIncrement` versionCode di profile rilis EAS; naikkan versionName sesuai SemVer.
- [x] Hapus total stub Play Integrity di `services/security.ts`; pastikan backend tidak mensyaratkan field integritas device (keputusan v3).
- [x] Sesuaikan profile rilis EAS agar menghasilkan APK (ubah `production` ke `apk`, atau tetapkan `internal-prod` sebagai profile rilis resmi); hapus `submit.production` yang tak terpakai.
- [x] Tambah timeout (`AbortController`) pada `apiRequest` dan `refreshAccessToken`.

**Fase 1 — Kode & tooling**
- [x] Aktifkan Prettier (config + script + CI), `.editorconfig` root.
- [x] Naikkan ESLint: `no-explicit-any` error, `exhaustive-deps` kembali error.
- [x] Perbaiki pelanggaran layering: `HistoryScreen` (API langsung + mutasi queue), `ScanScreen` (service langsung + logic scan), pindahkan pembuatan `offline_id` ke service dengan crypto.
- [x] Ekstrak `formatCurrency` ke `src/utils/format.ts` (hapus 5 duplikat) + unit test.
- [x] Hapus artefak `apps/mobile/apps/`; [x] Samakan versi Node (engines vs CI).

**Fase 2 — UI & Design System**
- [x] Jalankan `06-execution-checklist.md` (centang yang benar-benar selesai; lanjutkan migrasi 03/04).
- [x] Bersihkan warna hardcoded (StatusBadge, TasksScreen) dan blok alias di `theme/colors.ts`.
- [x] Pecah screen >300 baris (Tasks 839, Scan 652, History 640) secara bertahap saat disentuh.

**Fase 3 — Testing & CI/CD**
- [x] Perbaiki `testMatch`, aktifkan coverage + threshold awal.
- [x] Tambah test: `useAuthStore`, `api.ts` (refresh/timeout), `sync.ts` (retry/quarantine/lock), `utils/format.ts`.
- [x] CI: lint + typecheck untuk mobile, job build android debug, cache pnpm.
- [x] Aktifkan minify/R8 release + smoke test rilis; buat `CHANGELOG.md` (Keep a Changelog).
- [x] Naikkan targetSdk mengikuti upgrade React Native (tidak ada batasan toko; cukup dijaga tidak terlalu tua — lihat 5.2).

---

## Lampiran A — Referensi Standar Eksternal

Standar/spesifikasi eksternal yang diadopsi dokumen ini:

| Standar | Mengatur | Referensi |
|---|---|---|
| **SemVer 2.0.0** | Versioning `versionName` (Bab 5.1) | https://semver.org/ |
| **Conventional Commits 1.0.0** | Format commit & scope PR (Bab 1.5) | https://www.conventionalcommits.org/ |
| **RFC 2119** | Kata kewajiban WAJIB/JANGAN/SEBAIKNYA di dokumen ini | https://www.rfc-editor.org/rfc/rfc2119 |
| **OWASP MASVS** | Keamanan aplikasi mobile — penyimpanan, kripto, jaringan, auth (Bab 2) | https://mas.owasp.org/MASVS/ |
| **NIST FIPS 197 (AES)** | Panjang kunci enkripsi minimum 128-bit (Bab 2.1) | https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.197.pdf |
| **W3C Design Tokens CG (draft)** | Konsep design tokens sebagai sumber tunggal nilai visual (Bab 3) | https://tr.designtokens.org/ |
| **Twelve-Factor App (III. Config)** | Konfigurasi via environment, bukan hardcoded (Bab 5.5) | https://12factor.net/config |
| **Keep a Changelog 1.1** | Format CHANGELOG.md (Bab 1.5, 5.3) | https://keepachangelog.com/en/1.1.0/ |
| **typescript-eslint (rekomendasi lint type-aware)** | Rule ESLint ketat + type-aware linting (Bab 1.6) | https://typescript-eslint.io/ |
| **Panduan versioning Android** | `versionCode`/`versionName` (Bab 5.1) | https://developer.android.com/studio/publish/versioning |
| **Penandatanganan aplikasi Android** | Release signing, larangan debug keystore, keystore sebagai identitas permanen (Bab 5.2, 5.6) | https://developer.android.com/studio/publish/app-signing |
| **Unicode CLDR / `Intl.NumberFormat`** | Format mata uang `id-ID` yang benar (Bab 4.3) | https://cldr.unicode.org/ |
| **RFC 9110 (HTTP Semantics) — idempotency** | Dasar desain idempotency sync offline (`offline_id`, `ALREADY_SYNCED`) (Bab 1.4) | https://www.rfc-editor.org/rfc/rfc9110 |
| **React Native Releases (support policy)** | Cadence upgrade RN & targetSdk (Bab 5.2, Fase 3) | https://reactnative.dev/releases |

Catatan cakupan: aplikasi ini berbasis React Native, sehingga **tidak** mengikuti standar UI Android native (Material Design 3) maupun Kotlin/Compose style guide; standar UI mengikuti design system internal yang dibangun di atas konsep design tokens.

---

*Terakhir diperbarui: 2026-08-22 (v3)*
