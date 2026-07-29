# Product Requirements Document: Bekal Petugas

## 1. Status Dokumen

| Atribut | Nilai |
|---|---|
| Status produk | DEFERRED - tidak masuk scope penyelesaian MVP saat ini |
| Prioritas | Backlog pasca aplikasi penjemputan stabil |
| Produk terkait | Mobile Petugas, Web Admin, Backend API |
| Pemilik konsep | LAZISNU |
| Dokumen induk | `docs/PRD.md` |
| Tanggal pencatatan | 5 Juli 2026 |

Dokumen ini menyimpan konsep fitur Bekal Petugas agar pembahasannya tidak hilang. Implementasi tidak boleh dimulai sebelum alur utama penjemputan donasi dinyatakan stabil dan pemilik produk secara eksplisit mengaktifkan kembali inisiatif ini.

## 2. Keputusan Scope Saat Ini

Fokus aktif proyek tetap pada aplikasi penjemputan donasi:

- autentikasi petugas;
- penugasan dan daftar tugas;
- pemindaian QR;
- pencatatan penjemputan;
- dukungan offline dan sinkronisasi;
- riwayat transaksi;
- pengelolaan kaleng, petugas, penugasan, dan laporan melalui web;
- keamanan, audit, reliabilitas, dan kesiapan operasional.

Fitur Bekal Petugas tidak menjadi syarat rilis aplikasi penjemputan. Fitur ini juga tidak boleh menghambat perbaikan bug, pengujian lapangan, atau penyelesaian fungsi inti.

## 3. Latar Belakang

Petugas lapangan tidak hanya mengambil donasi. Dalam pertemuan dengan donatur, petugas sering menerima pertanyaan seperti:

- berapa dana yang dihimpun pada bulan sebelumnya;
- dana digunakan untuk program apa saja;
- siapa penerima manfaatnya;
- bagaimana alur dana setelah dijemput;
- bagaimana lembaga memverifikasi dan melaporkan dana;
- apakah lembaga diaudit;
- bagaimana donatur mendapatkan bukti transaksi;
- siapa yang dapat dihubungi untuk informasi lebih lanjut.

Jawaban yang tidak lengkap, berbeda antarpetugas, atau menggunakan angka yang sudah tidak berlaku dapat menurunkan kepercayaan donatur. Sebaliknya, jawaban yang akurat, konsisten, dan memiliki sumber resmi dapat memperkuat citra lembaga.

Masalah tersebut tidak cukup diselesaikan dengan menambahkan artikel statis di aplikasi. Informasi keuangan dan kelembagaan membutuhkan sumber data, persetujuan, versi, masa berlaku, audit, dan distribusi yang terkendali.

## 4. Visi Produk

Bekal Petugas adalah pusat informasi resmi yang membantu petugas menjawab pertanyaan donatur secara akurat, singkat, konsisten, dan dapat dipertanggungjawabkan.

Fitur ini bukan media iklan umum. Kontennya harus memiliki hubungan langsung dengan interaksi petugas dan donatur.

## 5. Tujuan

### 5.1 Tujuan Utama

- Memberikan jawaban resmi untuk pertanyaan donatur yang sering muncul.
- Menyediakan angka penghimpunan dan penyaluran yang telah diverifikasi.
- Menjelaskan alur pengelolaan dana dengan bahasa yang mudah dipahami.
- Mengurangi jawaban berdasarkan ingatan, perkiraan, atau asumsi petugas.
- Menjaga konsistensi informasi antarpetugas dan antarwilayah.
- Menyediakan informasi penting secara offline saat petugas berada di lapangan.

### 5.2 Tujuan Sekunder

- Meningkatkan kepercayaan petugas ketika berkomunikasi dengan donatur.
- Membantu pengurus mendistribusikan pembaruan kebijakan.
- Menyediakan jejak audit untuk informasi yang pernah dipublikasikan.
- Mengukur topik yang paling sering dibutuhkan petugas.

## 6. Bukan Tujuan

Fitur ini tidak ditujukan untuk:

