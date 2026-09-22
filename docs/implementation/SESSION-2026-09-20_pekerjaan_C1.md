# Sesi 2026-09-20 — Pekerjaan C1 (Tiket T0 → T5)

> Sesi tunggal mengerjakan fondasi + paruh pertama siklus C1 (periode tetap +
> approve 2 tingkat + berita acara digital): **T0, T1, T2, T3, T4, T5 selesai
> dan hijau**. Pola kerja: satu-tiket-satu-branch berantai
> (T0→T1→T2→T3→T4→T5), source of truth = salinan verbatim rencana induk di
> `docs/implementation/`, syarat-lanjutan review per tiket, verifikasi
> `tsc` backend+web dan `jest` sebelum commit.
>
> Status: T6–T12 BELUM dikerjakan.

---

## 1. Ringkasan per tiket

| Tiket | Hasil | Branch (tip) | Verifikasi akhir |
|---|---|---|---|
| T0 Migrasi DB + peran | `branches.kind`, role `STAF_PENGUMPULAN`/`STAF_KEUANGAN`, tabel `ppk/branch_submissions` + `period_calendar`, unique index, backfill Taqwa, `ceil_1000` (`c1Math.ts`) | `feat/c1-t0-fondasi-2026-09-20` @ `53c9646` → merge PR #112 (`52c9c4e`) | tsc backend EXIT 0; unit + integrasi hijau (DB test dimigrasi 0008) |
| T1 Kalender periode + WIB | `services/periodCalendar.ts` (helper tunggal `buildPeriodBoundaries`, status OPEN→TOLERANCE→LOCKED, Dc→Jan), salinan verbatim C1/B1 di-track | `feat/c1-t1-kalender-periode-2026-09-20` @ `3e46bea` | tsc backend+web EXIT 0; 15 test batas hijau; suite penuh hijau |
| T2 Scan + submit kunci | Lookup toleran (`scanClassification.ts`), `QR_WRONG_PERIOD`/`QR_PERIOD_CLOSED`, validasi `collected_at` + `serverTimestamp`, sync non-retry → gagal permanen terlihat, tolak Sept→Okt | `feat/c1-t2-scan-submit-kunci-2026-09-20` @ `fa8e539` | **38/38 suite, 339/339 test** |
| T3 Generate approve | `period_drafts` + items (migrasi 0009), robot prepare tgl 10 & 20 (draft saja, tak pernah assignments), approve 1-tx + eskalasi 24 jam + tombol-mati, guard masa-depan/kunci, guard future-HIT di scan, sapuan susulan | `feat/c1-t3-generate-approve-2026-09-20` @ `57ae87c` (termasuk fix temuan #2: tolak approve bila petugas nonaktif) | **43/43 suite, 404/404 test** (koreksi review-T3 #1) |
| T4 Submission PPK | `ppkSubmissions.ts` (hitung ceil otomatis, ensure DRAFT, FINAL 2 tingkat + version optimistik + `CONFLICT`, kunci submit/resubmit/skip), route mobile + admin, CHECK DB beda-TTD | `feat/c1-t4-submission-ppk-2026-09-20` (feat `3a3f009`; tip `639104e` = prompt T5) | **45/45 suite, 421/421 test** (`--ci --runInBand`) |
| T5 Co-sign + BA + berkas | Upacara per sesi (sign/countersign/force, `PPK_SIGNED`), scope bendahara 2 tier, BA teks snapshot, PDF lazy + hash + QR minimal, R2 privat + consent + purge, verify publik, row-lock `FOR UPDATE` | `feat/c1-t5-cosign-ba-berkas-2026-09-20` (feat `3393ecf`; tip `b6f6384` docs lanjutan) | tsc backend+web EXIT 0; **48/48 suite, 451/451 test** (`--ci --runInBand`) |

Aritmetika T5 jujur: 421 + 13 (unit BA) + 12 (integrasi cosign) + 3 (HTTP verify) + 2 (scope T4) = **451** ✅.

## 2. Keputusan penting per tiket

- **T0**: Taqwa = `PROGRAM_MWC` (Opsi 1, 1 kolom + backfill); bisyaroh 10% `ceil_1000` (867.500 → 87.000); peran baru hanya dibaca (tulis ditolak di tiket berikutnya).
- **T1**: Satu helper tanggal (`operationalTimeZone` dipakai ulang); kolom `timestamp` tanpa tz = kebijakan disengaja; `due` = akhir hari tgl 27; `DIBUKA_SEBAGIAN` hanya ditulis T7.
- **T2**: Patokan = `assignment.period`; PERIOD_CLOSED hanya bulan lalu yang baru dikunci (lebih lama → WRONG_PERIOD); `due` tgl 27 akhir hari; skip tak diubah (UNCOLLECTED = cara catat 0).
- **T3**: Robot tak pernah tulis `assignments`; approve tolak bulan-masa-depan; `tombol mati` via `WHERE status + affected-rows`; sapuan pasca-approve langsung jadi assignment teraudit; cron = endpoint + spek (wiring T12).
- **T4**: Angka murni sistem; FINAL butuh kedua signer terisi + jangkar identitas (PPK=owner, bendahara=Keuangan); force hanya Admin Ranting + alasan; agregat insiden (HP_HILANG/KOREKSI_ADMIN) = T8, bukan T4.
- **T5**: `signer_id` = pemilik sesi (body `*_signer_id` → 400); bendahara PPK seranting / MWC sedistrik-tanpa-branch; PDF dari snapshot + QR hash-konten (bukan hash bytes — bytes tak bisa meng-hash dirinya); `pdf_hash` = arsip; sign ulang PPK = CONFLICT, sign ulang ranting = timpa + audit; purge hanya `signatures/…`.

## 3. Dokumen yang lahir di sesi ini

- Salinan verbatim (hash identik, read-only): `C1-RENCANA-…-2026-09-19.md`, `B1-FILTER-…-2026-09-18.md`.
- Syarat lanjutan review: `C1-SYARAT-LANJUTAN-REVIEW-T0/T2/T3/T4-2026-09-20.md` (+ checklist TZ deploy T12, prompt T5).
- Kontrak API: §3.8 (mobile submissions + upacara), §4.11 (draft), §4.12 (ranting + BA/PDF/verify), §5.3 (prepare-draft).

## 4. Temuan lintas-tiket (dicatat agar tak terulang)

1. Konstanta magic PNG salah (`47` desimal vs `0x47`) — ditangkap test T5, bukti guard bekerja.
2. Fixture beraudit wajib hapus `activity_logs` dulu (FK users/entityId) — pola `deleteMyAuditTrails` (T3→T4→T5).
3. Suite `*.integration.test.ts` racy bila paralel (`DROP RULE`, `closeDbConnection`) — wajib `--runInBand` di CI (ketetapan review-T2, berlaku terus).
4. Fixture tanggal: periode fixed + `now` injeksi (tak kedaluwarsa oleh waktu); fixture statis Juni diperbaiki jadi dinamis (T2).
5. `pdf-lib` butuh sanitasi WinAnsi (`asciiSafe`) + metadata difiksasi; bytes tak deterministik (doc-ID acak) → idempotensi via hash tersimpan.
6. Mobile `tsc` punya 18 error TS2786 pre-existing di file tak tersentuh (0 di file tiket) — mobile tak diubah T0–T5.
7. TD-06 (noise Redis jest) tak disentuh, tetap di `MASTER-GOAL-LIST.md`.
8. Disiplin: tanpa `git add -A`; migrasi hanya via `generate` + DB test lokal; staging/prod via runbook terpisah; audit tak boleh menggagalkan operasi sah; dokumen rencana/review read-only.

## 5. Sisa (T6–T12) + saran T6

Belum dikerjakan: T6 kunci berlapis, T7 reopen, T8 laporan+agregat, T9/T10 UI peran, T11 notifikasi, T12 rollout. **Saran T6** (§14.7): `POST /v1/admin/kunci-periode` (MWC) tahap-a 27–9 tarik FINAL saja vs tahap-b 10+ buat `FINAL_NOL` + audit + notif + flag merah-bukan-lapor; pakai `finalizeBranchSubmission(asNol)` + `resolvePeriodStatus` yang sudah ada. T7 perlu tabel riwayat PDF (kolom tunggal hanya untuk versi terakhir).

---

# Sesi lanjutan — Pekerjaan C1 (Tiket T6 → T12, SELESAI SEMUA)

> Sesi lanjutan menuntaskan paruh kedua + tutup siklus: **T6, T7, T8, T9, T10,
> T11, T12 selesai dan hijau**. Pola sama: satu-tiket-satu-branch
> (`feat/c1-tX-…`), syarat-lanjutan review per tiket (G/H/J/K/L/M), verifikasi
> `tsc` backend+web, `jest --ci --runInBand` backend, `jest --ci` mobile,
> `vitest` web sebelum commit. Tanpa `git add -A` (hanya file tiket).
> Dokumen rencana/review T0–T11 read-only.

## 6. Ringkasan per tiket (lanjutan)

| Tiket | Hasil | Branch (tip) | Verifikasi akhir |
|---|---|---|---|
| T6 Kunci berlapis | `POST /v1/admin/kunci-periode` 2 tahap (REKAP 27–9 / KUNCI_KERAS 10+ `FINAL_NOL` massal + LOCKED + audit, idempoten); tutup F3 (verify wajib FINAL), F6 (`as_nol` turunan), F8 (re-countersign = koreksi), F1a (hapus yatim), F4 (test `.strict()`), F5 (nit docs) | `feat/c1-t6-kunci-berlapis-2026-09-20` @ `927fbde` (review `7540f94`, G1–G4 non-blokir) | tsc backend+web EXIT 0; **50/50 suite, 462/462 test** (451+6 unit+5 integrasi) |
| T7 Reopen menular | Reopen PPK FINAL→DRAFT menular ke branch (arsip PDF per versi `ba_pdf_archives`, TTD hangus kolom NULL + hapus R2 best-effort, version+1, jendela 48 jam, kalender LOCKED↔DIBUKA_SEBAGIAN); verify baca arsip; migrasi 0010 aditif | `feat/c1-t7-reopen-arsip-2026-09-20` @ `dcbb618` (review H1–H3) | tsc backend+web EXIT 0; **52/52 suite, 472/472 test** (462+4 unit+6 integrasi) |
| T8 Laporan + agregat | `GET /admin/laporan-mwc` 2 kartu FINAL-only + flag; agregat darurat HP_HILANG (tabel + saksi + upsert, masuk total); salin manual per kaleng + audit; BA baris agregat; selisih dilepas untuk PROGRAM_MWC; H1; migrasi 0011 aditif | `feat/c1-t8-laporan-mwc-agregat-2026-09-21` @ `71a5820` (review `7d78dcd`, J1–J4 non-blokir) | tsc backend+web EXIT 0; **55/55 suite, 480/480 test** (472+2 unit+4+2 integrasi) |
| T9 Mobile peran | 1 APK beda kartu (roleMap murni, 4 layar, tab per peran, PeriodChip+countdown, auto-sync foreground, pengingat in-app); server: pdf-versions ×2 (H3), period-info, device-token, staf ringkasan, keuangan inbox; TTD interaktif ditunda T10 | `feat/c1-t9-mobile-peran-2026-09-22` @ `356fa53` (review `73b7ae6`, K1–K4 non-blokir) | backend tsc 0 + **56/56, 485/485**; mobile **32/32, 250/250** + tsc 13 pre-existing; web tsc 0 |
| T10 Web peran + TTD | Menu peran + `lib/c1` + halaman persetujuan/setoran (TTD kanvas)/rekap-mwc + label/tone audit C1; K1 (countdown server); K4 (rebuild `dist` shared-types — tsc mobile 13→0 tanpa ubah kode); mobile PNG murni + SignSheet + sign/countersign; H1 sudah di T8 | `feat/c1-t10-web-peran-ttd-2026-09-22` @ `a5d460c` (review `c29e1bd`, L1–L4 non-blokir) | backend **56/56, 485/485**; mobile **34/34, 256/256** + tsc 1 (L1, milik T10); web **6/31** + tsc 0 |
| T11 Notifikasi | Dispatcher push→WA `send-text` (retry 10x + DLQ, tak melempar); 9 template murni; 9 call-site (approve/prepare/FINAL/selisih/reopen/BA); sapu scheduler eskalasi/H-3/kunci (dedup 20 jam + jobId); K3 audit token, K2 filter arsip, L1/L2/L3 | `feat/c1-t11-notifikasi-push-wa-2026-09-22` @ `5810249` (review `bd9b952`, M1–M4 non-blokir; merge ke staging `03a5103`) | backend **58/58, 499/499** (485+9 unit+5 integrasi); mobile **34/34, 257/257** + tsc 0; web **7/33** + tsc 0 |
| T12 Tutup siklus | Helper `sumCollectionsByPeriod` + 3 query ke periode assignment (§2.2); test akseptansi 5 (§2.2, #13, #20, #22, #9-429); M3 mock canvas; doc rollout (cron, dual-run, saklar balik, 0008→0011, petakan 22 uji, L4 tutup); adendum B1/checklist/metrik; API §4.19 + catatan §5.2; tanpa migrasi | `feat/c1-t12-rollout-bersih-2026-09-22` @ `55dffe2` (dari staging-T11 `03a5103`) | backend tsc 0 + **59/59, 504/504**; mobile tsc 0 + **34/34, 257/257**; web **7/34** + tsc 0 |

Aritmetika jujur: 451 → +11 (T6) → +10 (T7) → +8 (T8) → +5 (T9) → +0 (T10, hanya asersi) → +14 (T11: 9 unit + 5 integrasi) → +5 (T12) = **504** ✅. Mobile: 243 → +7 (T9) → +6 (T10: 4 PNG + 2 sheet) → +1 (T11 L3) = **257** ✅ (tsc mobile 13→0 via rebuild `dist` yang di-`.gitignore`). Web: 31 → +2 (T10 audit/menu) → +1 (T11 SignaturePad) = **34** ✅.

## 7. Keputusan penting lanjutan (T6–T12)

- **T6**: Fase dari jam murni (`resolveKunciPeriodePhase`); massal hanya ranting TANPA baris + TANPA PPK (DRAFT/parsial = pending manual, tak hapus uang); `FINAL_NOL` = 0 + `KOREKSI_ADMIN` + snapshot kaleng + signer NULL (segel sistem); `reported` = FINAL saja.
- **T7**: Arsip SEBELUM null-kan (hash dari snapshot FINAL); hapus R2 SETELAH commit; `reopened_until` NULL = DRAFT normal; re-FINAL segarkan jendela branch pasangan; kalender dua arah; migrasi hanya via `generate` + pasang ke DB test via skrip (push interaktif macet di Windows).
- **T8**: Agregat masuk total tak masuk rincian; upsert-ganti + audit old→new; salin manual tanpa WA donatur (provenance di audit); program bebas gerbang selisih (§8b) tapi `asNol` tetap wajib alasan.
- **T9**: Penjaga di server, klien hanya memilih endpoint; `pdf_hash` NULL = belum diunduh (bukan rusak); token milik sesi; push asli = T11.
- **T10**: TTD web = `canvas.toDataURL` (murni web); TTD mobile = encoder PNG tulisan-tangan (stored-block, nol dep) — terbukti via inflate+CRC di test; `dist/` basi adalah akar drift tipe (bukan kontrak).
- **T11**: Dispatcher tak pernah melempar (tugas > notif); `createdAt` log ikut `now` injeksi agar dedup konsisten; jobId deterministik + dedup 20 jam; hook `await` (deterministik, murah: FCM instan-false + mock queue).
- **T12**: Hari/Minggu Ini tetap wall-clock (aktivitas, bukan atribusi); `/stats` scheduler tak diubah (metrik ops, bukan uang); B1/checklist/metrik cukup adendum (tak tulis ulang sejarah); L4 DINYATAKAN TUTUP (K2+K3 di T11).

## 8. Dokumen yang lahir di sesi lanjutan

- Tinjauan ulang: `C1-TINJAUAN-ULANG-T6/T7/T8/T9/T10/T11/T12` (+ syarat T7 `C1-SYARAT-LANJUTAN-REVIEW-T7`).
- Kontrak API: §4.13 (kunci), §4.14 (reopen), §4.15 (laporan+agregat), §4.16 (mobile peran), §4.17 (web+TTD), §4.18 (notifikasi), §4.19 + catatan §5.2 (T12).
- Rollout: `C1-T12-ROLLOUT-DUALRUN-2026-09-22.md` (cron, dual-run, go/no-go, saklar balik, urutan 0008→0011, petakan 22 uji) + `C1-T12-CHECKLIST-VERIFIKASI-TZ-DEPLOY` (prasyarat).
- Migrasi: `0010` (arsip + jendela) + `0011` (agregat) — aditif murni, sudah di DB test/staging, MENUNGGU produksi (runbook T12).

## 9. Temuan lintas-tiket sesi lanjutan (agar tak terulang)

1. `packages/shared-types/dist` di-`.gitignore` → rebuild (`pnpm build:shared`/`tsc`) WAJIB tiap sesi sebelum vonis tsc mobile.
2. DB test persisten lintas sesi: sisa fixture/draft sesi lama memblokir cleanup via FK (`draft_items→officers`, `users→branches`, kalender-vs-user) — pola keras: hapus draft-items→drafts→…→users→branches→districts + user per-branch (bukan hanya per-email).
3. Dynamic `import()` butuh sufiks `.js` (node16) — 6 titik T11.
4. Import worker BullMQ di test = poll Lua ioredis-mock tanpa akhir → mock `bullmq` (pola `whatsapp-worker.test.ts`).
5. Full suite hanya foreground `--runInBand` (T7: `DROP RULE`/close koneksi pararel = racy); timeout tool 240–300 dtk cukup (~60–115 dtk).
6. Klaim angka harus dihitung ulang dari output (aritmetika di §6) — review T8/T10 menangkap overstate (F-call `listTests`, klaim tsc-0 L1).
7. Disiplin tetap: audit tak menggagalkan operasi sah; `.strict()` + test jebakan; jebakan difiksasi jadi test (magic PNG, yatim R2, doc-ID acak, base64 tak-throw).
8. T12: `calculate-summaries` filter periode di memori (N1 — benar tapi full-table; pindah ke SQL bila membesar); `stats-range` kini atribusi-periode — perubahan semantik disengaja §2.2, sudah didoc §5.2 (N2, operator jangan kaget).

## 10. Sisa setelah C1 (butuh manusia/infra — bukan kode sesi ini)

- Eksekusi: cron deploy (robot tgl 10 & 20 + sapu harian 07:00 WIB), go/no-go + migrasi produksi 0008→0011 via runbook, uji HP fisik/APK + TTD fisik, terima-push mobile (dep messaging + farm).
- Backlog abadi: F2 (purge scope), F7 (bungkus PDF), J1 (test H1), J3 (audit manual luar tx), M1 (jobId telan update), M2 (dedup per-HP), N1 (calculate-summaries full-table → filter SQL), K2-sisa? tutup, L4 tutup.
