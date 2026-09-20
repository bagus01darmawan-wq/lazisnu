# Sesi 2026-09-20 — Tinjauan Ulang C1-T0 (Lazisnu)

## Ringkasan sesi

Tinjauan hasil kerja T0 (fondasi C1: 2 role staf, `branches.kind`, 3 tabel submission/kalender, rumus `ceil_1000`) terhadap klaim yang dilaporkan, lalu eksekusi perbaikan yang muncul dari pemeriksaan.

## Asumsi awal yang divalidasi

| Asumsi | Hasil verifikasi |
|---|---|
| Commit-able: tepat 11 file T0 | ✅ (dicatat: jangan `git add -A` — banyak file untracked lain di working tree) |
| `tsc --noEmit` bersih & test hijau | ✅ jalankan ulang 36 suite / 322 test (NODE\_ENV=test) |
| Migrasi aditif, tidak ada DROP/alter data | ✅ identifikasi isi `0008_blue_proteus.sql` + perbandingan hash journal vs file lokal |
| Role new scope BACA, penegakan akhirnya di server T4–T6 | ✅ NET: role new tidak masuk `authorize()` manapun |

## Temuan yang muncul saat tinjauan (tidak diiklaim T0)

1. **DB Supabase BELUM migrasi 0008** — kedua DB (produksi & staging) sama-sama nol objek 0008; journal berhenti di 0007. Dibuktikan via query read-only + perbandingan hash.
2. **Foo printan dari laporan T0**: migrasi tidak menyentuh DB dev karena kredensial `DIRECT_URL` di `.env` lokal autentikasi gagal dari mesin ini — artinya catatan jujur #1 T0 ("mungkin menyentuh DB dev") ternyata tidak benar (tidak ada yang tersentuh).
3. **Dokumen rencana induk C1 tidak ada di repo** — satu-satunya artefak tinjauan `docs/tinjauan/tinjauan-rencana-c1-b1-2026-09-19.md` saat itu `untracked`. Menguraikan definisi T1–T12 mengandung asumsi di luar repo (jika ada akses di sesi lain, komit salinan ke repo).
4. **CI menangkap regresi web yang typecheck lokal (backend-only) lewatkan** — `apps/web` mengkompilasi terhadap `shared-types`; union `UserRole` di `menu-config.ts` lokal-only (3 role) tidak mengenali role staf baru. Perluasan menjadi 5 role diperbaiki.

## Tindakan yang dilakukan (eksekusi penuh)

### 1. Dokumentasi find & runbook

- Dipindahkan `0008-journal-recon.sql` dari `%TEMP%` ke `apps/backend/scripts/`.
- Membuat `docs/ci/RUNBOOK-0008-REKONSILIASI-JOURNAL.md` (Opsi B): fakta terverifikasi dari source `drizzle-orm@0.45.2` (migrator hanya bandingkan `created_at` terakhir, hash tidak pernah dibaca), urutan staging→produksi, kriteria lulus (journal 9 baris identik), 8 query verifikasi siap-pakai, disiplin `RUN_MIGRATIONS=0` + larangan drizzle-kit dari laptop (karena `DIRECT_URL` lokal mengarah ke project Supabase produksi).

### 2. Simpan konteks review & syarat lanjutan

- Dikomit `docs/tinjauan/tinjauan-rencana-c1-b1-2026-09-19.md` (dulu untracked) agar konteks review tidak hilang.
- Membuat `docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T0-2026-09-20.md` berisi addendum acceptance criteria: T1 (helper tunggal WIB + test batas lintas-tahun), T4 (FINAL wajib 2 TTD terisi + test CHECK DB + test staf tanpa branchId→403), T7 (reopen hanguskan TTD), merujuk roadmap TD-06. Status eksplisit "bukan tugas baru, melainkan kriteria tambahan untuk tugas yang ada".

### 3. Perbaikan typo web yang ditemukan CI

- Commit `53c9646`: perluas union `UserRole` di `apps/web/src/lib/menu-config.ts` menjadi 5 nilai (role staf belum punya menu → `getMenuItems` mengembalikan `[]`).

### 4. Push & PR