- menggantikan laporan keuangan resmi lembaga;
- membuka seluruh data internal kepada petugas;
- menyediakan data pribadi donatur atau penerima manfaat;
- menjadi media sosial atau portal berita umum;
- memberi petugas kewenangan mengubah angka dan narasi resmi;
- menghasilkan jawaban otomatis menggunakan AI tanpa sumber yang disetujui;
- menampilkan konten promosi yang tidak berkaitan dengan tugas petugas;
- menggantikan prosedur eskalasi pertanyaan sensitif kepada pengurus.

## 7. Pengguna dan Kewenangan

### 7.1 Petugas

- Membaca materi yang sudah diterbitkan.
- Mengakses materi sesuai kecamatan atau rantingnya.
- Membaca materi yang tersimpan secara offline.
- Menyalin atau menyampaikan jawaban resmi kepada donatur.
- Tidak dapat mengubah, menyetujui, atau menerbitkan konten.

### 7.2 Admin Ranting

- Membuat draf FAQ atau informasi lokal untuk rantingnya.
- Menambahkan konteks operasional lokal.
- Mengajukan draf untuk ditinjau.
- Tidak dapat mengesahkan angka keuangan tingkat kecamatan.

### 7.3 Bendahara

- Memeriksa angka penghimpunan yang dihitung sistem.
- Memasukkan data penyaluran berdasarkan laporan resmi.
- Menambahkan dokumen atau referensi sumber.
- Memverifikasi angka keuangan sebelum digunakan dalam materi.
- Tidak otomatis memiliki kewenangan menerbitkan materi ke mobile.

### 7.4 Admin Kecamatan

- Meninjau materi dan cakupan distribusinya.
- Menyetujui atau menolak materi.
- Menerbitkan, menjadwalkan, mengganti materi unggulan, dan mengarsipkan materi.
- Melihat riwayat revisi dan audit.

## 8. Prinsip Produk

1. Sumber lebih penting daripada tampilan.
2. Angka tidak boleh diketik ulang jika dapat dihitung dari sistem.
3. Angka penyaluran hanya berasal dari laporan yang telah disahkan.
4. Setiap materi memiliki pemilik, sumber, versi, dan tanggal pembaruan.
5. Konten yang sudah terbit tidak diedit diam-diam; perubahan membuat revisi baru.
6. Mobile hanya menerima konten berstatus terbit dan sesuai cakupan pengguna.
7. Konten kedaluwarsa tidak boleh tetap tampil sebagai informasi terkini.
8. Informasi harus singkat di Beranda dan lengkap pada halaman detail.
9. Jika tidak ada informasi valid, aplikasi tidak menampilkan klaim pengganti.
10. Fitur harus tetap berguna saat koneksi internet tidak tersedia.

## 9. Model Informasi Hulu ke Hilir

Alur informasi yang diinginkan:

```text
Transaksi dan laporan resmi
        |
        v
Validasi angka oleh sistem dan Bendahara
        |
        v
Penyusunan materi oleh Admin
        |
        v
Review dan persetujuan Admin Kecamatan
        |
        v
Publikasi melalui Backend API
        |
        v
Cache dan tampilan di Mobile Petugas
        |
        v
Jawaban petugas kepada donatur
```

Setiap tahap harus dapat ditelusuri. Mobile bukan sumber kebenaran; mobile adalah kanal distribusi informasi yang sudah disahkan.

## 10. Sumber Data

### 10.1 Data Penghimpunan Otomatis

Sumber utama:

- `collections` untuk transaksi yang valid;
- `collection_summaries` untuk rekap periode dan wilayah;
- `cans` untuk jumlah kaleng atau donatur aktif;
- `branches` dan `districts` untuk konteks wilayah.

Contoh informasi yang dapat dihitung:

- total penghimpunan bulan lalu;
- jumlah transaksi penjemputan;
- jumlah kaleng aktif;
- jumlah wilayah yang terlayani;
- perubahan dibanding periode sebelumnya.

Query hanya boleh menggunakan transaksi dengan status yang dinyatakan valid oleh aturan bisnis. Definisi status valid harus konsisten dengan laporan resmi web.

### 10.2 Data Penyaluran Terstruktur

Data ini belum tersedia sebagai sumber terstruktur pada sistem saat dokumen dibuat. Diperlukan data baru yang mencakup:

- periode laporan;
- program penyaluran;
- nominal yang disalurkan;
- jumlah penerima manfaat;
- wilayah penyaluran;
- deskripsi penggunaan;
- dokumen atau referensi sumber;
- pembuat, pemeriksa, dan penyetuju;
- status laporan.

