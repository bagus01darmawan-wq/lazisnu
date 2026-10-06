# C1 — Tinjauan Ulang T8 Laporan MWC + Agregat (21 Sep 2026)

> Status: **LULUS (hijau), tanpa temuan blocking.**
> Objek: commit `71a5820` (`feat(c1-t8): laporan MWC 2 kartu + agregat darurat + salin manual`)
> pada branch `feat/c1-t8-laporan-mwc-agregat-2026-09-21`.
> Basis: T7 `6ea6f70` (review T7: LULUS + H1–H3). Baseline: 52 suite / 472 test.
> Pola mengikuti `C1-TINJAUAN-ULANG-T7-2026-09-20.md`. Dokumen review T0–T7 read-only.

## 1. Verifikasi klaim laporan T8

| Klaim | Hasil |
|---|---|
| 21 file | ✅ `git diff --name-only 6ea6f70 HEAD` = tepat 21 (0011 + snapshot + journal, 3 service baru, 2 route baru, 3 test baru, 7 edit, docs §4.15) |
| `tsc` backend + web EXIT 0 | ✅ dijalankan ulang live, keduanya EXIT 0 |
| **55/55 suite, 480/480 test** | ✅ **dijalankan ulang penuh secara live** (proses latar): `Test Suites: 55 passed; Tests: 480 passed`. Aritmetika: 472 + 2 unit (incidents) + 4 integrasi (agregat/manual) + 2 integrasi (rekap) = 480; 52+3 file = 55 |
| Migrasi 0011 ke DB test | ✅ `_journal.json` idx 11 = `0011_lying_monster_badoon`; SQL = tabel `ppk_emergency_aggregates` + FK ×4 + unique `(officer,year,month)` + idx `(branch,period)` — aditif murni; suite integrasi memakainya tanpa error. **DB remote tak disentuh** (runbook T12) — konsisten disiplin |
| `computePpkTotals` inklusi agregat | ✅ total = jumlah kaleng + `aggregateTotal`; `collectionCount` = jumlah kaleng SAJA (agregat tak menambah rincian); test: 50000+25000=75000, bisyaroh ceil(7500)=8000, upsert 30000 → 80000; test T4 lama diperbarui ekspektasinya (aggregateTotal: 0) |
| `POST /admin/emergency-aggregates` | ✅ scope server: peran salah → FORBIDDEN, ranting salah → FORBIDDEN_SCOPE, saksi bukan Keuangan seranting → FORBIDDEN_SCOPE (pakai `assertPpkBendaharaScope` — aturan countersign T5); alasan hanya HP_HILANG/KOREKSI_ADMIN; upsert-ganti `onConflictDoUpdate` + audit old→new (`EMERGENCY_AGGREGATE_RECORDED`, `replaced` flag); FINAL → CONFLICT; jendela reopen lewat → ditolak (`assertReopenWindowOpen`) |
| `POST /admin/collections/manual` | ✅ validasi inti = jalur submit PPK (`validateAssignmentForSubmit` + `assertCollectedAtInWindow` + `submitCollection` dalam 1 tx); officer-beda-kaleng ditolak; provenance audit `MANUAL_COLLECTION` (test assert `audit.userId` = admin); tanpa WA donatur; empty-streak best-effort |
| `GET /admin/laporan-mwc` | ✅ hanya ADMIN_KECAMATAN; 2 kartu (ranting dgn share, program bruto); sumber = SNAPSHOT FINAL/FINAL_NOL (tanpa ensure/tulis — benar, beda dgn daftar T4); DRAFT = BELUM_LAPOR + flag MASIH_DRAFT; flag: SELISIH_TANPA_ALASAN (defensif), GABUNG_PERIODE, INSIDEN_*, MEMUAT_AGREGAT; rows di-sort nama |
| BA-PPK baris agregat | ✅ `aggregateTotal > 0` → baris "Termasuk agregat darurat"; teks BA (getPpkBeritaAcara) + PDF (ensurePpkBaPdf) keduanya menyuplai; snapshot QR berubah (bisyaroh masuk konten kanonis) — sah karena QR terikat versi |
| Gerbang selisih dilepas PROGRAM_MWC (temuan 6b) | ✅ `computeBranchFinalValues` membaca `branches.kind`; wajib-alasan hanya `!isProgram`; variance tetap dihitung utk display; asNol tetap wajib alasan (disengaja vs kebetulan — benar); test: program FINAL share 0 tanpa alasan |
| H1 | ✅ `reopen.ts`: extend jendela kini `AND status` (PPK: DRAFT/PPK_SIGNED dinamis via `statusGuard`; branch: DRAFT) — re-FINAL yang menyelinap tak lagi tertimpa jendela basi |
| Checklist test | ✅ semua item ada padanannya: gerbang 403 (peran/scope/saksi), upsert+audit, 75000=50000+25000 tanpa rincian ekstra, FINAL kunci agregat + snapshot ranting memuat (fin.total 80000), happy manual + audit + dobel-submit `ASSIGNMENT_INVALID` + FINAL-kunci `QR_ALREADY_SUBMITTED`, rekap math 2 kartu persis (75000/8000/20100/46900; program 30000/3000/27000) + pending + flag, program share 0 tanpa alasan, H1 |
| Jebakan 6(a) — ekspektasi dobel | ✅ jujur dikoreksi: assignment COMPLETED → `ASSIGNMENT_INVALID` (validate dulu), FINAL-kunci lewat assignment ACTIVE baru → `QR_ALREADY_SUBMITTED`; kedua test eksplisit |

