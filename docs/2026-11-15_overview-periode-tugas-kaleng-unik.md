# Overview: Rekap Perubahan Kaleng Unik per Periode Tugas — Implementation Plan

> **Untuk pelaksana:** Aturan bisnis telah dikonfirmasi pada bagian “Keputusan final sebelum coding”. Revisi rencana ini bukan izin implementasi; jangan mengubah kode, menjalankan migrasi, atau deployment sebelum persetujuan implementasi terpisah.

**Goal:** Ubah kartu Overview “Status & Kondisi Kaleng” dari snapshot keadaan akhir menjadi rekap kaleng unik yang mengalami perubahan terkait periode tugas, termasuk perubahan manual yang diberi periode tugas secara eksplisit.

**Architecture:** Untuk tiap periode tugas terpilih, temukan perubahan status operasional dan/atau kondisi fisik dari aktivitas tugas, otomatisasi dengan pemicu terbukti, serta perubahan admin/proposal manual dengan periode tugas eksplisit. Hitung tiap kaleng paling banyak satu kali per dimensi per periode; rentang beberapa bulan mengakumulasi hasil bulanan. Periode berasal dari assignment, periode kunjungan tersimpan, atau atribusi manual eksplisit, bukan bulan kalender tindakan. Scope memakai ranting pemilik kaleng saat ini; perpindahan kaleng dapat mengubah rekap ranting untuk periode lama.

**Tech Stack:** PostgreSQL/Drizzle, Fastify/TypeScript, Next.js/React, Vitest/Jest.

---

## Konteks dan keputusan yang sudah disepakati

- Branch kerja yang diperiksa: `fix/overview-metrics-labels-2026-11-13` (tip saat diperiksa sama dengan `staging`).
- Saat ini kartu menghitung **snapshot** pada cutoff akhir bulan pilihan terakhir (bulan berjalan sampai `now`) dengan replay `can_state_history`. Kodenya berada di `apps/backend/src/services/overviewService.ts` (`getCanStateSnapshot`) dan tampilannya di `apps/web/src/components/overview/ConditionBreakdown.tsx`.
- Keputusan baru dalam percakapan:
  1. Periode filter mengikuti **periode tugas**, bukan bulan kalender saat tugas dikerjakan.
  2. Satu bulan menampilkan aktivitas yang diatribusikan ke periode tugas itu. Contoh: perubahan dari tugas Oktober tetap dihitung pada Oktober walau tindakannya terjadi pada November.
  3. Rentang Sep–Nov mengakumulasi hasil periode tugas September, Oktober, dan November.
  4. Ukuran yang dipilih adalah **jumlah kaleng unik yang mengalami perubahan**, bukan jumlah event/transisi.
- Implikasi sementara untuk keunikan: hitung unik **per dimensi dan per periode tugas**. Sebuah kaleng bisa dihitung satu kali di kelompok Status dan satu kali di kelompok Kondisi pada periode yang sama bila kedua dimensi berubah. Bila kaleng sama berubah pada beberapa periode tugas dalam rentang, ia dihitung satu kali pada masing-masing periode lalu hasil periode dijumlahkan.
- Tidak boleh menyamakan metrik baru ini dengan jumlah seluruh kaleng pada akhir periode. Label/deskripsi UI harus menjelaskan bahwa angka merupakan kaleng yang berubah dan dikaitkan dengan periode tugas terpilih, termasuk perubahan manual berperiode eksplisit.
- Keputusan final: perubahan admin/proposal manual ikut rekap hanya bila admin menetapkan periode tugas secara eksplisit. Perubahan tanpa atribusi tidak ditebak dari tanggal tindakan dan tidak dimasukkan; riwayat serta dampaknya pada keadaan kaleng tetap dipertahankan.
- Kalibrasi teknis: agregasi baru hanya mengganti angka pada kartu Status & Kondisi. Snapshot lama tetap diperlukan untuk `placement_coverage`, `active_cans`, `inactive_cans`, `damaged_cans`, `lost_cans`, dan `action_required` di ringkasan Overview.
- Cakupan ledger dimulai dari baseline cutover; baseline bukan riwayat perubahan. Periode tugas sebelum atau melintasi awal pencatatan tidak boleh dilaporkan sebagai nol lengkap. Kontrak harus membedakan nol lengkap, data parsial, dan riwayat tidak tersedia.
- Scope final mengikuti ranting pemilik kaleng saat ini (`cans.branch_id`), bukan ranting pada waktu event atau ranting petugas. Perpindahan kaleng memindahkan kontribusi rekap periode lama ke ranting pemilik baru. Ini bukan izin penjemputan lintas ranting; batas akses yang berlaku tetap dipertahankan.
- Resubmit koleksi membuat versi baru, sedangkan event kondisi tetap merujuk koleksi asal. Jangan gunakan filter koleksi terbaru untuk agregasi perubahan kondisi.
- Urutan nilai terakhir deterministik per dimensi: `effective_at`, lalu `can_version`; waktu penerimaan event tidak boleh mengalahkan waktu kejadian.

