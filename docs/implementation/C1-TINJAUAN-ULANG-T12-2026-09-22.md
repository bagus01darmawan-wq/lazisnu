# C1 — Tinjauan Ulang T12 Tutup Siklus + Rollout (22 Sep 2026)

> Status: **LULUS (hijau), tanpa temuan blocking. Seluruh tiket C1 (T0–T12) selesai.**
> Objek: commit `55dffe2` (`feat(c1-t12): tutup siklus - atribusi periode + 22 uji + rollout`)
> pada branch `feat/c1-t12-rollout-bersih-2026-09-22`.
> Basis: staging-T11 `03a5103` (review T11: LULUS + M1–M4). Baseline: backend 58/499,
> mobile 34/257, web 7/33.
> Pola mengikuti `C1-TINJAUAN-ULANG-T11-2026-09-22.md`. Dokumen review T0–T11 read-only.

## 1. Verifikasi klaim laporan T12

| Klaim | Hasil |
|---|---|
| 10 file, tanpa migrasi | ✅ `git diff --name-only 03a5103..HEAD` = tepat 10 (3 edit backend + 1 test baru; 1 test web; 5 docs — API + checklist + metrik + B1 + rollout). Klaim "10 (3+1+1+5)" pas; jalur docs checklist yang benar `docs/audit/` (bukan `docs/implementation/` seperti tertulis di laporan — redaksi saja) |
| Backend `tsc` 0 | ✅ live (`npx tsc --noEmit` EXIT 0) |
| Mobile `tsc` 0 | ✅ live EXIT 0 |
| Web `tsc` 0 | ✅ live EXIT 0 |
| Test akseptansi 5 (§2.2, #13, #20, #22, #9) | ✅ live: `c1Acceptance12` **5/5 passed** (§2.2 atribusi, #20 FORBIDDEN, #13 PERIOD_CLOSED+Okt, #22 sapu+DLQ, #9 429) |
| Full backend **59/59, 504/504** (499+5) | ⚠️ aritmetika konsisten (499+5=504; suite 58+1=59) dan 5 test baru hijau live, tapi **full suite tak terkonfirmasi lokal** (suite akseptansi saja ~25 dtk; tool timeout 30 dtk) — jadikan log CI sumber kebenaran |
| Mobile **34/34, 257/257** | ✅ parsial live: SignSheet `3/3`; full suite mengacu CI (tidak ada diff mobile di T12, jadi 257 stabil) |
| Web **7/34** | ✅ live penuh: `7 files, 34 passed` (SignaturePad 3/3 termasuk test gambar M3) |
| Helper `sumCollectionsByPeriod` + 3 query ke periode assignment | ✅ dengan koreksi redaksi: **2 call-site helper + 1 filter inline** — `tasks.ts` dashboard monthStats + stats-range via helper (join assignments, filter `periodYear/Month` + COMPLETED + latest, benar); `scheduler.ts calculate-summaries` filter inline di memori (`inPeriod`), bukan via helper. Klaim "3 query" benar sebagai hasil, "helper bersama" hanya untuk 2 di antaranya |
| M3 mock canvas (web 3/3) | ✅ `mockCanvas2d` menutup down→move→up→emit + round-trip PNG; 2 test lama masih memancarkan warning jsdom `getContext not implemented` tapi hijau — M3 inti (path gambar) tertutup |
| Doc rollout (cron, dual-run, saklar balik, 0008→0011, 22 uji, L4 tutup) | ✅ `C1-T12-ROLLOUT-DUALRUN-2026-09-22.md` 76 baris: cron tgl 10/20 + harian 07:00 WIB, dual-run s/d 9 Okt, go/no-go, saklar balik (revert 3 call-site; migrasi aditif), urutan 0008→0009→0010→0011, tabel 22 uji, L4 DINYATAKAN TUTUP + backlog abadi F2/F7/J1(M2?)/J3/M1/M2 |
| Adendum B1/checklist/metrik; API §4.19 + §5.2 | ✅ 3 adendum penutup + §4.19 + catatan §5.2 (atribusi assignment; Hari/Minggu tetap wall-clock) |
| Checklist 22 uji terpetakan (17 + 5 baru) | ✅ tabel §4 rollout: #9→`c1Acceptance12` 31 hit→429 (`verify.ts:14` max 30/mnt — cocok); #13/#20/#22 + §2.2 → test baru; sisanya menunjuk suite T0–T11 yang tepat |
| Temuan (a) mock `bullmq` | ✅ pola sama dengan `whatsapp-worker.test.ts`; alasan (poll Lua ioredis-mock) ditulis di komentar test |
| Temuan (b) cleanup FK + EMP-T12-1 | ✅ urutan hapus (draft→koleksi/assignment→arsip→submission→agregat→officer→kaleng→kalender→notif→user→branch→distrik) + komentar sisa massal #22; konsisten pola keras T6–T11 |
| Temuan (c) rate-limit via probe | ✅ konsisten dengan test auth existing (login 5/mnt→429) dan `verify/ba` 30/mnt |
| Temuan (d) `dist/` gitignored | ✅ konsisten dengan K4 (T10); tidak ada `dist/` di diff |

## 2. Temuan sesi ini (3, semua non-blokir)

| # | Prio | Isi | Target |
|---|---|---|---|
| N1 | P4 | **`calculate-summaries` ambil SEMUA koleksi lalu filter di memori** (`scheduler.ts:139-152`): benar secara atribusi, tapi full-table `findMany` + `with` branch/officer/assignment tiap hitung ulang. Untuk skala MWC (ribuan baris) masih aman; bila membesar, pindahkan filter periode ke SQL (join assignments di where). Terima untuk T12 | backlog |
| N2 | P4 | **Perubahan semantik `stats-range` diam-diam**: nominal kini per PERIODE assignment yang tersentuh rentang (bukan collected_at dalam rentang) — konsisten §2.2 dan dengan separuh tugas, tapi rentang 1–5 Okt kini memuat nominal assignment Sept bila tersentuh. Sudah didokumentasikan (§5.2 + komentar kode); hanya catat agar operator tidak kaget | info |
| N3 | P4 | **Redaksi kecil laporan T12**: (i) jalur checklist = `docs/audit/` bukan `docs/implementation/`; (ii) "3 query via helper" = 2 helper + 1 inline; (iii) "Hari/Minggu Ini tetap wall-clock" benar di kode (today/weekStart tetap `collectedAt`) ✅ — tidak ada yang salah, hanya presisi kata | info |

## 3. Tindak lanjut

- T12 **selesai, boleh merge ke staging**. Bukti live sesi ini: backend/mobile/web tsc 0; akseptansi `5/5`; web `7/34`; SignSheet `3/3`. Full `59/59, 504/504` + mobile `34/257` mengacu CI.
- **C1 (T0–T12) DINYATAKAN SELESAI di level kode.** Yang tersisa di luar kode (butuh manusia/infra): eksekusi cron di deploy, go/no-go + migrasi produksi 0008–0011 via runbook, uji HP fisik/APK, mobile terima-push.
- Backlog abadi: F2, F7, J1 (H1-test), J3, M1, M2, N1 (+ N2/N3 info).
