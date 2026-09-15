# Dasar perbaikan metrik tugas pada aplikasi mobile

**Tanggal:** 13 September 2026  
**Status:** Dasar keputusan dan rancangan perbaikan; belum merupakan implementasi kode.

## 1. Tujuan dokumen

Dokumen ini merangkum hasil pembahasan tentang angka pada tiga bagian aplikasi mobile:

1. kartu bulan berjalan pada halaman beranda;
2. halaman Daftar Tugas;
3. halaman Statistik Rentang.

Dokumen ini menjadi acuan sebelum mengubah query backend, kontrak API, tampilan mobile, dan alur status assignment.

---

## 2. Definisi final yang disepakati

### 2.1 `x penjemputan`

`x penjemputan` berarti jumlah kaleng yang benar-benar berhasil dijemput pada rentang tanggal yang sedang dilihat.

Sumber datanya adalah tabel `collections`, bukan tabel `assignments`.

Aturan hitung:

- collection milik petugas yang sedang dilihat;
- tanggal `collected_at` berada di dalam rentang;
- `sync_status = 'COMPLETED'`;
- hanya collection terbaru untuk kombinasi assignment dan kaleng, menggunakan aturan `getLatestCollectionCondition()`.

Contoh:

```text
35 penjemputan
```

Artinya 35 kaleng berhasil dijemput. Angka ini tidak otomatis berarti total tugas adalah 35.

Label yang disarankan:

```text
35 penjemputan
```

atau:

```text
35 kaleng dijemput
```

Jangan menampilkan angka collection dengan label yang membuatnya terlihat sebagai jumlah assignment.

### 2.2 `x tugas belum`

`x tugas belum` berarti jumlah assignment yang masih terbuka dan masih perlu dikerjakan.

Dalam alur tugas yang berjalan sekarang, assignment yang masih terbuka adalah status:

```text
ACTIVE
```

Rumus:

```text
x tugas belum = jumlah assignment berstatus ACTIVE
```

Filter harus menggunakan scope yang sama dengan total tugas:

```text
officer_id  = petugas yang sedang dilaporkan
period_year = tahun periode tugas
period_month = bulan periode tugas
```

Contoh:

```text
2 tugas belum
```

Artinya masih ada 2 assignment yang belum ditutup.

### 2.3 `x/y tugas selesai`

`x/y tugas selesai` berarti:

- `y` = seluruh assignment yang dibebankan kepada petugas pada periode yang sama;
- `x` = assignment yang sudah ditutup secara operasional.

Untuk alur yang telah disepakati:

```text
COMPLETED   = berhasil dijemput dan ditutup
UNCOLLECTED = tidak berhasil dijemput, tetapi sudah ditutup dengan alasan
```

Maka:

```text
x tugas selesai = COMPLETED + UNCOLLECTED

y total tugas = semua assignment pada scope petugas + periode yang sama
```

Contoh utama:

```text
38 penjemputan
0 tugas belum
60/60 tugas selesai
```

Interpretasi:

```text
38 assignment COMPLETED karena 38 kaleng berhasil dijemput
22 assignment UNCOLLECTED karena tidak berhasil dijemput tetapi sudah ditutup
0 assignment ACTIVE tersisa
60 assignment total
```

Contoh kedua:

```text
35 penjemputan
2 tugas belum
38/40 tugas selesai
```

Interpretasi:

```text
35 assignment COMPLETED
3 assignment UNCOLLECTED
2 assignment ACTIVE
40 assignment total
```

Perhitungannya:

```text
35 COMPLETED + 3 UNCOLLECTED = 38 tugas selesai
38 tugas selesai + 2 ACTIVE = 40 total tugas
```

---

## 3. Mengapa tampilan lama membingungkan

Tampilan lama beranda menggunakan format seperti:

```text
38 kaleng · 1 dari 1 tugas
```

Ada dua masalah:

1. angka pertama berasal dari `collections` berdasarkan tanggal penjemputan;
2. angka kedua berasal dari `assignments` berdasarkan periode dan status tugas.

Keduanya tidak memakai sumber data dan filter yang sama.

Selain itu, angka pertama pada format lama memakai `task_completed`, sedangkan kebutuhan final adalah:

```text
x tugas belum = ACTIVE
x/y tugas selesai = tugas tertutup / seluruh assignment
```

Format yang disarankan pada Statistik Rentang:

