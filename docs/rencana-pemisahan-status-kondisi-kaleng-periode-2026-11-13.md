# Status & Kondisi Kaleng Berbasis Periode — Implementation Plan

> **Untuk pelaksana:** Kerjakan bertahap dengan TDD. Pertahankan kompatibilitas API/mobile selama transisi, dan jangan menghapus skema lama sebelum seluruh pemakai lama terverifikasi.

**Status:** Direvisi berdasarkan review user pada 2026-11-13; menunggu persetujuan akhir dan aba-aba implementasi. Jangan mulai implementasi sebelum aba-aba.

**Goal:** Pisahkan status operasional kaleng dari kondisi fisiknya, tampilkan kedua kelompok pada kartu **“Status & Kondisi Kaleng”** sesuai posisi pada akhir periode filter, dan hilangkan metrik “Baru disebar”/“Ditarik” dari kartu serta agregasi overview yang hanya melayani kartu tersebut.

**Architecture:** Tambahkan field lifecycle status dan kondisi fisik sebagai dua dimensi independen, serta ledger event append-only yang menyimpan perubahan per dimensi, waktu kejadian, waktu pencatatan, dan urutan deterministik. Snapshot historis direkonstruksi/replay per dimensi; event terlambat memicu rekalkulasi proyeksi dan checkpoint, bukan menyisipkan snapshot gabungan yang stale. Cutover membuat baseline untuk setiap kaleng pada waktu cutover setelah penulisan dihentikan/drain, lalu merekonsiliasi baseline sebelum pembacaan ledger diaktifkan. API mempertahankan field `condition` lama sebagai proyeksi kompatibilitas; request campuran yang bertentangan ditolak.

**Tech Stack:** PostgreSQL + Drizzle ORM, Fastify, TypeScript/shared-types, React Native/Expo, Next.js, Recharts, Jest, Vitest.

---

## Konteks dan keputusan

- Rencana ini direvisi setelah review enam celah P1/P2. Persetujuan arah sebelumnya tidak mengizinkan eksekusi; implementasi tetap menunggu aba-aba user.
- Sumber saat ini adalah `apps/backend/src/database/schema.ts`: `cans.condition` menggabungkan `AKTIF`, `NON_AKTIF`, `RUSAK`, `HILANG`, dan `DIKEMBALIKAN`. `is_active` bukan pengganti status operasional; saat ini ia terutama menandai kaleng masih dilacak dan hanya `DIKEMBALIKAN` bernilai `false`.
- Definisi yang disepakati:
  - **Status:** `AKTIF`, `NON_AKTIF`, `DIKEMBALIKAN`.
  - **Kondisi fisik:** `BAIK`, `RUSAK`, `HILANG`; jika kondisi record lama tidak dapat dipastikan dari riwayat, isi `BAIK` sebagai asumsi yang diizinkan user dan tandai sumbernya sebagai asumsi backfill agar dapat ditinjau/dikoreksi.
  - Satu kaleng dapat muncul satu kali pada setiap kelompok, misalnya status `NON_AKTIF` dan kondisi `BAIK`. Jumlah dua kelompok tidak dijumlahkan sebagai total kaleng.
  - Filter bulan menampilkan snapshot pada akhir bulan terpilih paling akhir. Untuk bulan berjalan, snapshot berhenti pada waktu sekarang. Pemilihan beberapa bulan tetap menghasilkan satu snapshot pada akhir bulan terpilih paling akhir, bukan penjumlahan event. Bulan/tahun masa depan ditolak; boundary historis bersifat setengah terbuka: `effective_at < awal bulan berikutnya`.
