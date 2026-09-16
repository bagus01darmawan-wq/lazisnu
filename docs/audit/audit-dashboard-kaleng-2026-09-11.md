# Audit Dashboard Overview & Status Kaleng — Lazisnu

Tanggal penelusuran: 11 September 2026
Repo: `bagus01darmawan-wq/lazisnu`
Cakupan: halaman `/dashboard/overview` (4 kartu angka), halaman `/dashboard/cans`
(definisi & status kaleng), endpoint `/admin/branch/dashboard` dan
`/admin/district/dashboard`
Metode: penelusuran langsung dari kode UI → endpoint → service → SQL. Semua
referensi baris di bawah adalah kondisi kode per tanggal di atas.

---

## Kesimpulan singkat

**Rumusnya jelas dan saringannya benar. Yang bermasalah adalah label dan dua tempat
yang menghitung hal sama dengan cara berbeda.**

Kabar baiknya lebih dulu: angka nominal di dashboard sudah dijaga dengan benar. Ada
dua saringan wajib yang mencegah angka menggelembung — hanya penjemputan berstatus
`COMPLETED` yang dihitung, dan hanya baris terbaru per kaleng yang dihitung sehingga
koreksi nominal tidak dihitung dua kali. Itu fondasi yang tepat untuk data keuangan.

Tetapi ada **empat hal yang membuat angka di layar tidak bisa langsung dipercaya**:

1. Grafik "Perolehan per Ranting" mengambil ranting dari **petugas**, bukan dari
   **kaleng** — nominal bisa salah tempat atau hilang.
2. Kaleng yang ditandai "tidak dijemput" atau ditunda **menghilang dari semua tab
   status**, padahal labelnya tertulis ASSIGNED.
3. Label "Total Infaq" menyesatkan — itu hanya bulan berjalan.
4. Metrik "Petugas Lapangan" dihitung dengan dua definisi berbeda, sehingga admin
   ranting dan admin kecamatan bisa melihat angka berbeda untuk kecamatan yang sama.

> Analogi sederhana: ini seperti buku kas yang penjumlahannya sudah teliti, tapi
> judul kolomnya salah tulis di beberapa tempat, dan ada satu kolom yang kadang
> diisi dari buku yang berbeda tergantung siapa yang membuka.

---

## Bagian 1 — Peta alur angka kartu overview

### 1.1 Endpoint dipilih berdasarkan peran

Halaman overview tidak memanggil satu endpoint tetap. Endpoint dipilih dari peran akun
(`apps/web/src/app/dashboard/overview/page.tsx:137` dan `:163`):

| Peran | Endpoint | Cara hitung |
|---|---|---|
| `ADMIN_RANTING` | `GET /admin/branch/dashboard` | Agregasi di SQL lewat `dashboardService.ts` |
| `ADMIN_KECAMATAN` | `GET /admin/district/dashboard` | `findMany` + filter di JavaScript |

Konsekuensi yang perlu diingat: admin ranting **juga** menerima blok `district` di dalam
respons endpoint branch-nya, dan blok itu ditampilkan di bagian bawah halaman
(`page.tsx:527`). Jadi satu kecamatan bisa tampil dengan angka berbeda antara yang
dilihat admin ranting dan yang dilihat admin kecamatan, karena dua jalur kode berbeda.

### 1.2 Dua saringan wajib pada semua perhitungan nominal

Ini bagian terpenting dan sudah benar. Setiap query ke tabel `collections` menambahkan:

1. **`sync_status = 'COMPLETED'`** — penjemputan yang masih tertahan di HP petugas
   (belum terkirim) tidak ikut dihitung.
2. **`submit_sequence = MAX(submit_sequence)`** per pasangan `assignment_id` + `can_id`
   — kalau petugas mengirim ulang untuk mengoreksi nominal, hanya baris terbaru yang
   dihitung. Ini yang mencegah satu kaleng terhitung dua kali.

Logika saringan kedua terpusat di
`apps/backend/src/services/collectionSubmission.ts` pada fungsi
`getLatestCollectionCondition()`. **Setiap metrik nominal baru wajib memakai fungsi ini.**