```text
35 penjemputan
2 tugas belum
38/40 tugas selesai
```

Untuk beranda, format yang sama dapat dipakai jika ruang mencukupi. Jika ruang terbatas, gunakan dua baris:

```text
35 penjemputan
2 tugas belum · 38/40 selesai
```

---

## 4. Jalur kode yang sudah diperiksa

### 4.1 Beranda mobile

File:

```text
apps/mobile/src/screens/DashboardScreen.tsx
```

Bagian penting:

```tsx
{monthStats?.collected || 0} kaleng · {monthTaskCompleted} dari {monthTaskTotal} tugas
```

Saat ini:

- `monthStats.collected` berasal dari jumlah collection bulan berjalan;
- `monthStats.task_completed` berasal dari assignment berstatus `COMPLETED`;
- `monthStats.task_total` saat ini dihitung sebagai `ACTIVE + COMPLETED`;
- UI menampilkan jumlah `COMPLETED` sebagai angka pertama progres tugas.

Perubahan yang diperlukan:

- angka pertama kartu penjemputan memakai `collected` dan label `penjemputan`;
- angka `tugas belum` memakai `task_active`;
- angka `tugas selesai` memakai `task_closed / task_total`;
- jangan lagi memakai `task_completed / task_total` sebagai format progres yang terlihat oleh pengguna.

### 4.2 Daftar Tugas mobile

File:

```text
apps/mobile/src/screens/TasksScreen.tsx
apps/mobile/src/stores/useTasksStore.ts
```

Daftar tugas mengambil status default:

```text
ACTIVE
```

Karena itu, setelah assignment berubah menjadi `COMPLETED` atau `UNCOLLECTED`, assignment tersebut hilang dari daftar tugas aktif.

Tampilan `0` pada Daftar Tugas berarti:

```text
tidak ada assignment ACTIVE yang tersisa
```

Itu tidak berarti collection atau riwayat tugas hilang.

### 4.3 Statistik Rentang mobile

File:

```text
apps/mobile/src/screens/RangeStatsScreen.tsx
```

Saat ini UI menampilkan:

```tsx
`${stats.task_completed}/${stats.task_total}`
```

dengan label:

```text
Tugas Selesai
```

Ini belum sesuai definisi final karena:

- numerator harus tugas yang sudah ditutup secara operasional;
- denominator harus semua assignment pada scope yang sama;
- UI juga perlu menampilkan `task_active` sebagai `x tugas belum`.

Format baru yang disarankan:

```text
35 penjemputan
2 tugas belum
38/40 tugas selesai
```

### 4.4 Endpoint dashboard mobile

File:

```text
apps/backend/src/routes/mobile/tasks.ts
```

Endpoint:

```text
GET /mobile/dashboard
```

Saat ini bagian statistik bulan berjalan mengelompokkan assignment berdasarkan status, tetapi hanya mengambil:

```ts
COMPLETED
ACTIVE
```

dan mengembalikan konsep:

```text
task_total = COMPLETED + ACTIVE
task_completed = COMPLETED
```

Perubahan yang diperlukan:

```text
task_active   = ACTIVE
task_closed   = COMPLETED + UNCOLLECTED
task_total    = seluruh assignment pada petugas + periode
```

`task_completed` tetap boleh dikembalikan untuk kebutuhan teknis atau laporan khusus, tetapi bukan lagi numerator utama kartu progres tugas.

### 4.5 Endpoint statistik rentang

Endpoint:

```text
GET /mobile/tasks/stats-range?start=YYYY-MM-DD&end=YYYY-MM-DD
```

File:

```text
apps/backend/src/routes/mobile/tasks.ts
```

Endpoint ini menentukan bulan yang tercakup oleh rentang tanggal, kemudian mencari assignment petugas pada bulan-bulan tersebut.

Saat ini endpoint mengembalikan:

```text
collected
total_nominal
task_active
task_completed
task_total
months_covered
```

Kontrak yang disarankan:

```text
collected
total_nominal
task_active
task_closed
task_completed
task_uncollected
task_total
months_covered
```

Field tambahan membuat definisi tiap angka jelas dan membantu audit.

---

## 5. Alur status assignment final

### 5.1 Status yang dipertahankan

```text
ACTIVE
COMPLETED
UNCOLLECTED
REASSIGNED
```

### 5.2 `ACTIVE`

Arti:

