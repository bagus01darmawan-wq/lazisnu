# C1 — Temuan & Syarat Lanjutan Hasil Review T7 (20 Sep 2026)

> Status: **BUKAN tugas baru.** Ini temuan terbuka + acceptance tambahan dari
> review C1-T7, 20 Sep 2026 atas commit `dcbb618` (branch
> `feat/c1-t7-reopen-arsip-2026-09-20`, `feat(c1-t7): reopen menular + arsip
> PDF per versi + jendela 48 jam`). Semua klaim laporan T7 diverifikasi ulang
> terhadap kode dan eksekusi — **T7 LULUS**: `npx tsc --noEmit` backend & web
> EXIT 0; `jest --ci --runInBand` **52/52 suite, 472/472 test** hijau
> (dijalankan ulang penuh secara live di sesi review, 62,3 dtk, proses latar).
> Tak satu pun temuan di bawah memblokir merge. Pola dokumen mengikuti
> `C1-SYARAT-LANJUTAN-REVIEW-T5-2026-09-20.md`. Dokumen review T0–T6 bersifat
> read-only; ringkasan verifikasi ada di `C1-TINJAUAN-ULANG-T7-2026-09-20.md`.

> **Premis T7 yang sudah dikunci (jangan dibongkar tugas berikutnya):**
> reopen = 1 transaksi + update bersyarat `WHERE status AND version` (CONFLICT
> bila balapan); arsip PDF versi lama ke `ba_pdf_archives` **SEBELUM** kolom
> `pdf_url/pdf_hash` di-null-kan; TTD + coretan dihanguskan (kolom NULL, file
> R2 coretan dihapus best-effort SETELAH commit — bytes PDF lama imut, tak
> dihapus); jendela koreksi 48 jam (`reopened_until`, batas INKLUSIF, NULL =
> DRAFT normal selalu lolos) ditegakkan di choke bersama
> (`assertSubmissionOpen` untuk submit/resubmit/skip + 4 jalur cosign + 2
> finalize); verify QR versi lama membaca arsip (status arsip wajib
> FINAL/FINAL_NOL) dan tetap seragam `{ valid }`; kalender
> LOCKED→DIBUKA_SEBAGIAN saat reopen, kembali LOCKED saat ranting re-FINAL;
> PPK re-FINAL men-refresh jendela branch pasangan; reopen DRAFT-berjendela =
> perpanjangan (`extended: true`, tanpa arsip/bump); migrasi 0010 aditif
> (`ba_pdf_archives` + `reopened_until` ×2, tanpa alter data) **hanya di DB
> test** — DB staging/prod BELUM. **Baseline baru untuk T8: 52 suite / 472 test.**

## Ringkasan temuan

| # | Prio | Lokasi | Ringkas | Target |
| --- | --- | --- | --- | --- |
| H1 | P4 | `services/reopen.ts` (jalur perpanjangan, PPK ±:221–230, branch ±:381–389) | UPDATE `reopenedUntil` hanya `WHERE id(+version)` tanpa cek status — bila re-FINAL commit di antara baca & update, baris FINAL bisa terisi jendela basi. Harmless (finalize set NULL; gate hanya relevan DRAFT; reopen FINAL berikutnya tetap jalan) | T8/backlog — perketat `AND status IN ('DRAFT','PPK_SIGNED')` |
| H2 | P4 | `services/ppkSubmissions.ts` (`ensurePpk/ensureBranchSubmission`) | Recount DRAFT tidak ter-gate jendela reopen. Aman: recount murni agregasi baca-saja; tulis (submit) tetap ter-gate `assertSubmissionOpen`. Catatan saja, tidak ada celah nominal | — |
| H3 | P4 | `ba_pdf_archives.pdfKey/pdfHash` nullable; belum ada endpoint daftar arsip | Desain benar (versi tak pernah diunduh tetap terverifikasi via `contentHash`), tapi UI T9/T10 JANGAN menyimpulkan `pdf_key NULL` = arsip rusak. Endpoint riwayat arsip = kebutuhan T9/T10 | T9/T10 |

## Status temuan lama (agar jejak audit utuh)

- **F1** (yatim R2): **F1a ditutup T6, F1b ditutup T7** — coretan lama kini
  dihapus best-effort saat reopen (key dikumpulkan sebelum tx, hapus setelah
  commit).
- **F3** (verify wajib FINAL): **ditutup T6**; T7 menambah lapis arsip (QR versi
  lama tetap sah via `ba_pdf_archives`) — test v1&v2 hijau.
- **F4** (test `.strict()`): **ditutup T6**. **F5** (docs/komentar PDF):
  **ditutup T6**. **F6** (`as_nol` tak dipersistensi): **ditutup T6**
  (turunan nol + alasan; massal = `KOREKSI_ADMIN`). **F8** (re-countersign
  PPK_SIGNED): **ditutup T6** (kebijakan: dibiarkan sebagai koreksi).
- **G1** (kalimat "REKAP tanpa tulis"): **diperbaiki T7** — §4.13 kini
  "tanpa tulis submission/LOCKED (baris kalender di-ensure bila belum ada)".