### 1.3 Pemetaan empat kartu

| Kartu | Field respons | Rumus | Sumber kode |
|---|---|---|---|
| Total Infaq | `summary.month_collection` | `SUM(nominal)` bulan berjalan | `dashboardService.ts:208` (ranting) / `district.ts:281` (kecamatan) |
| Kaleng Aktif | `summary.active_cans` | `COUNT(cans)` dengan `is_active = true` | `dashboard.ts:60` |
| Petugas Lapangan | `summary.total_officers` | `COUNT(officers)` dengan `is_active = true` | `dashboard.ts:61` |
| Penjemputan | dihitung di browser | `month_count / active_cans × 100` | `page.tsx:248` |

Catatan penting: kartu **Penjemputan tidak dihitung di server**. Server hanya mengirim
`month_count` (jumlah baris penjemputan bulan ini) dan `active_cans`; pembagiannya
dilakukan di browser.

### 1.4 Rumus tren di bawah tiap angka

| Kartu | Rumus tren | Jenis | Sumber |
|---|---|---|---|
| Total Infaq | `(bulanIni − bulanLalu) / bulanLalu × 100` | persen relatif (benar) | `page.tsx:233-240` |
| Penjemputan | `rateBulanIni − rateBulanLalu` | selisih poin persentase | `page.tsx:250` |

Kalau bulan lalu bernilai 0 dan bulan ini lebih dari 0, tren Total Infaq dipaksa
menjadi `100%` (`page.tsx:238-239`).

---

## Bagian 2 — Definisi "Kaleng Aktif"

### 2.1 Definisi

**"Kaleng Aktif" adalah jumlah baris tabel `cans` yang kolom `is_active` bernilai `true`**
(`apps/backend/src/routes/admin/dashboard.ts:60`).

Ini **saklar manual**, bukan hasil kerja petugas lapangan. Tidak ada hubungannya dengan
"kaleng ini sudah dijemput bulan ini" atau "kaleng ini ada isinya".

Angka pendamping di bawahnya dihitung di browser (`page.tsx:243-244`):

- `Total` = seluruh kaleng di ranting, **tanpa** melihat `is_active`
- `Nonaktif` = `total − aktif`, dijaga tidak pernah negatif

### 2.2 Siapa yang mengubah `is_active`

| Kejadian | Hasil | Kode |
|---|---|---|
| Kaleng baru dibuat | otomatis **aktif** | `canService.ts:332`, default di `schema.ts:87` |
| Admin klik "Nonaktifkan" | jadi **nonaktif** | `canService.ts:293` |
| Admin klik "Nonaktifkan Massal" | jadi **nonaktif** | `canService.ts:357, 372, 383` |
| Admin klik "Aktifkan Kembali" | kembali **aktif** | web `cans/page.tsx:483` |

**Tidak ada satu pun logika otomatis** yang menonaktifkan kaleng — tidak ada scheduler
maupun cron. Angka kaleng aktif hanya berubah kalau ada orang yang mengubahnya.

Karena itu, tombol "Nonaktifkan" di menu Kaleng sebenarnya adalah **cara hapus yang aman
(soft delete)**: kaleng hilang dari daftar aktif, tetapi riwayatnya tidak hilang.

### 2.3 Akibatnya di sistem

| Dampak | Keterangan |
|---|---|
| Tidak dibuatkan jadwal penjemputan | `assignmentGenerator.ts:20` hanya mengambil kaleng `isActive = true` |
| Scan QR ditolak | `mobile/tasks.ts:351` |
| Tetap dihitung di `total_cans` | sehingga muncul sebagai baris "X Nonaktif / Total Y" |
| **Riwayat penjemputan lama tetap masuk Total Infaq** | query `collections` tidak menyaring `is_active` |

Poin terakhir itu **perilaku yang benar** untuk laporan keuangan — menonaktifkan kaleng
hari ini tidak boleh mengurangi angka infaq bulan lalu.