- Perubahan mobile yang sudah ada pada branch `fix/overview-metrics-labels-2026-11-13` belum di-commit. Pertahankan perubahan rata-rata Overview dan label input “Baik”; jangan menimpa atau membatalkannya.
- `new_cans` dan `withdrawn` tidak punya endpoint terpisah. Hasil penelusuran repo menunjukkan keduanya dikonsumsi oleh kartu ini melalui respons dashboard; fungsi agregasinya hanya dipakai oleh `overviewService`. Hapus hanya kedua metrik tersebut, bukan endpoint dashboard. Field `returned_*` tidak termasuk cakupan penghapusan ini.
- `can_visits.condition`, `can_condition_proposals`, dan `activity_logs` memiliki sebagian riwayat, tetapi belum menjadi satu ledger lengkap untuk setiap jalur perubahan. Snapshot historis sebelum cakupan riwayat yang dapat dibuktikan harus ditandai tidak tersedia/tidak lengkap, bukan dipalsukan.
- Efek koleksi/kunjungan offline memakai **waktu kejadian** (`collected_at`/`visited_at`) untuk `effective_at`, bukan waktu sinkronisasi. Simpan pula `recorded_at` dan urutan deterministik per kaleng. Event terlambat disisipkan ke urutan historis per dimensi; sesudahnya sistem menghitung ulang state terkini/checkpoint terdampak. Event terlambat tidak boleh menimpa branch dari event lain atau mengembalikan dimensi yang tidak diubah.
- Semua pengujian dan migrasi awal dilakukan lokal/test lalu staging. Tidak ada migrasi atau deployment produksi tanpa persetujuan terpisah.

## Model target

### Data saat ini dan kompatibilitas

Tambahkan dua kolom di `cans`:

- `lifecycle_status`: enum `AKTIF | NON_AKTIF | DIKEMBALIKAN`.
- `physical_condition`: enum `BAIK | RUSAK | HILANG`, tidak null setelah baseline/backfill.

Pertahankan `condition` lama sementara. Semua jalur tulis baru memperbarui pasangan field baru serta menjaga representasi `condition` lama agar klien mobile lama tetap berfungsi. Untuk status `NON_AKTIF`/`DIKEMBALIKAN`, kondisi fisik tetap independen dan mengikuti kondisi terakhir; jika riwayat lama tidak cukup untuk mengetahuinya, isi `BAIK` dengan sumber asumsi yang tercatat.

Pemetaan backfill awal:

| `condition` lama | `lifecycle_status` | `physical_condition` |
|---|---|---|
| `AKTIF` | `AKTIF` | `BAIK` |
| `RUSAK` | `AKTIF` | `RUSAK` |
| `HILANG` | `AKTIF` | `HILANG` |
| `NON_AKTIF` | `NON_AKTIF` | kondisi terakhir yang dapat dibuktikan; selain itu `BAIK` dengan provenance asumsi |
| `DIKEMBALIKAN` | `DIKEMBALIKAN` | kondisi terakhir yang dapat dibuktikan; selain itu `BAIK` dengan provenance asumsi |

**Proyeksi balik pasangan baru → legacy `condition`:** `AKTIF+BAIK → AKTIF`, `AKTIF+RUSAK → RUSAK`, `AKTIF+HILANG → HILANG`, `NON_AKTIF+BAIK/RUSAK/HILANG → NON_AKTIF`, dan `DIKEMBALIKAN+BAIK/RUSAK/HILANG → DIKEMBALIKAN`. Proyeksi ini memang lossy untuk klien lama; field baru tetap menjadi sumber kebenaran. Request endpoint koleksi lama menafsirkan `condition=AKTIF/RUSAK/HILANG` sebagai kondisi fisik saja, sedangkan endpoint admin yang mengubah enum lima nilai memakai mapping legacy sesuai state machine. Jika request membawa legacy `condition` sekaligus pasangan field baru, hitung proyeksi dan tolak dengan `VALIDATION_ERROR` bila tidak sama; jangan gunakan fallback backfill untuk request baru. Kaleng baru dimulai sebagai `AKTIF + BAIK`. `is_active` dipertahankan sebagai proyeksi kompatibilitas (`false` hanya untuk `DIKEMBALIKAN`) sampai seluruh query lama diperbarui dan diuji.

### Ledger keadaan

Buat ledger event append-only `can_state_history` yang menyimpan **patch per dimensi**, bukan snapshot penuh yang dianggap sebagai perubahan semua dimensi:

- `can_id`; nilai baru nullable untuk dimensi yang berubah saja: `lifecycle_status`, `physical_condition`, `branch_id`;
- `effective_at`, `recorded_at`, `can_version`/urutan monotonik yang diberikan saat lock, source/source ID stabil untuk idempotensi, actor bila tersedia, dan provenance kondisi fisik;
- baris event wajib mengubah minimal satu dimensi.

Tulis event di transaksi yang sama dengan perubahan. Untuk event terlambat, rekonstruksi tiap dimensi dengan mengurutkan event dimensi tersebut (`effective_at`, lalu urutan deterministik saat timestamp sama), hitung ulang proyeksi `cans`, dan perbarui/bangun ulang checkpoint setelah posisi event tersisip. Jangan menganggap event pindah ranting membawa nilai kondisi fisik yang berlaku pada saat ia diterima. Tetapkan aturan penghapusan permanen agar ledger tidak hilang/menjadi orphan tanpa sengaja.

