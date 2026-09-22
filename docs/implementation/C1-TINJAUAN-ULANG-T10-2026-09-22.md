# C1 — Tinjauan Ulang T10 Web Peran + TTD Interaktif (22 Sep 2026)

> Status: **LULUS (hijau), tanpa temuan blocking.**
> Objek: commit `a5d460c` (`feat(c1-t10): web peran + TTD interaktif + K1`)
> pada branch `feat/c1-t10-web-peran-ttd-2026-09-22`.
> Basis: T9 `73b7ae6` (review T9: LULUS + K1–K4). Baseline: backend 56/485,
> mobile 32/250 + tsc 13 pre-existing, web tsc 0.
> Pola mengikuti `C1-TINJAUAN-ULANG-T9-2026-09-22.md`. Dokumen review T0–T9 read-only.

## 1. Verifikasi klaim laporan T10

| Klaim | Hasil |
|---|---|
| 21 file | ✅ `git diff --name-only 73b7ae6 HEAD` = tepat 21 (backend K1 ×2, mobile SignaturePad+SignSheet+encoder+2 test+3 layar+api, web 4 lib/halaman/test + SignaturePad, docs §4.17) |
| Backend `tsc` EXIT 0 | ✅ live |
| Backend `jest --ci --runInBand` **56/56, 485/485** | ✅ **live penuh** (proses latar): `Test Suites: 56 passed; Tests: 485 passed` — sama seperti baseline T9 (K1 menambah aserti ke test lama, bukan test baru) |
| Mobile `jest --ci` **34/34, 256/256** | ✅ **live penuh**: `Test Suites: 34 passed; Tests: 256 passed`. Aritmetika: 250 + 4 PNG + 2 SignSheet = 256; 32+2 = 34 |
| Mobile `tsc` **0** (13 pre-existing hilang) | ⚠️ **tidak nol — 1 error baru dari T10 sendiri** (lihat L1 di bawah) |
| Web `vitest` 6/31 + `tsc` 0 | ✅ **live**: `Test Files 6 passed; Tests 31 passed` (audit formatters 7, menu-config 5, dsb.); web `tsc` EXIT 0 |
| K1 countdown server | ✅ `getStafSummary` kini pakai `getPeriodInfo` (server) dan menyuplai `days_to_due/days_to_lock/in_tolerance`; test assert TOLERANCE + 12 hari; klien Persetujuan memakai `summary.*` (konstanta 99 hilang — `git show 73b7ae6` vs HEAD membuktikan) |
| K4 tuntas via rebuild dist | ✅ **benar tanpa ubah kode**: `packages/shared-types/dist` di-`.gitignore` dan tidak berubah di diff T10; `Task`/`VisitTask` di sumber sudah lama punya `condition?`, `is_visit_task?`, `assignment_status?` (baris 424/427/445 dll.) — jadi 13 error hanyalah drift **artefak dist**; tsc mobile 13→0 karena rebuild. |
| PNG encoder murni (stored-block, tanpa dep native) | ✅ `signaturePng.ts` benar-benar nol dep: CRC32/Adler32 tulisan tangan, DEFLATE blok stored (BFINAL=1, BTYPE=00), base64 tanpa `Buffer` (RN Hermes). Test `signaturePng.test.ts` kuat: signature 8-byte, chunk IHDR(240×120 gray8)/IDAT/IEND berurutan, **CRC per-chunk diverifikasi terhadap encoder**, **inflateSync → piksel identik round-trip**, Adler32 atas data mentah (tanpa header blok) — dan temuan 6b dibuktikan jujur (komentar test menyebut perbaikan jangkauan Adler), `<50KB`, kosong → null |
| SignSheet/SignaturePad mobile | ✅ kanvas PanResponder + pratinjau Polyline SVG; gerbang lokal ganda (kosong → null, tanpa consent → tolak) + tombol disable bila `!hasContent || !consent`; server tetap menegakkan T5 |
| Web menu peran + 3 halaman + audit label/tone | ✅ menu difilter role (Staf/Persetujuan, Ranting/Setoran, MWC/Rekap); halaman setoran: detail + TTD kanvas + BA + unduh + riwayat; label C1 23 kunci + tone warning/success; prettier/lint lolos (CI Verify) |
| Sign web (canvas.toDataURL) | ✅ murni web; guard 50KB klien + server; DPR-scale + pointer capture; clear restorasi transform benar |
| H1 (status guard reopen) | ✅ diverifikasi **present di T8** (`71a5820`, `statusGuard`) — tak perlu commit ulang, sesuai klaim 6a |
| Device-only (uji TTD fisik + build APK) | ✅ konsisten diakui out-of-scope (tidak dieksekusi sesi ini — tak ada klaim lintas); apk CI T9 saja skip (hanya backend/web berubah) |

## 2. Temuan sesi ini (4, semua non-blokir)

| # | Prio | Isi | Target |
|---|---|---|---|
| L1 | P3 | **tsc mobile ≠ 0 — 1 error baru dari T10 sendiri** (bukan 0 seperti klaim). Lokasi: `apps/mobile/__tests__/components/SignSheet.test.tsx(25,55)` — `node.type === 'Text'` membandingkan string host react-test-renderer (union yang tak overlap dengan `'Text'`) → `TS2367`. Ini **bukan** pre-existing (file test T10 baru); 13 lama memang hilang, tapi penggantinya 1. Dampak nol pada runtime/test (jest hijau) — hanya klaim tsc yang overstate. Perbaikan murah: jadikan filter berbasis isi props saja, bukan banding type | backlog |
| L2 | P3 | **DPR web SignaturePad meleset bila `devicePixelRatio` berubah saat menggambar**: `pos()` memakai rasio dari `canvas.width/rect.width` (saat init), `ctx.scale(dpr)` di init, lalu `lineTo(p.x/dpr)` di move membaca **DPR terkini**. Di multi-display/zoom, coretan bergeser. Konsisten bila 1 kanvas tetap (praktis mayoritas), tetapi rapuh. Perbaikan murah: simpan DPR di ref saat init, pakai itu di move (bukan baca ulang) | backlog |
| L3 | P4 | **TTD interaktif web tak punya test vitest** (komponen + halaman setoran hanya type-checked). Jalur sign/countersign mobile tak punya test sheet yang menyimulasikan consent→submit (hanya render + no-submit-diam). Ditinggalkan diakui (Device-only), tapi layak dicatat sebelum T11 (push ke token yang baru disimpan tanpa audit) | T11 |
| L4 | P4 | **K2 review-T9 masih terbuka** (arsip versi tak memfilter status) + K3 (`saveDeviceToken` tanpa audit) belum dikerjakan di T10 — benar ditinggalkan | T11 |

## 3. Tindak lanjut

- T10 **selesai, boleh merge**. Bukti live sesi ini: backend tsc 0, web tsc 0; backend jest **56/56, 485/485**; mobile jest **34/34, 256/256**; web vitest **6/31**; **mobile tsc = 1 error baru (L1)**, bukan 0.
- Ditinggalkan dengan benar: **T11** push asli (+ audit token K3 + test sheet L3) + **T12** cron + **rollout produksi 0008–0011** (state terverifikasi: main pra-C1, DB 0007, 4 migrasi pending; boleh setelah semua tiket — migrasi mendahului kode `main`).
- Backlog tetap: F2 (purge scope distrik), F7 (bungkus teks PDF), H1-test (J1), J3 (audit `MANUAL_COLLECTION` luar tx), K2, K3.
- Baseline baru untuk T11: backend **56/485**; mobile **34/256**; web **6/31**.