### 2.4 Jebakan yang perlu disadari

Karena kartu Penjemputan = `month_count ÷ active_cans`, maka:

- Menonaktifkan kaleng yang sudah tidak ditagih akan **menaikkan** persentase
  penjemputan tanpa ada tambahan kerja nyata di lapangan.
- Menambah kaleng baru akan **menurunkan** persentase meski penjemputannya sama.

Jadi angka itu bukan ukuran kinerja petugas, melainkan ukuran **beban kerja per kaleng
aktif**. Membandingkannya antar bulan hanya sahih kalau jumlah kaleng aktif setara.

---

## Bagian 3 — Peta lengkap status kaleng

### 3.1 Status tidak disimpan di database

**Tabel `cans` tidak punya kolom `status`.** Kolom yang ada hanya
(`apps/backend/src/database/schema.ts:72-93`):

| Kolom | Isi |
|---|---|
| `is_active` | saklar manual admin (baris 87) |
| `last_collected_at` | waktu penjemputan terakhir (baris 88) |
| `total_collected` | akumulasi nominal sepanjang masa (baris 89) |
| `collection_count` | jumlah penjemputan sepanjang masa (baris 90) |

Tiga kolom terakhir adalah penghitung kumulatif, bukan status. Status yang tampil di
kolom STATUS adalah **turunan** yang dihitung saat halaman dibuka, dengan menggabungkan
`is_active` + status penugasan bulan berjalan (`cans/page.tsx:610-641`).

Akibatnya: status kaleng **berubah sendiri setiap awal bulan** tanpa ada data kaleng yang
diubah, karena penugasan difilter per bulan berjalan.

### 3.2 Empat status yang tampil

Diperiksa berurutan, yang pertama cocok itulah yang dipakai:

| Urutan | Status | Warna | Syarat |
|---|---|---|---|
| 1 | **NON-AKTIF** | abu | `is_active = false` |
| 2 | **SELESAI** | hijau | aktif + ada penugasan bulan ini berstatus `COMPLETED` |
| 3 | **ASSIGNED** | oranye | aktif + ada penugasan bulan ini, status apa pun selain `COMPLETED` |
| 4 | **AKTIF** | hijau | aktif + tidak ada penugasan bulan ini |

### 3.3 Lima status penugasan di baliknya

`assignmentStatusEnum` (`schema.ts:7`) punya lima nilai. Ini yang jadi bahan perhitungan
di atas, tetapi **tidak pernah tampil di halaman Kaleng**:

| Status | Arti | Siapa yang mengubah |
|---|---|---|
| `ACTIVE` | Tugas berjalan | Sistem saat jadwal dibuat |
| `COMPLETED` | Sudah dijemput | Petugas setelah submit |
| `UNCOLLECTED` | Ditandai tidak dijemput | Petugas di aplikasi HP (`mobile/tasks.ts:407-414`) |
| `POSTPONED` | Ditunda | Admin lewat `PUT /admin/assignments/:id` (`assignments.ts:238`) |
| `REASSIGNED` | Dipindah ke petugas lain | Admin saat menugaskan ulang |

Catatan: halaman Penugasan (`/dashboard/assignments`) sudah mengenali kelimanya dan
memberi label Indonesia — `TERTUNDA`, `RE-ASSIGN`, `TERLEWAT`
(`assignments/page.tsx:511-513`). Hanya halaman Kaleng yang belum.

### 3.4 Tab filter dan logikanya

Lima pilihan tab di halaman Kaleng (`cans/page.tsx:803-807`), dengan logika di
`apps/backend/src/services/canService.ts:71-117`:

| Tab | Kondisi SQL |
|---|---|
| SEMUA STATUS | tanpa filter status |
| AKTIF | `is_active = true` **DAN** id **tidak ada** di penugasan bulan ini |
| ASSIGNED | `is_active = true` **DAN** id ada di penugasan bulan ini berstatus `ACTIVE` |
| SELESAI | `is_active = true` **DAN** id ada di penugasan bulan ini berstatus `COMPLETED` |
| NON-AKTIF | `is_active = false` |

