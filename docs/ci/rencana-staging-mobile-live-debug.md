# RENCANA — Staging Mobile via Live Debug (Metro Fast Refresh)

**Tanggal**: 2026-09-15
**Status**: DRAFT untuk tinjauan — **belum ada perubahan apa pun yang dieksekusi**
**Penanya**: Bagus Darmwan
**Pendahuluan**: Alternatif dari
`docs/ci/rencana-staging-mobile-sejajar-produksi.md` (APK staging via CI).

---

## 1. Ide utama

> *"Bagaimana jika CI workflow tetap seperti ini, sebagai gantinya APK preview
> tampil lewat debugging yang bisa langsung diedit secara live?"*

Intinya: **jangan bangun APK staging sama sekali**. Sebagai gantinya,
developer memakai Metro dev server + Fast Refresh — aplikasi terpasang **sekali**
(debug APK), lalu semua perubahan kode langsung terlihat di HP dalam ~1 detik,
tanpa rebuild Gradle, tanpa upload artifact.

CI workflow **tidak diubah sama sekali**. Yang diubah adalah cara kita
menguji mobile saat staging.

## 2. Apa yang memungkinkannya (verifikasi langsung)

| Komponen | Status sekarang | Sumber |
|---|---|---|
| Metro config monorepo (`watchFolders` + symlink) | ✅ sudah benar | `apps/mobile/metro.config.js` |
| RN CLI (`react-native start` / `run-android`) | ✅ tersedia | `apps/mobile/node_modules/.bin/react-native`, `package.json` script `start`/`android` |
| Android SDK + emulator image | ✅ terpasang | `local.properties` → SDK path; system-image `android-34/36` (google_apis) |
| Java 17 + JAVA_HOME | ✅ terpasang | `java -version` 17.0.19 |
| ADB (USB debugging ke HP fisik) | ✅ terpasang & teruji | `adb` v1.0.41; memory: "adb USB OK" |
| Babel inline `API_URL` | ✅ plugin aktif, whitelist `API_URL` | `apps/mobile/babel.config.js` |

**Tidak ada satu pun dari tabel di atas yang perlu diinstal atau dikonfigurasi
ulang** — semuanya sudah ada.

## 3. Cara kerja singkat

1. Pasang aplikasi **sekali** ke HP/emulator:
   ```bash
   cd apps/mobile
   API_URL=https://staging-api.lazisnu.site pnpm react-native run-android --variant debug
   ```
   `run-android` = build APK debug + install + start Metro.

2. Metro dev server menyajikan JS bundle dari host (komputer dev).
   Aplikasi di HP memuat bundle dari `http://<IP-host>:8081`.

3. Setiap perubahan file `.tsx`/`.ts` → **Fast Refresh** segera menerapkan
   tanpa rebuild, tanpa reinstall.

4. **API_URL staging**: metro membaca ulang env? **Tidak otomatis.** Karena
   `API_URL` di-inline oleh Babel pada saat bundle pertama kali, ganti URL
   API butuh restart Metro + reload bundling — **bukan hot reload**. Detail
   di §5.2.

5. Koneksi ke backend staging: langsung dari HP ke
   `https://staging-api.lazisnu.site` — tidak butuh tunnel khusus.

## 4. Perbandingan: Live Debug vs APK Staging (CI)

| Aspek | **Live Debug (Metro)** | **APK Staging via CI** (rencana sebelumnya) |
|---|---|---|
| Perubahan CI | **tidak ada** | job baru + Gradle variant |
| Iterasi UI/logika | **~1 detik**, live | 4–8 menit per build |
| Bisa diedit live | ✅ ya, itulah intinya | ❌ tidak |
| Butuh Android SDK lokal | ✅ ya (sudah ada) | ❌ runner GitHub |
| Perlu HP fisik / emulator | ✅ ya (sudah ada) | perlu pasang artifact manual |
| Uji "user asli" (clean install, no dev menu) | ❌ tidak | ✅ ya |
| Uji build release (ProGuard/R8, minify) | ❌ tidak | ✅ ya |
| Distribusi ke tester non-dev (Bagus saja?) | ❌ harus di mesin dev | ✅ tinggal kirim artifact |
| Uji fitur native murni (ML Kit, Crashlytics) | ⚠️ sebagian (mode debug) | ✅ ya |
| Risiko untuk produksi | **tidak ada** — tidak ada alur rilis yang tersentuh | kecil tapi ada |
| Isolasi dari produksi | ✅ applicationId sama (debug), data terpisah via MMKV | ✅ applicationId berbeda |

## 5. Keterbatasan penting (harus dipahami sebelum pilih)

### 5.1 Ini bukan "staging", ini "dev preview"

Live debug = **build debug**. Yang teruji:
- ✅ Tampilan, navigasi, state, logika JS, koneksi API
- ❌ **ProGuard/R8 minify** (release-only) — bug produksi akibat obfuscation
  tidak tertangkap
