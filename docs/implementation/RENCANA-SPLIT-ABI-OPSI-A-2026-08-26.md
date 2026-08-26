# Rencana Implementasi — Split APK per Arsitektur (Opsi A: 2 build + auto-pick)

**Tanggal:** 2026-08-26 · **Status:** RENCANA (belum dieksekusi) · **Disusun oleh:** Hermes (untuk Bagus Darmwan)

> Opsi A = rilis menghasilkan **3 artefak** (arm64-v8a, armeabi-v7a, universal),
> aplikasi **mendeteksi CPU sendiri** dan mengunduh file yang tepat — petugas tetap
> 1 tombol "Perbarui", tanpa pertanyaan apa pun.

---

## 1. Ringkasan Eksekutif

| Item | Keputusan |
|---|---|
| Artefak per rilis | 3 APK: `lazisnu-<ver>-arm64.apk`, `lazisnu-<ver>-armv7.apk`, `lazisnu-<ver>.apk` (universal) |
| Ukuran unduhan petugas | ±30 MB (arm64) — dari 40,5 MB saat ini (~25% lebih ringan) |
| Pemilihan file | **Otomatis oleh aplikasi** (modul native kecil, ~40 baris Kotlin) — tanpa input petugas |
| Cara membangun | **2 build EAS terpisah** (1 ABI per build) — BUKAN gradle `splits` (sumber saga `.tar.gz`) |
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
| 1 | **Splits + EAS internal → `.tar.gz`** (petugas tak bisa 1-klik) | DILARANG gradle `splits`. Tiap build EAS hanya 1 ABI (via `-PabiFilter`) → 1 build = 1 APK tanpa zip. **Gate verifikasi:** nama artefak harus `.apk` (bukan `.tar.gz`) sebelum unggah |
| 2 | `versionName` ekspresi → dibaca literal | Tetap string literal di build.gradle; `-PabiFilter` TIDAK menyentuh versionName/versionCode |
| 3 | **Satu perubahan infrastruktur per build** (retro #6) | Opsi A TIDAK dicampur dengan editan aplikasi. v1.1.2 = editan (jalur lama); v1.1.3 = Opsi A saja |
| 4 | **Bukti sebelum lanjut** (retro #7) | Step verifikasi per artefak di release.yml: HTTP 200 + ukuran ±30 MB + `unzip -l` menunjukkan hanya 1 direktori `lib/<abi>` (bukan 2) — sebelum dispatch deploy |
| 5 | **Stop-flag eksplisit** (retro #8) | Dikonversi menjadi aturan biaya: gagal 2× berturut dengan sebab baru → hentikan, rilis universal-only, evaluasi biaya (2× build ≈ 2× antrean EAS per rilis) |
| 6 | Counter versionCode remote tak sinkron (vc "terbakar") | Sudah ditutup permanen: `appVersionSource: local` + `autoIncrement: false` (commit 56ab4c3) — tidak diubah lagi |
| 7 | Deploy staging tabrakan (2026-08-25) | Bukan ranah desain ini; concurrency guard sudah terpasang di ci.yml & release.yml |

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

**`mobileRelease.json`** (+ `apkUrls`, camelCase internal seperti `apkUrl`):
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
**`version.ts`** — zod schema: tambah `apkUrls: z.object({arm64: z.string().url(), armv7: z.string().url()})` (wajib di sisi server mulai v1.1.3; wire tetap snake_case via serializer → `apk_urls`).

**Tes:** `__tests__/mobile-version.integration.test.ts` — assert `apk_url` ADA dan `apk_urls.arm64`/`armv7` mengarah ke `apk.lazisnu.site`.

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

**Tes:** `__tests__/services/updates/resolveApkUrl.test.ts` — 4 kasus: arm64→arm64, armv7→armv7, ABI null→universal, ABI `x86`→universal. **Tidak ada perubahan UI** — modal tetap persis seperti sekarang (alur dalam-aplikasi, satu tombol).

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
    - checkout
    - pilih profile: universal → "production" | lain → "production-arm64"/"production-armv7"
    - eas build --wait --json → 1 APK; **cek nama artefak *.apk (bukan .tar.gz) → TOKSIK, gagal**
    - unduh → unzip -l | grep lib/ → HARUS tepat 1 direktori lib/<abi> (universal → 2)
    - ukuran: arm* ±25–35 MB → tawaran luar jangkauan = gagal (fail-fast)
    - unggah R2: lazisnu-<ver>-arm64.apk / -armv7.apk / lazisnu-<ver>.apk
    - verifikasi publik: curl 200 + size_download > 20 MB ×3
  trigger-deploy:              # needs: semua matrix selesai hijau
    - gh workflow run ci.yml --ref <tag>   (fail-closed: 1 artefak gagal = tidak ada deploy)
```

### 5.H `scripts/release-bump.mjs` — TIDAK BERUBAH

versionCode tetap satu angka (mis. 21) yang dirilis sebagai 3 artefak. Hanya komentar header yang diperbarui menjelaskan 3 nama file hasil.

---

## 6. Urutan Rilis (penting — pelajaran retro #6)

| Rilis | Isi | Jalur distribusi |
|---|---|---|
| **v1.1.2** | Editan user (kode aplikasi) | Jalur lama + R2 universal (pipeline Opsi B yang SUDAH teruji hari ini) |
| **v1.1.3** | Opsi A (split + auto-pick) | release.yml versi matrix — perubahan infrastruktur MURNI, tidak dicampur fitur |

Kalau editan user belum siap saat v1.1.2: rilis v1.1.2 diundur, v1.1.3 = Opsi A + editan sekaligus HANYA bila user setuju risiko (tidak direkomendasikan).

---

## 7. Verifikasi per Gate

| Gate | Bukti | Kapan |
|---|---|---|
| G1 | Instal `AbiModule` ke debug APK → `NativeModules.AbiModule.primaryAbi` = "arm64-v8a" di HP uji | Sebelum CI diubah |
| G2 | `pnpm --filter lazisnu-collector-app test` hijau (resolveApkUrl 4 kasus + suite lama) | Lokal |
| G3 | Backend integration test hijau (schema apk_urls) | Lokal + CI |
| G4 | 1× build per-ABI manual (eas profile baru) → artefak `.apk` tunggal, `unzip -l` hanya `lib/arm64-v8a/` | Pra-rilis v1.1.3 |
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
| Rollback | File APK lama TIDAK dihapus dari R2; kembalikan `mobileRelease.json` ke rilis sebelumnya + tag lama → deploy ulang (jalur ci.yml terbukti) |

## 9. Checklist Eksekusi (urut)

- [ ] 1. Buat `AbiModule.kt` + `AbiPackage.kt` + Daftar `MainApplication.kt` (Gate G1)
- [ ] 2. `deviceAbi.ts` + `resolveApkUrl.ts` + tes (Gate G2) → commit (kode saja, CI hijau)
- [ ] 3. shared-types + backend schema + `mobileRelease.json` + tes integrasi (Gate G3) → commit
- [ ] 4. `build.gradle` parametrisasi + `gradle.properties` (default tak berubah) → build debug lokal hijau
- [ ] 5. eas.json: tambah profil `production-arm64`/`production-armv7` → 1× build percobaan tiap profil (Gate G4, ±30 menit; bukti `unzip -l`)
- [ ] 6. release.yml → matrix 3 artefak + gate `.apk`/ABI/ukuran; trigger-deploy fail-closed
- [ ] 7. Dokumen: retro lesson ditambahkan + RENCANA ini ditandai SELESAI setelah v1.1.3 rilis
- [ ] 8. Rilis v1.1.3 (1 perintah `release-bump.mjs --publish`) → Gate G5 → G6 (2 perangkat)
- [ ] 9. Laporkan biaya siklus aktual (antrean EAS) & putuskan: lanjut permanen atau kembali universal

## 10. Yang TIDAK berubah

- Alur UI modal update (tetap 1 tombol, dalam-aplikasi, tanpa browser).
- `appVersionSource: local`, concurrency guards, jalur deploy ci.yml, `release-bump.mjs` antar-muka.
- Distribusi via `apk.lazisnu.site` (R2) — hanya nama file yang bertambah 2 varian.
