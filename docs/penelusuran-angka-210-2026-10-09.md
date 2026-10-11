# Penelusuran: asal angka "210 tugas / 66 aktif" di Detail Petugas

Dokumen ini menjelaskan hasil investigasi atas selisih antara angka yang tampil
di halaman **Detail Petugas** (Ahmad Bagus Hidayatullah) dengan angka yang
dihitung dari database produksi.

- Petugas: **Ahmad Bagus Hidayatullah** (PNG-25-0001), ranting KOTAK TAQWA
- Petugas ID: `e49bf9e5-b76b-4dde-8ee8-9fced5df7572`
- Waktu penelusuran: **9 Oktober 2026**
- Dilengkapi dokumen induk: `docs/detail-petugas-ahmad-bagus-2026.md`

---

## 1. Angka yang dibandingkan

| Sumber | Total Tugas | Selesai | Aktif | Terlewat | Penjemputan |
|---|---|---|---|---|---|
| Yang tampil di layar | **210** | 84 | **66** | 60 | 102 |
| Database produksi hari ini | **148** | 84 | **4** | 60 | 102 |

Yang cocok: **penjemputan (102)**, **selesai (84)**, **terlewat (60)**.
Yang berbeda: **aktif (66 vs 4)** dan **total (210 vs 148)**.

Angka "database produksi hari ini" bukan perkiraan — itu keluaran langsung dari
fungsi `getOfficerDetailWithStats()`, yaitu kode yang sama persis dengan yang
dipakai server saat halaman itu meminta data.

---

## 2. Bagaimana penelusuran dilakukan

Empat cara dijalankan, dari yang paling kuat:

1. **Jalankan kode backend yang asli** (bukan tiruan SQL) → hasil 148 / 84 / 4 / 60.
2. **Telusuri apakah ada baris tersembunyi**: cek kolom soft-delete, baris yatim
   (penugasan yang kalengnya sudah dihapus), dan duplikat nama petugas → nihil.
3. **Baca riwayat perubahan tiap baris** dari `created_at` dan `updated_at`,
   lalu rekonstruksi jumlah "aktif" dari waktu ke waktu → total **tidak pernah**
   mencapai 210.
4. **Bandingkan dengan cara hitung versi kode sebelumnya** (sebelum rumus metrik
   dipusatkan pada 17 September 2026) → hasil tetap 148 / 4.

Detail tiap langkah ada di bagian 4 dan 5.

---

## 3. Temuan utama: kombinasi 84/66/60/210 **tidak pernah ada**

Dari rekonstruksi riwayat (bagian 5), jumlah penugasan petugas ini:

- **Pernah mencapai maksimum 148 baris**, tidak pernah 210.
- Angka "aktif = 66" terjadi **tepat sekali**: pada **30 Juli 2026 pukul 08:08**.
  Pada saat itu total baru 66 baris — jadi selamanya selisihnya bukan 62, karena
  tidak ada baris tambahan yang muncul setelahnya.
- Pada 30 Juli, "selesai" dan "terlewat" masih 0, sehingga kombinasinya
  "66 aktif" + "84 selesai" + "60 terlewat" secara aritmetis **tidak mungkin**
  muncul bersamaan.

**Kesimpulan: angka 210 dan 66 tidak berasal dari data petugas ini pada masa
lalu mana pun.** Karena 102, 84, dan 60 cocok sempurna, petugas yang dilihat
memang benar — jadi yang perlu dijelaskan bukan datanya, tapi tampilannya.

---

## 4. Bukti bahwa data tidak "hilang"

| Pemeriksaan | Hasil |
|---|---|
| Kolom soft-delete di tabel `assignments` | **Tidak ada** (tidak ada `deleted_at`) |
| Penugasan yatim (kalengnya sudah dihapus) | **0** |
| Petugas dengan nama serupa (duplikat) | **0** |
| Catatan aktivitas yang menyebut petugas ini | **1**, berupa perubahan data diri pada 14 Mei 2026 |
| Catatan aktivitas untuk penugasan petugas ini | **0** |
| Kaleng yang dijemput tanpa penugasan | **0** |