Data penyaluran harus dimasukkan Bendahara dari laporan resmi dan disetujui sebelum dapat dirujuk oleh materi.

### 10.3 Materi Kelembagaan

Sumber yang diperbolehkan:

- SOP lembaga;
- keputusan pengurus;
- laporan keuangan atau program yang sudah disahkan;
- dokumen legalitas;
- kebijakan layanan donatur;
- jawaban resmi dari pihak berwenang.

Setiap materi manual harus mencantumkan label sumber dan pemilik informasi.

## 11. Kelompok Konten

### 11.1 Transparansi Penghimpunan

Contoh:

- Berapa dana yang dihimpun bulan lalu?
- Berapa jumlah donatur aktif?
- Bagaimana perkembangan penghimpunan dibanding bulan sebelumnya?

### 11.2 Penyaluran dan Dampak

Contoh:

- Program apa yang menerima penyaluran?
- Berapa penerima manfaatnya?
- Wilayah mana yang menerima manfaat?

### 11.3 Alur Pengelolaan Dana

Contoh alur:

```text
Donatur -> Petugas -> Verifikasi -> Rekening lembaga
-> Penyaluran program -> Pelaporan
```

### 11.4 Tanya Jawab Donatur

Contoh:

- Apakah donasi mendapatkan bukti?
- Siapa yang menentukan penerima manfaat?
- Apakah donasi dapat diarahkan ke program tertentu?
- Bagaimana lembaga melakukan audit?

### 11.5 Panduan Komunikasi

Materi harus mengajarkan:

- jawaban yang diperbolehkan;
- cara menyebut periode dan sumber angka;
- informasi yang tidak boleh diperkirakan;
- cara mengakui bahwa jawaban belum diketahui;
- kapan pertanyaan harus diteruskan kepada pengurus.

Contoh jawaban aman:

> Saya belum memiliki angka terbarunya. Saya akan memeriksa laporan resmi agar informasi yang Bapak atau Ibu terima tepat.

## 12. Pengalaman Mobile

### 12.1 Beranda

Setelah fitur diaktifkan, susunan Beranda yang diusulkan:

1. Header identitas dan status sinkronisasi.
2. Ringkasan pekerjaan hari ini.
3. Satu kartu materi unggulan Bekal Petugas.
4. Dua atau tiga pertanyaan populer.
5. Aksi Lihat Semua Materi.
6. Bottom navigation.

CTA Mulai Penjemputan, tiga quick action, dan daftar Tugas Berikutnya dapat dihapus dari Beranda karena fungsinya sudah diwakili bottom navigation. Keputusan ini baru diterapkan ketika fitur Bekal Petugas benar-benar masuk scope.

### 12.2 Kartu Materi Unggulan

Memuat:

- kategori;
- judul berbentuk pertanyaan atau pernyataan jelas;
- jawaban ringkas;
- periode data jika menggunakan angka;
- tanggal pembaruan;
- label sumber;
- estimasi waktu baca;
- aksi membuka detail.

Hanya satu materi unggulan ditampilkan. Materi dipilih secara eksplisit melalui web, bukan diacak dan bukan wajib berganti berdasarkan jadwal.

### 12.3 Pertanyaan Populer

- Maksimal tiga item di Beranda.
- Dipilih pengurus atau berdasarkan analitik penggunaan yang sudah memadai.
- Membuka halaman detail materi.
- Tidak menduplikasi isi kartu unggulan.

### 12.4 Daftar Materi

- Pencarian berdasarkan kata kunci.
- Filter kategori.
- Penanda materi baru atau diperbarui.
- Urutan berdasarkan prioritas dan relevansi.
- Hanya menampilkan materi yang berlaku untuk wilayah petugas.

### 12.5 Detail Materi

- Jawaban singkat yang dapat langsung disampaikan.
- Penjelasan lengkap.
- Angka dan periode laporan.
- Sumber informasi.
- Tanggal publikasi dan pembaruan.
- Panduan eskalasi jika pertanyaan membutuhkan pengurus.

### 12.6 Offline