- PR #112 (`feat/c1-t0-fondasi-2026-09-20` → `staging`). Ceklis review di body PR.
- Semua check CI hijau: Verify, Test backend (0000→0008 apply bersih di Postgres 16 kosong = 1m26s), Test web, Test mobile, CodeQL, Dependency review, changes.
- Merge PR #112 (enam commit tersebut masuk `staging` sebagai `52c9c4e`).

### 5. Persiapan ganti pekerjaan

- Branch kerja T1 baru: `feat/c1-t1-kalender-periode-2026-09-20` (branch lahir dari staging segar `52c9c4e`).
- Dokumen bacaan T1 dibuat: prompt siap pakai yang memperlihatkan konteks, temuan "dokumen induk hilang", syarat wajib, dan disiplin yang tidak boleh dilanggar.
- TD-06 tercatat di `MASTER-GOAL-LIST.md` bagian Technical Debt.

## Status di akhir sesi

- `staging` lokal: `52c9c4e` (PR #112 sudah di-merge).
- `feat/c1-t1-kalender-periode-2026-09-20` di-push, siap kerja.
- CI `staging` sedang berjalan (push merge memicu CI+Security; deploy staging otomatis jika hijau); job Deploy staging adalah bagian dari rerun CI — bukan eksekusi manual.

## Catatan berikutnya (T1 atau sesi lain)

- TEMUAN TEROBAT BELUM: "dokumen rencana induk C1 tidak ada di repo". Kalau pemilik/sesi penulis punya akses ke dokumen asli, komit salinnya ke `docs/implementation/` dan perbarui checklist syarat lanjutan.
- Eksekusi runbook 0008 ke DB staging (via VM) **sebelum** rilis kode yang membaca `period_calendar` (T1/T2). Saat ini DB staging belum migrasi; `RUN_MIGRATIONS=0` di semua deploy.
- Penalaran dokumen Rencana C1: untuk menghindari "definisi T1–T12 mengandung asumsi di luar repo" di sesi S--2026-09-20_nanti, segera komit dokumen rencana jika diakses.

---

## Sesi lanjutan 2026-09-20 — Tinjauan Ulang C1-T1 + Rekayomendasi T2

> Dilanjutkan setelah T1 (`feat/c1-t1-kalender-periode-2026-09-20`, commit
> `53de886` docs + `f0e8ee0` feat, push sukses). Ini sesi **review, bukan
> implementasi T2** — namun berisi eksekusi temuan review non-blocking dari
> T1 dan prompt siap pakai untuk T2.

### 1. Temuan §1 (sumber) — terverifikasi
- `.hermes/` tetap di `.gitignore:58-59`; dokumen induk C1/B1 tidak pernah
  ter-commit sampai T1. Sesi penulis punya working-tree `.hermes/plans/`, saya
  ** tidak mengandalkan memori tulisan laporan** — SHA256 disamakan secara
  langsung (`50BB…BBE` C1, `B5B3…982` B1).

### 2. Verifikasi klaim T1 (semua terjadi di mesin ini)
| Klaim | Bukti |
|---|---|
| 38 suite / 339 test lolos | Background run jest: `Test Suites: 38 passed, 38 total / Tests: 339 passed` (64.8s) |
| Backend typecheck hijau | `npm run typecheck` exit 0 |
| Web typecheck hijau | Background run; `error TS` count = 0 |
| 15/15 periodCalendar test lolos | `npx jest periodCalendar.test.ts` → 15 passed |
| Enum period_status cocok union | `schema.ts:21 pgEnum('period_status', ['OPEN','TOLERANCE','LOCKED','DIBUJA_SEBAGIAN'])` ≡ `PeriodStatusValue` |
| MIN/MAX year = cermin generateTasksSchema | `periodCalendar.ts:37-39` (2020–2100) ≡ `scheduler.ts:14-17` |
| Verbatim SHA256 | `Get-FileHash` working-tree vs `docs/implementation/` identik |
| Commit higiene | `git status` → file untracked lain tak tersentuh (tanpa `git add -A`) |
| Guard `noRawDateInterpolation` lolos | Test ada (`services/__tests__/noRawDateInterpolation.test.ts`); hanya menandai tanggal sebagai operand `sql``` — `periodCalendar.ts` tidak pakai `sql``` sama sekali |

### 3. Temuan review C1-T1 (6, semua non-blocking)
1. **Premium TZ 2 lapis belum tersampaikan**: laporan/syarat T1 hanya menyebut OS/VM/container, tapi driver pg menyerialisasi `Date` dengan **offset sesi PostgreSQL**. OS = WIB tapi sesi PG = UTC → `timestamp without time zone` bisa bergeser 7 jam. Perlu `SHOW timezone`.
2. `checkOperationalTimezone` membandingkan *nama* zona → false-negative pada alias (mis. `Etc/GMT-7` = +07:00 setara). Perlu fallback: bila `ok:false` tapi `offsetMinutes===420` → pass-with-note.
3. `isPeriodLocked(now, toleranceEnd)` menerima `Date` mentah → pemanggil T2/T3 bisa salim. Saran: paksa oper `buildPeriodBoundaries(...).toleranceEnd`.
4. `periodKey` duplikat inline di `scheduler.ts:65` (dedupe T2).
5. Judul tugas "kalender periode + cron" — cron memang di-T3/T12 (sudah jujur di laporan T1 §1).
6. Noise Jest (`Force exiting Jest`, "Audit Logger Insert Failed di log) = TD-06 pre-existing, bukan regresi T1.

### 4. Eksekusi penuh temuan review (commit `3e46bea`)
Bukan hanya rekomendasi — langsung dilaksanakan, **komentar/docstring saja, nol perubahan logika** (diff +28/−2 di 2 file + 1 dokumen baru):
- `operationalTimeZone.ts` header: premise dua-lapis (OS + sesi PG), mekanisme geser 7 jam, perintah `SHOW timezone` / `SET timezone`, referensi ke checklist T12.
- `periodCalendar.ts`: `isPeriodLocked` docstring kini ekspiriten "WAJIB `buildPeriodBoundaries(...).toleranceEnd`"; `checkOperationalTimezone` docstring menjelaskan alias + fallback offset; header merujuk ke checklist T12 (`SHOW timezone`).
- `docs/implementation/C1-T12-CHECKLIST-VERIFIKASI-TZ-DEPLOY-2026-09-20.md` baru (verbatim dokumen induk **tidak disentuh**): 3 lapis TZ (OS/container, Node, sesi PG), prosedur 5 langkah berurutan, smoke test bandingkan baris `period_calendar` vs `buildPeriodBoundaries`, catatan dedupe `periodKey`.

Verifikasi pasca-eksekusi: `npm run typecheck` exit 0; `periodCalendar.test.ts` (15) + `noRawDateInterpolation.test.ts` (1) = 16/16. Push ke `feat/c1-t1-kalender-periode-2026-09-20`.

### 5. Prompt T2 siap pakai (ringkasan — lihat di chat ini untuk full prompt)
Tema T2 = **Scan + submit kunci (§14.1–14.4)**: patokan periode = assignment; lookup toleran pakai helper T1; kode `QR_WRONG_PERIOD` & `QR_PERIOD_CLOSED` di `utils/errorCatalog.ts` + shared-types; validasi `collected_at` ∈ [assign, tolerance_end] ±10 mnt + bukti `serverTimestamp`; `offline/sync.ts:54-60` jangan spam/retry ngotot/hilang; tolak submit Sept→Okt. Hard constraint: tiap `new Date` batas periode **hanya** via `periodCalendar.ts`; DB lokal saja (`db:reset-test`); jangan sentuh verbatim dokumen, jangan sentuh runbook/RUN_MIGRATIONS/TD-06; T3/T6/T7 di luar scope.

### 6. Status di akhir sesi ini
- `feat/c1-t1-kalender-periode-2026-09-20` = `3e46bea` (review + eksekusi),
  push ke origin.
- Siap lanjut T2 dari branch ini (atau `main` bila PR T1 ke-`staging` sudah
  dipetakan; periksa status CI `staging` yang tertindih oleh merge #112).
- Eksekusi runbook 0008 ke staging **sebelum** kode T1/T2 membaca
  `period_calendar` (DB staging belum migrasi 0008, `RUN_MIGRATIONS=0`).