## Asumsi domain dan pertanyaan sebelum implementasi

### Aturan agregasi yang diusulkan

- **Status Kaleng:** jumlah `can_id` unik per periode tugas yang mengalami sedikitnya satu perubahan `lifecycle_status` dari sumber yang memenuhi aturan atribusi final.
- **Kondisi Kaleng:** jumlah `can_id` unik per periode tugas yang mengalami sedikitnya satu perubahan `physical_condition` dari sumber yang memenuhi aturan atribusi final.
- Bila satu kaleng berubah berulang kali pada dimensi yang sama dalam satu periode, hitung satu kali pada dimensi itu. Misalnya Baik → Rusak → Baik = satu kaleng terdampak pada Kondisi, bukan dua event.
- Jika satu kaleng mengalami perubahan status dan kondisi dalam periode yang sama, hitung sekali pada masing-masing kelompok. Karena kelompok adalah dimensi independen, total kedua kelompok tidak dijumlahkan sebagai total kaleng unik.
- Rentang bulan adalah penjumlahan rekap tiap periode tugas. Kaleng yang sama dapat muncul di hitungan dua bulan berbeda jika berubah pada dua periode tugas tersebut.
- Untuk kategori per status/kondisi, masukkan kaleng ke kategori **nilai terakhir yang dicapai pada dimensi itu oleh perubahan yang memenuhi syarat dalam periode tugas**. Perubahan manual berperiode eksplisit ikut menentukan kategori terakhir; perubahan tanpa atribusi tidak ikut.

### Keputusan final sebelum coding

1. **Kategori terakhir:** satu kaleng yang berubah kembali pada periode sama tetap dihitung sekali per dimensi, dengan kategori perubahan terakhir yang memenuhi syarat. Baik → Rusak → Baik = satu kaleng pada kategori Baik.
2. **Otomatisasi:** `AUTO_EMPTY_STREAK` dan `AUTO_RESTORE_ACTIVE` keduanya dihitung jika koleksi/tugas pemicunya dapat dibuktikan. Periode mengikuti tugas pemicu, bukan tanggal evaluasi otomatis. Jika pemicu tidak terbukti, jangan menebak; tandai data belum lengkap.
3. **Identitas pemicu:** persistensikan relasi stabil ke koleksi/assignment pemicu untuk kedua otomatisasi. UUID acak dan waktu proposal saja tidak cukup; ini kebutuhan teknis untuk memenuhi keputusan nomor 2.
4. **Perubahan manual:** perubahan admin dan persetujuan proposal manual ikut dihitung hanya bila admin menentukan periode tugas secara eksplisit. Alur input periode dan penyimpanannya termasuk cakupan implementasi. Riwayat manual lama tanpa atribusi tidak otomatis diberi periode kalender atau periode tampilan.
5. **Scope ranting:** gunakan ranting pemilik kaleng saat ini. Contoh: perubahan terjadi ketika kaleng milik A, lalu kaleng dipindah ke B; kontribusi periode lama ikut masuk B dan keluar dari A. Pengguna menerima bahwa rekap lama dapat berubah karena perpindahan kepemilikan.
6. **Batas operasional:** tidak menambah izin penjemputan lintas ranting. Petugas mengikuti batas akses ranting yang berlaku; pengujian harus memastikan agregasi Overview tidak melonggarkan batas tersebut.
7. **Kunjungan tanpa assignment:** gunakan `can_visits.periodYear/periodMonth` yang memang tersimpan sebagai periode tugas/display, bukan menebak dari timestamp tindakan.
8. **Keunikan dan rentang:** hitung sekali per kaleng/dimensi/periode; hasil beberapa bulan adalah penjumlahan hasil tiap bulan terpilih. Kaleng yang sama berubah pada Oktober dan November dapat menyumbang dua hitungan. Kelompok Status dan Kondisi tidak dijumlahkan sebagai total kaleng unik.
9. **Kelengkapan:** riwayat tidak tersedia/parsial tidak ditampilkan sebagai nol lengkap. Angka yang masih dapat berubah karena tugas/sinkronisasi diberi penanda sementara. Finalisasi setoran tidak berarti rekap ini dibekukan: atribusi manual dan perpindahan kaleng tetap dapat memengaruhinya.
10. **Batas perubahan:** hanya kartu rekap ini yang berganti semantik. Summary keadaan seluruh kaleng tetap berbasis snapshot. Persetujuan aturan ini belum merupakan izin implementasi.

