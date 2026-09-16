# Tinjauan ulang: rencana + eksekusi susulan mobile–overview (fix overview 500)

**Tanggal:** 16 September 2026 (disusun ulang 17 September 2026 setelah eksekusi POSTPONED)
**Ditinjau:** `RENCANA-SUSULAN-MOBILE-OVERVIEW-2026-09-16.md` (rencana) dan
`LAPORAN-EKSEKUSI-SUSULAN-MOBILE-OVERVIEW-2026-09-16.md` (laporan eksekusi)
**Metode:** klaim di kedua dokumen diverifikasi ulang terhadap kode dan git
(diff, re-run command, stash + revert hardening), bukan sekadar dibaca.
**Verdict keseluruhan:** Rencana **bagus** (logika verifikasi-sarannya benar —
terbukti dari koreksi routing yang tepat pada 5 saran awal). Eksekusi **rapi
dan jujur**. **⚠️ 1 temuan substantif yang tadinya terbuka — `POSTPONED`
menyerang konsistensi metrik web↔mobile — kini DITUTUP PENUH: dead enum
dihapus dari kode, DB produksi, dan cadangan harian dipasang.** Lihat §C1.

**Status perubahan sejak versi pertama dokumen ini:**

| Temuan asli | Status sekarang | Bukti |
|---|---|---|
| §C1 `POSTPONED` ditangguhkan tanpa pemilik; ring mobile bisa < 100% selamanya | ✅ **DITUTUP** — dead enum dihapus dari kode + DB produksi | commit `2602135` (kode), `85d2eec` (migrasi 0007), `558dfeb` (eksekusi produksi) |
| §C2 janji test regression Fase 2 belum terpenuhi | ⚠️ **MASIH TERBUKA** | §C2 di bawah |
| §C3 divergensi scope web vs mobile tidak terdokumentasi | ⚠️ **MASIH TERBUKA** | §C3 di bawah |
| §G.1 "commit dulu" | ✅ **DILAKUKAN** — semua sudah di-commit ke branch `fix/postponed-dead-enum-2026-09-16` (6 commit) | `git log` |
| §G.2 perlakuan `POSTPONED` di angka mobile | ✅ **DITUTUP** — `task_total` = ACTIVE+COMPLETED+UNCOLLECTED+REASSIGNED, sesuai kontrak metrik | `overviewService.ts`, `routes/mobile/tasks.ts` |
| §G.3 regression test metrik campuran | ⚠️ **MASIH TERBUKA** | §C2 |
| §G.4 luruskan laporan ("22 baseline" → 18) | ⚠️ **MASIH TERBUKA** | §B |
| Backup DB produksi tidak pernah ada | ✅ **DIPASANG** — cron harian 02:30 WIB ke R2 + healthcheck | §E |

---

## A. Re-run verifikasi laporan (semua saya jalankan sendiri)

| Cek | Klaim laporan | Hasil riil saya | Verdict |
|---|---|---|---|
| `tsc --noEmit` backend | "Hijau, nol error" | **exit 0, nol error** | ✅ |
| Unit backend `src/(services\|middleware\|utils)/__tests__` | "12 suite / 87 tes" | **20 suite / 191 tes hijau** | ✅ (lebih banyak dari klaim — angka laporan **understated**, bukan inflated) |
| Kontrol negatif guard (revert hardening → guard gagal) | "Terbukti tertangkap" | **Terverifikasi empiris**: stashed diff (kode kembali ke `sql\`...>= ${startDate}\``), guard **gagal** dengan 8 pelanggaran tepat (`services/collectionReportService.ts: operand startDate/endDate`, `services/officerService.ts` ×3 pasang). Test benar-benar mengunci fix. | ✅✅ |
| `tsc --noEmit` mobile | "18 vs 22 baseline, nol error baru" | **18 error sekarang, 18 error di baseline (HEAD)** — semua `TS2786` pada `LinearGradient`/`SafeAreaView`/`Animated.View` di 10 file, 6 di antaranya file yang **tak disentuh** (Login/Profile/TasksScreen/TaskItem/FloatingTabBar/AppNavigator) → pasti pre-existing | ⚠️ **Klaim "22 baseline" tidak terbukti**; baseline riil = 18. Tapi kesimpulan substansialnya ("nol error baru") **benar** |
| Uji mobile terkait | "3 suite / 34 tes" | **3 suite / 34 tes hijau** (`api.test.ts`, `offlineFlowRegression.test.ts`, `SkipReasonSheet.test.tsx`) | ✅ |
| `prettier --check` mobile | "Hijau (4 file diformat ulang)" | **Hijau** (8 file tersentuh) | ✅ |
| Rebuild `dist` shared-types | "+ rebuild dist" | `dist/index.d.ts` berisi ke-8 simbol baru, **POSTPONED sudah hilang** | ✅ |
| Guard scan `noRawDateInterpolation.test.ts` | "Pola wajib = operator Drizzle" | Kode di 3 service kini `gte(col, sql\`${str}\`)`; **tidak ada lagi perbandingan mentah** | ✅ |