- Materi aktif terakhir disimpan secara lokal.
- Data cache menyertakan versi dan waktu sinkronisasi.
- Aplikasi menunjukkan bahwa materi berasal dari cache jika sedang offline.
- Materi kedaluwarsa tidak boleh disebut sebagai informasi terbaru.
- Cache diperbarui saat login, pull-to-refresh, atau aplikasi kembali online.

## 13. Pengalaman Web

### 13.1 Modul Transparansi Dana

Fungsi:

- daftar laporan per periode dan wilayah;
- angka penghimpunan yang dihitung sistem;
- input alokasi penyaluran per program;
- jumlah penerima manfaat;
- dokumen dan referensi sumber;
- rekonsiliasi total;
- pengajuan review;
- persetujuan dan penguncian laporan.

### 13.2 Modul Bekal Petugas

Fungsi:

- daftar draf, review, terbit, dan arsip;
- editor konten terstruktur;
- pemilihan sumber laporan yang telah disahkan;
- pengaturan kecamatan atau ranting sasaran;
- masa berlaku;
- pratinjau tampilan mobile;
- pemilihan materi unggulan;
- pengelolaan pertanyaan populer;
- publikasi, revisi, dan arsip;
- riwayat versi dan audit.

### 13.3 Editor Terstruktur

Editor tidak boleh hanya menyediakan HTML bebas. Struktur minimum:

- judul;
- kategori;
- jawaban singkat;
- penjelasan lengkap;
- poin penting;
- sumber;
- referensi laporan;
- periode berlaku;
- instruksi eskalasi;
- cakupan wilayah.

Konten disimpan sebagai blok terstruktur agar mobile dapat merender secara konsisten dan aman.

## 14. Workflow Konten

Status minimum:

```text
DRAFT -> IN_REVIEW -> PUBLISHED -> ARCHIVED
```

Aturan:

- Draf dapat diubah oleh pembuat yang memiliki scope sesuai.
- Konten dalam review tidak dapat diterbitkan oleh pembuatnya sendiri apabila kebijakan pemisahan tugas diaktifkan.
- Hanya Admin Kecamatan yang dapat menerbitkan.
- Konten terbit bersifat immutable sebagai versi publik.
- Perubahan menghasilkan versi baru dengan status draf.
- Konten dapat memiliki `valid_from` dan `valid_until`.
- Hanya satu materi unggulan aktif per scope pada satu waktu.
- Mengarsipkan materi tidak menghapus riwayatnya.

## 15. Rancangan Data Konseptual

Nama final dapat disesuaikan dengan konvensi Drizzle proyek.

### 15.1 `fund_reports`

- `id`
- `period_year`
- `period_month`
- `district_id`
- `branch_id`, nullable untuk laporan tingkat kecamatan
- `collection_total`, hasil perhitungan sistem
- `distribution_total`, hasil penjumlahan alokasi
- `status`
- `source_reference`
- `prepared_by`
- `reviewed_by`
- `approved_by`
- `approved_at`
- `created_at`
- `updated_at`

Constraint yang diperlukan:

- satu laporan per periode dan scope;
- total penyaluran tidak negatif;
- laporan terbit tidak dapat diubah langsung;
- scope ranting harus berada dalam kecamatan terkait.

### 15.2 `fund_report_allocations`

- `id`
- `fund_report_id`
- `program_name`
- `amount`
- `beneficiary_count`
- `area_description`
- `description`
- `source_document_url`
- `created_at`
- `updated_at`

### 15.3 `knowledge_articles`

- `id`
- `slug`
- `category`
- `title`
- `short_answer`
- `content_blocks` dalam JSON terstruktur
- `district_id`
- `branch_id`, nullable untuk cakupan kecamatan
- `status`
- `is_featured`
- `is_popular`
- `priority`
- `valid_from`
- `valid_until`
- `source_type`
- `source_label`
- `fund_report_id`, nullable
- `created_by`
- `reviewed_by`
- `published_by`
- `published_at`
- `created_at`
- `updated_at`

### 15.4 `knowledge_article_versions`

- `id`
- `article_id`
- `version_number`
- snapshot seluruh konten publik;
- `change_summary`
- `created_by`
- `created_at`

### 15.5 Analitik Opsional

Tabel pembacaan atau event analytics tidak wajib pada MVP fitur. Jika ditambahkan, data hanya untuk mengetahui kebutuhan materi, bukan untuk menilai performa individu petugas tanpa kebijakan yang jelas.