## Kalibrasi terhadap review teknis

1. **P1 — `AUTO_RESTORE_ACTIVE` terlewat:** Task 2 sekarang mencakup kedua otomatisasi (`AUTO_EMPTY_STREAK` dan `AUTO_RESTORE_ACTIVE`). Kedua event harus menyimpan pemicu koleksi/assignment/periode yang stabil; jangan mengandalkan `approved_at` atau UUID acak.
2. **P1 — riwayat sebelum cutover:** kontrak rekap kini wajib membedakan nol lengkap, parsial, dan tidak tersedia. Baseline cutover tidak dianggap sebagai daftar perubahan historis; periode yang tumpang tindih dengan awal pencatatan ditandai parsial kecuali riwayatnya dapat dibuktikan.
3. **P1 — risiko merusak metrik snapshot lain:** snapshot di `getOverview()` tetap dipakai untuk summary. Rekap perubahan adalah field baru dan hanya menggantikan data kartu Status & Kondisi.
4. **P1 — scope ranting:** rekomendasi awal replay branch historis telah diganti oleh keputusan pengguna: gunakan pemilik kaleng saat ini. Tes perpindahan memastikan kontribusi rekap lama ikut pemilik baru; tes akses tetap menolak operasi lintas ranting yang tidak diizinkan.
5. **P2 — resubmit koleksi:** event perubahan kondisi diatribusikan melalui collection asal yang tertulis di event, tanpa filter latest collection. Tes memastikan koreksi nominal tidak menghilangkan perubahan kondisi.
6. **P2 — “perubahan terakhir” ambigu:** nilai akhir per dimensi ditentukan secara deterministik oleh `effective_at`, lalu `can_version`; tes mencakup event terlambat dan timestamp sama.
7. **Keputusan manual:** rekomendasi awal mengecualikan seluruh perubahan manual telah diganti: masukkan perubahan manual dengan periode tugas eksplisit. Tambahkan alur admin, kontrak input, penyimpanan atribusi, dan pengujian terkait.

## Rencana implementasi

### Task 1 — Kunci aturan bisnis dalam tes agregasi murni

**Files:**
- Modify: `apps/backend/src/services/__tests__/canState.test.ts` atau buat `apps/backend/src/services/__tests__/overviewCanChangeSummary.test.ts`
- Modify: `apps/backend/src/services/overviewService.ts` hanya jika helper murni ditempatkan di sana; lebih baik buat helper kecil terpisah.