> Assignment masih terbuka dan masih perlu dikerjakan.

Dampak:

- tampil di Daftar Tugas;
- masuk `task_active`;
- tidak masuk `task_closed`;
- tidak masuk jumlah penjemputan.

### 5.3 `COMPLETED`

Arti:

> Kaleng berhasil dijemput oleh petugas yang mengerjakan assignment tersebut.

Dampak:

- tidak lagi tampil sebagai tugas aktif;
- masuk `task_closed`;
- collection berhasil masuk metrik penjemputan jika sinkronisasi dan aturan latest collection terpenuhi.

### 5.4 `UNCOLLECTED`

Arti:

> Penjemputan tidak berhasil, tetapi petugas sudah menangani assignment tersebut dan menutupnya dengan alasan baku.

Contoh alasan baku:

- tidak ada orang di rumah;
- donatur tidak ingin dijemput;
- rumah tutup atau kosong;
- kaleng tidak ditemukan;
- alasan lapangan lainnya yang disetujui admin.

Dampak:

- tidak tampil di Daftar Tugas aktif;
- tidak masuk jumlah `penjemputan` karena tidak ada kaleng yang berhasil dijemput;
- masuk `task_closed`;
- masuk pembilang `x` pada format `x/y tugas selesai`.

Saat ini endpoint skip menerima alasan sebagai teks bebas:

```text
POST /mobile/assignments/:id/skip
```

Skema saat ini menggunakan `notes` opsional. Ini perlu diganti atau dilengkapi dengan reason code baku.

### 5.5 `POSTPONED` dihapus

Keputusan final:

> Tidak ada alur penundaan.

Jika penjemputan tidak berhasil:

```text
ACTIVE
  └── pilih alasan baku
        └── UNCOLLECTED
```

Yang perlu dilakukan saat implementasi:

1. migrasikan data lama berstatus `POSTPONED`;
2. tentukan alasan baku untuk setiap data lama atau tandai untuk review admin;
3. hapus `POSTPONED` dari enum database;
4. hapus dari validasi backend;
5. hapus dari UI admin;
6. hapus dari shared types dan filter laporan;
7. tambahkan reason code untuk `UNCOLLECTED`.

Jangan menghapus nilai enum sebelum data lama dipetakan.

---

## 6. Alur `REASSIGNED` untuk petugas sakit

### 6.1 Skenario bisnis

Contoh:

```text
Petugas A menerima tugas pada awal periode.
Petugas A menyelesaikan sebagian penjemputan.
Petugas A sakit mendadak.
Sisa tugas Petugas A dilimpahkan kepada Petugas B.
Petugas A dan Petugas B melaporkan hasil kerja masing-masing.
```

Aturan penting:

- laporan Petugas A hanya menghitung penjemputan yang dilakukan Petugas A;
- laporan Petugas B hanya menghitung penjemputan limpahan yang dilakukan Petugas B;
- nominal kedua petugas tidak digabung ke laporan salah satu petugas;
- collection dari Petugas B tidak boleh muncul sebagai hasil kerja Petugas A;
- collection dari Petugas A tidak boleh muncul sebagai hasil kerja Petugas B.

### 6.2 Model data yang aman

Jangan menimpa `officer_id` pada assignment lama.

Model yang disarankan:

```text
Assignment lama:
  officer_id = Petugas A
  status     = REASSIGNED
```

```text
Assignment limpahan:
  officer_id = Petugas B
  status     = ACTIVE
```

Collection Petugas A:

```text
assignment_id = assignment lama
officer_id    = Petugas A
```

Collection Petugas B:

```text
assignment_id = assignment limpahan
officer_id    = Petugas B
```

Hubungan internal antara assignment lama dan assignment limpahan, jika diperlukan, hanya digunakan untuk audit administrasi. Hubungan itu tidak digunakan untuk menggabungkan hasil kerja atau nominal.

### 6.3 Masalah implementasi sekarang

Di UI admin, transfer saat ini mengirim:

```ts
{
  officer_id: petugasBaru,
  status: 'REASSIGNED'
}
```

Route admin kemudian mengubah baris assignment yang sama.

Dampaknya:

- officer lama tertimpa;
- assignment baru tidak dibuat;
- status menjadi `REASSIGNED`, bukan `ACTIVE` untuk petugas baru;
- mobile hanya mengambil `ACTIVE`;
- tugas tidak muncul di petugas lama maupun petugas baru.