## 16. Kontrak API Konseptual

### 16.1 Admin - Laporan Dana

- `GET /v1/admin/fund-reports`
- `POST /v1/admin/fund-reports`
- `GET /v1/admin/fund-reports/:id`
- `PUT /v1/admin/fund-reports/:id`
- `POST /v1/admin/fund-reports/:id/submit-review`
- `POST /v1/admin/fund-reports/:id/approve`
- `POST /v1/admin/fund-reports/:id/archive`

### 16.2 Admin - Bekal Petugas

- `GET /v1/admin/knowledge-articles`
- `POST /v1/admin/knowledge-articles`
- `GET /v1/admin/knowledge-articles/:id`
- `PUT /v1/admin/knowledge-articles/:id`
- `POST /v1/admin/knowledge-articles/:id/submit-review`
- `POST /v1/admin/knowledge-articles/:id/publish`
- `POST /v1/admin/knowledge-articles/:id/archive`
- `POST /v1/admin/knowledge-articles/:id/set-featured`
- `GET /v1/admin/knowledge-articles/:id/versions`

### 16.3 Mobile

- `GET /v1/mobile/knowledge/home`
- `GET /v1/mobile/knowledge/articles`
- `GET /v1/mobile/knowledge/articles/:id`
- `GET /v1/mobile/knowledge/categories`

Respons mobile hanya berisi konten yang:

- berstatus terbit;
- sudah masuk masa berlaku;
- belum kedaluwarsa;
- sesuai scope petugas;
- merujuk laporan yang sah jika menggunakan data keuangan.

API harus menyediakan `version`, `updated_at`, dan cache metadata untuk sinkronisasi offline.

## 17. Aturan Scope Wilayah

- Materi tingkat kecamatan berlaku untuk seluruh petugas dalam kecamatan tersebut.
- Materi tingkat ranting hanya berlaku untuk petugas pada ranting itu.
- Materi ranting dapat menggantikan materi kecamatan hanya jika aturan prioritas ditentukan secara eksplisit.
- Admin Ranting tidak dapat membaca atau mengubah draf ranting lain.
- Bendahara dan Admin Kecamatan mengikuti scope pada token autentikasi.
- Semua pemeriksaan scope dilakukan di backend, bukan hanya disembunyikan melalui UI web.

## 18. Keamanan dan Integritas

- Semua endpoint admin menggunakan autentikasi dan `authorize` sesuai role.
- Mutasi dicatat melalui `activity_logs`.
- Konten terbit menyimpan snapshot versi.
- Data pribadi penerima manfaat tidak boleh tampil di mobile.
- Dokumen sumber memiliki kontrol akses yang sesuai.
- JSON konten divalidasi menggunakan schema yang ketat.
- Mobile tidak merender HTML atau script bebas.
- Nilai nominal menggunakan tipe integer atau bigint, bukan floating point.
- Tanggal dan periode disimpan secara eksplisit.
- Penghapusan fisik konten terbit tidak diperbolehkan melalui UI normal.

## 19. Kebutuhan Non-Fungsional

### 19.1 Reliabilitas

- Kegagalan memuat Bekal Petugas tidak boleh memblokir fungsi penjemputan.
- Endpoint konten dipisahkan dari transaksi inti.
- Mobile menampilkan cache terakhir jika API konten gagal.

### 19.2 Kinerja

- Respons Beranda hanya membawa materi unggulan dan pertanyaan populer.
- Daftar lengkap menggunakan pagination.
- Dokumen besar tidak dimasukkan langsung ke respons artikel.

### 19.3 Aksesibilitas

- Ukuran teks mengikuti standar mobile proyek.
- Kontras memenuhi standar yang digunakan design system.
- Informasi tidak bergantung pada warna saja.
- Struktur jawaban mudah dipindai di lapangan.

### 19.4 Observabilitas

- Error publikasi, scope, dan sinkronisasi dicatat.
- Setiap respons memiliki request ID mengikuti pola backend.
- Kegagalan cache mobile tidak boleh menghilangkan data transaksi.

## 20. Kriteria Penerimaan Produk

Fitur dianggap memenuhi konsep apabila:

