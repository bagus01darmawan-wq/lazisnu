# 05 — Pengujian, rilis, dan rollout

## Prinsip rilis

Setiap tahap memiliki bukti angka, tes otomatis, dan titik rollback sendiri. Jangan mengaktifkan UI baru bila query dan hasil rekonsiliasinya belum diterima.

## 1. Data uji minimum

Buat fixture terisolasi untuk satu kecamatan dengan sedikitnya dua ranting dan dua petugas. Sertakan:

| Kasus | Data dan hasil yang diharapkan |
|---|---|
| Aktif | masuk cakupan, menerima tugas |
| Rusak | masuk cakupan dan tugas, masuk tindakan |
| Hilang | tidak masuk cakupan penempatan, masuk cakupan hilang, menerima tugas, masuk tindakan |
| Nonaktif | masuk cakupan, tidak menerima tugas, perlu kunjungan verifikasi |
| Dikembalikan | `isActive = false`, tidak masuk cakupan/tugas/tindakan |
| Enam kali kosong | menghasilkan proposal, tidak mengubah kondisi sebelum admin setuju |
| Terisi lagi | `NON_AKTIF → AKTIF`, riwayat kosong direset secara terhitung |
| Tidak terjemput | `UNCOLLECTED`, tidak menambah collection kosong |
| Resubmit | dua submit collection untuk assignment/can sama; hanya submit terbaru dihitung |
| Lintas ranting | petugas ranting A mengambil kaleng ranting B; nominal masuk ranting B |
| Reassignment | collection A tetap milik A; collection B tetap milik B |

## 2. Tes backend

Tambahkan test di struktur test backend yang sudah digunakan proyek; bila belum ada pola test, mulai dari unit test service agar query dan transition dapat diuji tanpa browser.

### Data dan transition

- migrasi schema dapat diterapkan pada database kosong dan snapshot lama;
- backfill `is_active = false → DIKEMBALIKAN`;
- generator assignment menyaring tiga kondisi yang boleh ditagih;
- layanan proposal idempoten dan memeriksa scope;
- visit tidak menyentuh tabel `collections`;
- perubahan kondisi dan proposal atomik saat ada kegagalan tengah transaksi.

### Overview API

- `ADMIN_RANTING` memperoleh data hanya dari ranting token;
- `ADMIN_KECAMATAN` memperoleh agregat seluruh rantingnya;
- `branch_id` kecamatan di luar district ditolak `403/404` sesuai konvensi proyek;
- `pending/task_active` selalu tersaring scope;
- nominal memakai `sync_status = COMPLETED` dan `getLatestCollectionCondition()`;
- grouping per ranting memakai `cans.branchId`;
- data `action_items` dibatasi serta berurutan deterministik.

## 3. Tes web

Validasi halaman aktual `apps/web/src/app/dashboard/overview/page.tsx` dan komponen overview baru:

- state loading, retry, error, zero data, dan zero action;
- role ranting tidak memiliki filter ranting maupun data agregat kecamatan;
- role kecamatan dapat berpindah “Semua ranting” ke satu ranting, lalu seluruh section berubah bersama;
- kartu dan daftar tindakan memiliki tautan/filter tujuan yang tepat;
- layar 360px, 768px, 1024px, dan desktop tidak overflow horizontal;
- fokus keyboard terlihat; semua tombol dapat dipakai; label kondisi tidak bergantung warna;
- chart memiliki ringkasan/table fallback.

Jalankan juga pemeriksaan type dan build yang tersedia:

```text
pnpm build:shared
pnpm build:backend
pnpm build:web
```

## 4. Rekonsiliasi sebelum deploy

Sebelum dan sesudah setiap deploy, simpan untuk scope dan waktu yang sama:

- total nominal bulan berjalan;
- jumlah collection valid;
- total kaleng lama dan `is_active = true/false`;
- jumlah assignment per status;
- hasil per ranting untuk kecamatan uji.

Setelah fase skema dan query, angka nominal serta jumlah collection valid harus sama. Perbedaan kondisi hanya boleh terjadi bila dijelaskan oleh backfill yang disetujui.

## 5. Runbook rollout

### Deploy 1 — skema aman

1. Backup database.
2. Jalankan migrasi condition, proposal, visit, reason code.
3. Backfill `is_active = false` ke `DIKEMBALIKAN`.
4. Verifikasi tidak ada perubahan perilaku aplikasi lama.
5. Rollback: hentikan deploy aplikasi; untuk rollback schema gunakan migrasi balik yang telah diuji, bukan SQL ad hoc.

### Deploy 2 — backend API paralel

1. Deploy service/endpoint overview baru namun biarkan UI lama memakai kontrak lama bila perlu.
2. Bandingkan respons baru dengan baseline secara manual dan melalui test integrasi.
3. Pantau query lambat/error API.
4. Rollback: arahkan UI ke kontrak lama dan nonaktifkan endpoint baru; data condition tidak dihapus.

### Deploy 3 — web overview

1. Deploy UI setelah API accepted.
2. Uji dua akun nyata: satu ranting, satu kecamatan.
3. Pantau error client dan kesalahan scope filter.
4. Rollback: rilis versi web sebelumnya; backend baru dapat tetap hidup.

### Deploy 4 — operasi mobile dan admin

1. Rilis backend yang kompatibel untuk reason code lama (`OTHER`) dan baru.
2. Rilis APK dengan pemilih alasan.
3. Setelah adopsi APK terukur, wajibkan reason code.
4. Baru setelah seluruh data `POSTPONED` dipetakan, hapus nilai enum dan UI terkait.

## 6. Go / no-go

**Go** bila semua acceptance criteria fase terpenuhi, build lulus, scope role tidak bocor, dan nominal hasil rekonsiliasi sama.

**No-go** bila salah satu terjadi:

- nominal atau jumlah collection valid berubah tanpa penjelasan;
- dashboard kecamatan dan ranting menunjukkan angka berbeda untuk scope sama;
- kaleng nonaktif menerima tugas penjemputan;
- kaleng hilang tidak terlihat pada tindakan/cakupan hilang;
- proposal atau aksi dapat menyentuh kaleng luar wilayah;
- UI memotong kontrol utama pada layar 360px.
