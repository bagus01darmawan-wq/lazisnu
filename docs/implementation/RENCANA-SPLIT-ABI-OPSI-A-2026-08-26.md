# Rencana Implementasi — Split APK per Arsitektur (Opsi A: per-ABI + auto-pick)

**Tanggal:** 2026-08-26 · **Status:** RENCANA — desain matang (R1+R2), keystone empiris = Gate G4 · **Disusun oleh:** Hermes (untuk Bagus Darmwan)
**Revisi R1 (2026-08-26):** hasil review ulang ox-alpha — perbaikan F1–F4 + rekomendasi minor (lihat bagian 11).
**Revisi R2 (2026-08-26):** bedah sesi gagal split asli (`ses_fce66068…`) — pelajaran S1–S5 + kronologi bukti §3.A + log bagian 12.
**Sinkronisasi (2026-08-26):** §6 diperbarui — isi v1.1.2 kini pasti (statistik rentang + penguatan auth); backend sliding session live di staging, interaksi nol dengan pipeline rilis.

> Opsi A = rilis menghasilkan **3 artefak** (arm64-v8a, armeabi-v7a, universal),
> aplikasi **mendeteksi CPU sendiri** dan mengunduh file yang tepat — petugas tetap
> 1 tombol "Perbarui", tanpa pertanyaan apa pun.

---

## 1. Ringkasan Eksekutif

