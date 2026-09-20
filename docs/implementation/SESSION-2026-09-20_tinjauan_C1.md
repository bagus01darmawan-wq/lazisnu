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

---

## Sesi lanjutan 2026-09-20 — Tinjauan Ulang C1-T3 + Prompt T4

> Sesi **review, bukan implementasi T4**. Basis: commit `aa29a62`
> (`feat(c1-t3): generate approve robot-draft-manusia-setujui + eskalasi 24 jam`)
> di branch `feat/c1-t3-generate-approve-2026-09-20`. Hasil: T3 **LULUS**;
> 1 koreksi angka laporan; dokumen tindak lanjut T3 dibuat + dipush; prompt T4
> disusun. Catatan sesi review C1-T2 ada di file terpisah
> `SESSION-2026-09-20_tinjauan_C1-T2.md` (pola penamaan yang sama dipakai bila
> sesi T4 nanti ingin file sendiri).

### 1. Verifikasi ulang klaim laporan T3 (dijalankan di mesin ini)

| Klaim laporan T3 | Bukti hasil pengukuran ulang |
|---|---|
| 17 file berubah, 4720 baris | ✅ `git show --stat aa29a62` persis sama dengan tabel §2 laporan |
| `tsc` backend EXIT 0 | ✅ dijalankan ulang, EXIT 0 |
| `tsc` web EXIT 0 | ✅ dijalankan ulang, EXIT 0 |
| `tsc` shared-types (pelajaran PR #112) | ✅ EXIT 0 |
| `npx jest` 43/43 suite hijau | ✅ `Test Suites: 43 passed, 43 total` |
| `npx jest` 402/402 test hijau | ⚠️ hasil ukur = **404 passed, 404 total** (selisih +2 → masuk dokumen tindak lanjut) |

### 2. Checklist tiket T3 (§15:435) + syarat review-T2 → semua terbukti di kode

- **Syarat T2 butir (a)** robot tak melahirkan assignment: jalur DRAFT
  `preparePeriodDraft` hanya menulis `period_drafts` + `period_draft_items` +
  `period_calendar`; insert `assignments` hanya di approve manusia dan sapuan
  susulan pasca-approve (keduanya teraudit).
- **Syarat T2 butir (b)** baris kalender identik `buildPeriodBoundaries`:
  `periodCalendarRowMatches` (bandingkan hingga milidetik) dipakai
  `ensurePeriodCalendarRow`; diuji 4× di unit + asersi di test integrasi.
- Approve 1 transaksi + **tombol mati sekali** (`UPDATE … WHERE status='DRAFT'`
  dengan cek baris terpengaruh → rollback penuh bila kalah balapan);
  **eskalasi 24 jam** (dini 403, telat lolos); tolak **masa depan**
  (`VALIDATION_ERROR`) dan **periode terkunci** (`QR_PERIOD_CLOSED`);
  edit/hapus hanya `STAF_PENGUMPULAN` + status DRAFT + petugas se-ranting;
  matriks scope ranting/MWC-program/`FORBIDDEN_SCOPE`; guard **future-HIT** di
  `classifyScan`; kron tgl 10 & 20 lewat `POST /v1/scheduler/prepare-draft`
  (kunci internal `x-internal-api-key` + spek crontab di komentar); persiapan
  notifikasi T11 (`collectApprovalRecipients`, `approvalEventKind`) tanpa kirim.

### 3. Temuan sesi ini (1 koreksi + 5 non-blokir, tanpa perubahan kode produksi)

1. **Koreksi angka laporan**: 402 → nyatanya 404 test.
2. `approveDraft` tidak memvalidasi ulang `officer.isActive` (jalur edit sudah) —
   petugas yang dinonaktifkan antara prepare (tgl 10) dan approve tetap
   melahirkan tugas ACTIVE.
3. Penamaan `calendarRowWritten` menyesatkan: nilainya "baris kalender kini
   konsisten dengan helper", bukan "baru ditulis" (true walau tak menulis; false
   bila baris warisan meleset — perilaku benar, hanya nama/komentar).
4. `listDrafts` N+1: hitung `itemCount` per draft dengan query terpisah.
5. `preparePeriodDraft` memakai transaksi **per-branch** — diterima (idempoten,
   run ulang men-top-up sisanya); dicatat agar tugas berikutnya tidak
   "merapikannya" menjadi satu transaksi global tanpa alasan.


### 4. Eksekusi yang dilakukan sesi ini (hanya dokumen + commit docs)