Perhatikan bedanya: tab **AKTIF** mengecualikan kaleng yang punya penugasan bulan ini
dengan status **apa pun**, sedangkan tab **ASSIGNED** hanya cocok untuk status `ACTIVE`.
Selisih di antara keduanya itulah sumber masalah pada temuan T2.

---

## Bagian 4 — Operasi admin pada kaleng

Semua endpoint berada di `apps/backend/src/routes/admin/cans.ts` dan dijaga middleware
`authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')`.

### 4.1 Daftar operasi

| Operasi | Endpoint | Catatan |
|---|---|---|
| Daftar kaleng | `GET /admin/cans` | mendukung filter `status`, `branch_id`, `search` |
| Detail kaleng | `GET /admin/cans/:id` | menyertakan 10 riwayat penjemputan terakhir |
| Tambah satu | `POST /admin/cans` | QR dibuat otomatis bila kosong |
| Tambah massal | `POST /admin/cans/bulk` | untuk import |
| Ubah data | `PUT /admin/cans/:id` | termasuk pindah ranting dan aktif/nonaktif |
| Nonaktifkan / hapus | `DELETE /admin/cans/:id?permanent=` | tanpa `permanent` berarti nonaktifkan |
| Nonaktifkan / hapus massal | `POST /admin/cans/bulk-delete` | |
| Cetak QR satu | `POST /admin/cans/:id/generate-qr` | |
| Cetak QR massal | `POST /admin/cans/bulk-generate-qr` | maksimal 500 kaleng sekali jalan |

### 4.2 Batasan akses

| Aturan | Kode |
|---|---|
| Admin ranting hanya boleh menyentuh kaleng di rantingnya | `canService.ts:41-42` |
| Admin kecamatan hanya boleh menyentuh kaleng di ranting dalam kecamatannya | `canService.ts:43-46` |
| **Pindah ranting hanya boleh admin kecamatan**, dan hanya dalam kecamatan sendiri | `canService.ts:229-239` |
| Saat menambah kaleng, admin ranting selalu masuk ke rantingnya sendiri (nilai `branch_id` dari klien diabaikan) | `canService.ts:150` |
| Hapus permanen ditolak bila kaleng punya riwayat penjemputan | `canService.ts:286` |
| Dukuh tujuan harus milik ranting tujuan | `canService.ts:250` |

### 4.3 Tindakan per status

| Status kaleng | Tombol yang muncul | Catatan |
|---|---|---|
| NON-AKTIF | QR, **Aktifkan Kembali**, Hapus Permanen | tidak bisa diedit |
| AKTIF | QR, Edit, Nonaktifkan | hapus = nonaktifkan |
| ASSIGNED | QR, Edit | tombol hapus **disembunyikan** |
| SELESAI | QR, Edit | tombol hapus **disembunyikan** |

Aturan praktisnya: **kalau tombol hapus tidak terlihat, berarti kaleng itu masih punya
penugasan bulan ini.** Selesaikan atau batalkan penugasannya dulu di halaman Penugasan.

---

## Bagian 5 — Temuan

Diurutkan berdasarkan tingkat risiko. Semua sudah diverifikasi langsung di kode.

### Tingkat 1 — Berisiko pada angka atau data

**T1. Grafik "Perolehan per Ranting" mengambil ranting dari petugas, bukan dari kaleng**

`apps/backend/src/routes/admin/district.ts:242` mengelompokkan nominal memakai
`c.officer.branchId`, padahal filter kecamatannya memakai `c.can.branch.districtId`.

Akibatnya, bila seorang petugas menagih kaleng di ranting lain:
- nominalnya masuk ke batang ranting yang salah, atau
- bila ranting petugas itu di luar kecamatan ini, nominalnya **hilang dari grafik**
  karena hasil pengelompokan hanya dipetakan ke daftar ranting kecamatan ini.