1. Petugas hanya melihat konten yang sudah disetujui dan sesuai wilayahnya.
2. Angka penghimpunan berasal dari transaksi valid, bukan input artikel bebas.
3. Angka penyaluran berasal dari laporan yang disahkan Bendahara dan Admin Kecamatan.
4. Setiap materi menampilkan sumber serta tanggal pembaruan.
5. Hanya satu materi unggulan aktif per scope.
6. Revisi konten terbit menghasilkan versi baru.
7. Materi aktif dapat dibaca secara offline.
8. Konten kedaluwarsa tidak ditampilkan sebagai informasi terbaru.
9. Kegagalan fitur konten tidak mengganggu scan, tugas, transaksi, atau sinkronisasi.
10. Semua mutasi penting tercatat dalam audit log.

## 21. Pengukuran Keberhasilan

Metrik harus dipilih hati-hati karena tujuan fitur adalah akurasi informasi, bukan sekadar engagement.

Metrik yang disarankan:

- persentase petugas yang pernah membuka materi;
- pertanyaan yang paling sering dibuka;
- persentase materi dengan sumber dan periode valid;
- waktu rata-rata dari draf hingga publikasi;
- jumlah koreksi setelah publikasi;
- hasil survei petugas tentang kemudahan menjawab donatur;
- penurunan pertanyaan berulang yang harus dieskalasikan.

Jumlah klik tidak boleh menjadi satu-satunya ukuran keberhasilan.

## 22. Risiko dan Mitigasi

### 22.1 Angka Tidak Konsisten

Risiko: angka pada artikel berbeda dengan laporan web.

Mitigasi: artikel merujuk `fund_report_id`; angka utama dirender dari laporan, bukan disalin manual.

### 22.2 Konten Kedaluwarsa

Risiko: petugas menyampaikan informasi lama.

Mitigasi: masa berlaku, label periode, peringatan cache, dan proses arsip otomatis.

### 22.3 Workflow Terlalu Berat

Risiko: pengurus tidak rutin menerbitkan konten.

Mitigasi: editor terstruktur, template FAQ, dan workflow minimum yang tetap memiliki approval.

### 22.4 Scope Membesar

Risiko: fitur berkembang menjadi CMS dan sistem akuntansi penuh.

Mitigasi: batasi pada laporan ringkas yang dibutuhkan petugas; integrasi akuntansi penuh menjadi proyek terpisah.

### 22.5 Data Sensitif

Risiko: identitas penerima manfaat atau dokumen internal tampil ke petugas.

Mitigasi: klasifikasi informasi, sanitasi respons mobile, dan review sebelum publikasi.

### 22.6 Mengganggu Fungsi Inti

Risiko: kegagalan modul konten menghambat Beranda atau penjemputan.

Mitigasi: isolasi endpoint, fallback cache, graceful degradation, dan feature flag.

## 23. Tahapan Implementasi Masa Depan

### Tahap 0 - Reaktivasi dan Validasi

- Pemilik produk menyatakan aplikasi penjemputan sudah stabil.
- Validasi kebutuhan bersama petugas, Bendahara, dan Admin Kecamatan.
- Tetapkan pemilik konten dan SLA pembaruan.
- Putuskan sumber resmi data penyaluran.
- Finalisasi scope MVP fitur.

### Tahap 1 - Fondasi Data

- Tambahkan enum status dan kategori.
- Tambahkan tabel laporan, alokasi, artikel, dan versi.
- Buat migration Drizzle, constraint, indeks, dan relasi.
- Tambahkan seed materi non-produksi.
- Tambahkan test integritas data.

### Tahap 2 - Backend Laporan Dana

- Implementasikan perhitungan penghimpunan.
- Implementasikan CRUD laporan dan alokasi.
- Implementasikan workflow review dan approval.
- Terapkan role scope dan audit.
- Tambahkan unit dan integration test.

### Tahap 3 - Backend Bekal Petugas

- Implementasikan CRUD artikel.
- Implementasikan versi dan immutable publication.
- Implementasikan unggulan, populer, masa berlaku, dan scope.
- Implementasikan endpoint mobile dan cache metadata.

### Tahap 4 - Web Transparansi Dana

- Daftar periode laporan.
- Form alokasi program.
- Rekonsiliasi total.
- Lampiran sumber.
- Review, approval, dan penguncian.

### Tahap 5 - Web Bekal Petugas