### Cakupan snapshot historis

- Query snapshot merekonstruksi nilai **masing-masing dimensi** dari event patch terakhir pada cutoff: `effective_at < awal bulan berikutnya` untuk bulan historis, dan `effective_at <= now` untuk bulan berjalan. Scope cabang juga direkonstruksi per dimensi; batasi kaleng pada `created_at` sebelum cutoff.
- Tambahkan metadata periode pada respons, misalnya batas riwayat yang tersedia dan indikator `history_complete`.
- Backfill event lama hanya dari jejak yang dapat diverifikasi (`can_condition_proposals`, `can_visits`, `activity_logs`). Nilai kondisi fisik lama yang tak dapat dibuktikan menjadi `BAIK` dengan provenance `LEGACY_ASSUMPTION_BAIK`. State awal semua kaleng existing dibuat sebagai baseline pada waktu cutover, bukan pada `created_at` yang direkayasa. Jika periode meminta status sebelum riwayat dapat dipercaya, UI tampilkan pesan keterbatasan dan jangan mengklaim snapshot status akurat.
- Gunakan batas tanggal operasional yang konsisten dengan `Asia/Jakarta`; tambahkan helper batas kalender dan tes boundary, timezone, serta event tepat tengah malam bulan berikutnya.

## Rencana kerja berurutan

### Task 1 — Kunci mapping domain dalam tes murni

**Files:**
- Create: `apps/backend/src/services/canState.ts`
- Create: `apps/backend/src/services/__tests__/canState.test.ts`
- Reference: `apps/backend/src/services/conditionRules.ts`

1. Tulis tes mapping lima enum legacy ke status/kondisi baru, termasuk fallback backfill `BAIK` ber-provenance untuk `NON_AKTIF`/`DIKEMBALIKAN` tanpa riwayat.
2. Tulis tes transisi: kondisi fisik bertahan saat status menjadi `NON_AKTIF`/`DIKEMBALIKAN`; kunjungan isi memperbarui kondisi fisik terpilih dan mengaktifkan status; kaleng rusak/hilang tetap berstatus aktif-terlacak.
3. Jalankan `pnpm --filter lazisnu-backend exec jest --runInBand src/services/__tests__/canState.test.ts`; pastikan merah.
4. Implementasikan tipe/helper mapping dan jalankan ulang sampai lulus.
5. Jangan ubah `conditionRules` state machine tanpa tes yang mengunci semua transisi lama.

### Task 2 — Tambahkan skema dan migrasi additive

**Files:**
- Modify: `apps/backend/src/database/schema.ts`
- Create: `apps/backend/src/database/migrations/0020_can_state_history.sql` (verifikasi indeks migrasi sebelum membuat)
- Update: `apps/backend/src/database/migrations/meta/_journal.json`
- Create/modify: tes migrasi/backfill di `apps/backend/src/database` atau `apps/backend/src/services/__tests__/`