- Membuat `docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T3-2026-09-20.md`
  (74 baris, pola dokumen T0/T2): aksi seketika (koreksi angka test) → **T4**
  (validasi petugas aktif saat approve + saran `ceil`/`version`/kedua-signer
  wajib terisi/test 403 staf tanpa scope) → **T12** (pola fixture
  `activity_logs` + suite integrasi wajib seri, diperkuat karena suite T3 juga
  `DROP RULE` global) → **backlog** (`calendarRowWritten`, N+1 `listDrafts`,
  keputusan transaksi per-branch, TD-06).
- Commit `d04a4a1` — `docs(c1-t3): tindak lanjut review — koreksi angka test +
  syarat lanjutan T4/T12/backlog` (1 file, 74 ins). Push ke origin, diverifikasi
  `origin/feat/c1-t3-generate-approve-2026-09-20` = `d04a4a1` di atas `aa29a62`.
- Disiplin: `git add` file spesifik, **tanpa** `git add -A`; file untracked lain
  di working tree tidak tersentuh (TD-06 utuh). Tidak ada perubahan kode
  produksi, tidak ada migrasi, tidak ada `db:reset-test`, tidak menyentuh
  dokumen induk C1 (verbatim).

### 5. Status di akhir sesi ini

- Branch aktif: `feat/c1-t3-generate-approve-2026-09-20` = `d04a4a1`
  (T3 `aa29a62` + docs review).
- `feat/c1-t2-…` = `fa8e539`; `feat/c1-t1-…` = `3e46bea` — tidak disentuh sesi ini.
- **T4 belum dikerjakan**; prompt siap pakai ada di bawah (§6).

### 6. Prompt siap-tempel untuk sesi T4 (copy-paste)