- ❌ **Signing produksi** & jalur update in-app (`apk_url`) tidak teruji
- ❌ **Performa release** (Hermes release build, dev menu aktif → metrik tidak akurat)
- ❌ **Clean install behavior** (data MMKV lama memengaruhi tes)

### 5.2 Ganti API_URL tidak bisa hot-reload

`API_URL` di-inline ke bundle oleh Babel (`babel.config.js`). Konsekuensi:
- Ubah `API_URL` → **restart Metro + full reload bundle**
- **Tidak** bisa diubah dari dev menu di HP
- Satu sesi Metro = satu target API

Solusi kerja: jalankan Metro dengan env yang benar dari awal:
```bash
API_URL=https://staging-api.lazisnu.site pnpm react-native start --reset-cache
```

### 5.3 Hanya bisa di mesin dev yang punya source code

Live debug **tidak bisa dikirim ke orang lain**. "Preview mobile" = Anda
memegang HP/emulator yang terhubung ke mesin Anda. Ini berbeda dengan tujuan
semula ("staging lengkap yang bisa diuji seperti produksi").

### 5.4 Emulator vs HP fisik

- **Emulator AVD**: `10.0.2.2` = host. Metro di `localhost:8081` otomatis
  terjangkau. Mudah.
- **HP fisik via USB/adb**: HP dan komputer harus **jaringan sama**; Metro harus
  bind ke IP yang bisa dijangkau HP (`--host 0.0.0.0` atau `adb reverse tcp:8081
  tcp:8081`). Ingat catatan di `api.ts` baris 56–59: `10.0.2.2` **tidak valid**
  di HP fisik.

## 6. Rekomendasi: jangan ganti, gabungkan

Live debug dan APK staging menutupi kebutuhan **berbeda**:

| Kebutuhan | Solusi |
|---|---|
| Iterasi cepat saat coding (edit → lihat) | **Live Debug** (Metro) |
| Verifikasi "release build benar-benar jalan" sebelum rilis | **APK staging** |
| Uji update in-app, signing, ProGuard | **APK staging** |
| Demo/coba fitur untuk pemilik produk | **APK staging** (bisa dikirim) |

**Saran:** pakai live debug sebagai alat utama sehari-hari (gratis, cepat),
dan aktifkan **hanya Fase 2** dari rencana APK staging (job CI `upload-artifact`
sederhana) sebagai jaring pengaman sebelum rilis produksi. Tidak perlu sampai
Fase 1 Gradle variant jika isolasi penuh belum dibutuhkan.

## 7. Yang bisa dilakukan sekarang (nol perubahan, nol risiko)

```bash
cd apps/mobile
# Pastikan HP fisik terdeteksi atau emulator jalan
adb devices

# Bangun + pasang debug APK sekali (sekali saja)
API_URL=https://staging-api.lazisnu.site pnpm react-native run-android

# Sesudahnya, metro jalan terus; tinggal edit kode → Fast Refresh
# Bila perlu ganti target API atau ada error aneh:
API_URL=https://staging-api.lazisnu.site pnpm react-native start --reset-cache
```

**Catatan untuk HP fisik**: `adb reverse tcp:8081 tcp:8081` supaya HP
menjangkau Metro di host tanpa peduli IP.

## 8. Yang harus dijaga

- **Jangan pernah** jalankan Metro dengan `API_URL` produksi saat menguji
  perubahan belum stabil — salah koneksi data asli.
- **Jangan** sampai build debug tertukar dengan release signing; signingConfig
  debug memakai keystore `debug.keystore` (`android`/`androiddebugkey`) —
  pastikan tidak ada yang menggantinya.
- **Jangan** commit file `apps/mobile/android/local.properties` (berisi path
  SDK lokal mesin Anda).
- Memory: HP Anda punya **Ruang Ganda / Dual Apps** — aplikasi debug dan
  "aplikasi ruang ganda" mungkin punya MMKV terpisah. Cek dulu sebelum tuduh
  "bug login hilang".

## 9. Pilihan keputusan untuk Bagus

1. **Pilih live debug saja** dan drop rencana APK staging (CI tetap utuh,
   tidak ada Gradle variant)?
2. **Gabungkan**: live debug harian + job CI artifact sederhana sebagai jaring
   pengaman rilis (rekomendasi)?
3. **Tetap dengan rencana APK staging penuh** (Fase 1–4)?
4. **Demonstrasi dulu**: jalankan `run-android` sekarang juga di mesin ini
   (nol perubahan, bisa langsung lihat hasilnya)?

---

## 10. Status

**Rencana ini belum dieksekusi.** Tidak ada file diubah, tidak ada CI
dimodifikasi, tidak ada Metro dijalankan. Menunggu persetujuan Bagus.