- Editor terstruktur.
- Referensi laporan.
- Preview mobile.
- Target wilayah.
- Publish, revisi, arsip, unggulan, dan populer.

### Tahap 6 - Mobile

- Tambahkan service dan store konten.
- Tambahkan kartu unggulan dan pertanyaan populer.
- Tambahkan daftar, pencarian, kategori, dan detail.
- Tambahkan cache offline dan indikator waktu sinkronisasi.
- Hapus elemen Beranda yang disepakati setelah fitur pengganti siap.

### Tahap 7 - Pengujian dan Peluncuran

- Uji role dan scope.
- Uji angka lintas periode.
- Uji versi dan kedaluwarsa.
- Uji offline.
- Uji kegagalan API tanpa mengganggu transaksi.
- Pilot pada satu ranting.
- Evaluasi bersama petugas sebelum perluasan.

## 24. Prasyarat Sebelum Implementasi

Implementasi baru boleh dimulai setelah seluruh kondisi berikut terpenuhi:

- alur login petugas stabil;
- daftar tugas dan assignment tervalidasi;
- scan QR stabil pada perangkat target;
- pencatatan donasi online dan offline stabil;
- sinkronisasi memiliki recovery yang teruji;
- riwayat transaksi akurat;
- web admin untuk operasi inti siap;
- audit dan role scope inti teruji;
- build Android siap diuji lapangan;
- tidak ada isu prioritas tinggi pada alur penjemputan;
- pemilik produk menetapkan pemilik data dan approver fitur Bekal Petugas.

## 25. Feature Flag dan Strategi Rilis

Fitur harus berada di belakang feature flag, misalnya `knowledge_hub_enabled`.

Urutan rilis:

1. Backend dan web tersedia untuk pengisian internal.
2. Konten awal diverifikasi.
3. Mobile dirilis dengan flag nonaktif.
4. Flag diaktifkan untuk petugas pilot.
5. Evaluasi data, cache, dan pemahaman petugas.
6. Perluasan bertahap per ranting atau kecamatan.

Jika flag nonaktif, Beranda tetap menggunakan desain aplikasi penjemputan yang berlaku saat itu.

## 26. Keputusan yang Sudah Disepakati

- Nama kerja fitur: Bekal Petugas.
- Beranda hanya menampilkan satu materi unggulan.
- Materi unggulan tidak diacak.
- Materi dipilih secara eksplisit melalui web.
- Dua kartu kategori kecil tidak diperlukan di Beranda.
- Pertanyaan populer dapat tampil di bawah materi unggulan.
- Daftar lengkap tersedia melalui Lihat Semua Materi.
- Web adalah ruang pengelolaan, verifikasi, approval, dan publikasi.
- Mobile hanya mengonsumsi informasi yang sudah disahkan.
- Profil kosong tetap diperbolehkan jika petugas belum mengunggah foto.
- Fitur ini ditunda agar fokus tetap pada penyelesaian aplikasi penjemputan.

## 27. Keputusan yang Masih Terbuka

- Siapa pemilik final setiap kategori konten?
- Apakah approval wajib selalu melibatkan Bendahara dan Admin Kecamatan?
- Apakah laporan penyaluran berasal dari input langsung atau integrasi sistem akuntansi?
- Apakah materi dapat berlaku lintas kecamatan pada masa depan?
- Berapa lama cache boleh dianggap masih layak digunakan?
- Apakah dokumen sumber dapat dilihat petugas atau hanya label sumbernya?
- Apakah petugas dapat mengirim usulan pertanyaan baru?
- Apakah pertanyaan populer dipilih manual atau berdasarkan analytics?
- Apakah notifikasi dibutuhkan untuk materi kebijakan yang mendesak?

Keputusan terbuka tidak perlu diselesaikan selama fitur masih berstatus deferred.

## 28. Definisi Selesai untuk Dokumen Ini

Konsep dianggap tersimpan dengan baik apabila dokumen ini:

- berada di repository;
- memisahkan fitur dari scope MVP aktif;
- mendokumentasikan sumber data dan tata kelola;
- menjelaskan peran backend, web, dan mobile;
- menyediakan rancangan data dan API konseptual;
- mencatat risiko, prasyarat, dan tahap implementasi;
- dapat digunakan sebagai titik awal discovery ketika fitur diaktifkan kembali.