```text
# Tugas: C1-T4 — Submission PPK (§14.5/10)

Kamu melanjutkan siklus implementasi C1. T0–T3 sudah selesai dan LULUS review
(43/43 suite jest hijau, 404/404 test; HEAD = `d04a4a1` di
`feat/c1-t3-generate-approve-2026-09-20`). Tugasmu tiket berikutnya:

## 0. Aksi pra-T3-tambahan (SEBELUM buka branch T4)
- Buat satu commit kecil di branch T3 (`feat/c1-t3-generate-approve-2026-09-20`)
  yang menutup temuan #2 review-T3 (`docs/implementation/C1-SYARAT-LANJUTAN-
  REVIEW-T3-2026-09-20.md` → butir "→ T4" pertama): `approveDraft` belum
  memvalidasi petugas masih aktif — petugas yang dinonaktifkan antara prepare
  (tgl 10) dan approve tetap melahirkan tugas ACTIVE. Perbaikan murah: satu
  query `inArray` officers aktif DI DALAM transaksi approve → tolak
  `VALIDATION_ERROR`. JANGAN mengubah semantik tombol-mati/eskalasi T3. Tambah
  1–2 test. Lalu branch T4 dibuat DARI branch T3 yang sudah memuat commit ini
  (satu-tiket-satu-branch, riwayat berantai T0→T1→T2→T3→T4).

## 1. Sumber wajib dibaca dulu (jangan mengarang spesifikasi)
- `docs/implementation/C1-RENCANA-SIKLUS-PERIODE-APPROVE-BERITA-ACARA-2026-09-19.md`
  → §14.5 (submission PPK), §7 (approve 2 tingkat), §8 (rumus rekap),
  §9.1/§9.2 (skema ppk/branch_submissions), §15 (tabel tiket — baris T4:
  "hitung ceil otomatis, FINAL, tolak resubmit/skip setelah FINAL, version").
- `docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T0-2026-09-20.md` → bagian
  "→ T4" (3 butir, WAJIB).
- `docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T3-2026-09-20.md` → bagian
  "→ T4".
- Premis review-T2: `docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T2-2026-09-20.md`.
- Kode premis: `apps/backend/src/database/schema.ts` (ppkSubmissions,
  branchSubmissions — SUDAH ADA dari T0, jangan dibuat ulang),
  `apps/backend/src/utils/c1Math.ts` (rumus uang terkunci: `ceil1000`,
  `calcBisyaroh` 10%, `calcExpectedShare` 30%, `calcShareVariance`,
  `needsVarianceReason` toleransi 10 rb),
  `apps/backend/src/utils/operationalTimeZone.ts`,
  `apps/backend/src/services/periodCalendar.ts`,
  `apps/backend/src/services/periodDrafts.ts` (pola T3: fungsi murni terpisah,
  audit, gate berlapis, pola test),
  `apps/backend/src/middleware/ownership.ts` (sudah menolak staf tanpa
  branchId — kunci dengan test).


## 2. Scope T4 (dari tabel tiket §15 + syarat review-T0)
- Service + route submission PPK: satu baris `ppk_submissions` per
  officer × periode (unique `ppk_officer_period_unq` sudah ada). Total =
  `SUM(collections.nominal)` milik officer+periode DIHITUNG SERVER dari
  `assignment.period` — TANPA ketik nominal manual (§2.2: periode milik
  assignment, bukan `collected_at`; ini patokan yang salah di kode lama).
- Hitung otomatis pakai `c1Math`: bisyaroh 10% ceil1000, ekspektasi share
  30% × (total − bisyaroh), selisih aktual−ekspektasi, wajib alasan bila
  |selisih| > 10.000 (`needsVarianceReason`); konversi BigInt↔number di
  service (komentar `c1Math` memang menitipkan ini ke T4). `formula_snapshot`
  json wajib terisi saat FINAL (snapshot, bukan referensi hidup).
- Daur hidup: `DRAFT → PPK_SIGNED → FINAL` (enum sudah ada). T4 memegang:
  buat/update DRAFT (PPK betulkan per kaleng di HP-nya — tidak ada ketik
  total), tolak submit/resubmit/skip setelah FINAL, FINAL dengan
  `version` optimistik (klik ganda/dua admin barengan → sekali saja, uji).
- Route FINAL wajib menegakkan di SERVER: kedua signer terisi
  (`ppkSignerId` + `bendaharaSignerId` NOT NULL di cek aplikasi) — CHECK DB
  (`ppk_signers_different_chk`) hanya menolak TTD sama orang, TIDAK
  mewajibkan kedua TTD terisi; itu wewenangmu (syarat review-T0). Set/ubah
  TTD sendiri = T5; T4 hanya membaca kolomnya saat menegakkan FINAL.
- Test integrasi wajib: (a) INSERT/UPDATE kedua TTD = userId sama DITOLAK DB
  (dokumentasi hidup pertahanan lapis-2); (b) "staf tanpa `branchId` → 403"
  untuk STAF_PENGUMPULAN/STAF_KEUANGAN di route submission.
- Audit `activity_logs` untuk transisi status + FINAL (pola T3:
  `insertActivityLog`, audit tidak boleh menggagalkan operasi sah; entityType
  `ppk_submission`).
- Status kalender tetap sumber waktu: pakai `resolvePeriodStatus`/
  `buildPeriodBoundaries` (T1) untuk gate "PELAPORAN/finalisasi" — jangan
  tarik `new Date()` mentah dengan asumsi zona (premis TZ T1, WIB).
- `branch_submissions` TIDAK di-final-kan di T4 (kunci ranting = T6); T4
  boleh menyiapkan hitungan draft-nya bila perlu, tapi tombol kunci bukan
  milikmu.
- API: tambahkan kontrak baru ke `docs/API_DOCUMENTATION.md` (§4 baru, pola
  §4.11 T3). Types wire baru → `packages/shared-types` (pelajaran PR #112:
  tsc web WAJIB hijau bila tersentuh).


## 3. Wilayah TIDAK tersentuh (tiket lain)
TTD asli + PDF lazy + hash + R2 (T5), kunci ranting/periode/FINAL_NOL (T6),
reopen menular (T7 — jangan implement, tapi desainmu harus TIDAK menghalangi:
reopen = kembali DRAFT + TTD hangus + version naik), laporan MWC/selisih (T8),
UI mobile/web peran (T9/T10), notifikasi (T11), rollout (T12).

## 4. Premis yang dikunci (jangan dibongkar)
- T0: skema ppk/branch_submissions + CHECK beda-signer + `c1Math` rumus
  terkunci (BISYAROH 10, SHARE 30, TOLERANCE 10.000) — pakai, jangan hitung
  ulang sendiri.
- T1: satu helper tanggal `buildPeriodBoundaries`; timestamp tanpa TZ
  konsisten dengan `operationalTimeZone.ts`.
- T2: kunci submit + validasi `collected_at` + `serverTimestamp` — submission
  T4 TIDAK menulis ulang aturan itu; total = agregat dari collections sah.
- T3: robot hanya menulis draft; premis "periode milik assignment".

## 5. Disiplin engineering (sama seperti T3)
- Branch baru `feat/c1-t4-submission-ppk-2026-09-20` dari HEAD branch T3
  (yang sudah memuat commit temuan #2). Satu-tiket-satu-branch, push.
- Migrasi HANYA via `npx drizzle-kit generate` bila memang perlu kolom baru
  (cobalah nol-migrasi; skema T0 dirancang cukup). Aplikasikan hanya ke
  `lazisnu_test` lokal (override env, tanpa `db:reset-test`/psql). Staging/prod
  via runbook terpisah — jangan sentuh.
- Uji: `npx tsc --noEmit` untuk backend + web + shared-types semua EXIT 0;
  `npx jest --runInBand` (suite integrasi DB racy bila paralel — ketetapan
  review-T2). Test baru: unit murni untuk hitungan/rumus + gate, integrasi
  untuk FINAL/version/TTD-sama-ditolak-DB/403-staf-tanpa-scope.
- Fixture integrasi: hapus `activity_logs` lebih dulu (FK user/entityId)
  sebelum users/drafts — pola `deleteMyAuditTrails` T3. Tanggal fixture
  statis + injeksi `now` eksplisit (pola T2/T3), jangan biarkan kedaluwarsa.
- Tanpa `git add -A`. Commit message `feat(c1-t4): ...`.

## 6. Selesai bila (definition of done T4)
- ✅ hitung ceil otomatis via c1Math (unit test; angka contoh §8 benar)
- ✅ FINAL menegakkan kedua signer di server + version optimistik sekali
- ✅ tolak resubmit/skip/ubah setelah FINAL
- ✅ test TTD-sama-userId ditolak DB; test staf tanpa branchId → 403
- ✅ audit log transisi; API doc diperbarui; shared-types bila perlu
- ✅ tsc 3 paket hijau; jest full hijau (laporkan angka PASTI dari run
  terakhir — kesalahan angka laporan T3: tulis 402 padahal 404)

## 7. Laporan akhir
Sertakan: keputusan scope + sumber §; daftar file berubah + alasan; bukti
(tsc/jest angka dari run terakhir); checklist definition-of-done; temuan
non-blokir; saran untuk T5. Jangan edit dokumen induk C1 (salinan verbatim);
temuan review-mu sendiri TIDAK perlu kamu tulis — itu kerja sesi review
berikutnya.
```