Versi di jalur ranting sudah benar karena memakai `schema.cans.branchId`
(`dashboardService.ts:180-194`). Perbaikannya: samakan `district.ts:242` agar memakai
`c.can.branchId`.

**T2. Kaleng berstatus TERTUNDA / TERLEWAT menghilang dari semua tab status**

Kaleng yang penugasan bulan ini berstatus `POSTPONED`, `REASSIGNED`, atau `UNCOLLECTED`:

| Tab | Muncul? | Alasan |
|---|---|---|
| ASSIGNED | tidak | filter mensyaratkan status `ACTIVE` |
| SELESAI | tidak | filter mensyaratkan status `COMPLETED` |
| AKTIF | tidak | dikecualikan karena punya penugasan bulan ini |
| NON-AKTIF | tidak | kalengnya masih aktif |

Jadi kaleng itu hanya terlihat di **SEMUA STATUS** — tetapi di kolom STATUS-nya tertulis
**ASSIGNED** (oranye), seolah-olah penugasannya normal (`cans/page.tsx:619-637`).
Ini berbahaya karena kaleng yang gagal dijemput justru tersembunyi dari pandangan.
`UNCOLLECTED` sendiri diset langsung oleh aplikasi HP petugas, jadi kasus ini nyata.

**T3. `pending_tasks` dihitung tanpa filter wilayah**

`apps/backend/src/routes/admin/dashboard.ts:62` menghitung seluruh penugasan berstatus
`ACTIVE` di database, tanpa membatasi ranting maupun kecamatan. Nilainya dikirim sebagai
`pending_tasks`. Saat ini **belum dirender** di halaman overview sehingga belum
terlihat, tetapi akan salah begitu dipakai. Tidak ada rujukan ke field ini di
`apps/web/src`.

### Tingkat 2 — Menyesatkan pengguna

**T4. Label "Total Infaq" padahal isinya hanya bulan berjalan**

`page.tsx:278-280` menampilkan `summary.month_collection` dengan judul "Total Infaq".
Rumusnya `SUM(nominal)` dengan filter `collected_at >= awal bulan`
(`dashboardService.ts:208-232`). Untuk total sepanjang masa, datanya ada di kolom
`cans.total_collected` tetapi tidak dipakai di kartu ini.

**T5. Tren kartu Penjemputan memakai satuan yang salah**

`page.tsx:250` menghitung `currentRate − lastRate` — itu **selisih poin persentase** —
tetapi `page.tsx:343` menampilkannya dengan tanda `%`. Naik dari 50% ke 55% akan
tertulis "5.0%", padahal artinya naik 5 poin atau +10% secara relatif. Kartu Total Infaq
sudah benar karena memakai persen relatif.

**T6. Pembanding tren Penjemputan tidak setara**

`page.tsx:249` memakai `activeCans` bulan ini sebagai penyebut untuk **bulan lalu juga**.
Bila jumlah kaleng aktif berubah, perbandingannya tidak apple-to-apple. Perlu keputusan
produk: mau memakai jumlah kaleng aktif bulan lalu, atau memang sengaja memakai basis
yang sama.

**T7. Definisi "Petugas Lapangan" berbeda antar jalur**

| Jalur | Kondisi | Kode |
|---|---|---|
| Endpoint ranting (blok district) | `officers.branch_id` ada di daftar ranting kecamatan | `dashboard.ts:83` |
| Endpoint kecamatan | `officers.district_id = districtId` | `district.ts:236` |

Dua kolom berbeda yang tidak dijamin sinkron di database (`officers.district_id` dan
`officers.branch_id` diisi terpisah, lihat `schema.ts:54-55`). Akibatnya angka
"Petugas Lapangan" untuk kecamatan yang sama bisa berbeda antara tampilan admin ranting
dan admin kecamatan.

**T8. Pesan galat hapus permanen membingungkan di tab NON-AKTIF**