## 2. Temuan sesi ini (4, semua non-blokir)

| # | Prio | Isi | Target |
|---|---|---|---|
| J1 | P3 | **H1 terverifikasi di kode tapi tanpa test regresi** — `statusGuard` di `reopen.ts` dan guard `status='DRAFT'` di jalur branch tidak punya test balapan (memang sulit diuji deterministik; risiko memang kecil karena update tanpa guard hanya berdampak jendela basi). Test unit murni tak menjangkau; bila suatu saat menyentuh `reopen.ts`, tambahkan test tx yang disisipi | T12/backlog |
| J2 | P4 | Rekap MWC loop N+1 + agregat per-branch (2 query per ranting) — skala kecamatan, read-only, tombol bulanan; konsisten diterimanya G4 di T6 | — |
| J3 | P4 | Salin manual `recordManualCollection` tidak menuliskan `MANUAL_COLLECTION` di dalam transaksi yang sama dengan submit (audit setelah tx) — jika proses mati di antara keduanya, baris collection sah tanpa catatan provenance. Jendela sangat sempit, dampak higiene-provenance bukan uang (baris tetap terhitung); catat saja | backlog |
| J4 | P4 | `emergencyAggregates.ts` mengunci agregat saat FINAL, tapi agregat yang sudah masuk snapshot lalu barisnya DIHAPUS manual dari DB (jalur tak ada di aplikasi) tidak akan menarik snapshot — sesuai desain snapshot-beku; hanya catatan bahwa penghapusan langsung-DB tak didukung (baik) | — |

## 3. Tindak lanjut

- T8 **selesai, boleh merge**. Bukti live sesi ini: tsc backend+web EXIT 0; jest **55/55 suite, 480/480 test**.
- ⚠️ **KOREKSI framing (22 Sep 2026):** butir berikut ternyata salah untuk
  bagian staging — merge ke `staging` = auto-deploy (`Deploy staging: success`
  22 Sep 03:53Z, run `35684837759`), sehingga backend staging berjalan dengan
  DB tanpa 0010/0011 dan jalur `ensurePpkSubmission → computePpkTotals` berpotensi
  500 (`42P01`). Runbook 0010+0011 ke **staging dieksekusi SEKARANG**
  (`docs/ci/RUNBOOK-0010-0011-STAGING-2026-09-22.md` + `apps/backend/scripts/
  0010-0011-journal-recon.sql`). Yang benar-benar menunggu T12: rollout ke
  **produksi** + cron + TZ. Pelajaran: **DB mendahului kode di lingkungan
  auto-deploy** — migrasi aditif staging diberlakukan sebelum PR merge.
- Ditinggalkan dengan benar: T9/T10 UI + endpoint riwayat arsip (H3 review-T7); T11 notifikasi; T12 wiring cron + rollout migrasi 0010 + 0011 ke **produksi** via runbook (WAJIB sebelum rilis kode yang membaca tabel/kolom baru; 0011 tanpa tabel = `computePpkTotals` 500 di semua jalur).
- Backlog tetap: F2 (purge scope distrik), F7 (bungkus teks PDF), H1-test (J1).
- Baseline baru untuk T9/T10: **55 suite / 480 test**.
