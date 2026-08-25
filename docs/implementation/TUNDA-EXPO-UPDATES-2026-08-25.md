# Rencana Implementasi: Tunda Integrasi EAS Update (expo-updates)

Tanggal: 2026-08-25
Status: SIAP DIEKSEKUSI
Target: Mengembalikan pipeline build yang hijau dengan pekerjaan expo-updates dilepas bersih, tanpa kehilangan perbaikan sah lainnya dari sesi yang sama.

---

## 1. Latar Belakang

Eksperimentasi menambahkan `expo-updates` (OTA Tingkat 2) di proyek bare RN 0.74 menemui 4 kegagalan build EAS berturut-turut. Penyebabnya masalah internal library `expo-updates` sendiri (stub kapt `NonExistentClass`) yang tidak dapat diperbaiki secara ekonomis dari sisi konsumen. Keputusan: **lepaskan integrasi ini**, kembalikan ke jalur build stabil, dan lanjutkan rencana update-in-app (Tingkat 1: modal cek versi) di sesi berikutnya.

### Yang DIPERTAHANKAN (bukan bagian eksperimen, jangan ikut dibuang)

| Item | Asal | Alasan |
|---|---|---|
| `src/config/appConfig.json` + `appConfig.ts` | dddf11f | Sumber tunggal nomor versi |
| Label versi dinamis di `ProfileScreen.tsx` | dddf11f | Berguna, bebas expo-updates |
| `versionName "1.1.0"` literal di `build.gradle` | 64e5e5e | Diwajibkan `appVersionSource: remote` |
| Tes sinkron versi (versi ramping) | 64e5e5e | Penjaga versionName↔appConfig |
| `reactNativeArchitectures` tanpa x86/x86_64 | 914eb85 | Penghematan ukuran (Option A) |
| eas-cli 22 (devDependency) | sesi ini | Versi baru, tidak berbahaya |
| Seluruh pekerjaan koreksi-offline & UI & auth | sebelumnya | Sudah hijau & di-commit |

### Anchor pemulihan
Commit **`914eb85`** = commit terakhir sebelum integrasi expo-updates dimulai.

---

## 2. Matriks Perubahan per File

| File | Aksi | Metode |
|---|---|---|
| `apps/mobile/package.json` | Balikkan `postinstall` ke `"patch-package"`; hapus `expo`, `expo-updates` dari deps | `pnpm remove` + edit manual |
| `apps/mobile/android/app/build.gradle` | Checkout dari anchor, lalu 2 koreksi kecil ulang | `git checkout 914eb85` + 2 edit manual (lihat §3.2) |
| `apps/mobile/android/settings.gradle` | Checkout dari anchor (autolinking expo hilang) | `git checkout 914eb85` |
| `apps/mobile/android/build.gradle` | Checkout dari anchor (blok `subprojects` JVM17 hilang) | `git checkout 914eb85` |
| `apps/mobile/android/app/src/main/AndroidManifest.xml` | Checkout dari anchor (meta-data expo-updates hilang) | `git checkout 914eb85` |
| `apps/mobile/android/app/src/main/res/values/strings.xml` | Checkout dari anchor (`expo_runtime_version` hilang) | `git checkout 914eb85` |
| `apps/mobile/eas.json` | Checkout dari anchor (`channel`/`updates` hilang) | `git checkout 914eb85` |
| `apps/mobile/app.json` | Checkout dari anchor (bagian `expo` hilang) | `git checkout 914eb85` |
| `apps/mobile/scripts/patches/expo-updates-kapt-fix.js` | Hapus berkas + folder `scripts/patches` | `Remove-Item` |
| `apps/mobile/__tests__/config/appVersionSync.test.ts` | Timpa dengan versi ramping (hanya sinkron versionName) | tulis ulang (lihat §3.4) |
| `apps/mobile/pnpm-lock.yaml` | Regenerasi bersih tanpa expo | `pnpm install` |

---

## 3. Langkah Implementasi Lengkap

### 3.1 — Cabut Paket NPM + Balikkan postinstall

```bash
cd apps/mobile
pnpm remove expo expo-updates
pnpm remove patch-package --ignore-scripts   # tidak; patch-package memang bawaan asli — JANGAN di-remove
```

Catatan akurat:
- Jan di-remove **hanya** `expo` dan `expo-updates`. `patch-package` memang sudah ada sejak awal (devDependency asli) dan tetap dipakai.
- Edit `package.json` → `postinstall` kembali ke:
  ```json
  "postinstall": "patch-package",
  ```

**Verifikasi 3.1:** `rg '"expo"|"expo-updates"' package.json` → tanpa hasil.

### 3.2 — Pulihkan File Native dari Anchor + 2 Koreksi Manual

```bash
cd C:/Users/user/Documents/lazisnu
git checkout 914eb85 -- `
  apps/mobile/android/app/build.gradle `
  apps/mobile/android/settings.gradle `
  apps/mobile/android/build.gradle `
  apps/mobile/android/app/src/main/AndroidManifest.xml `
  apps/mobile/android/app/src/main/res/values/strings.xml `
  apps/mobile/eas.json `
  apps/mobile/app.json