Di tab NON-AKTIF, tombol hapus **selalu** berarti hapus permanen
(`cans/page.tsx:276`, `:306`, `:320`). Bila kaleng punya riwayat penjemputan, sistem
menolak (`canService.ts:286-288`) dengan pesan *"Gunakan fitur nonaktifkan (soft delete)"*
— padahal kalengnya sudah non-aktif. Untuk kaleng seperti itu memang tidak ada cara
menghapusnya, dan itu disengaja demi menjaga riwayat keuangan. Yang perlu diperbaiki
hanya pesannya.

**T9. Status kembali AKTIF setiap tanggal 1**

Karena penugasan difilter per bulan, semua kaleng yang tadinya SELESAI menjadi AKTIF
lagi di bulan baru sampai jadwal berikutnya dibuat. Ini perilaku normal untuk program
bulanan, tetapi perlu diketahui agar tidak dikira data hilang.

### Tingkat 3 — Teknis dan performa

**T10. Endpoint kecamatan masih memakai pola lama**

`district.ts:202-237` memuat baris ke memori lalu membuang sebagian di JavaScript,
sedangkan jalur ranting sudah memakai agregasi SQL. Komentar di
`dashboardService.ts:2-6` sendiri menyebut pola JavaScript itu yang seharusnya sudah
ditinggalkan. Contoh paling jelas: `district.ts:228-231` memuat seluruh kaleng dan
petugas hanya untuk menghitung panjang array.

**T11. Logika "baris terbaru" diduplikasi**

`district.ts:183-192` menulis ulang logika `getLatestCollectionCondition()` secara
inline. Bukan bug saat ini, tetapi berisiko menyimpang bila kebijakan resubmit berubah.
Sebaiknya impor dari `collectionSubmission.ts`.

**T12. Tipe data di halaman Kaleng tidak lengkap**

`cans/page.tsx:52` hanya mendeklarasikan `ACTIVE | COMPLETED | POSTPONED | REASSIGNED`
— tidak memuat `UNCOLLECTED`. TypeScript tidak menangkap ini karena respons API di-cast.

**T13. Pengambilan penugasan tanpa urutan**

`canService.ts:130-137` mengambil penugasan bulan berjalan dengan `limit: 1` **tanpa
`orderBy`**. Bila sebuah kaleng punya lebih dari satu penugasan dalam satu bulan (mungkin
terjadi setelah penugasan ulang), penugasan mana yang dipakai untuk label status menjadi
tidak pasti.

**T14. Zona waktu server UTC**

`docker-compose.prod.yml` tidak men-set `TZ` untuk container backend, sehingga container
berjalan di UTC. Sementara `monthStart` dihitung dari `new Date()` server
(`dashboard.ts:30`, `district.ts:194-195`). Akibatnya penjemputan tanggal 1 pukul
00:00–06:59 WIB akan terhitung sebagai bulan sebelumnya.

**T15. Waktu penjemputan berasal dari jam HP petugas**

`apps/mobile/src/screens/CollectionScreen.tsx:67` mengirim `new Date().toISOString()`,
dan server menerimanya apa adanya (`apps/backend/src/routes/mobile/collections.ts:89`)
tanpa validasi. Jam HP yang tidak akurat membuat nominal masuk ke bulan yang salah.

**T16. Potensi tampilan "Rp NaN"**

`page.tsx:280` memakai `Number(summary.month_collection)` tanpa nilai cadangan. Bila
field itu tidak ada di respons, yang tampil adalah "Rp NaN". Guard `data.summary || {}`
di `page.tsx:230` tidak menolong karena tidak ada default per field.

---

## Lampiran A — Rujukan kode