1. Tulis tes backfill untuk semua nilai legacy, provenance `LEGACY_ASSUMPTION_BAIK`, dan baseline yang dibuat pada satu `cutover_at` eksplisit untuk setiap kaleng yang sudah ada.
2. Jalankan tes sebelum implementasi; verifikasi ia gagal karena kolom/ledger belum tersedia.
3. Tambahkan enum baru, kolom `cans`, ledger patch, indeks, dan journal migration `0020` secara additive.
4. Tetapkan runbook cutover yang sesuai `scripts/deploy-blue-green.sh`: script dapat menyiapkan target sementara backend lama masih aktif dan migrasi dilakukan sebelum switch; karena backend lama hanya menulis `condition`, aktifkan write-pause/maintenance sebelum backfill, hentikan/drain kedua warna dan seluruh mutasi termasuk batch sync offline, lalu ambil satu `cutover_at`. Jangan mengandalkan `RUN_MIGRATIONS` atau switch blue-green sebagai mekanisme konsistensi. Jika write-pause tidak dapat diterima, desain dan uji dual-write yang menangkap effective time sebelum cutover sebagai prasyarat terpisah.
5. Backfill kolom; isi kondisi fisik lama tanpa bukti sebagai `BAIK` dengan provenance; buat tepat satu baseline ledger `CUTOVER_BASELINE` pada `cutover_at` bagi **setiap** kaleng existing, membawa state hasil backfill dan branchId saat cutover. Baseline bukan event bisnis dan tidak boleh memakai `created_at` kaleng.
6. Rekonsiliasi sebelum mengaktifkan pembacaan ledger: jumlah kaleng existing = jumlah baseline; periksa setiap nilai legacy↔pasangan baru, branch scope, asumsi BAIK, duplikasi source ID, serta kesetaraan proyeksi `cans` dengan replay. Gagal rekonsiliasi berarti batalkan cutover dan jangan switch/resume writes.
7. Definisikan rollback eksplisit: sebelum backend baru menerima mutasi, rollback boleh kembali ke backend lama selama pembacaan ledger dinonaktifkan. Jika writer lama kembali menerima mutasi, ledger baru dianggap dormant/stale; sebelum pembacaan ledger diaktifkan lagi, lakukan write-pause, drain, rekonsiliasi penulisan legacy, dan buat baseline cutover baru. Setelah writer baru menerima mutasi, jangan switch langsung ke writer lama; utamakan forward-fix. Rollback kode hanya boleh dengan write-pause, drain, replay/rekonsiliasi event dan proyeksi legacy, serta validasi baseline; bila tidak dapat dibuktikan konsisten, tetap pause writes.
8. Tambahkan constraint yang aman, jalankan `pnpm --filter lazisnu-backend db:check-orphans`, lalu validasi seluruh prosedur pada database test/staging. Jangan jalankan di produksi tanpa izin terpisah.

### Task 3 — Catat semua perubahan state secara atomik

**Files utama:**
- Modify: `apps/backend/src/services/canService.ts`
- Modify: `apps/backend/src/services/conditionProposalService.ts`
- Modify: `apps/backend/src/services/collectionSubmission.ts`
- Modify: `apps/backend/src/services/mobileSyncService.ts`
- Modify: `apps/backend/src/routes/mobile/tasks.ts`
- Modify: `apps/backend/src/routes/admin/cans.ts`
- Create: `apps/backend/src/services/canStateHistory.ts`
- Create: `apps/backend/src/services/__tests__/canStateHistory.test.ts`

1. Tulis tes event per dimensi, idempotensi, urutan deterministic, dan rekonstruksi baseline + patch untuk status, kondisi, serta ranting.
2. Tambahkan tes regresi: pada 10 Okt ada event pindah ranting yang hanya mengubah `branch_id` dengan kondisi BAIK; event kondisi RUSAK datang terlambat dengan `effective_at` 5 Okt. Replay harus menghasilkan kondisi RUSAK pada akhir 5 Okt dan sesudah 10 Okt, tanpa mengubah branch tujuan. Tambahkan variasi event status terlambat, perubahan fisik berikutnya yang memang mengubah RUSAK kembali, serta dua perubahan dimensi yang datang bersamaan.
3. Jika event terlambat memiliki `effective_at` sebelum baseline cutover, perlakukan sebagai rekonsiliasi historis: bangun ulang baseline/dimensi terdampak dari riwayat yang dapat dipercaya. Bila ada gap sejarah yang membuat hasil ambigu, tandai konflik/riwayat tidak lengkap dan jangan menimpa proyeksi secara otomatis.
4. Tambahkan tes konkurensi integrasi untuk dua mutasi bersamaan (update branch/identitas vs update kondisi) yang membuktikan tidak ada lost update dan kedua event tercatat; tes harus mengulang race beberapa kali atau gunakan barrier deterministik.
5. Pindahkan pembacaan `existing` dan validasi transisi `updateCan` ke dalam transaksi setelah lock `SELECT ... FOR UPDATE` pada row kaleng. Semua jalur state-changing memakai helper lock yang sama dan urutan lock konsisten (can sebelum assignment/history); jangan menulis ulang field yang tidak berubah dari objek lama yang dibaca di luar transaksi.
6. Alokasikan `can_version` secara monotonik di bawah lock. Urut event per dimensi dengan `(effective_at, can_version)`; versi hanya memecahkan timestamp kejadian yang sama dan tidak mengalahkan tanggal kejadian yang lebih lama.
7. Integrasikan writer event patch dan replay/rebuild checkpoint/proyeksi per dimensi di create/update/return, approval proposal, collection, restore/nonaktif otomatis, visit, sync batch, dan kunjungan khusus. Untuk event lapangan gunakan `collected_at`/`visited_at` tervalidasi; untuk perubahan otomatis ambang enam koleksi, tentukan timestamp kejadian dan uji.
8. Setiap event terlambat memicu rekalkulasi dimensi yang berubah sampai proyeksi terkini; event pindah ranting tidak membawa kondisi lama. `condition` legacy dan `is_active` diturunkan konsisten dari pasangan hasil replay.
9. Jalankan tes konkurensi/integrasi dan `pnpm --filter lazisnu-backend typecheck`.

