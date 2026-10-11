# Data Petugas — Ahmad Bagus Hidayatullah

Dokumen ini dibuat dari database produksi pada 9 Oktober 2026 agar angka-angka di
halaman **Detail Petugas** bisa dibaca satu per satu, bukan dalam bentuk ringkasan.

Periode yang dibaca: **1 Januari – 31 Desember 2026** (kondisi bawaan halaman itu
saat tidak ada bulan yang dipilih).

## A. Identitas

| Keterangan | Nilai |
|---|---|
| Nama | Ahmad Bagus Hidayatullah |
| Kode petugas | PNG-25-0001 |
| Nomor HP | 6282134536151 |
| Ranting | KOTAK TAQWA |
| Kecamatan | Kecamatan Paninggaran |
| Wilayah tugas | **(kosong)** |
| Dukuh terkait | (belum dipetakan) |
| Status akun | Aktif |
| Terdaftar sejak | 02 Mei 2026 |

### Tentang "Wilayah Tugas" yang tampil "-"

Yang tampil "-" adalah isi kolom `assigned_zone`, dan kolom itu memang **kosong**
di database (`null`). Yang seharusnya tercantum di sana adalah **nama dusun/dusun
tempat petugas itu menjemput kaleng** — misalnya "Dusun 1 Sawangan" (contoh terisi
di data awal sistem).

Dua hal penting soal kolom ini:

1. **Tidak bisa diisi dari halaman web.** Tombol Edit hanya dapat mengubah nama dan
   nomor HP. Field `assigned_zone` ada di skema validasi tetapi tidak pernah
   dikirim ke server saat menyimpan, sehingga tidak ada jalan lewat tampilan.
2. **Cara lama yang sudah ditinggalkan.** Menurut catatan di skema basis data, nilai
   kolom ini dulu berisi nama dusun yang tidak cocok dengan daftar resmi `dukuhs`,
   sehingga tidak bisa dipakai untuk mengelompokkan petugas per wilayah. Karena itu
   pada 6 Oktober 2026 ditambahkan kolom baru `dukuh_id` yang mengacu ke daftar resmi.
   Untuk petugas ini, `dukuh_id` juga masih kosong.

**Jadi jawabannya:** seharusnya diisi dusun tempat ia bertugas, dan ke depan
sebaiknya kolom itu diganti menjadi pilihan dari daftar dukuh resmi (bukan ketik
bebas), supaya benar-benar bisa dipakai untuk laporan per wilayah.

## B. Ringkasan angka yang dibahas

| Istilah di halaman | Angka | Arti |
|---|---|---|
| Total Penjemputan | 102 | Jumlah setoran berhasil tercatat |
| Total Tugas | 148 | Jumlah seluruh penugasan di 2026 |
| — selesai | 84 | Kaleng berhasil dijemput (COMPLETED) |
| — aktif | 4 | Sudah ditugaskan, belum dikerjakan (ACTIVE) |
| — terlewat | 60 | Lewat masa penjemputan (UNCOLLECTED) |
| Tingkat penyelesaian | 57% | 84 dari 148 |

Catatan: selesai + aktif + terlewat = 148 = total. Jadi angka "total" bukan ukuran terpisah, melainkan hasil penjumlahan ketiganya.

## C. Sebaran tugas per bulan

| Bulan 2026 | Selesai | Aktif | Terlewat | Jumlah |
|---|---|---|---|---|
| Juli | 35 | 0 | 32 | 67 |
| Agustus | 48 | 0 | 20 | 68 |
| September | 1 | 4 | 8 | 13 |
| **Jumlah** | **84** | **4** | **60** | **148** |

## D. Daftar penjemputan (satu per satu)

102 baris. Diurutkan dari yang paling awal.

