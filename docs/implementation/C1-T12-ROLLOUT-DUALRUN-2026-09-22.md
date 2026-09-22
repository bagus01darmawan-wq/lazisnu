# C1-T12 — Rollout: cron, dual-run, saklar balik, migrasi (22 Sep 2026)

> Artefak T12 (§14 C-11 + §14.16 + §12). Status prod terverifikasi: `main`
> pra-C1, DB 0007 — migrasi 0008–0011 HANYA via runbook ini (urutan menanjak,
> TIDAK dibalik: setiap migrasi aditif). Kode C1 membaca tabel/kolom baru;
> tanpa migrasi → 500 di jalur submission/reopen/agregat/notif.

## 1. Cron terjadwal (wiring deploy — zona WIB, `OPERATIONAL_TIMEZONE`)

| Kapan (WIB) | Perintah | Efek |
|---|---|---|
| Tgl 10 00:00, tiap bulan | `POST /v1/scheduler/prepare-draft {year,month = bulan berjalan}` + `x-internal-api-key` | Robot siapkan draft periode berjalan (pasca-kunci M, §6); Staf setujui |
| Tgl 20 00:00, tiap bulan | sama (bulan berjalan) | Sapuan susulan kaleng/PPK baru + kickoff pengingat |
| Harian 07:00 | `POST /v1/scheduler/notifikasi-sapu {year,month = bulan berjalan}` | Eskalasi approve (>24 jam → Keuangan) + H-3 (ACTIVE tersisa) + mendekati kunci (2 hari terakhir toleransi); dedup 20 jam |

Semua endpoint menolak bulan masa depan; tak ada tombol manual (Staf via
`/v1/admin/period-drafts`). Premis TZ: server `TZ=Asia/Jakarta` + cek
`checkOperationalTimezone` + `SHOW timezone` sesi PostgreSQL (lihat
`C1-T12-CHECKLIST-VERIFIKASI-TZ-DEPLOY-2026-09-20.md`).

## 2. Dual-run s/d 9 Okt + go/no-go + saklar balik

- 20 Sep–9 Okt: laporan lama (WA/koleksi mentah) tetap dibuka; BA digital
  dibentuk paralel. Data Juli/Agu = historis pra-sistem (tanpa BA).
- Berlaku penuh 10 Okt (kunci keras pertama); Sept jalan aturan lama s/d 9 Okt.
- Go: tidak ada uang hilang (rekap WA vs `laporan-mwc` cocok per §8) +
  MWC bisa tarik FINAL.
- Saklar balik: kode lama = query `collectedAt` (helper `sumCollectionsByPeriod`
  satu-satunya titik baru — revert = kembalikan 3 call-site ke filter tanggal);
  migrasi 0008–0011 aditif (tabel + kolom nullable + enum value? TIDAK ada
  alter destruktif) sehingga rollback kode aman tanpa down-migration.
  Operator migrasi ditunjuk sebelum rilis (C-11).

## 3. Urutan migrasi produksi

`0008` (fondasi submission) → `0009` (draft) → `0010` (arsip + jendela) →
`0011` (agregat). Kriteria lulus per journal (pola runbook 0008). Staging
sudah 0008–0011 (terverifikasi T8–T11); produksi menunggu go T12.

## 4. Petakan 22 uji §12 → bukti (uji penuh hijau = lulus)

| # | Skenario | Bukti test |
|---|---|---|
| 1 | Scan Sept 5 Okt → Toleransi | `scanClassification`/`scan-qr` toleransi + `c1Acceptance12` atribusi |
| 2 | Scan Sept 10 Okt → `QR_PERIOD_CLOSED` | klasifikasi scan + `#13` acceptance |
| 3 | Jemput 12 Okt → rekap Okt | `periodDrafts` prepare Okt pasca-kunci (early-generate §6) |
| 4 | FINAL → resubmit ditolak | `ppkSubmissions` + `collectionSubmission` kunci |
| 5 | Ranting kunci + PPK DRAFT → tolak + nama | `computeBranchFinalValues` openNames |
| 6 | MWC tarik campur → hanya FINAL | `mwcRecap` FINAL-only + pending |
| 7 | Diam → FINAL_NOL | `kunciPeriode` KUNCI_KERAS |
| 8 | PDF unduh ulang = snapshot | `baPdfService` hash tersimpan + verify |
| 9 | Rate limit 30/mnt | `c1Acceptance12` 31 hit → 429 (rute `/v1/verify/ba`) |
| 10 | Data uji + WA nomor uji | Prosedur: fixture `0840000009xx`/`TEST-QR-*` + WA dry-run tanpa kredensial |
| 11 | Batas 09 23:59 vs 10 00:00 | `periodCalendar` 1-ms + `#13` |
| 12 | TZ HP ≠ WIB | `periodCalendar` independen-TZ + cek deploy T12 |
| 13 | Offline 27 Sep sync 11 Okt → tolak | `c1Acceptance12` PERIOD_CLOSED + Okt lolos |
| 14 | `collected_at` mundur → tolak/flag | `assertCollectedAtInWindow` + audit |
| 15 | 1 akun 2 TTD → tolak | `cosign` beda-userId + CHECK DB |
| 16 | FINAL ganda → sekali | `CONFLICT` version/status guard |
| 17 | Reopen menular | `reopen` contagion + arsip + hash |
| 18 | Kunci berlapis 2 tahap | `kunciPeriode` REKAP vs KERAS + audit + notif |
| 19 | Approve dobel → sekali | `approveDraft` tombol-mati |
| 20 | Staf FINAL/Kunci → 403 | `c1Acceptance12` STAF_PENGUMPULAN → FORBIDDEN |
| 21 | PDF V1/V2 pasca-reopen | arsip `contentHash` + verify dua versi |
| 22 | Beban + notif massal | `c1Acceptance12` sapu 25 recipient + DLQ `staff_notice` FAILED |

## 5. Klarifikasi sisa review (M4 review-T11)

- **L4 (review-T10) DINYATAKAN TUTUP**: K2 ditutup diff T11 (filter status
  arsip + test versi-99-DRAFT), K3 ditutup diff T11 (`DEVICE_TOKEN_SAVED` +
  test). Tidak menggantung lagi.
- Backlog abadi (di luar C1): F2 (purge scope), F7 (bungkus PDF), H1-test
  (J1), J3 (audit manual luar tx), M1 (jobId telan update), M2 (dedup
  per-HP), M3-sisa (down/move/up web — mock canvas menutup render+hapus).
- Mobile terima-push (dep `@react-native-firebase/messaging` + device farm)
  tetap di luar C1 — `device-token` + dispatcher + antrean WA siap.
