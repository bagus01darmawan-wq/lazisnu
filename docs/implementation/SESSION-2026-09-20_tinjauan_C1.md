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
2. **False positive dari laporan T0**: migrasi tidak menyentuh DB dev karena kredensial `DIRECT_URL` di `.env` lokal autentikasi gagal dari mesin ini — artinya catatan jujur #1 T0 ("mungkin menyentuh DB dev") ternyata tidak benar (tidak ada yang tersentuh).
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
- Penalaran dokumen Rencana C1: untuk menghindari "definisi T1–T12 mengandung asumsi di luar repo" di sesi berikutnya, segera komit dokumen rencana jika diakses.

---

## Sesi lanjutan 2026-09-20 — Tinjauan Ulang C1-T1 + Rekomendasi T2

> Dilanjutkan setelah T1 (`feat/c1-t1-kalender-periode-2026-09-20`, commit
> `53de886` docs + `f0e8ee0` feat, push sukses). Ini sesi **review, bukan
> implementasi T2** — namun berisi eksekusi temuan review non-blocking dari
> T1 dan prompt siap pakai untuk T2.

### 1. Temuan §1 (sumber) — terverifikasi
- `.hermes/` tetap di `.gitignore:58-59`; dokumen induk C1/B1 tidak pernah
  ter-commit sampai T1. Sesi penulis punya working-tree `.hermes/plans/`, saya
  **tidak mengandalkan memori tulisan laporan** — SHA256 disamakan secara
  langsung (`50BB…BBE` C1, `B5B3…982` B1).

### 2. Verifikasi klaim T1 (semua terjadi di mesin ini)
| Klaim | Bukti |
|---|---|
| 38 suite / 339 test lolos | Background run jest: `Test Suites: 38 passed, 38 total / Tests: 339 passed` (64.8s) |
| Backend typecheck hijau | `npm run typecheck` exit 0 |
| Web typecheck hijau | Background run; `error TS` count = 0 |
| 15/15 periodCalendar test lolos | `npx jest periodCalendar.test.ts` → 15 passed |
| Enum period_status cocok union | `schema.ts:21 pgEnum('period_status', ['OPEN','TOLERANCE','LOCKED','DIBUKA_SEBAGIAN'])` ≡ `PeriodStatusValue` |
| MIN/MAX year = cermin generateTasksSchema | `periodCalendar.ts:37-39` (2020–2100) ≡ `scheduler.ts:14-17` |
| Verbatim SHA256 | `Get-FileHash` working-tree vs `docs/implementation/` identik |
| Commit higiene | `git status` → file untracked lain tak tersentuh (tanpa `git add -A`) |
| Guard `noRawDateInterpolation` lolos | Test ada (`services/__tests__/noRawDateInterpolation.test.ts`); hanya menandai tanggal sebagai operand `sql`; `periodCalendar.ts` tidak memakai `sql` sama sekali |