**Kesimpulan A:** klaim teknis laporan pada dasarnya benar dan cenderung
*meremehkan* diri sendiri (angka tes lebih besar, kontrol negatif benar-benar
dibuktikan dengan eksperimen revert). Tapi angka "22 baseline" tidak bisa
direproduksi — lihat §B.

---

## B. Yang tidak akurat / perlu diperbaiki pada laporan

| # | Klaim | Kenyataan | Dampak |
|---|---|---|---|
| 1 | "18 error vs **22** baseline (`tmp/mobile-tsc.log`)" | Baseline (HEAD, via `git stash`) juga **18**. `tmp/` hanya berisi `be-tsc.log` (0 byte), `drizzle-gen.log`, `jest-*.log` — **tidak ada `tmp/mobile-tsc.log`**. File bukti yang dirujuk tidak ada. | Kecil (kesimpulannya tetap benar), tapi mengutip file log yang tidak ada adalah pola yang harus diluruskan |
| 2 | "12 suite unit backend (87 tes)" | Riil **20 suite / 191 tes** | Tidak ada dampak; hanya angka understated |
| 3 | Laporan Fase 2: "task_total = seluruh assignment scope + periode" | **Sumber divergensi nyata** — lihat §C.1 (kini ditutup lewat hapus POSTPONED) | Sedang (sekarang: rendah) |

---

## C. Temuan substantif

### C.1 ✅ DITUTUP — `POSTPONED` dead enum (tadinya: ring mobile < 100% selamanya)

**Kondisi asli (mengapa ini temuan):** enum assignment berisi 5 nilai
(`ACTIVE, COMPLETED, POSTPONED, REASSIGNED, UNCOLLECTED`) tapi `POSTPONED`
**tidak pernah dipakai** — 0 baris di produksi. Sementara itu:

- **Web** (`overviewService.ts:245`): `task_total = active + completed + uncollected + reassigned + postponed` — eksplisit per status dengan komentar.
- **Mobile** (`routes/mobile/tasks.ts`): `taskTotal = taskRows.reduce(...)` — menjumlahkan **semua** status yang muncul, termasuk `POSTPONED`, **tanpa komentar**.

Konsekuensinya: bila ada 1 baris `POSTPONED`, ring progres mobile terlihat
selamanya < 100% dan web↔mobile tidak dapat dibandingkan.

**Apa yang dilakukan:** penghapusan dead enum penuh, bukan tambal-tambal:

| Area | Aksi | Commit |
|---|---|---|
| Kode (8 file) | hapus `POSTPONED` dari `schema.ts` pgEnum, `shared-types`, zod `admin/assignments.ts`, `officerService.ts`, `overviewService.ts` (`task_total` = ACTIVE+COMPLETED+UNCOLLECTED+REASSIGNED per kontrak metrik), web `assignments/page.tsx` + `cans/page.tsx`, `scan-qr.test.ts` | `2602135` |
| Migrasi | `0007_remove_postponed_enum.sql` di-generate drizzle-kit | `85d2eec` |
| Validasi | dry-run di PostgreSQL 16 lokal: skenario 0 POSTPONED → sukses 0.17s data utuh; skenario 1 POSTPONED → **rollback bersih 6 statement, nol parsial** (bukti tidak akan merusak) | `PROSEDUR-MAINTENANCE-HAPUS-POSTPONED` §C |
| Produksi | 0007 dijalankan manual via `psql` (single transaction, `ON_ERROR_STOP=1`) — **0.19 detik sukses** | `558dfeb` |
| Tracking | hash 0007 dicatat di `__drizzle_migrations` + simulate-deploy migrate-cli → **"skema sudah mutakhir", exit 0** | `558dfeb` |