| No | Tanggal | Jam | Nominal | Tempat |
|---|---|---|---|---|
| 1 | 03 Juli 2026 | 08:21 | Rp 123 | Master Salon |
| 2 | 03 Juli 2026 | 08:23 | Rp 15.000 | Warung Tauto |
| 3 | 03 Juli 2026 | 09:17 | Rp 67.000 | Fatma Cell (Domiyang) |
| 4 | 03 Juli 2026 | 09:21 | Rp 7.000 | Apotik Sikawat |
| 5 | 03 Juli 2026 | 09:33 | Rp 10.000 | Andalas Motor |
| 6 | 05 Juli 2026 | 20:56 | Rp 9.000 | Ayam Kremes |
| 7 | 06 Juli 2026 | 18:22 | Rp 200.000 | FC Ova (tdk terkunci) |
| 8 | 06 Juli 2026 | 18:43 | Rp 36.000 | Apotik Ady Farma |
| 9 | 06 Juli 2026 | 19:25 | Rp 1.550 | Kantor BKAD |
| 10 | 09 Juli 2026 | 09:33 | Rp 7.500 | Ayam Sambal hijau |
| 11 | 09 Juli 2026 | 09:36 | Rp 2.300 | Primkoveri |
| 12 | 09 Juli 2026 | 12:20 | Rp 25.000 | Bengkel Lukman |
| 13 | 09 Juli 2026 | 12:21 | Rp 25.000 | Winner Salon (kunci tdk bisa) |
| 14 | 09 Juli 2026 | 12:40 | Rp 10.000 | Wr. Tidar |
| 15 | 09 Juli 2026 | 12:53 | Rp 20.000 | Bakso Ojo Lali |
| 16 | 12 Juli 2026 | 07:35 | Rp 1.001 | Bakso Rejeh |
| 17 | 12 Juli 2026 | 08:07 | Rp 2.300 | Toko Kitab Masrukhin |
| 18 | 12 Juli 2026 | 08:07 | Rp 56.777 | Warung Syifa (Sikawat) |
| 19 | 12 Juli 2026 | 13:50 | Rp 300 | Toko Eni Latifah |
| 20 | 12 Juli 2026 | 16:32 | Rp 6.700 | Bengkel Variasi Irfandi |
| 21 | 12 Juli 2026 | 18:30 | Rp 20.000 | Wr. Makan Mbak Siti |
| 22 | 14 Juli 2026 | 14:02 | Rp 60.000 | Wr. Makan Ibu Yuni |
| 23 | 14 Juli 2026 | 14:06 | Rp 2.777 | TB. Langganan |
| 24 | 14 Juli 2026 | 14:42 | Rp 50.000 | Bengkel Perut |
| 25 | 14 Juli 2026 | 14:43 | Rp 50.000 | Megono Lek Ati |
| 26 | 14 Juli 2026 | 14:52 | Rp 1.000.000 | FC. Harmonis |
| 27 | 14 Juli 2026 | 15:19 | Rp 300 | Sandi Cell |
| 28 | 14 Juli 2026 | 15:19 | Rp 2.000.000 | Sandi Cell |
| 29 | 14 Juli 2026 | 16:20 | Rp 1.000 | Mie Ayam Pertelon |
| 30 | 14 Juli 2026 | 16:20 | Rp 1.000.000 | Mie Ayam Pertelon |
| 31 | 14 Juli 2026 | 16:20 | Rp 1 | Mie Ayam Pertelon |
| 32 | 14 Juli 2026 | 16:20 | Rp 3.000.000 | Mie Ayam Pertelon |
| 33 | 14 Juli 2026 | 16:24 | Rp 2.223 | Gopal Elektronik |
| 34 | 14 Juli 2026 | 16:24 | Rp 798.899 | Gopal Elektronik |
| 35 | 15 Juli 2026 | 19:17 | Rp 7.600 | maahin |
| 36 | 15 Juli 2026 | 19:17 | Rp 10.000 | maahin |
| 37 | 15 Juli 2026 | 19:17 | Rp 100.600 | maahin |
| 38 | 15 Juli 2026 | 19:17 | Rp 2.000 | maahin |
| 39 | 15 Juli 2026 | 19:17 | Rp 5.000 | maahin |
| 40 | 15 Juli 2026 | 19:17 | Rp 21 | maahin |
| 41 | 15 Juli 2026 | 19:17 | Rp 646.464 | maahin |
| 42 | 15 Juli 2026 | 19:17 | Rp 2 | maahin |
| 43 | 19 Juli 2026 | 04:20 | Rp 400 | Mama Ndoah |
| 44 | 28 Juli 2026 | 23:08 | Rp 50 | Nasi Goreng Bu Wur |
| 45 | 30 Juli 2026 | 07:53 | Rp 200.000 | Helmy Mubarok |
| 46 | 30 Juli 2026 | 07:53 | Rp 12.500 | Helmy Mubarok |
| 47 | 30 Juli 2026 | 07:53 | Rp 120.000 | Helmy Mubarok |
| 48 | 30 Juli 2026 | 08:08 | Rp 111.111 | Helmy Mubarok |
| 49 | 30 Juli 2026 | 08:10 | Rp 222.222 | Helmy Mubarok |
| 50 | 23 Agustus 2026 | 17:42 | Rp 4.000 | Toko Bangunan Syhab |
| 51 | 23 Agustus 2026 | 18:25 | Rp 2.000 | maahin2 |
| 52 | 23 Agustus 2026 | 18:25 | Rp 0 | maahin2 |
| 53 | 23 Agustus 2026 | 18:28 | Rp 1.000 | maahin8 |
| 54 | 23 Agustus 2026 | 18:39 | Rp 21.000 | Helmy Mubarok |
| 55 | 23 Agustus 2026 | 19:41 | Rp 300 | maahin9 |
| 56 | 23 Agustus 2026 | 21:26 | Rp 20 | maahin7 |
| 57 | 23 Agustus 2026 | 21:27 | Rp 600 | maahin |
| 58 | 24 Agustus 2026 | 21:14 | Rp 200 | maahin6 |
| 59 | 24 Agustus 2026 | 21:14 | Rp 200.000 | maahin6 |
| 60 | 27 Agustus 2026 | 17:35 | Rp 21.500 | maahin4 |
| 61 | 27 Agustus 2026 | 17:35 | Rp 300 | maahin4 |
| 62 | 28 Agustus 2026 | 09:13 | Rp 50.000 | maahin5 |
| 63 | 28 Agustus 2026 | 22:41 | Rp 9.930 | maahin3 |
| 64 | 29 Agustus 2026 | 18:52 | Rp 25.000 | maahin10 |
| 65 | 02 September 2026 | 07:11 | Rp 50.050 | Helmy Mubarok |
| 66 | 02 September 2026 | 07:15 | Rp 72.500 | Helmy Mubarok |
| 67 | 04 September 2026 | 18:22 | Rp 20.000 | haji |
| 68 | 05 September 2026 | 20:05 | Rp 42.000 | WM. Sederhana Pom |
| 69 | 05 September 2026 | 20:09 | Rp 11.000 | Barbershop Ezpaz Nizar Swg |
| 70 | 05 September 2026 | 20:17 | Rp 38.000 | Wow Pacalan |
| 71 | 05 September 2026 | 20:20 | Rp 3.000 | Kopi dan PS Miti |
| 72 | 05 September 2026 | 20:37 | Rp 20.000 | Tk Sepatu dan tas ( Rosid ) |
| 73 | 05 September 2026 | 20:44 | Rp 21.500 | Berkah Mede |
| 74 | 05 September 2026 | 21:02 | Rp 21.500 | FC Ova (tdk terkunci) |
| 75 | 05 September 2026 | 21:09 | Rp 40.000 | Nasi Goreng Bu Wur |
| 76 | 05 September 2026 | 21:16 | Rp 9.000 | Toko Bangunan Syhab |
| 77 | 05 September 2026 | 21:23 | Rp 155.500 | Sandi Cell |
| 78 | 05 September 2026 | 22:41 | Rp 10.000 | Wr. Makan Mbak Siti |
| 79 | 05 September 2026 | 22:50 | Rp 125.000 | Restu juss |
| 80 | 05 September 2026 | 22:53 | Rp 17.500 | FC. Harmonis |
| 81 | 05 September 2026 | 22:56 | Rp 8.500 | Khoirudin (Brudin) |
| 82 | 05 September 2026 | 22:59 | Rp 60.500 | TB. Langganan |
| 83 | 05 September 2026 | 23:02 | Rp 25.000 | Ayam bakar Khundori |
| 84 | 05 September 2026 | 23:06 | Rp 31.000 | Toko Eni Latifah |
| 85 | 05 September 2026 | 23:10 | Rp 12.000 | Toko Kitab Masrukhin |
| 86 | 05 September 2026 | 23:13 | Rp 50.000 | Bakso Rejeh |
| 87 | 05 September 2026 | 23:16 | Rp 27.000 | Wr. Tidar |
| 88 | 05 September 2026 | 23:24 | Rp 60.000 | Winner Salon (kunci tdk bisa) |
| 89 | 05 September 2026 | 23:30 | Rp 24.000 | Master Salon |
| 90 | 05 September 2026 | 23:49 | Rp 15.000 | Bidan Bunda SPA |
| 91 | 05 September 2026 | 23:49 | Rp 42.000 | Bengkel Lukman |
| 92 | 05 September 2026 | 23:53 | Rp 48.500 | Warung Syifa (Sikawat) |
| 93 | 06 September 2026 | 00:01 | Rp 118.000 | Anisa Hijab (Domiyang) |
| 94 | 06 September 2026 | 00:11 | Rp 12.500 | Fatma Cell (Domiyang) |
| 95 | 06 September 2026 | 00:17 | Rp 24.000 | Andalas Motor |
| 96 | 07 September 2026 | 22:26 | Rp 21.500 | Kantor POS |
| 97 | 07 September 2026 | 22:35 | Rp 20.000 | Mama Ndoah |
| 98 | 07 September 2026 | 22:37 | Rp 11.000 | Primkoveri |
| 99 | 08 September 2026 | 04:57 | Rp 105.000 | Bengkel Perut |
| 100 | 08 September 2026 | 05:03 | Rp 82.000 | Mie Ayam Pertelon |
| 101 | 08 September 2026 | 05:10 | Rp 55.500 | Megono Lek Ati |
| 102 | 09 September 2026 | 20:42 | Rp 95.000 | Ratu Perabot (Nis) |