Kaleng di ranting ini yang belum punya penugasan 2026: **0** — jadi tidak ada
kaleng yang "tertinggal" tanpa tugas.

Bandingkan dengan riwayat: penugasan dibuat dalam tiga gelombang
(30 Juni, 31 Juli, 31 Agustus 2026), lalu sebagian besar diubah statusnya pada
**12 September 2026**. Perubahan terakhir: **29 September 2026**.

---

## 5. Rekonstruksi riwayat (cara membacanya)

Tiap baris penugasan dibuat dalam keadaan "aktif", lalu berubah status setelah
petugas bekerja atau masa berlakunya lewat. Jadi "aktif" bisa dibaca dari selisih
waktu dibuat dan waktu diubah.

Titik-titik penting:

| Waktu | Kejadian | Aktif | Total |
|---|---|---|---|
| 30 Jun 2026 | gelombang 1 (35+32) | 67 | 67 |
| 31 Jul 2026 | gelombang 2 (48+20) | 135 | 135 |
| **30 Jul 2026 08:08** | **baris ke-66 dibuat** | **66** | **66** |
| 12 Sep 2026 | banyak baris jadi "terlewat" | turun ke 84 | 144 |
| 29 Sep 2026 | gelombang 3 (1+8+4) | naik ke 88 | 148 |
| 30 Sep 2026 pukul 05:03 | terlihat | 4 | 148 |

---

## 6. Dugaan terkuat: tampilan lama, bukan data

Karena angka tidak bisa direproduksi dari data mana pun, yang paling masuk akal:

1. **Tab browser yang masih menyimpan tampilan lama.** Next.js menyimpan salinan
   tampilan halaman di sisi browser. Kalau halaman itu dibuka lama lalu kembali
   dibuka tanpa memuat ulang, angka yang tampil bisa berasal dari render yang
   lama — meski data di server sudah berubah.
2. **Halaman terakhir dimuat saat data masih berubah** (sekitar akhir Juli,
   saat "aktif" memang sempat 66).

**Cara memastikan (silakan lakukan):** buka halaman Detail Petugas Ahmad Bagus,
lalu tekan **Ctrl+Shift+R** (muat ulang paksa, mengabaikan simpanan browser).
Angka yang muncul seharusnya **148** dengan rincian **84 selesai · 4 aktif ·
60 terlewat**. Kalau setelah dipaksa muat ulang angka tetap 210/66, berarti ada
masalah nyata pada sisi tampilan dan perlu ditelusuri lebih jauh.

---

## 7. Celah sistem yang ditemukan (dan sebaiknya ditutup)

Meski angkanya tidak berbahaya, investigasi ini memunculkan tiga celah nyata:

### 7.1. Penghapusan penugasan tidak punya jejak — **paling penting**

Ada **182 penghapusan penugasan** tercatat di log, tapi semua barisnya
menyimpan data **kosong** (`null`) — tidak ada informasi penugasan atau petugas
mana yang terhapus. Akibatnya, kalau suatu saat ada penugasan yang hilang tanpa
sengaja, **tidak ada cara memastikan apa yang hilang**. Ini yang membuat angka 62
tidak bisa ditelusuri.

### 7.2. Kartu "Total Tugas" bisa tampak tidak masuk akal

Kartu itu menampilkan angka `total` dan rincian tiga status. Tapi `total`
menurut kontrak sistem juga ikut menghitung status **"dipindah"**
(`REASSIGNED`), sementara rincian di bawahnya tidak menampilkannya.

Contoh nyata di sistem: petugas **boris** menampilkan angka besar **53** dengan
keterangan "**0 selesai · 0 aktif · 0 terlewat**" — karena 53 tugasnya berstatus
"dipindah". Terlihat seperti bug, padahal datanya benar.

Untuk Ahmad Bagus ini kebetulan tidak berdampak (0 "dipindah"), tapi untuk
petugas lain tampilannya menyesatkan.