Perubahan yang diperlukan:

1. validasi bahwa assignment lama masih boleh dipindahkan;
2. tutup assignment lama sebagai `REASSIGNED`;
3. buat assignment baru untuk petugas pengganti dengan status `ACTIVE`;
4. pastikan periode dan kaleng yang ditugaskan tetap benar;
5. jangan memindahkan collection lama ke petugas baru;
6. pastikan collection baru menggunakan assignment baru dan `officer_id` petugas pengganti.

### 6.4 Perlakuan `REASSIGNED` pada statistik

`REASSIGNED` bukan penjemputan berhasil dan bukan `COMPLETED`.

Untuk petugas pengganti:

- assignment baru berstatus `ACTIVE` masuk `task_active`;
- setelah berhasil dijemput, berubah menjadi `COMPLETED`;
- jika tidak berhasil dijemput, berubah menjadi `UNCOLLECTED` dengan alasan baku.

Untuk petugas lama:

- assignment lama tidak lagi `ACTIVE` setelah dipindahkan;
- hasil kerja sebelum sakit tetap menjadi laporan Petugas A;
- hasil kerja Petugas B tidak ditambahkan ke laporan Petugas A.

Sebelum implementasi final, perlu diputuskan apakah laporan Petugas A menampilkan jumlah tugas yang dialihkan sebagai metrik terpisah, misalnya:

```text
20 tugas dialihkan
```

Metrik ini lebih jujur daripada menyebut assignment yang dialihkan sebagai `tugas selesai`.

---

## 7. Kontrak metrik yang disarankan

Untuk setiap petugas dan periode/rentang yang sama:

```text
penjemputan = jumlah collection valid yang berhasil

tugas_belum = jumlah assignment ACTIVE

tugas_selesai = jumlah assignment COMPLETED + UNCOLLECTED

tugas_total = seluruh assignment yang dibebankan pada scope tersebut
```

Respons API yang disarankan:

```json
{
  "collected": 35,
  "task_active": 2,
  "task_closed": 38,
  "task_completed": 35,
  "task_uncollected": 3,
  "task_reassigned": 0,
  "task_total": 40
}
```

Tampilan:

```text
35 penjemputan
2 tugas belum
38/40 tugas selesai
```

Untuk kasus 38 penjemputan dari 60 assignment dan sisanya ditutup sebagai `UNCOLLECTED`:

```text
38 penjemputan
0 tugas belum
60/60 tugas selesai
```

Jika ada assignment yang dialihkan, sebaiknya ditampilkan terpisah:

```text
35 penjemputan
2 tugas belum
38/40 tugas selesai
20 tugas dialihkan
```

Angka `task_reassigned` tidak boleh dimasukkan ke penjemputan atau dianggap sebagai penjemputan berhasil.

---

## 8. Rencana perubahan per file

### Backend

```text
apps/backend/src/database/schema.ts
```

- hapus `POSTPONED` dari enum setelah migrasi data;
- pertimbangkan enum atau tabel reason code untuk `UNCOLLECTED`;
- tambahkan struktur yang diperlukan untuk assignment limpahan jika audit transfer diperlukan.

```text
apps/backend/src/routes/mobile/schemas.ts
```

- ganti `notes` bebas sebagai satu-satunya alasan;
- validasi `reason_code` dari daftar baku.

```text
apps/backend/src/routes/mobile/tasks.ts
```

- ubah dashboard dan stats-range agar mengembalikan `task_active`, `task_closed`, `task_total`;
- hitung `task_closed = COMPLETED + UNCOLLECTED`;
- hitung `task_total` dari seluruh assignment dalam scope;
- jangan gunakan `task_completed/task_total` sebagai satu-satunya progres;
- perbaiki endpoint transfer agar membuat assignment baru untuk pengganti.

```text
apps/backend/src/routes/admin/assignments.ts
```

- hapus `POSTPONED` dari validasi;
- jangan lagi mengubah `officer_id` pada assignment lama saat reassignment;
- buat endpoint atau service transfer yang menutup assignment lama dan membuat assignment baru.

### Shared types

```text
packages/shared-types/src/index.ts
```

Tambahkan field yang dikonsumsi mobile:

```text
task_active
task_closed
task_total
task_completed
task_uncollected
task_reassigned
```

### Mobile

```text
apps/mobile/src/screens/DashboardScreen.tsx
apps/mobile/src/screens/RangeStatsScreen.tsx
```

