# C1 — Tinjauan Ulang T6 Kunci Berlapis (20 Sep 2026)

> Status: **LULUS (hijau), tanpa temuan blocking.**
> Objek: commit `927fbde` (`feat(c1-t6): kunci berlapis MWC 2 tahap + FINAL_NOL massal + F3/F6/F8/F1a/F4/F5`)
> pada branch `feat/c1-t6-kunci-berlapis-2026-09-20`.
> Basis: `feat/c1-t5-cosign-ba-berkas-2026-09-20 @ 0618f2c` (baseline T5: 48 suite / 451 test).
> Dokumen ini artefak review; pola mengikuti `C1-SYARAT-LANJUTAN-REVIEW-T5-2026-09-20.md`.
> Dokumen rencana induk dan dokumen review T0–T5 bersifat read-only.

## 1. Verifikasi klaim laporan T6

| Klaim | Hasil |
|---|---|
| 10 file berubah | ✅ `git diff --name-only HEAD~1 HEAD` = tepat 10 file (2 baru: `services/kunciPeriode.ts`, `routes/admin/kunciPeriode.ts`; 2 test baru; 5 edit service/route/schema; `docs/API_DOCUMENTATION.md`) |
| `tsc --noEmit` backend + web EXIT 0 | ✅ dijalankan ulang live di sesi ini, keduanya EXIT 0 |
| 50/50 suite, 462/462 test | ⚠️ aritmetika konsisten, eksekusi penuh tak terulang di sesi ini (tiap `jest` timeout batas tool 30 dtk): `listTests` = 50 suite (48+2 ✅); `test(` baru = 6 unit + 5 integrasi = 11; 451+11 = 462 ✅. Angka penuh diserahkan ke CI |
| Route `POST /v1/admin/kunci-periode`, MWC saja | ✅ prefix `/v1/admin` (`app.ts:264`) + `authorize('ADMIN_KECAMATAN')` + guard service `role !== ADMIN_KECAMATAN → FORBIDDEN` |
| Fase `<27` tolak / `27–9` REKAP / `≥10` KERAS | ✅ `resolveKunciPeriodePhase` murni + unit 4 batas (26→27, 27 tepat, 27–9, 9→10, Des→Jan). Satu-satunya konstruksi tanggal tetap di `buildPeriodBoundaries` (disiplin TZ terjaga) |
| Massal hanya RANTING diam; PROGRAM dikecualikan; DRAFT/parsial pending | ✅ filter `kind === 'RANTING'`; program hanya dihitung tak pernah di-insert; syarat diam = tanpa branch-row DAN `count(ppk) == 0`; DRAFT/PPK-parsial → `pending` manual |
| Encoding FINAL_NOL (keputusan F6) | ✅ total 0 + `KOREKSI_ADMIN` + snapshot kaleng + `finalizedBy=MWC` + signer NULL (segel sistem) + `reported = FINAL` saja |
| Idempoten + race kunci ganda | ✅ `onConflictDoNothing(branch,year,month)` + baca pemenang; test panggil kedua → `created == 0` |
| F3 verify wajib FINAL | ✅ gate status di `baPdfService.ts:409,414`; test DRAFT+hash-benar → false, FINAL+hash-benar → true |
| F8 re-countersign dibiarkan | ✅ `UPDATE … WHERE PPK_SIGNED` tanpa tolak TTD terisi; test R5 → tetap `PPK_SIGNED + needs_force=true`; komentar kebijakan jujur (TTD lama yatim → T7/F1b) |
| F1a hapus yatim best-effort | ✅ 4 fungsi sign/countersign × ppk/branch dibungkus `try/catch → deleteFromR2(key)`; path sukses aman (key dipakai row) |
| F4 `.strict()` | ✅ 2 unit test tolak `*_signer_id` di body |
| F5 docs/komentar | ✅ diff konfirmasi kalimat 409 dipindah ke blok yang tepat + komentar determinisme dikoreksi (doc-ID acak) |
| Checklist (REKAP tanpa nol/LOCKED; KERAS 1 NOL R1 canAktif 1 + LOCKED + idempoten; program utuh; DRAFT/parsial pending; 403 non-MWC; masa depan ditolak; verify DRAFT→false; re-countersign → needs_force) | ✅ semua ada padanannya di `kunciPeriode.integration.test.ts:274-378` |
| Jebakan FK cleanup (kalender → users → branches) | ✅ `beforeAll/afterAll`: audit → collections/assignments → submissions → officers → cans → kalender SEBELUM users → users → branches → districts |

## 2. Temuan sesi ini (4, semua non-blokir)

| # | Prio | Isi | Target |
|---|---|---|---|
| G1 | P3 | Klaim "REKAP tanpa tulis" overstate: REKAP tetap memanggil `ensurePeriodCalendarRow` (insert `OPEN` bila baris belum ada; test assert baris ada). Yang benar: *tanpa tulis submission/LOCKED*. Luruskan satu kalimat `API_DOCUMENTATION.md §4.13` | T7/docs |
| G2 | P3 | `ensurePeriodCalendarRow` selalu insert `OPEN`. Bila baris belum ada dan kunci dipanggil saat jendela TOLERANCE/LOCKED, baris lahir `OPEN` padahal `periodStatus` waktu itu TOLERANCE/LOCKED (jalur KERAS sembuh via UPDATE sesudahnya; jalur REKAP-akhir menyisakan `OPEN` vs waktu). Saran: insert dengan `resolvePeriodStatus(now, b)` | T7 |
| G3 | P4 | Cakupan test belum penuh tapi aman by-construction: (a) `adminkec2` (distrik B) dibuat tapi tak dipakai — tak ada test lintas-distrik (aman karena query di-`WHERE districtId` aktor); (b) F3 hanya tier branch, gate tier PPK tanpa test DRAFT/PPK_SIGNED; (c) loop KERAS tanpa satu transaksi — crash tengah loop = sebagian FINAL_NOL tanpa LOCKED (idempoten + retry menyembuhkan) | T7/backlog |
| G4 | P4 | N+1 query (1 baca submission + 1 count PPK per ranting + snapshot kaleng). Skala kecamatan + tombol bulanan — abaikan | — |

## 3. Tindak lanjut

- T6 **selesai, boleh merge** setelah CI hijau (tsc + `jest --ci --runInBand` penuh sebagai bukti 50/462).
- Ditinggalkan dengan benar untuk T7+: reopen + arsip PDF per versi (butuh tabel riwayat) + hapus TTD lama (F1b); T8 agregat/insiden; T9/T10 UI flag merah + countdown; T11 push/WA; T12 wiring cron + verif TZ.
- Backlog lama tetap: F2 (purge scope distrik), F7 (bungkus teks PDF 95 char).
- Baseline baru untuk T7: **50 suite / 462 test** (klaim; verifikasi penuh via CI).