**Total nominal seluruh penjemputan: Rp 11.866.121**

## E. Daftar tugas penugasan (satu per satu)

148 baris. Diurutkan per bulan, lalu per tanggal pembuatan.

| No | Bulan tugas | Tempat | Status |
|---|---|---|---|
| 1 | Juli | Warung Tauto | Selesai |
| 2 | Juli | Andalas Motor | Selesai |
| 3 | Juli | Master Salon | Selesai |
| 4 | Juli | FC Ova (tdk terkunci) | Selesai |
| 5 | Juli | Apotik Ady Farma | Selesai |
| 6 | Juli | Kantor BKAD | Selesai |
| 7 | Juli | Ayam Sambal hijau | Selesai |
| 8 | Juli | Primkoveri | Selesai |
| 9 | Juli | Bengkel Lukman | Selesai |
| 10 | Juli | Winner Salon (kunci tdk bisa) | Selesai |
| 11 | Juli | Wr. Tidar | Selesai |
| 12 | Juli | Bakso Ojo Lali | Selesai |
| 13 | Juli | Bakso Rejeh | Selesai |
| 14 | Juli | KFC Sangkuriang Alfa | Terlewat |
| 15 | Juli | Warung Syifa (Sikawat) | Selesai |
| 16 | Juli | Toko Eni Latifah | Selesai |
| 17 | Juli | Bengkel Variasi Irfandi | Selesai |
| 18 | Juli | Wr. Makan Mbak Siti | Selesai |
| 19 | Juli | Wr. Makan Ibu Yuni | Selesai |
| 20 | Juli | TB. Langganan | Selesai |
| 21 | Juli | Bengkel Perut | Selesai |
| 22 | Juli | Megono Lek Ati | Selesai |
| 23 | Juli | FC. Harmonis | Selesai |
| 24 | Juli | Sandi Cell | Selesai |
| 25 | Juli | Mie Ayam Pertelon | Selesai |
| 26 | Juli | Gopal Elektronik | Selesai |
| 27 | Juli | Mama Ndoah | Selesai |
| 28 | Juli | Nasi Goreng Bu Wur | Selesai |
| 29 | Juli | Khoirudin (Brudin) | Terlewat |
| 30 | Juli | Ratu Perabot (Nis) | Terlewat |
| 31 | Juli | Restu juss | Terlewat |
| 32 | Juli | WM. Sederhana Pom | Terlewat |
| 33 | Juli | Wow Pacalan | Terlewat |
| 34 | Juli | Berkah Mede | Terlewat |
| 35 | Juli | Ayam bakar Khundori | Terlewat |
| 36 | Juli | Barbershop Ezpaz Nizar Swg | Terlewat |
| 37 | Juli | Tk Sepatu dan tas ( Rosid ) | Terlewat |
| 38 | Juli | Kantor POS | Terlewat |
| 39 | Juli | Trendy Baber shop | Terlewat |
| 40 | Juli | Kopi dan PS Miti | Terlewat |
| 41 | Juli | Dua Putri Buah (kaleng) | Terlewat |
| 42 | Juli | Jhon Amin Tk. Sembako | Terlewat |
| 43 | Juli | Akbar Cell | Terlewat |
| 44 | Juli | Clasic Babershop / Ojan | Terlewat |
| 45 | Juli | Bidan Bunda SPA | Terlewat |
| 46 | Juli | Toko Kitab Masrukhin | Selesai |
| 47 | Juli | Apotik Sikawat | Selesai |
| 48 | Juli | Ayam Kremes | Selesai |
| 49 | Juli | Nirwana fotokopi | Terlewat |
| 50 | Juli | Anisa Hijab (Domiyang) | Terlewat |
| 51 | Juli | Fatma Cell (Domiyang) | Selesai |
| 52 | Juli | maahin | Selesai |
| 53 | Juli | maahin4 | Terlewat |
| 54 | Juli | maahin5 | Terlewat |
| 55 | Juli | maahin6 | Terlewat |
| 56 | Juli | maahin3 | Terlewat |
| 57 | Juli | maahin10 | Terlewat |
| 58 | Juli | maahin2 | Terlewat |
| 59 | Juli | maahin7 | Terlewat |
| 60 | Juli | maahin8 | Terlewat |
| 61 | Juli | maahin9 | Terlewat |
| 62 | Juli | Nasi Goreng Kuwat | Terlewat |
| 63 | Juli | Toko Bangunan Syhab | Terlewat |
| 64 | Juli | Lutfan isi ulang (kaleng) | Terlewat |
| 65 | Juli | Helmy Mubarok | Selesai |
| 66 | Juli | Helmy Mubarok | Selesai |
| 67 | Juli | Helmy Mubarok | Selesai |
| 68 | Agustus | Tk Sepatu dan tas ( Rosid ) | Selesai |
| 69 | Agustus | Apotik Ady Farma | Terlewat |
| 70 | Agustus | Bakso Ojo Lali | Terlewat |
| 71 | Agustus | Kantor BKAD | Terlewat |
| 72 | Agustus | Ayam Sambal hijau | Terlewat |
| 73 | Agustus | Wr. Makan Ibu Yuni | Terlewat |
| 74 | Agustus | Toko Bangunan Syhab | Selesai |
| 75 | Agustus | maahin2 | Selesai |
| 76 | Agustus | WM. Sederhana Pom | Selesai |
| 77 | Agustus | Barbershop Ezpaz Nizar Swg | Selesai |
| 78 | Agustus | Wow Pacalan | Selesai |
| 79 | Agustus | Kopi dan PS Miti | Selesai |
| 80 | Agustus | Berkah Mede | Selesai |
| 81 | Agustus | Sandi Cell | Selesai |
| 82 | Agustus | Restu juss | Selesai |
| 83 | Agustus | FC. Harmonis | Selesai |
| 84 | Agustus | Khoirudin (Brudin) | Selesai |
| 85 | Agustus | Ayam bakar Khundori | Selesai |
| 86 | Agustus | Toko Eni Latifah | Selesai |
| 87 | Agustus | Bidan Bunda SPA | Selesai |
| 88 | Agustus | Kantor POS | Selesai |
| 89 | Agustus | Mie Ayam Pertelon | Selesai |
| 90 | Agustus | Ratu Perabot (Nis) | Selesai |
| 91 | Agustus | Akbar Cell | Terlewat |
| 92 | Agustus | Jhon Amin Tk. Sembako | Terlewat |
| 93 | Agustus | Nirwana fotokopi | Terlewat |
| 94 | Agustus | Dua Putri Buah (kaleng) | Terlewat |
| 95 | Agustus | Trendy Baber shop | Terlewat |
| 96 | Agustus | KFC Sangkuriang Alfa | Terlewat |
| 97 | Agustus | Nasi Goreng Kuwat | Terlewat |
| 98 | Agustus | Gopal Elektronik | Terlewat |
| 99 | Agustus | Bengkel Variasi Irfandi | Terlewat |
| 100 | Agustus | Wr. Makan Mbak Siti | Selesai |
| 101 | Agustus | TB. Langganan | Selesai |
| 102 | Agustus | Toko Kitab Masrukhin | Selesai |
| 103 | Agustus | Bakso Rejeh | Selesai |
| 104 | Agustus | Wr. Tidar | Selesai |
| 105 | Agustus | Winner Salon (kunci tdk bisa) | Selesai |
| 106 | Agustus | Master Salon | Selesai |
| 107 | Agustus | Bengkel Lukman | Selesai |
| 108 | Agustus | Warung Syifa (Sikawat) | Selesai |
| 109 | Agustus | Anisa Hijab (Domiyang) | Selesai |
| 110 | Agustus | Andalas Motor | Selesai |
| 111 | Agustus | Primkoveri | Selesai |
| 112 | Agustus | Bengkel Perut | Selesai |
| 113 | Agustus | Megono Lek Ati | Selesai |
| 114 | Agustus | Apotik Sikawat | Terlewat |
| 115 | Agustus | Warung Tauto | Terlewat |
| 116 | Agustus | Ayam Kremes | Terlewat |
| 117 | Agustus | maahin | Selesai |
| 118 | Agustus | maahin6 | Selesai |
| 119 | Agustus | maahin4 | Selesai |
| 120 | Agustus | maahin5 | Selesai |
| 121 | Agustus | maahin3 | Selesai |
| 122 | Agustus | maahin10 | Selesai |
| 123 | Agustus | Helmy Mubarok | Selesai |
| 124 | Agustus | FC Ova (tdk terkunci) | Selesai |
| 125 | Agustus | Nasi Goreng Bu Wur | Selesai |
| 126 | Agustus | Lutfan isi ulang (kaleng) | Terlewat |
| 127 | Agustus | maahin7 | Selesai |
| 128 | Agustus | maahin9 | Selesai |
| 129 | Agustus | Fatma Cell (Domiyang) | Selesai |
| 130 | Agustus | Mama Ndoah | Selesai |
| 131 | Agustus | maahin8 | Selesai |
| 132 | Agustus | Helmy Mubarok | Terlewat |
| 133 | Agustus | Helmy Mubarok | Selesai |
| 134 | Agustus | adadeh | Terlewat |
| 135 | Agustus | haji | Selesai |
| 136 | September | maahin9 | Terlewat |
| 137 | September | maahin4 | Terlewat |
| 138 | September | maahin3 | Terlewat |
| 139 | September | maahin7 | Terlewat |
| 140 | September | Nasi Goreng Bu Wur | Terlewat |
| 141 | September | Dua Putri Buah (kaleng) | Terlewat |
| 142 | September | Tk Sepatu dan tas ( Rosid ) | Terlewat |
| 143 | September | Toko Bangunan Syhab | Selesai |
| 144 | September | Nasi Goreng Kuwat | Terlewat |
| 145 | September | Lutfan isi ulang (kaleng) | Aktif |
| 146 | September | Fatma Cell (Domiyang) | Aktif |
| 147 | September | Clasic Babershop / Ojan | Aktif |
| 148 | September | Anisa Hijab (Domiyang) | Aktif |