| Item | Keputusan |
|---|---|
| Artefak per rilis | 3 APK: `lazisnu-<ver>-arm64.apk`, `lazisnu-<ver>-armv7.apk`, `lazisnu-<ver>.apk` (universal) |
| Ukuran unduhan petugas | **TERKALIBRASI (trial CI 2026-08-26): arm64 = 28 MB** (29.293.431 B, −31% dari 40,5 MB) · armv7 = 22 MB (22.776.396 B, −46%) · universal tetap ±40,5 MB. Gate isi lib/ positif+negatif & tepat-1-artefak lolos kedua build (run `32937731538`) — angka final EAS dikonfirmasi ulang saat G4 resmi pasca-1 Sep |
| Pemilihan file | **Otomatis oleh aplikasi** (modul native kecil, ~40 baris Kotlin) — tanpa input petugas |
| Cara membangun | **3 build EAS per rilis** (arm64 + armv7 + universal; masing-masing 1 ABI / 2 ABI utk universal) — BUKAN gradle `splits` (sumber saga `.tar.gz`) |
| versionCode | Satu angka untuk keduanya (mis. 21) — aman: 2 APK beda ABI tidak pernah terpasang di perangkat yang sama |
| Kompatibilitas aplikasi lama | `apk_url` (universal) tetap dikirim → app v1.1.1 yang belum punya auto-pick tetap bisa unduh |
| Urutan rilis | **v1.1.2 = editan user saja (jalur lama, universal)** → **v1.1.3 = Opsi A** (satu perubahan infrastruktur per rilis, pelajaran retro #6) |
| Stop-flag | 2 kali kegagalan EAS per-ABI berturut tak terjelaskan → rilis berikutnya kembali universal-only |

---

## 2. Kenapa (dan kenapa tidak universal saja)

- Petugas kolektor di lapangan mengunduh APK lewat data seluler; 10 MB × puluhan HP per bulan = nyata.
- Pada 2026, hampir 100% HP Android = arm64-v8a. armeabi-v7a tetap disediakan untuk HP sangat tua.
- Universal tetap dibuat sebagai **jaring pengaman** (aplikasi lama v1.1.1 hanya tahu `apk_url`; perangkat ABI tak dikenal; fallback darurat).

---

## 3. Anti-Saga: setiap kegagalan lama vs mitigasi di desain ini

| # | Kegagalan saga lama (retro 2026-08-24/25) | Mitigasi WAJIB dalam desain ini |
|---|---|---|
| 1 | **Splits + EAS internal → `.tar.gz`** (petugas tak bisa 1-klik) | DILARANG gradle `splits`. Tiap build EAS hanya 1 ABI (via `-PabiFilter`) → 1 build = 1 APK tanpa zip. **Gate verifikasi:** nama artefak harus `.apk` (bukan `.tar.gz`) sebelum unggah. **Mengapa jalur ini lolos dari jerat tar.gz:** EAS hanya membungkus output ke arsip `.tar.gz` ketika SATU build menghasilkan LEBIH DARI SATU artefak (persis kasus splits: arm64+armv7+universal dalam satu build). Jalur Opsi A menjalankan build EAS TERPISAH yang masing-masing memancaskan tepat satu APK — tidak ada multi-artefak, tidak ada alasan pembungkusan |
| 2 | `versionName` ekspresi → dibaca literal | Tetap string literal di build.gradle; `-PabiFilter` TIDAK menyentuh versionName/versionCode. Konteks dari sesi lama: `appVersionSource` membuat EAS MEMBACA dan MENYUNTIKKAN nilai `versionName` sebagai teks mentah — ekspresi Groovy apa pun akan tampil literal di HP petugas. Tes penjaga `appVersionSync.test.ts` (build.gradle ↔ appConfig ↔ app.json) WAJIB dipertahankan dan tidak disentuh sepanjang eksekusi Opsi A |
| 3 | **Satu perubahan infrastruktur per build** (retro #6) | Opsi A TIDAK dicampur dengan editan aplikasi. v1.1.2 = editan (jalur lama); v1.1.3 = Opsi A saja. **Perluasan S3:** saga lama menghasilkan 12 kegagalan berturut justru karena split dieksekusi PARALEL dengan integrasi expo-updates ("sambil menunggu build, mulai tahap berikutnya"). Selama window eksekusi Opsi A: **DILARANG menyentuh infra lain** — termasuk membuka kembali expo-updates yang statusnya DITUNDA (`TUNDA-EXPO-UPDATES-2026-08-25.md`). Satu antrian, satu eksperimen |
| 4 | **Bukti sebelum lanjut** (retro #7) | Step verifikasi per artefak di release.yml: HTTP 200 + ukuran + gate isi `lib/` positif+negatif (F4) — sebelum dispatch deploy. **Metode dari sesi lama yang terbukti:** keputusan pembatalan split lahir dari MEMBANDINGKAN `artifacts.applicationArchiveUrl` antar build via `eas build:list --json`. Pola sama dipakai di G4/G5: simpan metadata JSON build sebagai lampiran bukti, jangan hanya status "FINISHED" |
| 5 | **Stop-flag eksplisit** (retro #8) | Dikonversi menjadi aturan biaya: gagal 2× berturut dengan sebab baru → hentikan, rilis universal-only, evaluasi biaya (2× build ≈ 2× antrean EAS per rilis) |
| 6 | Counter versionCode remote tak sinkron (vc "terbakar") | Sudah ditutup permanen: `appVersionSource: local` + `autoIncrement: false` (commit 56ab4c3) — tidak diubah lagi. **Peringatan S4:** blok warisan offset versionCode di build.gradle (:147-154) masih hidup — jika `splits` kembali aktif, ia diam-diam mengubah vc jadi `vc × 10 + N` (19 → 191!) tanpa error apa pun. Wajib DIHAPUS (M1), bukan sekadar dibiarkan nonaktif |
| 7 | Deploy staging tabrakan (2026-08-25) | Bukan ranah desain ini; concurrency guard sudah terpasang di ci.yml & release.yml |

### 3.A Kronologi singkat saga split (dari bedah sesi 2026-08-24, `ses_fce66068…`)

| Build | Commit | Hasil | Pelajaran |
|---|---|---|---|
| #3 | `a2b60b4` | `.apk`, v1.0.0 ✅ | Baseline normal |
| #4 | `dddf11f` | `.apk` ⚠️ versionName tampil `appConfig.version` | Bug versionName (ekspresi Groovy dibaca literal EAS) — TIDAK berkaitan split; attribution butuh bedah antar-build |
| #5 | `914eb85` | ❌ `.tar.gz` — split aktif | Gradle sukses 100%, status FINISHED — **kegagalan ada di lapisan distribusi EAS**, tak terlihat dari log build |
| #6 | `4641feb` | Gagal fase Gradle | Ditambah beban expo-updates paralel → 12 titik kegagalan berturut |

Kesimpulan yang menjadi fondasi desain Opsi A: (a) kegagalan split lama BUKAN gagal teknis gradle melainkan perilaku distribusi EAS — karena itu ganti mekanisme (build terpisah per ABI), bukan sekadar toggle flag yang sama; (b) dua eksperimen paralel merusak atribusi sebab-akibat; (c) verifikasi harus ke artefak fisik (nama/isi/ukuran), bukan status build.

---

## 4. Arsitektur Target

```
TAG v1.1.3 ──push──▶ release.yml (Opsi A)
                      │
              matrix: [arm64-v8a, armeabi-v7a]  +  universal
                      │
   ┌──────────────────┼──────────────────────┐
   │ EAS build         │ EAS build            │ EAS build
   │ profile prod-arm64│ prod-armv7           │ profile production
   │ -PabiFilter=…     │ -PabiFilter=…        │ (2 ABI, universal)
   │ 1 APK, ~30 MB     │ 1 APK, ~30 MB        │ 1 APK, ~40 MB
   └──────┬────────────┴───────┬──────────────┘
          ▼                    ▼                  ▼
   R2: lazisnu-1.1.3-arm64.apk  lazisnu-1.1.3-armv7.apk  lazisnu-1.1.3.apk
          │                        │                      │
          └────── verifikasi 3× (200, ukuran, 1-lib/<abi>) ├──────┘
                                        │
                                        ▼
                    dispatch ci.yml --ref v1.1.3 (deploy prod)
                                        │
                                        ▼
    GET /v1/mobile/version → { apk_url: universal, apk_urls: {arm64:…, armv7:…} }
                                        │
                                        ▼
   App 1.1.3: abi = NativeModules.AbiModule.abis[0]
      "arm64-v8a" → unduh lazisnu-1.1.3-arm64.apk  (petugas tetap 1 tombol)
      ABI tak dikenal / modul gagal → fallback lazisnu-1.1.3.apk (universal)
   App 1.1.1 (lama): hanya baca apk_url → universal → tetap bekerja
```

---

## 5. Perubahan Detail

### 5.A Native module deteksi ABI (Kotlin, mengikuti pola `qr/`)

**File baru:**
- `apps/mobile/android/app/src/main/java/com/lazisnucollectorapp/abi/AbiModule.kt`
- `apps/mobile/android/app/src/main/java/com/lazisnucollectorapp/abi/AbiPackage.kt`

**Edit:** `MainApplication.kt` — tambah `add(AbiPackage())` di blok `getPackages()` (sama seperti QrImageScannerPackage).

**AbiModule.kt (inti, ±40 baris):**
```kotlin
package com.lazisnucollectorapp.abi

import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class AbiModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "AbiModule"

  override fun getConstants(): Map<String, Any> =
    mapOf(
      // Hardcoded constants (no @ReactMethod) → bisa dibaca sinkron dari JS
      // tanpa promise, dan TIDAK bisa crash runtime (fail-safe).
      "supportedAbis" to Build.SUPPORTED_ABIS.toList(),
      "primaryAbi" to (Build.SUPPORTED_ABIS.firstOrNull() ?: ""),
    )
}
```
**Keputusan desain:** pakai `getConstants()` (bukan `@ReactMethod`+Promise) supaya pemanggilan sinkron dan bebas race; `primaryAbi` = `SUPPORTED_ABIS[0]` = ABI yang dipakai untuk memuat app saat ini → persis ABI yang bisa diinstal di perangkat ini.

**JS helper:** `apps/mobile/src/services/updates/deviceAbi.ts`
```ts
import {NativeModules, Platform} from 'react-native';

export function getDeviceAbi(): string | null {
  if (Platform.OS !== 'android') return null;
  const abi = NativeModules.AbiModule?.primaryAbi;
  return typeof abi === 'string' && abi.length > 0 ? abi : null;
}
```

### 5.B Kontrak data — `packages/shared-types/src/index.ts`

```ts
export interface MobileVersionInfo {
  version: string;
  version_code: number;
  apk_url: string;                        // UNIVERSAL — wajib (kompat app lama)
  apk_urls?: { arm64: string; armv7: string };   // OPSIONAL (fitur lama)
  changelog: string;
  minimum_version_code: number;
}
```
Field opsional → app lama yang mengabaikannya tidak terpengaruh; kontrak tetap backward-compatible.

### 5.C Backend — `apps/backend/src/routes/mobile/`

**`mobileRelease.json`** (+ `apkUrls`, camelCase internal seperti `apkUrl`) — **diisi hanya saat bump v1.1.3**, bukan saat commit langkah pengembangan:
```json
{
  "version": "1.1.3",
  "versionCode": 21,
  "apkUrl": "https://apk.lazisnu.site/lazisnu-1.1.3.apk",
  "apkUrls": {
    "arm64": "https://apk.lazisnu.site/lazisnu-1.1.3-arm64.apk",
    "armv7": "https://apk.lazisnu.site/lazisnu-1.1.3-armv7.apk"
  },
  "changelog": "...",
  "minimumVersionCode": 0
}
```
**`version.ts`** — zod schema: tambah `apkUrls: z.object({arm64: z.string().url(), armv7: z.string().url()}).optional()`.

> ⚠️ **F1 — WAJIB `.optional()`.** `mobileReleaseSchema.parse()` jalan saat module load (fail-fast: JSON rusak = server tidak start). Kalau field ini WAJIB sejak commit langkah 3, semua deploy staging/prod dari main selama window pengembangan memakai json v1.1.2 tanpa `apkUrls` → **crash loop production**. Sebaliknya, mengisi URL v1.1.3 lebih awal di json membuat petugas membaca URL yang filenya belum ada (404) — dan `resolveApkUrl` tidak mengecek keberadaan file. Karena itu: schema opsional (endpoint hanya cermin json), json diisi tepat saat bump v1.1.3.

Wire tetap snake_case via serializer (`serializeOutput` terbukti rekursif — nested `apkUrls` → `apk_urls`, key `arm64`/`armv7` tanpa huruf besar tak berubah).

**Tes:** `__tests__/mobile-version.integration.test.ts` — dua skenario: (a) json dengan `apkUrls` → assert `apk_urls.arm64`/`armv7` mengarah ke `apk.lazisnu.site`; (b) json TANPA `apkUrls` → endpoint tetap 200 dan `apk_urls` absen (kompatibilitas v1.1.2).

### 5.D Mobile — pemilih URL (pure function, teruji)

**Baru:** `apps/mobile/src/services/updates/resolveApkUrl.ts`
```ts
export function resolveApkUrl(release: MobileVersionInfo, deviceAbi: string | null): string {
  const map = release.apk_urls;
  if (map && deviceAbi === 'arm64-v8a' && map.arm64) return map.arm64;
  if (map && deviceAbi === 'armeabi-v7a' && map.armv7) return map.armv7;
  return release.apk_url;   // fallback universal (semua kasus lain)
}
```
**Edit:** `apps/mobile/src/stores/useUpdateStore.ts` baris ±103 — `downloadApk(releaseInfo.apk_url, …)` → `downloadApk(resolveApkUrl(releaseInfo, getDeviceAbi()), …)`.

**Tes:** `src/services/updates/resolveApkUrl.test.ts` — co-located di samping source sesuai konvensi repo (`versionCheck.test.ts`); 4 kasus: arm64→arm64, armv7→armv7, ABI null→universal, ABI `x86`→universal. **Tidak ada perubahan UI** — modal tetap persis seperti sekarang (alur dalam-aplikasi, satu tombol).

### 5.E Build — `build.gradle` + `gradle.properties`

**`apps/mobile/android/app/build.gradle`** — parametrisasi (default = status quo, tidak merusak build lokal):
```groovy
// ABI filter: default 2 ABI (build lokal/universal). Build per-ABI via
// -PabiFilter=arm64-v8a (dipakai release.yml / eas.json profil tersendiri).
def abiFilter = project.findProperty('abiFilter') ?: 'armeabi-v7a,arm64-v8a'
...
ndk {
    abiFilters abiFilter.split(',')
}
```
**Wajib sekalian (M1): HAPUS kode mati era saga** — blok `splits { abi { … } }` (build.gradle:136-143) dan blok offset `abiVersionCode` (:144-152). Saat ini memang nonaktif (`def enableSeparateBuildPerCPUArchitecture = false`, :68), tapi selama masih ada, saklar saga `.tar.gz` bisa tersentuh lagi. Dihapus = mustahil terulang.

**`gradle.properties`** — biarkan `reactNativeArchitectures=armeabi-v7a,arm64-v8a` sebagai default; release.yml mengirim `-PreactNativeArchitectures=<satu-ABI>` (sudah didukung, lihat komentar baris 29).

### 5.F EAS — `apps/mobile/eas.json` (tanpa `splits`!)

```json
"production-arm64": {
  "distribution": "internal",
  "autoIncrement": false,
  "android": {
    "buildType": "apk",
    "gradleCommand": ":app:assembleRelease -PabiFilter=arm64-v8a -PreactNativeArchitectures=arm64-v8a"
  },
  "env": { "API_URL": "https://api.lazisnu.site" }
},
"production-armv7": { … sama, "-PabiFilter=armeabi-v7a -PreactNativeArchitectures=armeabi-v7a" }
```
- `appVersionSource: local` TETAP → versionCode/versionName dari build.gradle (kedua build memakai versionCode yang sama — legal untuk APK beda ABI, dan perangkat hanya melihat satu).
- TIDAK ada `splits` → TIDAK ada `.tar.gz`. Gate: nama artefak wajib `.apk`.

### 5.G CI — `.github/workflows/release.yml` (modif)

```
jobs:
  build-and-upload:            # matrix: ABI + universal (3 komb)
    strategy.matrix.abi: [arm64-v8a, armeabi-v7a, universal]
    timeout-minutes: 120       # ⚠️ naik dari 90: stop-flag menuntut evaluasi kegagalan
                               #    lambat — jangan dibunuh GitHub tepat di ambang 90 mnt
    - checkout
    - pilih profile: universal → "production" | lain → "production-arm64"/"production-armv7"
    - eas build --wait --json → 1 APK; **cek nama artefak *.apk (bukan .tar.gz) → TOKSIK, gagal**
      ⚠️ S2: PIN versi eas-cli (mis. `npx eas-cli@<versi>`), JANGAN `@latest`.
      Saga lama: CLI 21.4 menolak konfigurasi baru dan memaksa upgrade mendadak
      di tengah eksperimen. `@latest` = target bergerak — build G4 dan rilis
      bisa kena CLI berbeda. Catat versi yang terbukti di G4 → hardcode VERSI
      YANG SAMA di release.yml matrix
    - unduh → verifikasi isi lib/ POSITIF+NEGATIF eksplisit (F4):
        arm64 : grep 'lib/arm64-v8a/' ADA  && grep 'lib/armeabi-v7a/' KOSONG
        armv7 : grep 'lib/armeabi-v7a/' ADA && grep 'lib/arm64-v8a/'  KOSONG
        univ. : KEDUA direktori ADA
      ("tepat 1 direktori" saja TIDAK cukup — build armv7 yang salah bangun
       jadi arm64 tetap lolos pola itu)
    - ukuran: arm64 ±25–31 MB · armv7 ±20–25 MB (terkalibrasi trial 2026-08-26: 28/22 MB) → di luar jangkauan = gagal (fail-fast)
    - unggah R2: lazisnu-<ver>-arm64.apk / -armv7.apk / lazisnu-<ver>.apk
    - verifikasi publik: curl 200 + size_download > 20 MB ×3
  trigger-deploy:              # needs: semua matrix selesai hijau
    - gh workflow run ci.yml --ref <tag>   (fail-closed: 1 artefak gagal = tidak ada deploy)
```

### 5.H `scripts/release-bump.mjs` — BERUBAH MINIMAL (+5 baris, teruji)

versionCode tetap satu angka (mis. 21) yang dirilis sebagai 3 artefak. Hanya komentar header yang diperbarui menjelaskan 3 nama file hasil.

> ⚠️ **F2 — jebakan senyap pada desain awal "TIDAK BERUBAH".** Script mem-preserve key tambahan json (JSON.parse → mutate → stringify), jadi `apkUrls` pre-committed selamat — TAPI `apkUrl` ditulis ulang otomatis mengikuti versi baru sedangkan `apkUrls` tidak. Skenario nyata: rilis v1.1.4 lupa update manual → petugas arm64 selamanya diarahkan ke APK v1.1.3, tanpa error apa pun.

**Solusi (wajib):** tambahkan setelah baris `release.apkUrl = ...`:
```js
if (release.apkUrls) {
  release.apkUrls.arm64 = `https://apk.lazisnu.site/lazisnu-${version}-arm64.apk`;
  release.apkUrls.armv7 = `https://apk.lazisnu.site/lazisnu-${version}-armv7.apk`;
}
```
Dengan ini, keberadaan `apkUrls` di json = saklar Opsi A: rilis v1.1.2 (tanpa key) berjalan persis seperti sekarang; v1.1.3+ otomatis sinkron 3 URL. Dry-run wajib diverifikasi sebelum publish.

---

## 6. Urutan Rilis (penting — pelajaran retro #6)

| Rilis | Isi | Jalur distribusi |
|---|---|---|
| **v1.1.2** | ✅ **SUDAH RILIS (2026-08-26)**: statistik rentang tanggal + sliding session + polish UI + adaptive icon — APK 41 MB di `apk.lazisnu.site`, deploy prod blue-green sukses | ✅ Terkirim via **Gradle-CI runner** (kuota EAS terbatas; alur R2 + deploy identik) |
| **v1.1.3** | Opsi A (split + auto-pick) | release.yml versi matrix — perubahan infrastruktur MURNI, tidak dicampur fitur |

Catatan sinkronisasi 2026-08-26 (pasca-rilis v1.1.2): backend sliding session
LIVE production sejak rilis ini; mesin build rilis juga sudah pindah ke
Gradle-CI (release.yml dirombak, terbukti 2×: dry-run + rilis nyata).
Interaksi Opsi A: nol — pipeline matrix ke depan tinggal disusun di jalur CI,
konfirmasi resmi EAS pasca-1 Sep tinggal opsional.

Kalau editan tambahan muncul setelah v1.1.2 rilis: masukkan ke v1.1.4, JANGAN
digabung ke v1.1.3 yang isinya Opsi A murni (retro #6).

---

## 7. Verifikasi per Gate

| Gate | Bukti | Kapan |
|---|---|---|
| G1 | Instal `AbiModule` ke debug APK → `NativeModules.AbiModule.primaryAbi` = "arm64-v8a" di HP uji | Sebelum CI diubah |
| G2 | `pnpm --filter lazisnu-collector-app test` hijau (`resolveApkUrl.test.ts` co-located, 4 kasus + suite lama) | Lokal |
| G3 | Backend integration test hijau (schema `apk_urls` opsional: dengan & tanpa key) | Lokal + CI |
| G4 | 1× build per-ABI manual (eas profile baru) → artefak `.apk` tunggal, gate positif+negatif lolos, **catat ukuran aktual → kalibrasi angka hemat di ringkasan & rentang ukuran CI** | Pra-rilis v1.1.3 |
| G5 | Rilis penuh v1.1.3 → 3 artefak 200 di `apk.lazisnu.site` → deploy prod → endpoint mengembalikan `apk_urls` | Rilis |
| G6 | Uji HP tua (armv7) + HP modern: update 1-tombol sukses, terinstal versi benar | Setelah rilis, 2 perangkat |

## 8. Risiko & Jaring Pengaman

| Risiko | Mitigasi |
|---|---|
| Petugas tak sengaja unduh file salah | Tidak mungkin: aplikasi memilih sendiri; apk_urls hanya dibaca aplikasi, tidak ditampilkan |
| HP lama tak dikenal (ABI aneh) | Fallback universal; app lama v1.1.1 → apk_url universal |
| Modul native bermasalah | `getConstants()` tidak melempar error; helper `?.` + fallback universal |
| EAS tar.gz terulang | Dilarang `splits` + gate artefak `.apk` di workflow (TOKSIK → gagal) |
| 2–3× build = antrean EAS lebih lama (±45–75 menit/rilis) | Diterima; stop-flag #2: jika 2 rilis berturut melebihi 90 menit → evaluasi kembali |
| vc sama untuk 2 APK | Aman (ABI beda tidak pernah berdekatan di perangkat); jangan gunakan `splits` (butuh vc unik per ABI) |
| Signature beda antar 3 build EAS → install-over gagal (M4) | Ketiga build memakai EAS credentials store yang sama (default) → keystore identik. **Larangan eksplisit: JANGAN regenerate credentials di antara build** — catat di checklist eksekusi |
| Rilis berikutnya lupa sinkron `apkUrls` → petugas arm64 terjebak versi lama diam-diam (F2) | Ditutup oleh perubahan release-bump.mjs (bagian 5.H): URL ikut versi otomatis |
| Rollback | File APK lama TIDAK dihapus dari R2; kembalikan `mobileRelease.json` ke rilis sebelumnya + tag lama → deploy ulang (jalur ci.yml terbukti) |

## 9. Checklist Eksekusi (urut)

- [ ] 1. Buat `AbiModule.kt` + `AbiPackage.kt` + Daftar `MainApplication.kt` (Gate G1)
- [ ] 2. `deviceAbi.ts` + `resolveApkUrl.ts` + tes co-located (Gate G2) → commit (kode saja, CI hijau)
- [ ] 3. shared-types (`apk_urls?` opsional) + backend schema `.optional()` + **tes integrasi 2 skenario** (Gate G3) → commit — json v1.1.2 TIDAK disentuh di langkah ini (F1)
- [x] 4. `build.gradle` parametrisasi (`-PabiFilter`, default 2 ABI arm = status quo) + **HAPUS blok `splits` & offset `abiVersionCode` (M1)** → ✅ 2026-08-26 tervalidasi CI: job Build Android Debug APK hijau (commit `219b077`)
- [x] 5.a eas.json: profil `production-arm64`/`production-armv7` TERPASANG (commit `219b077`)
- [ ] 5.b **Gate G4 — 1× build percobaan tiap profil** (±30 menit masing-masing; bukti wajib disimpan: artefak `.apk` tunggal, gate positif+negatif `lib/`, ukuran aktual → kalibrasi §1, metadata `eas build:list --json` + versi eas-cli (S1/S2))
  - ✅ **2026-08-26: G4-EQUIVALENT lolos via trial CI** (Opsi B, run `32937731538`, workflow sementara `g4-trial-build.yml`) — arm64: apk=1 archive=0, gate ABI lolos, **28 MB**; armv7: apk=1 archive=0, gate ABI lolos, **22 MB**. Menutup pertanyaan sisi Gradle (satu filter = satu APK) + kalibrasi ukuran.
  - ⛔ Sisa EAS-resmi: kuota Free Agustus habis; reset Sel 01 Sep. Konfirmasi ulang via EAS (jalur + versi eas-cli + metadata JSON) — gerbang `.apk` di release.yml tetap fail-closed sebagai jaring pengaman
- [ ] 5.b **JANGAN memulai pekerjaan infra lain selama window Opsi A** — khususnya expo-updates yang ditunda (`TUNDA-EXPO-UPDATES-2026-08-25.md`) tetap tertunda sampai v1.1.3 tuntas (S3)
- [ ] 6a. `release-bump.mjs`: sinkronisasi otomatis `apkUrls` ikut versi (bagian 5.H) + dry-run diverifikasi (F2)
- [ ] 6b. release.yml → matrix 3 artefak + gate `.apk`/ABI positif+negatif/ukuran terkalibrasi + timeout 120 mnt; trigger-deploy fail-closed
- [ ] 7. Bump v1.1.3: `release-bump.mjs` menulis `apkUrls` ke json pertama kali → verifikasi endpoint staging mengembalikan `apk_urls`
- [ ] 8. Rilis v1.1.3 (1 perintah `--publish`) → Gate G5 → G6 (2 perangkat) → dokumen retro + tandai rencana SELESAI
- [ ] 9. Laporkan biaya siklus aktual (antrean EAS) & putuskan: lanjut permanen atau kembali universal

> Catatan M4: seluruh build percobaan & rilis memakai EAS credentials store yang sama — dilarang regenerate credentials di antara langkah 5–8.

## 10. Yang TIDAK berubah

- Alur UI modal update (tetap 1 tombol, dalam-aplikasi, tanpa browser).
- `appVersionSource: local`, concurrency guards, jalur deploy ci.yml, antar-muka perintah `release-bump.mjs` (isi script berubah minimal — bagian 5.H).
- Distribusi via `apk.lazisnu.site` (R2) — hanya nama file yang bertambah 2 varian.

## 11. Log Revisi R1 (2026-08-26) — hasil review ulang

Review memverifikasi setiap klaim rencana langsung ke kode sumber. Yang terbukti BENAR: serializer rekursif (`apkUrls` → `apk_urls`), titik edit useUpdateStore.ts:103, `newArchEnabled=false` → `getConstants()` valid, versionCode sama legal utk sideload, kebutuhan ganda `-PabiFilter` + `-PreactNativeArchitectures`, struktur release.yml siap matrix.

Temuan yang diperbaiki di revisi ini:

| ID | Temuan | Perbaikan |
|----|--------|-----------|
| F1 | Schema zod `apkUrls` WAJIB + fail-fast boot = crash loop production selama window pengembangan; sebaliknya URL prematur = petugas dapat 404 | Schema `.optional()`; json diisi hanya saat bump v1.1.3; tes integrasi 2 skenario (dengan/tanpa key) — §5.C |
| F2 | "release-bump TIDAK BERUBAH" menyimpan jebakan: `apkUrl` ikut versi otomatis, `apkUrls` tidak → rilis berikutnya bisa diam-diam mengarahkan petugas arm64 ke versi lama selamanya | Script berubah minimal (+5 baris): `apkUrls` ikut versi otomatis bila key ada — §5.H |
| F3 | Estimasi hemat ±30 MB keliru: universal saat ini sudah 2 ABI, split hanya membuang ±setengah `lib/` | Target direvisi ±33–36 MB; angka final wajib kalibrasi di G4 sebelum diklaim — §1, §5.G, G4 |
| F4 | Gate "tepat 1 direktori lib/<abi>" bisa lolos walau armv7 salah bangun jadi arm64 | Gate positif+negatif eksplisit per artefak — §5.G |
| M1 | Blok `splits` + offset `abiVersionCode` = kode mati era saga yang masih bisa dinyalakan | Dihapus sekalian saat parametrisasi build.gradle — §5.E |
| M2 | Lokasi test menyimpang konvensi repo (test co-located) | `resolveApkUrl.test.ts` di samping source — §5.D |
| M3 | timeout-minutes 90 = stop-flag 90 menit → job dibunuh tepat sebelum sempat dievaluasi | Naik ke 120 menit — §5.G |
| M4 | Kontinuitas keystore antar 3 build belum dicatat; signature beda = install-over gagal | Larangan regenerate credentials dicatat di checklist & risiko — §8, §9 |
| M5 | Wording "2 build EAS" ambigu (total 3 build/rilis) | Ringkasan dikoreksi: 3 build EAS per rilis — §1 |

## 12. Log Revisi R2 (2026-08-26) — hasil bedah sesi gagal split (`ses_fce66068…`, 2026-08-24)

Sesi asli tempat percobaan split pertama terjadi dibedah utuh (512 pesan) untuk memastikan tidak ada pelajaran yang terlewat. Kronologi & buktinya kini terdokumentasi di §3.A. Tambahan aturan dari bedah:

| ID | Pelajaran dari sesi | Masuk ke rencana di |
|----|---------------------|---------------------|
| S1 | Build #5 status **FINISHED** tapi artefak `.tar.gz` — "build sukses ≠ artefak benar". Keputusan pembatalan lahir dari perbandingan `artifacts.applicationArchiveUrl` antar-build via `eas build:list --json` | Gate G4/G5 wajib melampirkan metadata JSON build sebagai bukti — §3 baris 4, checklist langkah 5 |
| S2 | eas-cli tua (21.4) menolak konfigurasi baru → upgrade mendadak 22.2 di tengah eksperimen; CI saat ini pakai `@latest` = target bergerak | Pin versi eas-cli: versi teruji di G4 → hardcode sama di release.yml — §5.G |
| S3 | Split dieksekusi PARALEL dengan integrasi expo-updates ("sambil menunggu build, mulai tahap berikutnya") → 12 kegagalan berturut, atribusi sebab kacau | Larangan eksplisit menyentuh infra lain (termasuk membuka expo-updates yang DITUNDA) selama window Opsi A — §3 baris 3, checklist langkah 5.b |
| S4 | Blok offset versionCode warisan (`vc × 10 + N`) ternyata masih hidup dan berbahaya: jika splits aktif lagi, vc berubah diam-diam 19 → 191 tanpa error; komentarnya juga stale (masih menyebut appVersionSource: remote) | M1 diperkuat dari "kode mati sebaiknya dihapus" menjadi "landmine yang WAJIB dihapus" — §3 baris 6 |
| S5 | Pasca-saga user diminta menganalisa sendiri apa yang disentuh — laporan per-file tidak tersedia real-time | Disiplin eksekusi: setiap langkah checklist mencatat file yang disentuh + commit hash (sudah terstruktur di §9) |
| — | Konfirmasi: anti-saga #2 (versionName literal) dan #6 (appVersionSource local) sudah menutup dua akar masalah sesi lama; tes penjaga `appVersionSync.test.ts` jangan disentuh selama eksekusi | §3 baris 2, §10 |