1. Tambahkan helper murni untuk mengelompokkan perubahan per `canId`, dimensi, dan periode tugas.
2. Tes kasus: dua event kondisi pada satu kaleng dalam satu periode menghasilkan satu kaleng unik; perubahan balik tetap dihitung satu kali; satu kaleng yang berubah status dan fisik dihitung satu kali di tiap kelompok; satu kaleng yang berubah di dua periode dihitung sekali pada setiap periode.
3. Tes kategori memakai nilai terakhir yang dicapai pada dimensi terkait dalam periode tersebut, dengan urutan ledger per dimensi `effective_at`, lalu `can_version`.
4. Uji event terlambat dan timestamp sama untuk memastikan hasil kategori terakhir deterministik; jangan gunakan urutan kedatangan event.
5. Jalankan tes dan pastikan merah sebelum implementasi.

### Task 2 — Tentukan atribusi event ke periode tugas

**Files:**
- Modify: `apps/backend/src/services/overviewService.ts`
- Modify: `apps/backend/src/database/schema.ts` dan migrasi baru bila diperlukan untuk relasi pemicu/atribusi; kebutuhan bukan hanya indeks.
- Reference/Modify: `apps/backend/src/services/canStateHistory.ts`, `apps/backend/src/services/conditionProposalService.ts` (writer otomatis dan identitas sumber).

1. Untuk event `COLLECTION`, hubungkan `can_state_history.source_id` dengan `collections.id`, lalu ambil `assignments.period_year/period_month` melalui `collections.assignment_id`. Jangan memakai `collected_at` sebagai periode atribusi.
2. Untuk event `CAN_VISIT`, hubungkan source event dengan record kunjungan; gunakan `can_visits.period_year/period_month` (sudah disimpan sebagai periode tugas/display yang berlaku).
3. Atribusikan `AUTO_EMPTY_STREAK` ke assignment koleksi yang melewati ambang, bukan `approved_at`. Persistensikan `trigger_collection_id`, `assignment_id`, dan periode tugas atau relasi stabil ekuivalen.
4. Atribusikan `AUTO_RESTORE_ACTIVE` dengan cara yang sama. Saat ini event memakai UUID acak dan tidak menyimpan pemicu; ubah writer agar identitas pemicu dapat ditelusuri dan stabil/idempoten.
5. Untuk event `COLLECTION`, ikuti `source_id` event ke koleksi asal dan assignment-nya. Jangan menyaring ke latest collection/resubmit: resubmit nominal tidak membatalkan atau mengganti peristiwa perubahan kondisi pada koleksi asal.
6. Batasi event pada sumber yang memenuhi keputusan final. Keluarkan baseline dan pembuatan kaleng. Masukkan admin update/proposal manual hanya jika memiliki periode tugas eksplisit yang tersimpan; jangan menyimpulkan periode dari waktu event.
7. Tambahkan tes: tugas Oktober dilakukan November tetap masuk Oktober; tugas November dilakukan Desember masuk November; kedua otomatisasi mengikuti periode koleksi pemicu.

### Task 2A — Tambahkan atribusi periode pada perubahan manual

**Files:**
- Modify: `apps/backend/src/services/canService.ts`, `apps/backend/src/services/conditionProposalService.ts`, dan route admin pemanggil terkait.
- Modify: `apps/backend/src/services/canStateHistory.ts`, `apps/backend/src/database/schema.ts`, migrasi baru, dan kontrak request bersama bila diperlukan.
- Modify: form admin pengubahan status/kondisi dan persetujuan proposal manual beserta client API-nya; temukan seluruh consumer sebelum edit.

