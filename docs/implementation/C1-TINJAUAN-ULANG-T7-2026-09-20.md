# C1 — Tinjauan Ulang T7 Reopen + Arsip PDF (20 Sep 2026)

> Status: **LULUS (hijau), tanpa temuan blocking.**
> Objek: commit `dcbb618` (`feat(c1-t7): reopen menular + arsip PDF per versi + jendela 48 jam`)
> pada branch `feat/c1-t7-reopen-arsip-2026-09-20`.
> Basis: T6 `7540f94` (review T6: LULUS + temuan G1–G4). Baseline: 50 suite / 462 test.
> Pola mengikuti `C1-TINJAUAN-ULANG-T6-2026-09-20.md`. Dokumen review T0–T6 read-only.

## 1. Verifikasi klaim laporan T7

| Klaim | Hasil |
|---|---|
| 19 file | ✅ `git diff --name-only 7540f94 HEAD` = tepat 19 (migrasi 0010 + snapshot + journal, `services/reopen.ts` baru 471 baris, 2 test baru, 11 edit, docs) |
| `tsc --noEmit` backend + web EXIT 0 | ✅ dijalankan ulang live, keduanya EXIT 0 |
| **52/52 suite, 472/472 test** | ✅ **dijalankan ulang penuh secara live** (proses latar, 62,3 dtk): `Test Suites: 52 passed, 52 total; Tests: 472 passed, 472 total` |
| Aritmetika | ✅ 462 + 4 unit (3 jendela + 1 schema `.strict()`) + 6 integrasi = 472; 50 + 2 file test = 52 |
| Migrasi 0010 ke DB test | ✅ terbukti berjalan: suite integrasi reopen membaca/menulis `ba_pdf_archives` + `reopened_until` tanpa error; `_journal.json` idx 10 = `0010_chunky_nekra`; SQL = tabel arsip + 2 kolom `reopened_until` + FK `archived_by` + unique `(tier,submission_id,version)` — aditif, tanpa alter data. **DB remote tidak disentuh** (runbook T12) — konsisten disiplin `RUN_MIGRATIONS=0` |
| Endpoint reopen ×2 | ✅ `POST /mobile/submissions/:id/reopen` + `POST /admin/branch-submissions/:id/reopen`, keduanya `authorize('ADMIN_RANTING','ADMIN_KECAMATAN')`, schema `.strict()` alasan min 10/maks 255 + `expected_version` |
| Scope server-side | ✅ Admin Ranting wajib pemilik branch; ADMIN_KECAMATAN wajib se-district; peran lain → FORBIDDEN (test: bendahara, admin ranting lain, MWC distrik lain) |
| PPK FINAL→DRAFT menular | ✅ 1 transaksi: arsip PPK → update bersyarat `WHERE status='FINAL' AND version` (CONFLICT bila balapan) → branch pasangan FINAL/FINAL_NOL diarsip + demote ke DRAFT bersyarat → kalender DIBUKA_SEBAGIAN; audit `PPK_REOPENED` berisi `contagion_*` |
| TTD + coretan hangus | ✅ signer/URL/tanggal NULL + `pdf_url/pdf_hash` NULL + `version+1` + `finalized_*` NULL; key coretan dikumpulkan SEBELUM tx, dihapus best-effort SETELAH commit (pola F1a/F1b benar — tidak menghapus key yang dipakai baris) |
| Arsip key/hash nyata | ✅ test unduh PDF pra-reopen (`getBaDownload`) lalu assert `archPpk.pdfKey` pola `ba-pdfs/ppk/` + `pdfHash` 64-hex + `contentHash` = hash snapshot pra-reopen; bytes PDF lama dipertahankan (arsip imut) |
| Verify baca arsip (QR lama sah) | ✅ `verifyBaRecord`: live row (versi cocok) dicek dulu; versi lama → lookup `ba_pdf_archives` (status arsip FINAL/FINAL_NOL + `contentHash` banding) → seragam `false` bila tak ada. Test QR v1 (arsip) & v2 (live) keduanya `true`, hash salah `false` |
| Kalender LOCKED→DIBUKA_SEBAGIAN→LOCKED | ✅ reopen: UPDATE `WHERE status='LOCKED'` (aman-ganda); re-FINAL branch: UPDATE `WHERE status='DIBUKA_SEBAGIAN'` di `countersignBranchSubmission`; test kedua arah |
| Jendela 48 jam | ✅ `REOPEN_WINDOW_HOURS` + `reopenWindowUntil` di `periodCalendar.ts` (rumah netral, tanpa import siklik); `assertReopenWindowOpen` batas INKLUSIF (`now == until` lolos), error + `details.reason: REOPEN_WINDOW_CLOSED` |
| Choke 6 titik | ✅ `assertSubmissionOpen` (submit :240, resubmit :322, skip via `assertAssignmentSkippable` :82) + 4 jalur cosign (`cosign.ts:195,281,484,580`) + finalize PPK & branch (`ppkSubmissions.ts:273,569`); DRAFT normal (`NULL`) terbukti lolos (unit test) |
| Perpanjangan (anti-buntu) | ✅ reopen DRAFT/PPK_SIGNED berjendela = `extended: true`, tanpa arsip/bump versi; DRAFT polos → "masih terbuka"; test 49 jam: ditolak → perpanjang → lolos lagi |
| Refresh jendela (temuan 6b) | ✅ PPK re-FINAL men-refresh `reopenedUntil` branch DRAFT-reopened pasangan (`WHERE status='DRAFT' AND reopened_until IS NOT NULL`) — alur 49 jam tak lagi menjepit sign ranting |
| FINAL_NOL→DRAFT | ✅ test reopen langsung ranting FINAL_NOL → DRAFT v2 + arsip v1 berstatus FINAL_NOL |
| `expected_version` → CONFLICT | ✅ test `expectedVersion: 999` → CONFLICT; update bersyarat version di semua jalur tulis |
| F3 tier-PPK (G3b) | ✅ test FINAL + hash benar → true / salah → false |
| Lintas-distrik 403 (G3a) | ✅ `adminkecb-t7` (distrik B) dipakai → FORBIDDEN_SCOPE |
| API docs §4.14 + G1 | ✅ §4.14 baru (endpoint, jendela, arsip, respons `contagion`/`extended`); kalimat REKAP T6 diluruskan: "tanpa tulis submission/LOCKED (baris kalender di-ensure bila belum ada)" |
| G2 | ✅ `ensurePeriodCalendarRow(year, month, now)` kini insert `resolvePeriodStatus(now,b)` (bukan selalu OPEN); `ensureCalendarRowTx` di reopen juga pakai `resolvePeriodStatus` — konsisten |
| Jebakan 6(a) — full-suite merah T6 | ✅ akar benar (sisa `period_drafts` sesi lama, FK `draft_items→officers` memblokir cleanup); hardening: hapus `period_draft_items` → `period_drafts` sebelum cans/officers di cleanup T6 DAN T7; cleanup T7 juga hapus `ba_pdf_archives`. Suite penuh hijau 52/52 membuktikan |