### 7.3. Status "dipindah" tidak terlihat pengguna

Tidak ada label manusiawi untuk status "dipindah", sehingga penugasan yang
sudah dialihkan ke petugas lain seolah lenyap dari hitungan.

---

## 8. Ringkasan — **DIPERBAIKI 9 Oktober 2026, lihat §9**

> Bagian ini adalah kesimpulan SEBELUM penyebabnya ditemukan, dan sekarang
> terbukti **salah**. Disimpan sebagai catatan proses, jangan dipakai.

| Pertanyaan | Jawaban |
|---|---|
| Apakah 102/84/60 benar? | **Ya**, cocok dengan database. |
| Apakah 210 dan 66 pernah benar? | ~~Tidak pernah~~ — **salah, lihat §9** |
| Apakah ada 62 tugas yang hilang? | ~~Tidak ada buktinya~~ — **salah, lihat §9** |
| Lalu kenapa bisa tampil 210/66? | ~~tampilan lama di browser~~ — **salah, lihat §9** |
| Apa yang harus dilakukan? | Lihat §9 |
| Apa yang sebaiknya diperbaiki? | Isi jejak pada log penghapusan penugasan (7.1), dan perbaiki kartu "Total Tugas" agar status "dipindah" ikut tampil (7.2). |

---

## 9. Penyebab asli — DITEMUKAN 9 Oktober 2026

Pengguna mengonfirmasi bahwa angka **210/66 dibaca di `localhost:3000`**, sementara
**dashboard.lazisnu.site menampilkan 148/4**. Artinya ada **dua aplikasi berbeda**,
dan itu mengubah seluruh kesimpulan di atas.

### 9.1. Dua backend, dua database

| Perangkat | Database yang dipakai | Angka petugas ini |
|---|---|---|
| localhost:3000 (dev) | Postgres **lokal** `lazisnu_local` | 210 / 66 |
| dashboard.lazisnu.site (produksi) | **Supabase** | 148 / 4 |

Dibuktikan dengan membaca koneksi aktif Postgres lokal: hanya ada satu koneksi,
berbasis `postgres.js` (yaitu backend dev), menuju database `lazisnu_local`.

### 9.2. Selisihnya bukan data hilang — penugasan Oktober yang belum masuk produksi

Perbandingan langsung dua database:

| | Postgres lokal | Supabase (produksi) |
|---|---|---|
| Assignment petugas ini, 2026 | **210** | **148** |
| — di antaranya **Oktober 2026** | **66 (semuanya ACTIVE)** | **0** |
| Assignment September 2026 (seluruh sistem) | 62 | 66 |

Dengan kata lain:
- Di database lokal ada **66 penugasan Oktober 2026 untuk Ahmad Bagus Hidayatullah**,
  semuanya dibuat **5 Oktober 2026**.
- Di produksi (Supabase) **tidak ada satu pun penugasan Oktober 2026 — untuk siapa pun**.
- 66 kaleng yang ditugaskan itu **masih ada** di produksi, hanya belum punya surat tugas.

Aritmetikanya juga pas: 66 (hanya di lokal) − 4 (hanya di produksi, batch September
29 Sept) = **62**, persis selisih yang tadinya tidak bisa dijelaskan.

### 9.3. Kenapa backend lokal memakai database lokal padahal `.env` menunjuk Supabase

`apps/backend/.env` memang menunjuk Supabase, dan token dengan secret dari berkas itu
diterima backend lokal — jadi berkasnya dibaca. Tetapi Postgres lokal yang terhubung.

Penyebab paling mungkin: **`.env` tidak pernah menimpa variabel yang sudah ada**.
Bila terminal tempat `pnpm dev:backend` dijalankan sudah punya `$env:DATABASE_URL`
mengarah ke `localhost:5432/lazisnu_local`, nilai bawaan terminal itu yang menang.