| Berkas | Isi penting |
|---|---|
| `apps/web/src/app/dashboard/overview/page.tsx` | Kartu overview, rumus tren, pemilihan endpoint |
| `apps/web/src/app/dashboard/cans/page.tsx` | Tabel kaleng, penurunan status, tombol aksi |
| `apps/web/src/app/dashboard/assignments/page.tsx` | Label kelima status penugasan |
| `apps/backend/src/routes/admin/dashboard.ts` | Endpoint dashboard ranting |
| `apps/backend/src/routes/admin/district.ts` | Endpoint dashboard kecamatan |
| `apps/backend/src/routes/admin/cans.ts` | Seluruh endpoint operasi kaleng |
| `apps/backend/src/services/dashboardService.ts` | Agregasi dashboard jalur ranting (SQL) |
| `apps/backend/src/services/canService.ts` | Logika kaleng, filter status, aturan hapus |
| `apps/backend/src/services/collectionSubmission.ts` | `getLatestCollectionCondition()` |
| `apps/backend/src/services/assignmentGenerator.ts` | Pembuatan jadwal (hanya kaleng aktif) |
| `apps/backend/src/database/schema.ts` | Definisi tabel dan enum status |
| `apps/mobile/src/screens/CollectionScreen.tsx` | Pengiriman `collected_at` dari perangkat |
| `docker-compose.prod.yml` | Konfigurasi container (tidak ada `TZ`) |

## Lampiran B — Daftar istilah

| Istilah | Arti di sistem ini |
|---|---|
| Ranting | Cabang/unit di bawah kecamatan (`branches`) |
| Dukuh | Wilayah di bawah ranting (`dukuhs`) |
| Kaleng | Kotak infaq milik warga (`cans`) |
| Petugas | Petugas lapangan penjemput kaleng (`officers`) |
| Penugasan | Jadwal penjemputan satu kaleng oleh satu petugas pada satu bulan (`assignments`) |
| Penjemputan | Satu kejadian penjemputan beserta nominalnya (`collections`) |
| `COMPLETED` (penjemputan) | Penjemputan yang sudah tersimpan di server |
| `is_active` | Saklar manual admin; ada di tabel `cans`, `officers`, dan `users` |
| Soft delete | Menonaktifkan data dengan mematikan `is_active`, bukan menghapus baris |

## Lampiran C — Urutan perbaikan yang disarankan

| Prioritas | Temuan | Alasan |
|---|---|---|
| 1 | T1 | Nominal finansial bisa salah tampil atau hilang dari grafik |
| 2 | T2 | Kaleng gagal jemput tersembunyi dari pandangan admin |
| 3 | T7 | Dua peran melihat angka berbeda untuk hal yang sama |
| 4 | T4, T5 | Perbaikan cepat, hanya mengubah label dan satuan |
| 5 | T3, T8 | Mencegah salah tafsir saat fitur berikutnya dibangun |
| 6 | T10–T13 | Perapian teknis, tidak berdampak langsung ke pengguna |
| 7 | T14–T16 | Perlu keputusan produk atau pengujian tersendiri |

## Lampiran D — Dokumen lanjutan (12 September 2026)

Setelah audit ini selesai, definisi status kaleng ditetapkan lengkap oleh Pion. Dua
dokumen menyusul, dan sebagian temuan di atas sudah punya arah perbaikan yang jelas:

| Dokumen | Isi |
|---|---|
| `alur-status-kaleng.html` | Peta alur 11 status dalam 2 lajur, 22 keputusan, daftar alasan baku |
| `rancangan-skema-status-kaleng-2026-09-12.md` | Rancangan kolom, tabel usulan, dan rencana migrasi data |

Temuan di audit ini yang bersinggungan langsung dengan rancangan tersebut:

- **T1** — pengelompokan nominal per ranting di halaman kecamatan memakai `branchId`
  petugas, bukan `branchId` kaleng. Rancangan skema menyentuh file yang sama
  (`routes/admin/district.ts`), jadi sebaiknya diperbaiki bersamaan.
- **T14** — zona waktu UTC. Rancangan skema menempatkannya sebagai tahap 1, sebelum
  kolom `condition` dibuat, karena ambang enam kali penjemputan bergantung padanya.
- **T2** — kaleng gagal jemput tersembunyi. Daftar alasan baku dan tabel usulan
  perubahan status akan membuatnya terlihat.
- **T4, T5** — label satuan persen yang keliru. Belum tersentuh rancangan baru.

---

*Dokumen ini adalah catatan audit, bukan instruksi perubahan. Tidak ada kode yang
diubah saat penyusunannya.*