### Task 4 — Pertahankan kontrak mobile, antrean offline, dan tipe bersama

**Files:**
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/backend/src/routes/admin/schemas.ts`
- Modify: `apps/backend/src/routes/mobile/schemas.ts`
- Modify: `apps/mobile/src/services/api.ts`
- Modify: `apps/mobile/src/services/offline/queue.ts`
- Modify: `apps/mobile/src/services/offline/sync.ts`
- Modify: layar mobile yang membaca/menulis kondisi, termasuk `apps/mobile/src/screens/CollectionScreen.tsx` dan layar tugas/riwayat relevan
- Tes queue/sync/screen di `apps/mobile/src/**/__tests__/**` dan `apps/backend/src/routes/mobile/__tests__/**`

1. Tambahkan field baru pada kontrak bertipe dan tes parsing request/response; tetapkan mapping balik legacy dan tolak request yang mengirim field lama+baru namun bertentangan. Fallback `BAIK` hanya berlaku untuk backfill, bukan perintah perubahan state.
2. Pertahankan input legacy `condition` untuk versi app lama dan antrean offline lama. Koleksi lama `AKTIF/RUSAK/HILANG` diperlakukan sebagai kondisi fisik; status ditentukan state machine server.
3. Naikkan `CURRENT_SCHEMA_VERSION` pada `apps/mobile/src/services/offline/queue.ts`; migrasikan item tersimpan yang hanya punya `condition` menjadi `physical_condition` tanpa menghilangkan id/retry metadata atau mengubah `offline_id`.
4. Perbarui `QueuedCollection` agar menyimpan kondisi fisik eksplisit. Perbarui `toBatchPayload` di `apps/mobile/src/services/offline/sync.ts` agar mengirim field baru dan legacy alias yang konsisten selama dual-contract.
5. Tambahkan tes normalisasi queue lama, queue schema upgrade, pembuatan payload, flush, dan replay setelah aplikasi ditutup/dibuka ulang; buktikan nilai fisik dan idempotency key tetap sama.
6. Mobile baru mengirim dimensi fisik secara eksplisit pada alur yang memilih kondisi; lifecycle status tetap diputuskan backend sesuai state machine/outcome.
7. Pertahankan response lama selama kompatibilitas; tandai `condition` deprecated. Jalankan tes queue/sync/screen serta typecheck mobile/shared-types.

### Task 5 — Bangun agregasi snapshot Overview sesuai periode

**Files:**
- Modify: `apps/backend/src/services/overviewService.ts`
- Modify atau extend: `apps/backend/src/services/periodCalendar.ts` dan tes kalendernya
- Modify: `packages/shared-types/src/index.ts`
- Create: `apps/backend/src/services/__tests__/overviewCanStateSnapshot.test.ts`
- Add integration coverage: `apps/backend/src/services/__tests__/overviewAttribution.integration.test.ts` atau tes integrasi Overview terpisah

1. Tulis tes validasi periode: tolak tahun/bulan masa depan (termasuk daftar multi-bulan yang berisi bulan mendatang); izinkan bulan berjalan dengan cutoff `now`, gunakan kalender operasional bukan timezone host.
2. Tulis tes batas historis setengah terbuka: event tepat `2026-11-01 00:00` tidak masuk snapshot Oktober, sedangkan event sebelum boundary masuk. Uji timezone operasional, Desember/Januari, dan beberapa bulan terpilih memakai bulan terakhir.
3. Tulis tes replay patch per dimensi, termasuk event kondisi terlambat setelah event pindah branch; implementasikan cutoff historis `effective_at < awal bulan berikutnya` dan bulan berjalan `effective_at <= now`.
4. Rekonstruksi branch dan setiap dimensi secara independen; batasi pada kaleng yang sudah ada saat cutoff dan sertakan metadata kelengkapan riwayat.
5. Kembalikan dua kelompok terpisah pada payload Overview: status (`AKTIF/NON_AKTIF/DIKEMBALIKAN`) dan kondisi fisik (`BAIK/RUSAK/HILANG`), serta jumlah kondisi `BAIK` yang berasal dari asumsi backfill. Jangan menjumlahkan kelompok silang.
6. Uji cakupan periode yang belum memiliki riwayat lengkap; respons harus mengindikasikan keterbatasan agar UI tidak menampilkan angka seolah-olah lengkap.
7. Ubah `parseOverviewPeriod` agar menolak bulan/tahun masa depan secara eksplisit (bukan membatasi diam-diam), dan sinkronkan filter UI agar bulan masa depan tidak dapat dipilih.
8. Jalankan tes Overview/periode, `pnpm --filter lazisnu-backend typecheck`, dan pemeriksaan migrasi orphan.

### Task 6 — Hapus arus “Baru disebar” dan “Ditarik” sampai ke agregasi Overview

**Files:**
- Modify: `apps/web/src/components/overview/ConditionBreakdown.tsx`
- Modify: `apps/web/src/app/dashboard/overview/page.tsx`
- Modify: `apps/web/src/components/overview/overviewView.ts`
- Modify: `apps/backend/src/services/overviewService.ts`
- Modify: `apps/backend/src/services/productivityService.ts`
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/backend/src/services/__tests__/productivity.integration.test.ts`
- Modify: fixture `apps/web/src/components/__tests__/overview-format.test.ts`
- Update: `docs/API_DOCUMENTATION.md` dan `docs/DATABASE_SCHEMA.sql` bila keduanya mendokumentasikan payload/skema terkait

1. Hapus props dan baris tampilan baru disebar/ditarik dari kartu.
2. Hapus `new_cans`/`withdrawn` dari `OverviewSummary`, view type, fixture, dan payload dashboard.
3. Setelah pencarian ulang seluruh monorepo membuktikan tidak ada konsumen lain, hapus `getNewCansCount`/`getWithdrawnCount` serta tes khusus keduanya. Jangan menghapus route dashboard atau metrik lain yang masih digunakan.
4. Jalankan tes web dan backend terkait; pastikan respons Overview tidak lagi menjalankan query yang dibuang.

### Task 7 — Bentuk kartu dan visualisasi dua kelompok

**Files:**
- Modify: `apps/web/src/components/overview/ConditionBreakdown.tsx`
- Modify: `apps/web/src/components/overview/overviewView.ts`
- Create/modify: tes komponen di `apps/web/src/components/overview/`

1. Tulis tes render untuk judul **Status & Kondisi Kaleng**, label kedua kelompok, nilai setiap kategori, indikator jumlah kondisi hasil asumsi backfill, dan state riwayat status tidak lengkap.
2. Ubah kartu menjadi dua kelompok bernama **Status Kaleng** dan **Kondisi Kaleng**; hilangkan dua baris arus.
3. Pisahkan visual menjadi dua chart radar tiga sumbu (satu status, satu kondisi), responsif pada mobile. Jika layout sempit membuat radar sulit dibaca, gunakan bar horizontal sebagai fallback; angka langsung dan daftar teks tetap terlihat sehingga chart bukan satu-satunya sumber informasi.
4. Sediakan accessible name/summary yang memuat kategori dan angka; jangan mengandalkan warna saja. Persentase dihitung di dalam kelompok masing-masing, bukan satu denominator gabungan.
5. Jalankan tes komponen dan `pnpm --filter web typecheck`.

### Task 8 — Verifikasi ujung-ke-ujung pada staging

**Files:** perubahan hanya pada file implementasi yang tercantum di atas; tidak ada file produksi/runtime yang diedit manual.

1. Jalankan `pnpm --filter lazisnu-backend test:unit`, `pnpm --filter lazisnu-backend exec jest --runInBand` untuk seluruh tes backend, `pnpm --filter lazisnu-backend typecheck`, `pnpm --filter web test`, `pnpm --filter web typecheck`, `pnpm --filter lazisnu-collector-app exec jest --runInBand`, dan `pnpm --filter lazisnu-collector-app typecheck`.
2. Jalankan `git diff --check` dan `pnpm --filter lazisnu-backend db:check-orphans`.
3. Di staging, validasi data dengan fixture anonim: seluruh kombinasi status/kondisi yang diizinkan, proyeksi legacy dan request konflik, baseline satu-per-kaleng, perpindahan ranting, serta event kondisi terlambat.
4. Urutan cutover staging wajib eksplisit: aktifkan write-pause/maintenance; drain mutasi dan sync offline; siapkan target blue-green dengan health check yang tidak membaca ledger; jalankan migrasi + backfill + baseline pada satu `cutover_at`; rekonsiliasi jumlah/state; aktifkan pembacaan ledger dan switch traffic; verifikasi; baru cabut write-pause.
5. Pastikan dua chart dan daftar angka terbaca di desktop/mobile; verifikasi query scope ranting/kecamatan tidak bocor. Uji bulan masa depan ditolak dan event tepat awal bulan berikutnya tidak masuk bulan sebelumnya.
6. Uji rollback sebelum dan sesudah backend baru menerima mutasi. Setelah mutasi baru diterima, rollback langsung ke writer lama dilarang; gunakan forward-fix atau rollback compatibility build/adapter yang telah diuji, dengan write-pause dan rekonsiliasi ledger. Jika tidak dapat membuktikan konsistensi, tetap pause writes.
7. Catat hasil migrasi staging dan jumlah kondisi yang diisi sebagai asumsi `BAIK`. **Jangan menjalankan migrasi, deployment, atau akses ke produksi** tanpa persetujuan user terpisah.

## File kemungkinan berubah

- Backend: `apps/backend/src/database/schema.ts`, migrasi baru `0020_can_state_history.sql`, `apps/backend/src/services/canState.ts`, `canStateHistory.ts`, `overviewService.ts`, `productivityService.ts`, `canService.ts`, `conditionProposalService.ts`, `collectionSubmission.ts`, `mobileSyncService.ts`, `periodCalendar.ts`, route/schema terkait, serta tes service/route.
- Kontrak dan mobile: `packages/shared-types/src/index.ts`, `apps/mobile/src/services/api.ts`, layar input/kegiatan yang membaca atau menulis state, dan tes mobile.
- Web: `apps/web/src/components/overview/ConditionBreakdown.tsx`, `overviewView.ts`, `apps/web/src/app/dashboard/overview/page.tsx`, serta tes Overview.
- Dokumentasi kontrak/skema: `docs/API_DOCUMENTATION.md`, `docs/DATABASE_SCHEMA.sql`, diperbarui hanya jika isinya mencakup kontrak yang diubah.
- Dokumen rencana ini: `docs/rencana-pemisahan-status-kondisi-kaleng-periode-2026-11-13.md`.

## Risiko dan pengendalian

1. **Event terlambat dan checkpoint:** ledger patch per dimensi, replay terurut, rebuild proyeksi/checkpoint sesudah event disisipkan; event sebelum cutover perlu rekonsiliasi dan tidak boleh mengalahkan baseline secara spekulatif.
2. **Mutasi serentak:** semua penulis mengambil lock row kaleng di transaksi sebelum membaca state; gunakan urutan lock yang seragam dan `can_version` sebagai tie-break efektif yang sama.
3. **Cutover/rollback:** backend lama menulis `condition` saja. Hentikan/drain mutasi selama baseline dan rekonsiliasi; setelah writer baru menerima mutasi, jangan kembali langsung ke writer lama tanpa adapter/forward-replay yang diuji.
4. **Backfill kondisi lama:** sesuai izin user, isi kondisi tanpa bukti sebagai `BAIK`, tetapi catat provenance dan tampilkan jumlah asumsi agar angka tidak dianggap hasil observasi pasti.
5. **Klien mobile offline/versi lama:** migrasikan queue ke skema baru secara durabel, pertahankan `offline_id`/retry metadata, serta tetap terima kontrak lama selama masa kompatibilitas.
6. **Scope historis:** simpan event branch secara independen dari kondisi fisik supaya laporan kondisi terlambat tidak mengembalikan branch; snapshot sebelum ledger lengkap tetap ditandai terbatas.
7. **Periode:** tolak bulan/tahun masa depan; bulan berjalan sampai sekarang; bulan historis memakai batas `< awal bulan berikutnya`.
8. **Perubahan kontrak:** dashboard API tetap ada; hanya field agregat `new_cans` dan `withdrawn` yang dihapus setelah pemakaian repo dikonfirmasi. Penghapusan kolom/enums lama bukan bagian rollout pertama.