### 7. Catatan / asumsi sesi ini

- Semua perintah dijalankan dari workspace `C:\Users\user\Documents\lazisnu`.
- Aplikasi migrasi `0009` hanya ke `lazisnu_test` lokal (disiplin laporan T3);
  DB staging/produksi **belum** tersentuh dan runbook 0008 (butir sesi T0 di
  atas) masih menjadi prasyarat sebelum deploy.
- Sesi ini murni review + dokumentasi: tidak ada perubahan kode produksi, tidak
  ada migrasi, tidak ada `db:reset-test`. Prompt T4 di atas belum dijalankan —
  menunggu sesi berikutnya.


### 8. Catatan pembaruan (ditulis setelah sesi paralel berjalan)

Saat catatan ini ditulis, working tree berpindah branch oleh **sesi paralel**
yang mengerjakan prompt di §6 pada direktori yang sama. Keadaan terverifikasi
via `git reflog` + `git branch -vv`:

| Item | Status terverifikasi |
|---|---|
| Branch pembawa catatan ini | `feat/c1-t5-cosign-ba-berkas-2026-09-20` — commit catatan sesi ini = `git log -1 -- docs/implementation/SESSION-2026-09-20_tinjauan_C1.md` (**belum dipush** saat ditulis; `ahead 1` dari origin, menunggu sesi paralel yang menyelesaikan T5) |
| Temuan review-T3 #2 (petugas draft nonaktif saat approve) | **SUDAH dikerjakan** sesi paralel → `57ae87c fix(c1-t3): tolak approve bila petugas draft sudah nonaktif (temuan review-T3 #2)`; tip branch T3 kini `57ae87c` (bukan lagi `d04a4a1`) |
| T4 | **SUDAH dikerjakan** → `3a3f009 feat(c1-t4): submission PPK dan ranting - hitung otomatis, FINAL, kunci, version` + `69ab425 docs(c1-t4): tindak lanjut review — syarat lanjutan T5 + catatan T6/T8/backlog` |
| T5 | **SUDAH dikerjakan** → `3393ecf feat(c1-t5): co-sign 2 HP + BA teks + PDF lazy + verifikasi + purge` + `e6ca60b docs(c1-t5): tindak lanjut review - temuan F1-F8 + syarat lanjutan T6/T7` |
| Prompt T4 di §6 | Menjadi **historis** — jangan dijalankan ulang; isinya sudah tercermin pada commit T4/T5 di atas |
| File sesi lain | `SESSION-2026-09-20_tinjauan_C1-T2.md` masih untracked; catatan sesi T0/T1 ada sebagai seksi di file ini (`2cd5e9d`, `b0f57fc`) |

Konsekuensi untuk sesi berikutnya: laporan review-T3 yang benar bagi sesi
paralel adalah tinjauan atas **T4/T5** (bukan mengulang T3). Jejak review T3
tetap ada di `docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T3-2026-09-20.md`
(`d04a4a1`) dan sudah ditindaklanjuti.