**Verifikasi pasca-migrasi di DB produksi (live):**

```
enum sekarang   : ACTIVE, COMPLETED, REASSIGNED, UNCOLLECTED   ← POSTPONED hilang
baris total     : 212        ← nol data hilang
distribusi      : ACTIVE=15, COMPLETED=84, REASSIGNED=53, UNCOLLECTED=60
3 index         : assignments_pkey, can_officer_period_unq, assignments_status_period_idx (utuh)
tipe kolom      : assignment_status
```

Tiga bukti paling kuat:
1. **`WHERE status = 'POSTPONED'` sekarang ERROR** — nilai benar-benar tidak ada lagi di enum.
2. **`GET /v1/mobile/tasks/stats-range` kembali 401, bukan 500** — endpoint overview yang dulu kena bug tidak lagi crash.
3. **Backend log bersih**, `/health` = `{"status":"ok"}`.

**Catatan teknis (mengapa migrasi via `psql`, bukan migrate-cli):** env
produksi hanya punya `DATABASE_URL` (pooler Supabase, `?pgbouncer=true`).
Migrator Drizzle memakai prepared statement yang **tidak didukung pgbouncer**
— persis catatan di `migrate-cli.ts` dan `drizzle.config.ts`. Selain itu
`docker-compose.prod.yml` **tidak menjalankan migrate-cli** sama sekali, jadi
deploy **tidak auto-run** migrasi. `pg_dump` juga menolak param `pgbouncer`
sehingga harus distrip dulu.

**⚠️ Jebakan yang sengaja ditutup:** tanpa hash 0007 di
`__drizzle_migrations`, migrate-cli akan menjalankan 0007 **lagi** di deploy
pertama setelah merge (0007 idempoten — enum tetap 4 nilai — tapi mengambil
lock `ACCESS EXCLUSIVE` dengan sia-sia). Setelah dicatat, simulate-deploy
keluar **"skema sudah mutakhir", exit 0**.

### C.2 ⚠️ MASIH TERBUKA — `month_stats` / `stats-range` belum punya regression test ber-DB

Rencana Fase 2 menjanjikan: *"Regression test backend: dashboard + stats-range
dengan assignment ACTIVE/COMPLETED/UNCOLLECTED campuran"*. Yang ada:
`p0-regression.test.ts` (9 tes, hijau) menguji `latestCollectionCondition`,
dan `conditionRules.test.ts` menguji DIKEMBALIKAN — **bukan** rumus metrik campuran.