## F. Catatan penting: selisih dengan angka di layar

Saat laporan ini dibuat, halaman Detail Petugas Anda menampilkan:
**"Total Tugas 210 (84 selesai, 66 aktif, 60 terlewat)"**.

Data dari database produksi hari ini: **148 tugas (84 selesai, 4 aktif, 60 terlewat)**.

Yang cocok persis: **102 penjemputan**, **84 selesai**, **60 terlewat**.
Yang berbeda: **aktif** (66 di layar vs 4 di database) dan **total** (210 vs 148).

Selisihnya tepat **62** pada kedua angka — artinya saat Anda melihat layar, masih ada
**62 penugasan berstatus "aktif"** yang sekarang sudah tidak masuk hitungan. Petugas
ini tidak punya nama kembar di sistem (sudah dicek), dan tidak ada petugas lain di
ranting yang menerima 62 tugas aktif, jadi penyebab pastinya perlu ditelusuri
terpisah — kemungkinan besar data penugasan berubah setelah halaman ditampilkan
terakhir kali (ada aktivitas pemindahan tugas di sistem).

**Angka yang bisa dipertanggungjawabkan saat ini adalah 148 / 84 / 4 / 60, karena
itu yang dihitung langsung oleh kode backend yang sedang berjalan di produksi**
(bukan perkiraan dari tabel).
