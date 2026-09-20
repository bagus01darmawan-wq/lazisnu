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