1. Tambahkan input periode tugas eksplisit pada perubahan status/kondisi manual dan saat menyetujui proposal manual. Jangan diam-diam mengisi dari tanggal tindakan, filter halaman, atau display period.
2. Untuk perubahan manual yang akan masuk rekap, periode wajib dipilih dan tersimpan bersama relasi event yang stabil. Jika atribusi tidak tersedia, perubahan tidak boleh ikut rekap; riwayat lama tidak dihapus atau ditebak.
3. Persistensikan atribusi secara atomik bersama mutasi keadaan dan event. Periode hanya mengatur rekap; urutan keadaan kaleng tetap memakai waktu kejadian dan `can_version`.
4. Pada perubahan admin yang hanya memindahkan ranting tanpa mengubah status/kondisi, jangan membuat kontribusi perubahan dimensi. Perpindahan tetap memindahkan kontribusi historis karena scope memakai pemilik saat ini.
5. Tes perubahan manual berperiode Oktober yang dilakukan November masuk Oktober; event manual tanpa atribusi tidak masuk; approval proposal mengikuti periode eksplisit; periode tidak mengubah keadaan kaleng pada tanggal lampau.
6. Tes perubahan tugas menjadi Rusak lalu koreksi manual berperiode sama menjadi Baik: hitung satu kaleng pada kategori Baik. Koreksi manual tanpa atribusi tidak mengubah kategori rekap tugas tersebut.
7. Migrasikan seluruh caller penulis perubahan manual dan verifikasi form admin yang berubah secara langsung; jangan hanya menguji payload backend.

### Task 3 — Buat agregasi kaleng unik per periode dan scope pemilik saat ini

**Files:**
- Modify: `apps/backend/src/services/overviewService.ts`
- Create: `apps/backend/src/services/__tests__/overviewCanChangeSummary.integration.test.ts`
- Possible shared contract: `packages/shared-types/src/index.ts`

1. Tambahkan service yang menerima district/branch scope dan year + daftar months, dan mengembalikan hitungan status/kondisi baru per task period.
2. Kelompokkan perubahan menurut `(period_year, period_month, can_id, dimension)`, pilih perubahan terakhir per pasangan kaleng/dimensi/periode, lalu agregasikan kategori nilai akhirnya.
3. Filter scope ranting melalui `cans.branch_id` saat query; scope kecamatan melalui ranting pemilik saat ini. Jangan replay branch pada waktu event atau memakai ranting petugas untuk menentukan pemilik rekap.
4. Tes perpindahan kaleng dari A ke B memindahkan kontribusi periode lama ke B dan menghilangkannya dari A, termasuk perpindahan antarkecamatan. Uji terpisah bahwa batas akses operasional ranting tetap berlaku; agregasi ini tidak membuka izin penjemputan lintas ranting.
5. Untuk filter satu bulan, kembalikan angka bulan tersebut. Untuk filter multi-bulan, jumlahkan angka per bulan yang dipilih, bukan seluruh rentang kalender di antaranya jika ada bulan tak terpilih.
6. Tes bulan tidak berurutan (mis. Sep + Nov) hanya menjumlahkan Sep dan Nov.
7. Tes respons periode kosong menghasilkan nol dan scope ranting tidak bocor.

### Task 4 — Ganti kontrak snapshot Overview dengan ringkasan perubahan

**Files:**
- Modify: `apps/backend/src/services/overviewService.ts`
- Modify: route yang memanggil overview (temukan pemanggil `getCanStateSnapshot` sebelum edit)
- Modify: `packages/shared-types/src/index.ts`
- Modify: `apps/web/src/components/overview/overviewView.ts`
- Modify: tes backend Overview terkait

1. Definisikan kontrak terpisah, misalnya `canStateChangesByTaskPeriod`, yang menandai periode atribusi, jumlah unik per kategori, dan metadata kelengkapan.
2. Metadata harus membedakan **nol perubahan**, **data parsial**, dan **riwayat tidak tersedia**. Baseline cutover tidak merekonstruksi event sebelum cutover. Catat awal cakupan ledger per sumber event dan status kelengkapan periode tugas; periode sebelum atau melintasi awal pencatatan ditandai parsial/tidak tersedia, kecuali cakupan historis dapat dibuktikan dari sumber lain.
3. Hindari nama/komentar `snapshot`, `cutoff_at`, dan `history_complete` pada angka kartu baru. Pertahankan endpoint/API kompatibel hanya jika klien lain masih memakai kontrak lama; verifikasi penggunaan seluruh repo.
4. **Jangan mengganti atau menghapus snapshot dari `getOverview()`.** Pertahankan `getCanStateSnapshot()` untuk summary (`placement_coverage`, `active_cans`, `inactive_cans`, `damaged_cans`, `lost_cans`, `action_required`) dan tambahkan ringkasan perubahan sebagai field terpisah. Hanya kartu Status & Kondisi yang beralih ke ringkasan baru.
5. Jangan menghapus endpoint atau field yang masih dipakai sebelum consumer search dan tes kontrak selesai.
6. Tes payload satu/multi-bulan, event terlambat, kunjungan tanpa assignment, atribusi manual eksplisit/tidak tersedia, scope pemilik saat ini, periode sebelum cutover, dan periode yang melintasi cutover.