Artinya **"Terima bila" Fase 2 utama** (contoh "38 penjemputan / 0 belum /
60-60 selesai identik di web dan mobile") **belum diverifikasi secara
otomatis**. Rumus mobile+web sama di atas kertas, tapi tidak ada test yang
memaksa keduanya tetap seimbang — perubahan satu sisi bisa lolos CI diam-diam.

**Kondisi yang memperparah:** penghapusan `POSTPONED` di §C1 mengubah
`task_total` di **empat** tempat (`overviewService.ts`, `routes/mobile/tasks.ts`
×2, `officerService.ts`). Tanpa test metrik campuran, tidak ada jaring
otomatis yang memaksa keempatnya tetap seimbang. **Ini kini prioritas lebih
tinggi dari sebelum §C1 dieksekusi.**

Laporan jujur menyebut hal ini ("Endpoint baru perlu liputan uji integrasi
ber-database (belum ada)"), tapi tidak menyebut bahwa **test metrik campuran
yang dijanjikan rencana Fase 2 juga belum ada** — janji itu harus ditandai
sebagai belum terpenuhi, bukan hanya endpoint baru.

### C.3 ⚠️ MASIH TERBUKA — divergensi scope web vs mobile (dengan alasan kuat, tapi tidak terdokumentasi)

Rencana Fase 2 berjanji angka "tampil identik di web overview dan mobile"
(`38 penjemputan / 0 belum / 60-60 selesai`). Faktanya scope-nya **berbeda**:

- Web `getTaskSummary` scope = **pemilik kaleng** (`cans.branch_id`, lewat `innerJoin(cans)`), karena "petugas boleh menjemput lintas ranting".
- Mobile `month_stats`/`stats-range` scope = **penempatan petugas** (`assignments.officerId = token`).

Ini **bukan bug** — mobile wajib menunjuk tugas petugas itu sendiri, dan web
memang menghitung kaleng milik ranting. Tapi "identik" hanya berlaku bila
petugas tak pernah menjemput kaleng lintas ranting; dalam kasus itu angkanya
**secara sah berbeda**. Laporan tidak menyebut pengecualian ini, padahal
"Terima bila" Fase 2 menyatakannya sebagai kriteria. Saran: ubah kriteria
terima menjadi "identik untuk petugas yang tidak menjemput lintas ranting;
perbedaan harus dapat dijelaskan dari scope", atau dokumentasikan.

### C.4 ℹ️ minor — `MonthStats.task_active` dibuat opsional padahal selalu dikirim

`shared-types` `MonthStats`: `task_active?: number` opsional, sedangkan
`RangeStatsResponse.task_active: number` wajib. Backend mobile **selalu**
mengirim `task_active` di kedua response. Opsional hanya menambah
ketidakpastian di sisi tipe; `DashboardScreen` sudah punya fallback
(`?? total - closed`), jadi opsional tidak diperlukan. Konsistensi: buat
`task_active` wajib di `MonthStats` (respons selalu mengirimnya), atau
pertahankan opsional **dan** tulis alasannya.

### C.5 ℹ️ minor — `proposal-status` tidak re-check status assignment

`GET /assignments/:id/proposal-status` mengembalikan proposal terbaru untuk
kaleng, **termasuk assignment yang sudah `COMPLETED`**. Banner usulan muncul
di TaskDetailScreen — yang juga tampil untuk tugas selesai. Ini mungkin
intensional (petugas ingin tahu hasil usulan walau tugasnya selesai), tetapi
tidak ada batasan eksplisit. Bila banner PENDING muncul terus-menerus di
tugas lama yang sudah selesai dan usulannya belum diputuskan admin, ini bisa
menyesatkan. Cukup diputuskan: apakah banner hanya untuk status `ACTIVE`
(batasi di UI atau di query `where status = 'ACTIVE'`), atau sengaja untuk
semua status (maka tambahkan komentar/tes).

---

## D. Tinjauan rencana (apa yang perlu ditingkatkan)

Rencana **kuat** pada: verifikasi ulang tiap saran (kolom "Koreksi routing"
menolak solusi parsial — terbukti pada "dokumentasi saja tidak memperbaiki
perilaku"), pemilihan endpoint detail vs list (menghindari N+1), penolakan
membuka `getCanDetail` admin ke mobile, dan pemikiran kompatibilitas APK lama.

Kelemahan yang terlihat dari hasil eksekusi:

1. **Kriteria "Terima bila" tidak dapat diuji otomatis untuk fase terberat.**
   Fase 2 "Terima bila" memakai skenario end-to-end tanpa test yang
   dapat dieksekusi di CI. Akibatnya janji test regression-nya luput
   tanpa terlihat. Saran: tiap "Terima bila" fase logika-murni harus
   mempunyai test yang **gagal bila rumusnya berubah** — seperti yang sudah
   benar-benar dilakukan untuk Fase 5 (guard). Fase 2 harus mengikuti standar
   Fase 5.
2. **~~Konsekuensi `POSTPONED` tertangguh tanpa pemilik.~~** ✅ **Diselesaikan §C1** —
   rencana menunda penghapusan enum (benar, butuh migrasi), dan pemiliknya
   kini jelas: `task_total` = ACTIVE+COMPLETED+UNCOLLECTED+REASSIGNED sesuai
   kontrak `docs/audit/dasar-perbaikan-metrik-tugas-mobile-2026-09-13.md` §7.
   **Pelajaran untuk rencana berikutnya:** saat menunda perubahan skema,
   tetapkan dulu **perlakuan angka sementara** — bukan hanya "nanti dihapus".
3. **Klaim "identik" web–mobile tidak mempertimbangkan scope.** (§C.3)
4. **Tidak ada tiket untuk uji manual staging.** Rencana menyebut "dijalankan
   di staging sebelum rilis", tetapi bukan checklist dengan pemilik. Catatan
   penting: **semuanya sudah di-commit** sekarang (lihat §G.1), jadi risiko
   "kehilangan kerjaan" sudah tidak ada — tapi **5 skenario manual staging
   tetap belum dijalankan**.

---

## E. ⭐ Temuan baru saat eksekusi: produksi tidak pernah punya backup DB

Saat menjalankan backup pra-migrasi §C2, ditemukan:

- Cron backup harian **hanya staging** — `/etc/cron.d/lazisnu-backup-health`
  memanggil `env.backup-staging` + marker `backup-status-staging/`.
- **Produksi belum pernah dibackup otomatis.** Backup pertama baru dibuat
  manual malam ini (316 KiB, `backups-prod/pre-0007-…sql.gz`).

Ini adalah **celah operasional nyata** yang lebih besar dari semua temuan §C:
DB produksi 212 baris tidak punya cadangan terjadwal.

**Yang sudah dipasang untuk menutup celah:**

| Komponen | Lokasi | Verifikasi |
|---|---|---|
| Env creds produksi (600, root-only) | `/opt/lazisnu/.env.backup-prod` | ✅ terbaca, `panjang_DIRECT_URL=114` |
| Wrapper backup | `/opt/lazisnu/scripts/backup-prod.sh` | ✅ exit 0 |
| Cron harian 02:30 WIB | `/etc/cron.d/lazisnu-backup-prod` (`30 19 * * *` UTC) | ✅ dijalankan via wrapper, sukses |
| Healthcheck tiap jam :19 | `/etc/cron.d/lazisnu-backup-health` baris prod | ✅ `SUCCESS key=backups-prod/…sql.gz size_bytes=287154 age=145s` |
| Status marker R2 | `backup-status/lazisnu-prod-latest.json` | ✅ terverifikasi via healthcheck |

**Hasil uji sekali jalan (live):**

```
START backup timestamp=20260917_001846 free_before=3155MB
Dump valid  size=284K  sha256=3ab157dd5f26f5816791e310bc2492871da9451d9dab3baa01bdabf34803f4f1
R2 object verified  key=backups-prod/lazisnu_20260917_001846.sql.gz  size_bytes=287158
Success marker verified  key=backup-status/lazisnu-prod-latest.json
SUCCESS  r2_key=backups-prod/lazisnu_20260917_001846.sql.gz  size_bytes=287158
```

**Desain:** memakai ulang `backup.sh` generik yang sudah terbukti (env terpisah,
folder terpisah, prefix R2 `backups-prod`, status marker terpisah, retensi
90 hari). Staging tetap di 02:00 WIB, produksi 02:30 WIB — **sengaja
berjarak** supaya keduanya tidak berdesakan mengunci koneksi yang sama.

**⚠️ Sisa untuk Anda putuskan:**
- Alert Discord healthcheck prod belum mengirim notifikasi — healthcheck
  melaporkan `ALERT_NOT_SENT reason=webhook_not_configured`. Ini **sudah ada
  di staging** (channel yang sama), tinggal env `DISCORD_WEBHOOK_*`
  ditambahkan ke `.env.backup-prod`. Tanpa webhook, healthcheck hanya
  menulis log — gagal backup tetap diam.
- Backup **hanya DB**. File/foto bukti penjemputan (jika ada di storage VM)
  tidak tercakup.

---

## F. Verifikasi keamanan (diaudit, bukan klaim laporan)

- ✅ **`POST /mobile/cans/:canId/visits`** memakai `assertCanAccess(user, can)`
  — pintu kepemilikan cabang tunggal (`canService.ts:50-62`), persis seperti
  rute admin dan `conditionProposalService`. Komentar eksplisit menyebut
  ini menutup celah PETUGAS. Tidak ada cross-branch write.
- ✅ **`GET /mobile/assignments/:id/proposal-status`** memfilter
  `assignments.officerId = token.officerId` — petugas lain dapat 403, bukan
  proposal. Tidak membuka `getCanDetail` admin (persis rencana Fase 1).
- ✅ **`GET /mobile/visits`** memfilter `canVisits.officerId = token`.
- ✅ Limit `GET /visits` di-clamp `1..50` (tidak bisa DoS dengan `limit=∞`).
- ✅ Tidak ada interpolasi input user ke `sql` baru; pakai Drizzle operator.
- ✅ Nol dead code: `recordCanVisit` (1 caller TaskDetailScreen),
  `getProposalStatus` (1 caller TaskDetailScreen), `getVisits` (1 caller
  HistoryScreen) — semuanya tersambung dan dipakai.
- ✅ **Hapus `POSTPONED` tidak membuka endpoint baru** — tidak ada input
  user baru yang menyentuh enum; kode turunannya justru menghilangkan
  jalan menuju status yang tidak valid.

---

## G. Ringkasan verdict

| Aspek | Verdict | Catatan |
|---|---|---|
| Rencana: koreksi routing 5 saran | ✅ kuat | Semua koreksi benar, logikanya terdokumentasi |
| Rencana: fase & urutan | ✅ | Ketergantungan logis, tidak over-engineering |
| Rencana: kriteria terima uji-otomatis | ⚠️ lemah | Fase 2 luput (§C.2, §D.1) |
| Eksekusi: backend | ✅ sangat rapi | Komentar kontrak §7 menunjuk sumber, guard Fase 5 benar-benar mengunci |
| Eksekusi: mobile | ✅ | Fallback server-lama konsisten, copy "bukan penjemputan" dipatuhi |
| Eksekusi: keamanan endpoint baru | ✅ | `assertCanAccess` + scope officer, tidak ada celah cross-scope |
| Eksekusi: kejujuran penyimpangan | ✅ | 4 penyimpangan tercatat, tidak ada yang ditutupi |
| Eksekusi: angka klaim | ⚠️ | "22 baseline" tidak terbukti (baseline=18); log dirujuk tidak ada |
| **Eksekusi: `POSTPONED`** | **✅ DITUTUP** | **§C1 — dead enum hilang dari kode + DB produksi + terverifikasi live** |
| **Backup DB produksi** | **✅ DIPASANG** | **§E — cron harian 02:30 WIB + healthcheck tiap jam** |
| Eksekusi: state git | ✅ | Semua di-commit ke `fix/postponed-dead-enum-2026-09-16` (6 commit, belum di-merge sesuai permintaan) |

---

## H. Rekomendasi (berurutan, prioritas sebelum rilis)

1. **~~Commit dulu~~** ✅ **Dilakukan** — 6 commit di branch
   `fix/postponed-dead-enum-2026-09-16` (semua unmerged sesuai permintaan
   "marge nanti"). Saat merge + deploy: **migrasi tidak akan dijalankan
   ulang** (hash 0007 tercatat, simulate-deploy exit 0).
2. **~~Tambah regression test metrik campuran~~ (§C.2)** ✅ **Selesai.**
   Penghapusan `POSTPONED` menyentuh `task_total` di 4 tempat tanpa jaring
   otomatis. Solusi yang diambil: **memindahkan rumus ke satu fungsi murni
   `computeTaskMetrics()`** (`src/services/taskMetrics.ts`, baru) yang
   sekarang dipakai keempat call site — `overviewService.getTaskSummary`
   (web), `routes/mobile/tasks.ts` (`month_stats` + `stats-range`), dan
   `officerService`. Pemusatan ini menggantikan pendekatan "test
   membandingkan 2 output" dengan sesuatu yang lebih kuat: **secara fisik
   tidak mungkin** web dan mobile berangsur lepas karena keduanya memanggil
   fungsi yang sama.

   Pemusatan juga memperbaiki pola lama yang berbahaya: `taskRows.reduce(...)`
   memasukkan **setiap** baris groupBy ke total, termasuk enum tak dikenal.
   Fungsi baru menjumlahkan per status eksplisit (`TOTAL_STATUSES`) dan
   melaporkan baris tak terhitung lewat `task_unaccounted`, plus
   `assertMetricsAccountForAllRows()` yang melempar bila total ≠ jumlah baris.
   Artinya: menambah status enum baru tanpa mendaftarkannya **tidak lagi
   diam-diam mengubah total** — menjadi alarm yang gagalkan build.

   Test `__tests__/taskMetrics.test.ts` (11 tes) mencakup sebaran produksi
   riil (212 baris), POSTPONED sebagai status tak terhitung, count
   bigint/string dari driver, input kosong, dan `count: null`.
   **315 backend test hijau**, `tsc --noEmit` hijau.
3. **Tambah webhook Discord ke `.env.backup-prod`** (§E) — tanpa ini, backup
   produksi gagal hanya terlihat di log. **Masih terbuka** (staging sudah
   punya webhook di channel yang sama; tinggal salin env).
4. **Luruskan laporan:** ganti "22 baseline" → 18 (atau bukti ulang), hapus
   rujukan ke `tmp/mobile-tsc.log`, perbarui "12 suite/87 tes" → 20/191.
   **Masih terbuka.**
5. **Dokumentasikan pengecualian scope web↔mobile** (§C.3) — ubah kriteria
   "identik" menjadi "identik untuk petugas yang tidak menjemput lintas
   ranting; perbedaan harus dapat dijelaskan dari scope".
   **Masih terbuka** (perbaikan arsitektur H.2 mengurangi — tidak menghapus —
   gap ini: scope memang berbeda, `cans.branch_id` vs `officerId`).
6. **~~`MonthStats.task_active` wajib atau opsional?~~** ✅ **Diselesaikan.**
   Ditemukan bahwa route `month_stats` **menghitung** field baru
   (`task_active`/`task_closed`/`task_uncollected`) tapi **hanya mengirim 4
   field lama** — field opsional itu sebenarnya selalu ada di server, hanya
   tidak pernah sampai ke client. Sekarang ketiganya dikirim di
   `month_stats`; tipe shared tetap opsional demi APK lama. (Banner proposal
   §C.5 tetap terbuka: keputusan produk, bukan teknis.)
7. **5 skenario manual staging** — **tidak dapat dijalankan saat ini**:
   container backend staging sedang mati (hanya redis + web yang up). Ini
   adalah **prasyarat rilis**, bukan langkah yang bisa selesai sebelum
   deploy. Jalankan setelah branch merge + deploy ke staging: skip `CAN_LOST`
   → approve → angka overview; kunjungan VERIFIKASI/PENGGANTIAN; APK lama;
   scan `CAN_RETURNED`; banner proposal.

---

## I. Yang berubah di produksi malam ini (16→17 Sep 2026)

| WIB | Aksi | Hasil |
|---|---|---|
| 23:02 | SSH prasyarat: 212 baris, POSTPONED=0, 0 query aktif | ✅ aman jalan |
| 23:38 | Backup pra-migrasi → R2 `backups-prod/pre-0007-…sql.gz` | ✅ 316 KiB terverifikasi |
| 23:40 | Migrasi 0007 via `psql` (single transaction) | ✅ **0.19 detik sukses** |
| 23:41 | Verifikasi pasca: enum 4 nilai, 212 baris, 3 index utuh | ✅ |
| 00:14 | Catat hash 0007 di `__drizzle_migrations` | ✅ id=7, `313f3dfe…` |
| 00:15 | Simulasi migrate-cli seperti deploy | ✅ "skema sudah mutakhir", exit 0 |
| 00:18 | Backup harian produksi pertama via script | ✅ 287.158 bytes → R2 terverifikasi |
| 00:21 | Healthcheck produksi pertama | ✅ `SUCCESS age=145s` |
| 00:22 | Pasang cron harian 02:30 WIB + healthcheck :19 | ✅ aktif, cron daemon berjalan |

**Dokumen pendukung:** `PROSEDUR-MAINTENANCE-HAPUS-POSTPONED-2026-09-16.md`
(prosedur 8 langkah A–E + bukti dry-run), `RENCANA-HAPUS-POSTPONED-2026-09-16.md`.