```

Koreksi manual wajib pada `apps/mobile/android/app/build.gradle` (keadaan anchor membawa dua masalah yang sudah terbukti di lapangan):

1. `enableSeparateBuildPerCPUArchitecture = true` → ubah kembali ke **`false`** (alasan: internal distribution membungkus split menjadi `.tar.gz`, petugas tidak bisa install langsung — terbukti di build #5).
2. `versionName appConfig.version` (ekspresi JsonSlurper) → ubah ke string literal **`versionName "1.1.0"`** (alasan: EAS `appVersionSource: remote` membaca nilai sebagai teks mentah — terbukti tampil "appConfig.version" di build #4/#5).

**Verifikasi 3.2:**
- `rg -n "enableSeparateBuildPerCPUArchitecture|versionName" apps/mobile/android/app/build.gradle` → `false` + `"1.1.0"`
- `rg -n "expo" apps/mobile/android/settings.gradle apps/mobile/eas.json apps/mobile/app.json` → tanpa hasil
- `rg -n "expo.modules.updates" apps/mobile/android/app/src/main/AndroidManifest.xml` → tanpa hasil

### 3.3 — Buang Berkas Sisa Integrasi

```bash
Remove-Item apps/mobile/scripts/patches/expo-updates-kapt-fix.js -Force
Remove-Item apps/mobile/scripts/patches -Force   # jika kosong
```

**Verifikasi 3.3:** `Test-Path apps/mobile/scripts/patches` → `False`
(dan `rg "expo-updates-kapt-fix" apps/mobile/package.json` → tanpa hasil)

### 3.4 — Rampungkan Tes Sinkron Versi

Tulis ulang `apps/mobile/__tests__/config/appVersionSync.test.ts` dengan isi yang hanya menjaga kenyataan yang masih relevan (4 tes berita lama mengecek `expo.updates.url`, `runtimeVersion`, dan `projectId` — dua pertama tidak lagi ada):

```ts
import {APP_VERSION} from '../../src/config/appConfig';
import {readFileSync} from 'fs';
import {join} from 'path';

/**
 * Penjaga satu-sumber versi: versionName WAJIB string literal di
 * android/app/build.gradle (keharusan EAS appVersionSource: remote)
 * dan tidak boleh meleset dari appConfig.json (label versi di Profil).
 */
describe('sinkronisasi nomor versi aplikasi', () => {
  it('versionName di build.gradle sama dengan appConfig.json', () => {
    const gradlePath = join(__dirname, '..', '..', 'android', 'app', 'build.gradle');
    const gradle = readFileSync(gradlePath, 'utf8');
    const match = gradle.match(/versionName\s+"([^"]+)"/);

    expect(match).not.toBeNull();
    expect(match![1]).toBe(APP_VERSION);
  });
});
```

### 3.5 — Jalankan Verifikasi Lengkap Lokal

```bash
cd apps/mobile
pnpm install            # lockfile bersih tanpa expo
pnpm run typecheck      # harus lolos
pnpm exec eslint src/ __tests__/  # bersih
pnpm run test           # seluruh suite hijau
```

Kriteria kelulusan:
- `pnpm-lock.yaml` tidak lagi memuat `expo@~51` / `expo-updates`.
- Seluruh tes lulus (angka tes = sebelum integrasi + tes baru sah: koreksi-offline 15 + authSession 10 + version-sync 1).
- Tidak ada referensi "expo" (selain `eas-cli` devDependency) di config build.

### 3.6 — Commit + Push + Build Rilis

```bash
git add -A
git commit -m "chore(mobile): lepas integrasi expo-updates — kembali ke pipeline build stabil"
git push
cd apps/mobile
pnpm exec eas build --profile production --platform android --no-wait
```

### 3.7 — Validasi Hasil Build (kriteria "tuntas")

Build berikutnya BERHASIL apabila dari `eas build:list`:
- `Status: FINISHED`
- `Version: 1.1.0` (bukan `appConfig.version`)
- `Version code` naik dari yang sebelumnya
- Artefak berakhiran **`.apk`** (bukan `.tar.gz`)
- Arti ukuran APK ≈ 40–45 MB (turun dari ±80 MB berkat penghapusan x86)

Lalu di perangkat: install menimpa, buka → Profil menampilkan "Versi 1.1.0" → smoke test minimal (login, beranda, satu penjemputan offline).

---

## 4. Rencana Cadangan (Jika Build Masih Gagal)

1. Ambil log seperti sebelumnya (brotli-decode), cari baris `What went wrong` pertama.
2. Jika kegagalan LANGSUNG mengait `expo`: ada sisa referensi terlewat → ulangi pencarian `rg -i expo apps/mobile/android apps/mobile/eas.json apps/mobile/package.json`.
3. Jika kegagalan berbeda topik (JNI/CMake/etc.): itu isu pra-eksperimen yang belum pernah muncul — tidak mungkin jintas dari sesi ini; investigasikan terpisah sebelum menyimpulkan apa pun.
4. Pelarian terakhir: `git revert` penuh ke `914eb85` HEAD-wajar, menjaga commit appConfig/versionName literal secara terpisah sebagai commit manual baru (lebih drastis, hindari).

---

## 5. Setelah Tuntas

1. Tandai selesai: ceritakan apa yang dicoba & dipelajari (untuk dokumentasi sesi).
2. Lanjutkan pekerjaan Fitur Tingkat 1 (**modal update-in-app** berbasis endpoint versi + link APK) pada sesi berikutnya — terpisah total dari legacy alur ini.
3. Catat di dokumentasi standar bahwa integrasi expo-updates hanya bisa dipertimbangkan kembali jika: upgrade RN/Expo SDK ke versi yang menjunjung Room 2.6+ dan Kotlin 1.9+ resmi (SDK ≥ 52).
