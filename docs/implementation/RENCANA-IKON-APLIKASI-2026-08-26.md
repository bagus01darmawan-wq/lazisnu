# Rencana Implementasi — Ikon Aplikasi LAZISNU (Adaptive Icon)

**Tanggal:** 2026-08-26 · **Status:** ✅ SELESAI — ter-rilis bersama v1.1.2 (commit `490b9b0`, APK 41 MB, CI hijau 2×) · **Oleh:** Hermes (untuk Bagus Darmwan)

> Keputusan user: **Varian B final** — background putih, mark hijau tua `#02542C`,
> **art diperbesar ke 90% lebar kanvas** (mengisi sisi kosong), preview rounded 20%.
> Diterapkan sebagai **adaptive icon** (Android 8+ / semua HP petugas).

---

## 1. Latar

Saat ini APK memakai `ic_launcher.png` 192×192 bawaan template React Native
(logo sistem Android). Rekomendasi format (sudah dibahas): **paket Adaptive Icon**
— foreground PNG transparan + background warna + `mipmap-anydpi-v26` XML.
Master logo sudah ada di repo (`assets/logo_lazisnu.svg` = mark vektor hijau tua).
Varian visual telah dipilih user (bukti: lembar perbandingan + perbandingan
sebelum/sesudah perbesaran di sesi 2026-08-26).

## 2. Keputusan Desain (FINAL — disetujui)

| Aspek | Nilai |
|---|---|
| Background | Putih `#FFFFFF` (solid, via `colors.xml`) |
| Foreground (mark) | `assets/logo_lazisnu.svg` — mark vektor, warna `rgb(2,84,44)` = `#02542C` |
| Ukuran art | **90% lebar kanvas 108dp grid** — hingga batas geometri: masih utuh di masker terketat (lingkaran Pixel r=50%) |
| Masker preview | Rounded 20% (OS akhirnya yang menentukan bentuk mask — ini hanya simulasi) |
| Catatan | Melampaui safe zone 66dp Play Store; TIDAK masalah untuk distribusi APK langsung. Kalau masa depan masuk Play Store → turunkan parameter ke 61% (satu angka) |

## 3. Perubahan File di `apps/mobile/android/app/src/main/res/`

### 3.1 Dibuat (generator, tidak manual)

| File | Ukuran (px) | Isi |
|---|---|---|
| `mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` | 48 / 72 / 96 / 144 / 192 | Legacy (HP < Android 8): latar putih **full-bleed** + mark |
| `mipmap-{...}/ic_launcher_round.png` | sama | Legacy versi bulat |
| `drawable-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_foreground.png` | 108 / 162 / 216 / 324 / 432 | **Foreground adaptive**: mark transparan, posisi tengah, lebar 90% grid |
| `mipmap-anydpi-v26/ic_launcher.xml` | — | `<adaptive-icon>`: background `@color/ic_launcher_background` + foreground `@drawable/ic_launcher_foreground` |
| `mipmap-anydpi-v26/ic_launcher_round.xml` | — | Sama (OS memproses bentuk bulat via mask) |
| `values/colors.xml` | — | `ic_launcher_background` = `#FFFFFF` |

### 3.2 TIDAK berubah

- `AndroidManifest.xml` — ref `@mipmap/ic_launcher` + `@mipmap/ic_launcher_round` (nama sama, isi baru)
- `strings.xml`, `styles.xml` — utuh
- Ikon/layout di dalam aplikasi (`src/assets/branding/`) — di luar lingkup
- Build config, EAS, CI — **nol dampak** (murni resource)

## 4. Generator (reproducible) — `apps/mobile/scripts/generate-app-icon.mjs`

- Dep: `sharp` sebagai **devDependency `apps/mobile`** (`pnpm --filter lazisnu-collector-app add -D sharp`) — satu-satunya dependensi baru.
- Input: `apps/mobile/../assets/logo_lazisnu.svg` (path relatif `../../assets/logo_lazisnu.svg`).
- Output: seluruh file §3.1 (10 PNG + 2 XML + colors.xml).
- Parameter di header: `MARK_SCALE = 0.90` (dan komentar: Play Store → 0.61).
- Idempoten + deterministik: hasil sama setiap run → aman di-commit ulang kapan pun (mis. ganti master logo = jalankan ulang + commit).
- Pemanggilan: `pnpm --filter lazisnu-collector-app generate:icon` (npm script baru di `apps/mobile/package.json`).

## 5. Langkah Eksekusi (berurutan)

- [ ] 1. `pnpm --filter lazisnu-collector-app add -D sharp` + tulis `generate-app-icon.mjs` + npm script `generate:icon`
- [ ] 2. Jalankan generator → verifikasi dimensi semua PNG (script `node -e` PIL/identify — 10 file, ukuran tepat)
- [ ] 3. XML adaptive valid (schema `adaptive-icon`; nama resource match)
- [ ] 4. **Gate G1** — build `assembleDebug` lokal bila toolchain ada; jika tidak → **CI `build-android-debug`** (job existing di ci.yml, otomatis jalan saat push main menyentuh `apps/mobile/**`) → APK debug hijau
- [ ] 5. **Gate G2** — anilisis APK: `unzip -l` APK debug memuat semua mipmap/drawable baru (`ic_launcher_foreground.png`, `anydpi-v26`)
- [ ] 6. Commit + push → CI penuh hijau (lint/typecheck/test/lint prettier mobile)
- [ ] 7. Uji perangkat nyata (opsional, setelah rilis): 1 HP arm64 modern → ikon terlihat putih + mark hijau, tidak terpotong; 1 HP lama (armv7, Android 7 ke bawah) → ikon legacy bulat
- [x] 8. ✅ Rilis ikut v1.1.2 (2026-08-26) — catatan: mesin build kini Gradle-CI runner (bukan EAS); tetap universal, alur R2/deploy identik

## 6. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Art terpotong masker OS (lingkaran Pixel) | 90% sudah dihitung secara geometri — art masih di dalam lingkaran r=50%; kalau ditemukan terpotong di HP nyata → turunkan `MARK_SCALE` 0.90 → 0.85, regenerasi, commit |
| Ikon legacy kabur/kotor di HP lama | Legacy PNG dibuat dari render 1024 yang sama (bukan upscale dari 192); filter LANCZOS |
| `drawable-*dpi` baru mengganggu build | Murni resource, tidak ada kode; build debug memverifikasi |
| Inisiatif ganda (ikon vs split ABI) | Ikon = perubahan resource (tanpa dampak build), split ABI = v1.1.3 terpisah — tidak menyinggung aturan "satu perubahan infrastruktur per rilis" |
| Rollback | `git revert` commit ikon (res-only, nol risiko runtime) |

## 7. Yang TIDAK berubah (reminder)

- Ukuran APK bertambah ≤ 300 KB (17 file PNG) — diabaikan.
- Tidak ada perubahan behavior/aplikasi — petugas hanya melihat ikon baru di launcher.
- `versionCode` 20 (v1.1.2) dan jalur rilis Opsi B universal tetap seperti rencana.

## 8. Bukti Visual (referensi keputusan)

- `C:\Users\user\AppData\Local\Temp\icon-variants\B-sebelum-sesudah.png` — perbandingan 62% vs 90%
- `C:\Users\user\AppData\Local\Temp\icon-variants\varian-B-final-rounded.png` — terpilih (rounded 20%)
- `C:\Users\user\AppData\Local\Temp\icon-variants\varian-B-final-canvas.png` — kanvas 1024 (foreground+background)