### Task 5 — Perbarui kartu dan copy UI

**Files:**
- Modify: `apps/web/src/app/dashboard/overview/page.tsx`
- Modify: `apps/web/src/components/overview/ConditionBreakdown.tsx`
- Modify: `apps/web/src/components/overview/ConditionBreakdown.test.tsx`
- Modify: `apps/web/src/components/overview/overviewView.ts`

1. Ubah penjelasan kartu agar menyatakan “kaleng yang mengalami perubahan terkait periode tugas terpilih”, termasuk perubahan manual dengan periode eksplisit, bukan “posisi pada akhir periode filter”.
2. Tampilkan dua kelompok independen Status dan Kondisi; setiap kategori menunjukkan kaleng unik dengan nilai perubahan terakhir yang memenuhi syarat pada dimensi/periode tersebut.
3. Tampilkan bahwa kelompok terpisah dan tidak dijumlahkan sebagai total kaleng.
4. Pertahankan semua summary berbasis snapshot pada bagian lain halaman Overview; perubahan semantik hanya berlaku pada kartu ini.
5. Bila periode belum tuntas, sebagian event belum teratribusi, atau riwayat periode belum tercakup ledger, tampilkan status sementara/parsial/tidak tersedia. Jangan menampilkan nol seolah-olah tidak ada perubahan ketika riwayatnya tidak tersedia.
6. Tes copy, angka, nol yang terverifikasi lengkap, dan tampilan status riwayat/atribusi tidak lengkap.
7. Jelaskan bahwa rentang bulan adalah akumulasi hasil bulanan, bukan kaleng unik global sepanjang rentang. Scope mengikuti pemilik saat ini; pemindahan kaleng dapat mengubah rekap ranting periode lama.

### Task 6 — Verifikasi seluruh jalur sumber dan regresi

**Files:**
- Backend tests: `apps/backend/src/services/__tests__/overviewCanChangeSummary.integration.test.ts`, `apps/backend/src/services/__tests__/canStateHistory.integration.test.ts`
- Web tests: `apps/web/src/components/overview/ConditionBreakdown.test.tsx`, `apps/web/src/app/dashboard/overview` tests yang relevan.

1. Buktikan tugas Oktober dilakukan November masuk Oktober, bukan November; tugas November dilakukan Desember masuk November.
2. Buktikan `AUTO_EMPTY_STREAK` dan `AUTO_RESTORE_ACTIVE` mengikuti periode koleksi pemicu dan pemicunya tersimpan stabil/idempoten.
3. Buktikan dua perubahan pada satu kaleng dalam satu task period hanya menambah satu kaleng unik per dimensi; kategori terakhir ditentukan oleh `effective_at`, lalu `can_version`.
4. Buktikan event terlambat dan timestamp sama memberi hasil kategori akhir yang deterministik.
5. Buktikan resubmit membuat versi collection baru tetapi event kondisi tetap diatribusikan melalui koleksi asal; tidak ada filter latest-version yang menghilangkan perubahan.
6. Buktikan perpindahan kaleng mengalihkan kontribusi historis ke pemilik saat ini, termasuk antarkecamatan; perpindahan branch saja tidak dihitung sebagai perubahan status/kondisi. Batas akses penugasan/kunjungan lintas ranting tetap berlaku.
7. Buktikan periode sebelum cutover/yang melintasi cutover ditandai tidak tersedia/parsial, sedangkan nol hanya diberikan jika cakupan lengkap dan memang tak ada kaleng berubah.
8. Buktikan metrik summary yang menggunakan snapshot tetap sama; hanya kartu perubahan yang memakai kontrak baru.
9. Buktikan perubahan admin/manual berperiode eksplisit ikut periode tersebut; tanpa atribusi tidak masuk. Uji approval, pengaruh koreksi manual pada kategori terakhir, dan form input periode end to end.
10. Jalankan tes backend/web terarah, typecheck, seluruh test suite yang relevan, dan `git diff --check`.