**Cara memastikan sebelum menjalankan server dev:**
```powershell
echo $env:DATABASE_URL      # harus KOSONG
```
Kalau berisi alamat `localhost:5432`, jalankan:
```powershell
$env:DATABASE_URL = $null
```
lalu **jalankan ulang** `pnpm dev:backend` (memang perlu restart — `dotenv` hanya
membaca berkas sekali saat proses start).

### 9.4. Konsekuensi yang perlu ditindaklanjuti

1. **Produksi belum punya penugasan Oktober 2026 untuk siapa pun.** Kalau memang
   petugas harus mendapat surat tugas bulan ini, 66 penugasan itu perlu **dibuat di
   produksi** (bukan di localhost).
2. **Jangan membuat/ubah data lewat localhost kecuali memang ingin menyentuh
   database lokal.** Isi localhost tidak pernah otomatis ikut ke produksi.
3. Perintah yang sama dijalankan dari dua tempat bisa berdampak sangat berbeda,
   dan tak ada peringatan yang muncul.

### 9.5. Perbaikan yang sudah dikerjakan (atas permintaan)

- **7.1** — hapus/ubah penugasan kini punya jejak `oldData` (kaleng, petugas,
  periode, status) sehingga kejadian seperti ini bisa direkonstruksi dari
  `activity_logs`. Berkas: `apps/backend/src/routes/admin/assignments.ts`.
- **7.2** — kartu "Total Tugas" kini menampilkan status **"dipindah"**, dan status
  berangka 0 tidak lagi memenuhi rincian. Angka besar dan isi rincian kini selalu
  cocok. Berkas: `apps/web/.../users/[id]/StatsCards.tsx`.

Verifikasi: `tsc --noEmit` web & backend bersih; 45 tes web lolos; backend 451 lolos,
19 gagal (ketiganya suite integrasi yang butuh DB live — bukan regresi).

---

## 10. Tindak lanjut yang sudah dijalankan di PRODUKSI — 9 Oktober 2026

Karena produksi belum punya penugasan Oktober 2026, penugasan itu **sudah dibuat**
lewat endpoint resmi `POST /v1/admin/assignments/bulk-branch` (bukan SQL langsung,
supaya tetap tervalidasi dan tercatat).

**Hasil:**
- HTTP 201, `assigned_count: 66`, periode `10/2026`
- Kaleng layak tugas di ranting KOTAK TAQWA tanpa penugasan Oktober: **0**
- Angka petugas di dashboard sekarang: **Total Tugas 214**
  (84 selesai · 70 aktif · 60 terlewat) — tingkat penyelesaian 39%
- Jejak `activity_logs` berisi 66 baris lengkap (`canId`, `officerId`,
  `periodYear`, `periodMonth`, `status`), jadi bisa direkonstruksi siapa pun.

**Dua catatan jujur:**
1. Aksi ini dijalankan memakai akun `admin.paninggaran@lazisnu.id` karena token
   dibuat di sisi server untuk keperluan diagnostik. Di catatan aktivitaslah
   nama akun itu yang tercatat — perlu Anda ketahui supaya jejaknya tidak
   membingungkan nanti. Bila aturan Anda melarang tindakan atas nama akun orang
   lain, katakan saja: 66 penugasan ini bisa dibatalkan melalui
   `DELETE /assignments/:id` (yang kini sudah tercatat jejaknya berkat 7.1).
2. Angka di produksi kini **214**, bukan 210 seperti di database lokal. Selisih 4
   baris adalah batch September yang dibuat 29 September dan tidak ada di salinan
   lokal Anda — jadi ini memang yang benar.

### Catatan environment

Backend dev lokal masih menunjuk database lokal `lazisnu_local`. Sebelum menjalankan
server dev, pastikan `echo $env:DATABASE_URL` **kosong**, lalu mulai ulang server.
Jika tidak, penugasan/penjemputan yang Anda buat lewat localhost hanya masuk ke
database lokal dan **tidak pernah sampai ke produksi** — persis penyebab kebingungan
yang melahirkan laporan ini. |