### 3. Temuan review C1-T1 (6, semua non-blocking)
1. **Premium TZ 2 lapis belum tersampaikan**: laporan/syarat T1 hanya menyebut OS/VM/container, tapi driver pg menserialisasi `Date` dengan **offset sesi PostgreSQL**. OS = WIB tapi sesi PG = UTC → `timestamp without time zone` bisa bergeser 7 jam. Perlu `SHOW timezone`.
2. `checkOperationalTimezone` membandingkan *nama* zona → false-negative pada alias (mis. `Etc/GMT-7` = +07:00 setara). Perlu fallback: bila `ok:false` tapi `offsetMinutes===420` → pass-with-note.
3. `isPeriodLocked(now, toleranceEnd)` menerima `Date` mentah → pemanggil T2/T3 bisa salah. Saran: paksa oper `buildPeriodBoundaries(...).toleranceEnd`.
4. `periodKey` duplikat inline di `scheduler.ts:65` (dedupe T2).
5. Judul tugas "kalender periode + cron" — cron memang di-T3/T12 (sudah jujur di laporan T1 §1).
6. Noise Jest (`Force exiting Jest`, "Audit Logger Insert Failed di log) = TD-06 pre-existing, bukan regresi T1.

### 4. Eksekusi penuh temuan review (commit `3e46bea`)
Bukan hanya rekomendasi — langsung dilaksanakan, **komentar/docstring saja, nol perubahan logika** (diff +28/−2 di 2 file + 1 dokumen baru):
- `operationalTimeZone.ts` header: premise dua-lapis (OS + sesi PG), mekanisme geser 7 jam, perintah `SHOW timezone` / `SET timezone`, referensi ke checklist T12.
- `periodCalendar.ts`: `isPeriodLocked` docstring kini eksplisit "WAJIB `buildPeriodBoundaries(...).toleranceEnd`"; `checkOperationalTimezone` docstring menjelaskan alias + fallback offset; header merujuk ke checklist T12 (`SHOW timezone`).
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

## Sesi lanjutan 2026-09-20 — Tinjauan Ulang C1-T2 + Persiapan T3

> Digabung dari berkas terpisah `SESSION-2026-09-20_tinjauan_C1-T2.md` (berkas
> itu **kini dihapus**) agar riwayat review C1 berkumpul dalam satu dokumen.
> Status asli saat ditulis: "dokumen sesi, belum di-commit". Karena T3/T4/T5
> sudah selesai, prompt T3 di §7 seksi ini bersifat **historis** — jangan
> dijalankan ulang.

### 1. Tinjauan ulang laporan akhir C1-T2

- **Verifikasi git**: commit `24b51f7` (`feat(c1-t2): scan toleran lintas
  periode + kunci submit + kode QR_PERIOD`) ditemukan, tepat satu commit di
  atas ujung T1 (`3e46bea`); 16 file berubah (746 ins, 29 del).
- **Baca kode vs dokumen induk** (`C1-RENCANA-SIKLUS-…-2026-09-19.md`):
  - `services/scanClassification.ts` (baru) — klasifier murni (HIT →
    ALREADY_COLLECTED → PERIOD_CLOSED → WRONG_PERIOD → NOT_ASSIGNED), query
    hanya assignment milik petugas, tidak membocorkan `owner_*`.
  - `validateAssignmentForSubmit` (`services/collectionSubmission.ts`) — kunci
    submit; tercakup online + batch; `details {period, next_period}`.
  - `assertCollectedAtInWindow` — jendela `[assignDate, toleranceEnd] ±10 mnt`
    (`CLOCK_SKEW_MINUTES=10`); `VALIDATION_ERROR` non-retry + audit
    `COLLECTED_AT_REJECTED`.
  - `routes/mobile/tasks.ts`, `routes/mobile/collections.ts`,
    `routes/scheduler.ts`, `services/mobileSyncService.ts`, `ScanScreen.tsx`,
    `packages/shared-types` (`Task.tolerance?`) — perubahan konsisten.
  - `utils/errorCatalog.ts` — `QR_NOT_ASSIGNED(403)/WRONG_PERIOD(409)/`
    `PERIOD_CLOSED(409)`, semua non-retryable.
  - `offline/sync.ts` tidak disentuh; `classifySyncError` di
    `mobileSyncService.ts` memetakan non-retryable → `can_retry=false` → gagal
    permanen yang terlihat.
- **Keputusan scope T2 terjaga**: tidak ada migrate/push non-lokal, tidak ada
  runbook 0008, tidak ada perubahan skema, TD-06 tidak disentuh.

### 2. Reproduksi build/test (semua cocok dengan laporan T2)

- `apps/backend`: `npm run typecheck` → EXIT 0.
- `apps/web`: `npm run typecheck` → EXIT 0.
- `apps/backend`: `npx jest` → **41/41 suite, 372/372 test hijau**.
- `apps/mobile`: `npx tsc --noEmit` → **18 error, semua TS2786**, tersebar di
  10 file lama; **0 error di ScanScreen/useTasksStore**.

### 3. File "temuan kecil" → dokumen tindak lanjut

- Membuat `docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T2-2026-09-20.md`
  (78 baris) memetakan 5 temuan ke tiket penerima:
  - #5 (branch T2 menumpang) → aksi sebelum PR;
  - #1 (future-period HIT di `classifyScan`) → T3;
  - #2 (`anomaly_flags` tak pernah diisi) → T8;
  - #4 (fallback statis ScanScreen menimpa pesan ber-periode) → T9;
  - #3 (RULE DB global + integrasi paralel di CI) → T12.

### 4. Pisah branch + push

- Buat branch `feat/c1-t2-scan-submit-kunci-2026-09-20` dari `24b51f7`; di
  atasnya commit `fa8e539` (docs: tindak lanjut review — syarat lanjutan
  T3/T8/T9/T12 + pisah branch T2). Branch ini **sudah di-push ke origin**
  (`fa8e539`).
- Geser branch lokal `feat/c1-t1-kalender-periode-2026-09-20` kembali ke
  `3e46bea` (T1 murni), lalu push `--force-with-lease` — origin T1 kini di
  `3e46bea`.
- Verifikasi `ls-remote`: T1 = `3e46bea`, T2 = `fa8e539` (lokal & remote
  cocok).
- Working directory saat itu berada di branch T2.

### 5. Prompt pelanjutan T3

- Menyusun & menyajikan prompt siap-tempel untuk sesi T3 (lihat §7 di bawah),
  mencakup: konteks status T0–T2, sumber §14.12–13 / §6 / §15 T3, syarat
  lanjutan → T3, pola kode/test existing, disiplin scope, dan bukti/verifikasi
  akhir.

### 6. Yang belum selesai saat itu / catatan

- T3 saat itu belum dikerjakan. Item wajib T3 (dari §14.12–14.13 + syarat
  lanjutan):
  - Draft periode via `buildPeriodBoundaries` (period_calendar) + guard
    future-period.
  - Trigger jadwal tgl 10 & 20 (cek/lebih lanjut infra cron repo).
  - Endpoint admin: prepare/edit draft → approve Staf (`STAF_PENGUMPULAN`,
    scope sesuai §14.13) → eskalasi 24 jam → approve Staf Keuangan; tombol
    sekali, audit, idempoten.
  - Setelah approve: draft → assignment PPK (tugas aktif).
  - Unit + integrasi; laporan tsc/jest; dokumen syarat lanjutan T3.
- Catatan/asumsi: semua perintah dari workspace
  `C:\Users\user\Documents\lazisnu`; branch T1 dipulihkan pakai
  `--force-with-lease` setelah memverifikasi origin T1 == `24b51f7` (benar),
  agar tak menimpa pekerjaan orang lain; di luar penulisan dokumen sesi ini,
  tidak ada state-changing command tambahan.

### 7. Prompt siap-tempel untuk sesi T3 (historis — T3 sudah selesai & LULUS review)

```text
Tugas kamu: implementasikan tiket C1-T3 (Generate Approve) di repo
C:\Users\user\Documents\lazisnu.

## Konteks proyek
C1 = siklus periode tetap + approve 2 tingkat + berita acara digital.
Status: T0 ✅, T1 ✅, T2 ✅ (lihat catatan sesi C1-T2 di
SESSION-2026-09-20_tinjauan_C1.md + C1-SYARAT-LANJUTAN-REVIEW-T0/T2-2026-09-20.md);
T4–T12 belum dikerjakan — jangan sentuh wilayahnya.

## Sumber kebenaran (baca, JANGAN edit)
docs/implementation/C1-RENCANA-SIKLUS-PERIODE-APPROVE-…-2026-09-19.md
→ §14.12 (robot siapkan → manusia setuju; draft tepat tgl 10 & 20; edit draft
boleh, edit aturan tidak; Staf setuju → tugas aktif + tombol mati sekali; 24 jam
tidak setuju → eskalasi Bendahara/Sekretaris STAF_KEUANGAN; sekali setuju
selesai; telat = tugas telat, tidak dimajukan),
§14.13 (STAF_PENGUMPULAN 1/ranting + 1/district boleh siapkan/edit/setuju & pantau,
TIDAK boleh FINAL/kunci/ubah nominal; STAF_KEUANGAN 2 per ranting/MWC boleh approve
eskalasi, saling gantikan, unduh PDF),
§6 (cron: tgl 10 M+1 00:00 kunci periode M + draft M+1; tgl 20 sapuan + kickoff),
§15 baris T3: "robot draft tepat tgl 10 & 20, edit draft, approve Staf → eskalasi
24 jam, tombol mati sekali, audit";
+ docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T2-2026-09-20.md bagian "→ T3".

## Pengerjaan
1. Mulai dari branch feat/c1-t2-… (fa8e539). Buat feat/c1-t3-generate-approve-2026-09-20.
2. Pelajari pola existing SEBELUM kode: periodCalendar.ts, routes/scheduler.ts,
   services/assignmentGenerator.ts, middleware/ownership.ts, auditLogService.ts,
   errorCatalog.ts, database/schema.ts (tabel period_calendar + submission draft),
   dan test di services/__tests__ + routes/__tests__.
3. Rancang & implementasikan minimal:
   - penulisan draft periode + baris period_calendar via buildPeriodBoundaries
     (SATU sumber batas; dilarang new Date(y,m,...) di luar helper);
   - trigger jadwal tgl 10 & 20 (cek infra cron repo dulu; jangan paksa dependensi baru
     tanpa alasan kuat);
   - endpoint admin: prepare/edit draft → approve Staf → eskalasi 24 jam (deadline dicek
     server) → approve Staf Keuangan; tombol sekali, audit tiap aksi;
   - setelah approve: draft → assignment PPK (tugas aktif) sesuai §14.12.
4. Test: unit + integrasi mengikuti pola T2. Wajib: batas cron 10 vs 20, edit-draft-setelah-approve
   ditolak, tombol dobel ditolak, eskalasi 24 jam (dipaksa waktu), guard future-period,
   period_calendar vs buildPeriodBoundaries identik.
5. Disiplin sama T2: tanpa migrate/push non-lokal, tanpa ubah skema di luar T0,
   tanpa runbook, TD-06 tidak disentuh, tolakan non-retryable + terlihat (pola errorCatalog).
6. Temuan untuk tiket lain → docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T3-2026-09-20.md;
   JANGAN edit dokumen induk.

## Bukti akhir wajib
- tsc EXIT 0 backend + web; mobile 0 error BARU (baseline 18 TS2786 diterima).
- npx jest apps/backend: seluruh suite hijau; cantumkan angka (baseline
  41/41 suite, 372/372 test) + daftar test baru.
- Daftar file berubah + alasan, checklist baris T3 §15:434 per butir, sisa/temuan.
- Commit kecil jelas (feat(c1-t3): …), push branch, jangan merge ke cabang lain.
```

---

## Sesi lanjutan 2026-09-20 — Tinjauan Ulang C1-T3 + Prompt T4

> Sesi **review, bukan implementasi T4**. Basis: commit `aa29a62`
> (`feat(c1-t3): generate approve robot-draft-manusia-setujui + eskalasi 24 jam`)
> di branch `feat/c1-t3-generate-approve-2026-09-20`. Hasil: T3 **LULUS**;
> 1 koreksi angka laporan; dokumen tindak lanjut T3 dibuat + dipush; prompt T4
> disusun. Catatan sesi review C1-T2 sudah digabung ke dokumen ini (seksi
> di atas; berkas terpisah `SESSION-2026-09-20_tinjauan_C1-T2.md` dihapus).

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
| File sesi lain | `SESSION-2026-09-20_tinjauan_C1-T2.md` (dulu untracked) **sudah digabung ke dokumen ini** lalu dihapus; catatan sesi T0/T1/T2/T4 semua menjadi seksi di file ini |

Konsekuensi untuk sesi berikutnya: laporan review-T3 yang benar bagi sesi
paralel adalah tinjauan atas **T4/T5** (bukan mengulang T3). Jejak review T3
tetap ada di `docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T3-2026-09-20.md`
(`d04a4a1`) dan sudah ditindaklanjuti.


### 9. Sesi tinjauan C1-T5 — review laporan akhir T5 + dokumentasi temuan (20 Sep 2026)

Status sesi: **review**, bukan sesi fitur — tidak ada berkas `apps/**` yang
diubah. Commit yang ditinjau: `3393ecf` (`feat(c1-t5): co-sign 2 HP + BA teks +
PDF lazy + verifikasi + purge`), base `69ab425`. Prompt resmi dibaca dari commit
`639104e` (`git show 639104e:docs/implementation/C1-PROMPT-T5-2026-09-20.md`)
karena memang tidak ikut branch. **Putusan: T5 LULUS**, 0 temuan pemblokir.

#### 9.1 Klaim laporan T5 vs verifikasi ulang (dijalankan di mesin ini)

| Klaim | Cara verifikasi | Hasil |
|---|---|---|
| tsc backend & web EXIT 0 | `cd apps/backend; npx tsc --noEmit` + `cd apps/web; npx tsc --noEmit` | ✅ EXIT 0 keduanya |
| jest 48/48 suite, 451/451 test | `node .\node_modules\jest\bin\jest.js --ci --runInBand` (log `tmp/jest-out.log` + `tmp/jest-err.log`) | ✅ `Test Suites: 48 passed, 48 total` / `Tests: 451 passed, 451 total` (102,4 dtk; 0 baris FAIL, 48 baris PASS) |
| 19 berkas berubah | `git diff --name-status 69ab425 3393ecf` | ✅ 19 (8 baru, 11 berubah) |
| Aritmetika 421+30=451; 45+3=48 | hitung ulang berkas `*.test.ts` + deklarasi `test(`/`it(` di kedua commit | ✅ 45→48 berkas; 384→414 deklarasi (+30 = 13 unit BA + 12 integrasi cosign + 3 HTTP verify + 2 scope-T4); offset deklarasi→jumlah jest **37 identik** di baseline & head |
| Push ✅ | `git rev-parse 3393ecf origin/feat/c1-t5-…` | ✅ identik |
| Tanpa migrasi | diff berkas migrasi | ✅ tidak ada |
| `shared-types`/mobile tak tersentuh | `git diff --stat 69ab425 3393ecf -- apps/mobile packages/` | ✅ kosong → klaim 18 error `TS2786` mobile jadi *moot* (by construction pre-existing) |
| Rute finalize lama hilang | baca route + schema; `git grep -i 'finalize\|countersign\|berita-acara' -- apps/mobile apps/web packages` | ✅ kosong, tak ada pemanggil tersisa |
| CHECK DB beda userId | `0008_blue_proteus.sql:106–107` | ✅ `ppk_signers_different_chk` + `branch_signers_different_chk` (pre-existing T0) |
| `FOR UPDATE` (syarat review-T4 #2) | `collectionSubmission.ts:38–42` | ✅ ada |
| signed URL 600 dtk | `r2.ts:101` (`expiresInSeconds = 3600`) dipakai di `cosign.ts:716,747` | ✅ TTL benar-benar dihormati |
| Cache-Control privat | `cosign.ts:111` (TTD), `baPdfService.ts:286` (PDF) | ✅ `'private'` |

#### 9.2 Kepatuhan kontrak prompt T5 (desain A–E)

- **A** ✅ `signer_id` selalu dari sesi (`.strict()` → `*_signer_id` di body 400);
  tier-1 `sign` (DRAFT→PPK_SIGNED, ulang CONFLICT) → `countersign` bendahara
  **seranting** (FINAL bila `ACTIVE=0`, selain itu `PPK_SIGNED` + `needs_force`)
  → `force-finalize` (wajib kedua TTD + alasan, hanya menimpa gerbang ACTIVE);
  tier-2 `sign` tetap DRAFT (+ angka T4) → `countersign` MWC sedistrik →
  `FINAL`/`FINAL_NOL`.
- **B** ✅ BA teks murni dari snapshot + cap `DRAFT — belum sah` + GET peran-scope.
- **C** ✅ PDF lazy hanya di jalur unduh (FINAL tak menyentuh R2), key berversi
  acak, `pdf_hash` = SHA-256 bytes, hash QR = hash konten kanonis, idempoten via
  hash tersimpan, audit `BA_DOWNLOADED`, verify publik `{ valid }` seragam.
- **D** ✅ PNG magic + ≤50KB + round-trip base64; consent + jejak (versi teks/IP/UA)
  di audit; `purgeSignatureFile` + endpoint ber-`reason` + audit.
- **E** ✅ 1 transaksi + `expected_version` → CONFLICT di semua transisi; guard
  peran/scope di server; tanpa migrasi/kolom baru.
- 8 uji wajib prompt semuanya ada — termasuk uji #2 "dua TTD orang sama" yang
  bersandar pada suite T4 (`ppkSubmissions.integration.test.ts:255–268`).

#### 9.3 Temuan sesi ini (8, semua non-blokir) — sudah terdokumentasi

Dituangkan ke `docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T5-2026-09-20.md`
(commit sesi ini = `e6ca60b`, 203 baris, 14 butir checkbox):

| # | Prio | Inti temuan | Target |
|---|---|---|---|
| F1 | P2 | `uploadSignature()` dipanggil **sebelum** gerbang kepemilikan/scope/status/versi (`cosign.ts:181,254,434,523`) → PNG yatim di tiap percobaan 403/400/409; `deleteFromR2` hanya dipakai purge (`:802`); coretan lama juga tidak dihapus saat re-sign tier-2 | Aksi seketika (F1a); sisa → T7 |
| F2 | P2 | `DELETE /admin/signatures` tidak terikat scope distrik (`routes/admin/signatures.ts:14–21`) | Backlog keamanan-retensi |
| F3 | P3 | `verifyBaRecord` (`baPdfService.ts:392–409`) tidak cek status `FINAL`/`FINAL_NOL` → `valid:true` = "konten cocok hash", bukan "BA sah" | T6 |
| F4 | P3 | Jebakan #1 (`.strict()` menolak `*_signer_id`) benar di kode tapi **belum ada test** yang membuktikannya | Aksi seketika (1 test) |
| F5 | P4 | Nit: `API_DOCUMENTATION.md:485` (kalimat 409 menempel di `GET /pdf` yang idempoten); komentar "Deterministik" `baPdfService.ts:12` overstate (doc-ID pdf-lib acak) | Aksi seketika (docs) |
| F6 | P4 | `as_nol` tidak dipersistensi → `FINAL_NOL` diturunkan (`cosign.ts:548–560`) | T6 |
| F7 | P4 | Pernyataan BA dipotong `substring(0,95)` (`baPdfService.ts:167`) | Backlog (kosmetik) |
| F8 | P4 | Bendahara boleh re-countersign selama `PPK_SIGNED` (`cosign.ts:263–277`) | T6 (putuskan) |

#### 9.4 Kendala teknis sesi ini (supaya tidak terulang)

1. `npx jest … | Select-Object …` di PowerShell **terpotong**: banner
   `npm notice` ditulis ke stderr → `NativeCommandError` + exit code 1 palsu,
   output jest tidak terlihat sama sekali. Solusi yang akhirnya dipakai:
   panggil `node .\node_modules\jest\bin\jest.js` langsung (atau
   `cmd /c "… > log 2>&1"`).
2. Satu perintah dibatasi ~30 dtk, sedangkan suite jest T5 butuh ~102 dtk →
   jalankan sebagai proses latar (`Start-Process` + redirect), lalu baca log.
   Ringkasan jest (`Test Suites:`/`Tests:`) ada di **stderr**, bukan stdout.
3. Scratch sesi ini (tidak di-commit): `tmp/jest-out.log` dan `tmp/jest-err.log`
   (gitignored lewat `.gitignore:24 *.log`), `tmp/jest-t5-verify.log` (run yang
   terpotong saat tool timeout → hanya 1 PASS tanpa ringkasan, **bukan bukti**),
   serta `tmp/jest-pid.txt` (PID proses latar, statusnya untracked).

#### 9.5 Berkas yang dibuat/diubah sesi ini

| Berkas | Status |
|---|---|
| `docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T5-2026-09-20.md` | **baru** (203 baris) — commit `e6ca60b`; sudah ikut terdorong ke remote oleh sesi lanjutan (origin kini `b0f57fc`) |
| `docs/implementation/SESSION-2026-09-20_tinjauan_C1.md` (seksi §9 ini) | disunting, **tanpa commit** sesuai instruksi |
| `apps/**`, `packages/**`, `schema.ts`, migrasi | **tidak ada** perubahan — sesi murni review |

#### 9.6 Status di akhir sesi ini

- Rantai commit branch `feat/c1-t5-cosign-ba-berkas-2026-09-20` utuh (tidak ada
  commit hilang): `69ab425 → 3393ecf → e6ca60b → 2cd5e9d → b0f57fc → b6f6384`.
  HEAD lokal = `b6f6384` ("docs: catat sesi lanjutan 2026-09-20 …"),
  `origin/feat/c1-t5-…` = `b0f57fc` → **ahead 1** (hanya `b6f6384` belum dipush).
- Verifikasi dijalankan pada `3393ecf`; setelah itu tidak ada commit kode
  (hanya commit docs), jadi hasilnya tetap berlaku: tsc backend & web EXIT 0,
  jest **48/48 suite, 451/451 test**. **Baseline untuk sesi T6: 48/451.**
- Belum dikerjakan (menunggu keputusan user): F1a + F4 + F5 sebagai
  `fix(c1-t5)`/`docs(c1-t5)` sebelum PR, F3/F6/F8 di T6, F2/F7 di backlog;
  plus opsi push `b6f6384`.


## Sesi tinjauan C1-T4 — review laporan akhir T4 + syarat lanjutan + prompt T5 (20 Sep 2026)

> Catatan waktu: seksi ini **ditulis belakangan** — saat disunting, branch kerja
> sudah berpindah ke `feat/c1-t5-cosign-ba-berkas-2026-09-20` (HEAD `b6f6384`).
> Sesi ini sebenarnya berlangsung **lebih awal**: HEAD masih `3a3f009` di branch
> `feat/c1-t4-submission-ppk-2026-09-20`. Urutan sebenarnya: sesi ini (review
> T4) → sesi T5 (`3393ecf`) → §9 (review T5). Berkas ini disunting **tanpa
> commit** (mengikuti pola §9.5).

Status sesi: **review + dokumentasi** — tidak ada perubahan kode produksi,
tidak ada migrasi, tidak ada `db:reset-test`.

### 10.1 Objek & putusan

- Objek: laporan akhir **C1-T4 — Submission PPK (§14.5/10)** pada branch
  `feat/c1-t4-submission-ppk-2026-09-20`, HEAD saat itu `3a3f009`
  (`feat(c1-t4)…`), parent `57ae87c` (fix temuan review-T3 #2).
- **Putusan: T4 LULUS** — 0 temuan pemblokir; 4 temuan non-blokir
  (3 teknis + 1 dokumentasi), semuanya diteruskan ke jalur tindak lanjut.

### 10.2 Verifikasi klaim laporan (dijalankan sendiri, bukan dikutip)

| Klaim laporan T4 | Cara verifikasi | Hasil |
|---|---|---|
| Branch + 2 commit | `git log --oneline -10` | ✅ `57ae87c` (fix-T3, 2 file +34) + `3a3f009` (feat T4) |
| 13 file berubah, +1515/−1 | `git diff 57ae87c..HEAD --name-only` | ✅ tepat 13, daftar identik laporan |
| `tsc` backend & web EXIT 0 | jalankan ulang sendiri | ✅ EXIT_OK keduanya |
| jest 45/45 suite, 421/421 test | `npx jest --ci --runInBand` | ✅ 45/45 & 421/421 (78,92 dtk, EXIT_OK) |
| Hitung ceil: 175rb→bis 18rb; 867.500→87.000 | baca test + `utils/c1Math.ts` | ✅ |
| Gerbang peran FINAL PPK (keuangan tanpa force; admin hanya force+alasan) | `ppkSubmissions.ts:285–301` | ✅ |
| Kedua signer wajib + beda + PPK=owner + bendahara berperan STAF_KEUANGAN | `ppkSubmissions.ts:336–351` | ✅ (jangkar pra-T5) |
| Tombol mati: `UPDATE … WHERE DRAFT + version` + cek baris → `CONFLICT` | `ppkSubmissions.ts:353–381` | ✅ race-safe |
| FINAL ranting: sebut nama (maks 3 + "+N"), selisih >10rb wajib alasan, GABUNG wajib `linked_periods`, `FINAL_NOL` total 0 + alasan, snapshot 6 kaleng | `ppkSubmissions.ts:435–571` | ✅ |
| Kunci pasca-FINAL 3 jalur (submit/resubmit/skip) | `collectionSubmission.ts` (dalam tx) + `routes/mobile/tasks.ts:680–687` | ✅ |
| `QR_ALREADY_SUBMITTED` non-retry | `errorCatalog.ts:69`; default `isRetryable=false` (`AppError.ts:18`) | ✅ |
| `CONFLICT` 409 baru | `errorCatalog.ts` | ✅ |
| Docs §3.8 & §4.12 | diff `API_DOCUMENTATION.md` | ✅ sesuai kontrak |
| Test baru: 10 integrasi T4 + 6 unit 403 + CHECK DB 2× | hitung `test(`/`test.each` | ✅ 10 + 6 |
| Tanpa migrasi/kolom, `shared-types` tak tersentuh | diff T4 | ✅ |

### 10.3 Temuan review-T4 (4, non-blokir) + nasibnya

| # | Inti temuan | Lokasi saat itu | Target | Status terkini |
|---|---|---|---|---|
| 1 | Scope bendahara signer tidak divalidasi — hanya cek `role === 'STAF_KEUANGAN'`, keuangan ranting/distrik lain bisa dicatat sebagai penandatangan | `ppkSubmissions.ts:348–351`, `:517–520` | T5 | ✅ **DITUTUP** — `cosign.ts:239,249,278` `assertPpkBendaharaScope` (seranting) & `:508,518,544` `assertMwcBendaharaScope` (satu distrik) |
| 2 | Point-read tanpa row lock pada `assertSubmissionOpen` + hitungan ACTIVE → balapan submit↔finalize di READ COMMITTED | `collectionSubmission.ts`; `ppkSubmissions.ts:318–334` | T5 / patch mandiri | ✅ **DITUTUP** — `collectionSubmission.ts:38–42` `SELECT … FOR UPDATE` (komentarnya menyebut "Syarat review-T4 #2") |
| 3 | `GET /admin/branch-submissions` memanggil `ensureBranchSubmission` per ranting = N query agregat + N upsert DRAFT pada operasi GET | `branchSubmissions.ts:73–74` | T6/T8 | ⏳ **MASIH TERBUKA** (diverifikasi ulang sesi ini: pola belum berubah) |
| 4 | Footnote aritmetika test laporan T4: "402+10+6+1+1+1?" — 402+10+6 = 418 ≠ 421 | laporan (chat), bukan berkas repo | Aksi seketika (dokumentasi) | ⏳ menunggu koreksi laporan; angka akhir 421/421 sendiri **terbukti benar** |

### 10.4 Deliverable A — `C1-SYARAT-LANJUTAN-REVIEW-T4-2026-09-20.md` (commit `69ab425`)

Struktur: header status ("bukan tugas baru", premis T4 yang dikunci agar tidak
dibongkar tugas berikutnya) → 4 bagian:

- **Aksi seketika (sebelum PR)** — koreksi footnote aritmetika test laporan T4
  (temuan #4).
- **→ T5** — (a) **scope bendahara signer wajib divalidasi** (temuan #1,
  diberi label "paling penting"); (b) saran T5 dari laporan T4 tetap berlaku
  (sign per sesi, `PPK_SIGNED`, PDF lazy + `pdf_hash` per versi, R2
  privat-rasa-publik + audit + consent, QR verifikasi minimal); (c) **kunci
  baris submission** (`FOR UPDATE` di `assertSubmissionOpen`, temuan #2).
- **→ T6/T8** — F3 N+1/tulis di GET list ranting + ketetapan review-T3
  (fixture beraudit hapus `activity_logs` dulu; suite integrasi seri).
- **Backlog** — TD-06 tidak disentuh; disiplin T4 yang dipertahankan
  (tanpa migrasi/kolom baru, tanpa DB non-lokal, tanpa `git add -A`, audit
  tidak menggagalkan FINAL yang sah).

### 10.5 Deliverable B — `C1-PROMPT-T5-2026-09-20.md` (commit `639104e`)

Prompt siap-tempel untuk sesi lain (254 baris): peran & konteks, daftar bacaan
wajib, definisi tiket (§15:437), desain **A–E** yang mengikat, batas (T6–T12),
8 uji wajib, disiplin kerja, perintah verifikasi, format laporan, 9 jebakan.

Fakta jangkar yang **ditemukan saat menyusun** (bukan asumsi) dan menentukan
bentuk prompt:

| Fakta | Bukti |
|---|---|
| Enum `ppk_submission_status` **sudah memuat `PPK_SIGNED` sejak T0** → T5 bisa tetap bebas migrasi seperti T4 | `schema.ts:16–17` |
| Kolom TTD kedua tingkat + `pdf_hash` sudah ada | `schema.ts:298–306` (PPK), `:345–353` (ranting) |
| API R2 yang tersedia: `uploadToR2`, `getSignedDownloadUrl(key, 3600)`, `deleteFromR2` | `services/r2.ts:43,72,92` |
| Pola PDF (pdf-lib + qrcode + upload R2) sudah ada | `services/qrPdfService.ts` |
| Belum ada mock R2 di test → prompt menetapkan `jest.mock` modul (pola `jest.mock('../../config/database', …)`) | grep test backend |
| Syarat review-T0 (dua TTD terisi + CHECK DB + staf tanpa branch 403) & review-T4 (#1/#2) diintegrasikan sebagai butir mengikat | dokumen syarat-lanjutan |

Catatan berkas: prompt ini hidup **hanya di branch T4** (`639104e`) — branch T5
dibuat dari `69ab425` sehingga berkasnya tidak ikut. Sesi review-T5 (§9) tetap
membacanya lewat `git show 639104e:docs/implementation/C1-PROMPT-T5-2026-09-20.md`.
Belum dipindahkan ke branch T5/T6 (opsi, menunggu keputusan).

### 10.6 Kepatuhan prompt → hasil T5 (silang dengan §9)

Menurut §9.2–§9.3 (verifikasi sesi review-T5), desain A–E prompt **diikuti**
dan 8 uji wajib prompt ada semua. Dari sisi temuan sesi ini: #1 (scope
bendahara) dan #2 (`FOR UPDATE`) **ditutup di T5** — diperiksa ulang sesi ini di
kode: `cosign.ts:278` `assertPpkBendaharaScope`, `:544` `assertMwcBendaharaScope`,
`collectionSubmission.ts:38–42`. Temuan #3 masih terbuka (target T6/T8).

### 10.7 Kendala teknis sesi ini (agar tidak terulang)

1. `npx tsc --noEmit` dan `npx jest --ci --runInBand` **melebihi batas ~30 dtk**
   per perintah → dijalankan sebagai proses latar.
2. `Start-Job` **mati** saat sesi PowerShell penulis perintah berakhir (log
   0 byte, tidak ada proses hidup) — yang berhasil: `Start-Process cmd.exe`
   detached (`/c cd /d <dir> && npx … > log 2>&1 && echo EXIT_OK >> log | echo EXIT_FAIL`),
   lalu log di-poll dari panggilan berikutnya.
3. Ringkasan jest ada di **stderr** — pastikan redirect `2>&1` agar
   `Test Suites:`/`Tests:` tertangkap.
4. Scratch sesi ini (gitignored lewat `*.log`, aman): `apps/backend/tsc-backend.log`,
   `apps/backend/jest-t4.log`, `apps/web/tsc-web.log` — berisi bukti verifikasi
   (EXIT_OK), boleh dihapus kapan saja.

### 10.8 Berkas & status akhir sesi ini

| Berkas | Status |
|---|---|
| `docs/implementation/C1-SYARAT-LANJUTAN-REVIEW-T4-2026-09-20.md` | **baru** (86 baris) — commit `69ab425` di branch `feat/c1-t4-submission-ppk-2026-09-20` |
| `docs/implementation/C1-PROMPT-T5-2026-09-20.md` | **baru** (254 baris) — commit `639104e` di branch yang sama |
| `docs/implementation/SESSION-2026-09-20_tinjauan_C1.md` (seksi §10 ini) | disunting, **tanpa commit** (pola §9.5) |
| `apps/**`, `packages/**`, `schema.ts`, migrasi | **tidak ada** perubahan — sesi murni review + dokumentasi |

Status saat sesi ini berakhir: branch T4 `feat/c1-t4-submission-ppk-2026-09-20`
HEAD `639104e` (2 commit docs **belum dipush**). Setelahnya sesi paralel
mengerjakan T5 dari `69ab425`; branch kerja kini
`feat/c1-t5-cosign-ba-berkas-2026-09-20` (HEAD `b6f6384`, `origin` `b0f57fc`).
Sisa yang belum dijalankan: koreksi footnote laporan T4 (temuan #4), F3 di
T6/T8, pemindahan/push `639104e` bila dikehendaki.