## Files yang kemungkinan berubah

- `apps/backend/src/services/overviewService.ts`
- Route Overview yang memanggil service (temukan via `rg "getCanStateSnapshot|getOverview" apps/backend/src` sebelum implementasi)
- `apps/backend/src/services/canStateHistory.ts` (atribusi event dan urutan deterministik)
- `apps/backend/src/services/conditionProposalService.ts`, `apps/backend/src/services/canService.ts`, route admin terkait, serta form/client API admin perubahan status/kondisi dan approval proposal.
- `apps/backend/src/database/schema.ts` dan migrasi baru (relasi pemicu otomatis, atribusi periode manual, serta cakupan ledger bila dibutuhkan)
- `packages/shared-types/src/index.ts`
- `apps/web/src/app/dashboard/overview/page.tsx`
- `apps/web/src/components/overview/ConditionBreakdown.tsx`
- `apps/web/src/components/overview/overviewView.ts`
- Tes service/integrasi backend dan komponen web terkait.

## Risiko dan mitigasi

- **Periode tugas berbeda dari tanggal tindakan:** atribusikan COLLECTION ke assignment periode; jangan memakai timestamp kalender sebagai pengganti.
- **Satu kaleng berulang kali berubah:** distinct per `(period, can, dimension)` dan kategori nilai terakhir, sesuai asumsi rencana.
- **Perubahan manual:** hanya masuk bila periode tugas ditentukan secara eksplisit dan tersimpan. Tanpa atribusi, jangan gunakan tanggal kalender sebagai pengganti. Kartu mencakup aktivitas tugas serta perubahan manual berperiode, bukan hanya tindakan petugas.
- **Otomatisasi status:** kedua jalur AUTO_EMPTY_STREAK dan AUTO_RESTORE_ACTIVE harus punya pemicu koleksi/assignment yang dapat ditelusuri; UUID acak saja tidak cukup untuk atribusi periode.
- **Cutover ledger:** baseline hanya memberi keadaan awal saat cutover, bukan sejarah perubahan sebelumnya. Periode lama atau periode tugas yang melintasi cutover wajib berstatus parsial/tidak tersedia kecuali ada bukti backfill yang lengkap.
- **Snapshot summary:** jangan menghapus/redefinisi snapshot yang dipakai metrik ringkasan lain; tambah rekap perubahan khusus kartu.
- **Scope pemilik saat ini:** perpindahan kaleng dapat mengubah rekap ranting/kecamatan periode lama walau event tidak berubah. Ini keputusan yang disetujui, bukan snapshot kepemilikan historis dan bukan izin operasi lintas ranting.
- **Resubmit:** latest collection dipakai oleh agregasi nominal, tetapi bukan filter untuk event kondisi; event tetap ditelusuri ke koleksi asal.
- **Multi-bulan dan deduplikasi:** akumulasi distinct bulanan, bukan deduplikasi global seluruh rentang. Tampilkan ini dalam tooltip/copy agar tidak ditafsirkan sebagai total kaleng unik sepanjang rentang.
- **Perubahan semantik kartu:** angka baru tidak sebanding langsung dengan snapshot lama. Label, deskripsi, tes, dan kontrak API harus berubah bersama.

## Gate sebelum implementasi

Keputusan pada bagian “Keputusan final sebelum coding” telah dikonfirmasi pengguna: kedua otomatisasi dengan pemicu terbukti dihitung; perubahan manual masuk dengan periode tugas eksplisit; scope mengikuti pemilik kaleng saat ini; tidak menambah izin penjemputan lintas ranting; aturan pendamping juga disetujui. Gate keputusan bisnis untuk rencana ini selesai. Implementasi kode, migrasi, dan deployment tetap menunggu persetujuan terpisah.