- tampilkan `collected` sebagai `penjemputan`;
- tampilkan `task_active` sebagai `tugas belum`;
- tampilkan `task_closed/task_total` sebagai `tugas selesai`;
- jangan menampilkan `task_completed/task_total` sebagai pengganti definisi final.

```text
apps/mobile/src/stores/useDashboardStore.ts
apps/mobile/src/stores/useTasksStore.ts
```

- sesuaikan mapping field baru;
- pastikan cache offline menyimpan dan merekonsiliasi metrik baru;
- jangan mencampur collection lokal dengan denominator assignment secara sembarangan.

### Web admin

```text
apps/web/src/app/dashboard/assignments/page.tsx
```

- hapus pilihan `POSTPONED`;
- ubah alur transfer agar memakai endpoint transfer yang benar;
- tampilkan status dan alasan `UNCOLLECTED` dengan istilah yang mudah dipahami.

---

## 9. Kriteria penerimaan

### Metrik normal

Dengan data:

```text
COMPLETED   = 35
UNCOLLECTED = 3
ACTIVE      = 2
TOTAL       = 40
```

API dan UI harus menghasilkan:

```text
35 penjemputan
2 tugas belum
38/40 tugas selesai
```

### Semua sudah ditutup

Dengan data:

```text
COMPLETED   = 38
UNCOLLECTED = 22
ACTIVE      = 0
TOTAL       = 60
```

API dan UI harus menghasilkan:

```text
38 penjemputan
0 tugas belum
60/60 tugas selesai
```

### Tidak ada collection berhasil

Dengan data:

```text
COMPLETED   = 0
UNCOLLECTED = 40
ACTIVE      = 0
TOTAL       = 40
```

API dan UI harus menghasilkan:

```text
0 penjemputan
0 tugas belum
40/40 tugas selesai
```

### Ada transfer karena petugas sakit

Dengan data:

```text
Petugas A: 10 collection milik A
Petugas B: 5 collection limpahan milik B
```

Laporan harus tetap:

```text
Petugas A = 10 penjemputan
Petugas B = 5 penjemputan
```

Collection Petugas B tidak boleh menambah angka Petugas A.

### Tidak ada POSTPONED

- UI tidak menawarkan penundaan;
- status penutupan menggunakan `UNCOLLECTED`;
- alasan wajib berasal dari daftar baku;
- data lama `POSTPONED` sudah dimigrasikan atau ditinjau;
- tidak ada query baru yang masih mengandalkan `POSTPONED`.

---

## 10. Hal yang belum boleh diasumsikan

1. Jangan menyamakan jumlah `collections` dengan jumlah `assignments` tanpa filter dan scope yang sama.
2. Jangan memakai `task_completed/task_total` untuk format baru karena angka pertama yang dibutuhkan adalah tugas yang belum, sedangkan rasio selesai membutuhkan tugas tertutup.
3. Jangan memasukkan `REASSIGNED` sebagai penjemputan berhasil.
4. Jangan menimpa assignment lama dengan `officer_id` petugas pengganti.
5. Jangan menghapus enum `POSTPONED` sebelum data lama dipetakan.
6. Jangan menggabungkan nominal atau collection petugas sakit dengan petugas pengganti pada laporan petugas.
7. Jangan menganggap status `REASSIGNED` sudah selesai secara operasional; ia berarti tanggung jawab dipindahkan dan perlu ditampilkan terpisah bila dibutuhkan.

---

## 11. Ringkasan keputusan

```text
x penjemputan
= collection berhasil
```

```text
x tugas belum
= assignment ACTIVE yang masih terbuka
```

```text
x/y tugas selesai
= assignment COMPLETED + UNCOLLECTED
  dibagi seluruh assignment pada scope yang sama
```

```text
POSTPONED
= dihapus dari alur
```

```text
Tidak berhasil dijemput
= pilih alasan baku
= UNCOLLECTED
= tugas ditutup
```

```text
REASSIGNED
= dipakai ketika petugas sakit atau tidak dapat melanjutkan
= assignment lama ditutup sebagai REASSIGNED
= assignment baru dibuat untuk petugas pengganti
= laporan kedua petugas tetap terpisah
```

Dokumen ini adalah dasar perbaikan. Belum ada perubahan kode yang dilakukan saat dokumen ini dibuat.