## 2. Temuan sesi ini (3, semua non-blokir)

| # | Prio | Isi | Target |
|---|---|---|---|
| H1 | P4 | Race kecil di jalur **perpanjangan jendela**: UPDATE `reopenedUntil` hanya `WHERE id(+version)` tanpa cek status — bila re-FINAL commit di antara baca & update, baris FINAL bisa terisi `reopenedUntil` basi. Harmless (finalize set NULL; gate hanya relevan utk DRAFT), tapi bisa diperketat `AND status IN ('DRAFT','PPK_SIGNED')` | T8/backlog |
| H2 | P4 | `assertReopenWindowOpen` tidak dipasang di `ensurePpk/ensureBranchSubmission` (recount DRAFT) — recount boleh jalan lewat jendela selama tulis (submit) tetap ter-gate; recount murni agregasi baca-saja, tak membuka celah nominal | — |
| H3 | P4 | `ba_pdf_archives.pdfKey/pdfHash` nullable + `contentHash` NOT NULL — desain benar (versi tak pernah diunduh tetap terverifikasi via konten), namun **belum ada endpoint daftar arsip** (ditinggalkan ke T9/T10 dengan benar). Pastikan UI T9/T10 tak menganggap `pdf_key NULL` = rusak | T9/T10 |

## 3. Tindak lanjut

- T7 **selesai, boleh merge**. Bukti live sesi ini: tsc backend+web EXIT 0; jest **52/52 suite, 472/472 test** (62,3 dtk, `--ci --runInBand`).
- Ditinggalkan dengan benar: T8 agregat/insiden; T9/T10 UI + endpoint riwayat arsip; T11 notifikasi reopen; T12 wiring cron + **rollout migrasi 0010 ke staging/prod via runbook** (WAJIB sebelum rilis kode yang membaca kolom baru — pola runbook 0008).
- Backlog tetap: F2 (purge scope distrik), F7 (bungkus teks PDF).
- Baseline baru untuk T8: **52 suite / 472 test**.