- **G2** (insert kalender selalu OPEN): **diperbaiki T7** —
  `ensurePeriodCalendarRow(y, m, now)` + `ensureCalendarRowTx` kini pakai
  `resolvePeriodStatus(now, b)`.
- **G3** (cakupan test T6): **ditutup T7** — lintas-distrik 403 (G3a) lewat
  fixture `adminkecb-t7`; F3 tier-PPK (G3b) ada testnya; loop KERAS tanpa 1
  transaksi tetap diterima (idempoten + retry) — biarkan.
- **G4** (N+1 kunci): tetap diabaikan (skala kecamatan + tombol bulanan).
- **Backlog tetap**: **F2** (purge coretan tak terikat scope distrik) dan
  **F7** (pernyataan BA terpotong 95 char) — belum disentuh, boleh tetap.

## Ditinggalkan untuk T8–T12 (dengan alasan, bukan lupa)

- **T8** agregat/insiden + alasan NOL khusus (migrasi enum bila mau) — plus H1.
- **T9/T10** UI flag merah + countdown + **endpoint riwayat arsip** (H3).
- **T11** notifikasi push/WA (reopen kini audit saja).
- **T12** wiring cron + verif TZ + **rollout migrasi 0010 ke staging/prod via
  runbook** — WAJIB sebelum/bersamaan rilis kode yang membaca kolom baru;
  kalau tidak, setiap call reopen → 500 (pola runbook 0008: urutan
  staging→prod, kriteria lulus journal, `RUN_MIGRATIONS=0` di laptop).

## Jebakan T7 yang terbukti (bekal sesi berikutnya)

1. **Cross-talk antar-suite DB persisten**: `preparePeriodDraft` (T3, cron/
   endpoint) membuat draft untuk SEMUA ranting — sisa `period_drafts` sesi
   lama memblokir cleanup fixture via FK `draft_items→officers` dan membuat
   5/5 suite merah di T6 (bukan regresi kode). Kebiasaan baru wajib: setiap
   fixture integrasi menghapus `period_draft_items` → `period_drafts` milik
   branch-nya SEBELUM cans/officers/users (dipakai T6 + T7).
2. **Arsip SEBELUM null-kan**: `contentHash` dihitung dari snapshot baris saat
   masih FINAL — bila dihitung setelah update, hash tidak akan pernah cocok
   dengan QR yang sudah tercetak. Urutan ini tidak boleh dibalik saat
   menyentuh `reopen.ts`.
3. **Hapus key R2 SETELAH commit**: kumpulkan key SEBELUM transaksi, hapus
   best-effort SETELAH commit — di dalam tx, kegagalan R2 akan menggagalkan
   reopen yang sah, dan key yang dipakai baris FINAL bisa terhapus duluan.
4. **Choke di helper bersama**: jendela reopen ditegakkan di
   `assertSubmissionOpen` (satu tempat untuk submit/resubmit/skip) — pola ini
   yang membuat choke "6 titik" cukup 1 fungsi + 6 call-site. Jangan menabur
   cek per-endpoint.
5. **Cara jalan verifikasi penuh**: satu perintah tool dibatasi ~30 dtk, suite
   butuh ~62 dtk → jalankan `Start-Process node … jest.js --ci --runInBand`
   dengan `-RedirectStandardOutput/Error` ke `tmp/`, poll ringkasan
   (`Test Suites:`/`Tests:` ada di **stderr**). Banner `npm notice`/`remote:`
   di stderr memicu `NativeCommandError` palsu di PowerShell — bukan
   kegagalan; verifikasi lewat `git ls-remote`/isi log.

## Bukti verifikasi review (agar sesi T8 tidak mengulang)

Dijalankan 20 Sep 2026 di `C:\Users\user\Documents\lazisnu` pada `dcbb618`:

```
cd apps/backend ; npx tsc --noEmit                       → EXIT 0
cd apps/web     ; npx tsc --noEmit                       → EXIT 0
cd apps/backend ; node .\node_modules\jest\bin\jest.js --ci --runInBand
   → Test Suites: 52 passed, 52 total
   → Tests:       472 passed, 472 total   (62,254 dtk; 0 FAIL)
```

Aritmetika test (dihitung ulang): baseline T6 50 suite/462 test + 2 file baru
(`reopen.unit.test.ts` 4 test, `reopen.integration.test.ts` 6 test) = 52/472.

Juga diverifikasi: 19 berkas berubah; migrasi 0010 aditif (tabel arsip +
2 kolom `reopened_until` + FK `archived_by` + unique `(tier,submission_id,
version)`) dan terbukti terpasang di DB test lokal; `apps/mobile`/`packages`
tak tersentuh; DB remote tak disentuh (konsisten `RUN_MIGRATIONS=0`); choke
jendela terpasang di 6 titik tulis; kalender dua arah (DIBUKA_SEBAGIAN ↔
LOCKED) teruji.

> Dokumen ini artefak review T7. Saat sebuah butir dikerjakan di tiket
> lanjutan, centang di sini atau catat pengecualiannya di prompt tiket
> bersangkutan agar jejak audit tetap utuh (pola yang sama dipakai dokumen
> review T0–T6).
