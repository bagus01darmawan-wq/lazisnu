# 03 — Web overview berbasis role dan UI

## Tujuan fase

Mengganti overview di `apps/web/src/app/dashboard/overview/page.tsx` menjadi pusat monitoring kaleng yang ringkas, dapat ditindaklanjuti, dan konsisten untuk dua role. Fase ini dimulai hanya saat kontrak API pada fase 02 stabil.

## Arah desain

Arah dipilih untuk dashboard operasional nonprofit: fokus pada keputusan lapangan, bukan dekorasi kartu. Rekomendasi UI Pro Max yang relevan adalah dashboard padat namun terstruktur, chart tren untuk data berurutan waktu, dan informasi non-warna sebagai fallback aksesibilitas. Arahan visual mempertahankan identitas hijau Lazisnu yang sudah digunakan di halaman saat ini, bukan mengganti brand maupun menambah font/dependensi.

Prinsip:

1. **Tindakan dahulu.** Kasus `HILANG`, `RUSAK`, dan `NON_AKTIF` lebih penting daripada grafik nominal.
2. **Satu angka, satu makna.** Jangan memberi label “Total Infaq” pada nominal bulan berjalan.
3. **Kondisi kaleng dan siklus tugas dipisahkan.** Jangan menampilkan tugas ditutup sebagai penjemputan berhasil.
4. **Bersih, bukan ramai.** Hindari grid berisi banyak kartu identik; gunakan satu blok ringkasan, satu blok tindakan, lalu analitik pendukung.
5. **Mobile-first.** Admin ranting diprioritaskan di lebar 360–375px: satu kolom, aksi sentuh minimal 44px, jarak antar target minimal 8px, dan tidak ada hover sebagai satu-satunya cara memperoleh informasi.

## Struktur layar target

```text
Header: Overview kaleng
Scope + periode + status pembaruan
[filter ranting hanya untuk admin kecamatan]

Ringkasan operasional
[ Cakupan penempatan ] [ Tugas periode ini ]
[ Perlu tindakan     ] [ Infaq bulan ini   ]

Perlu tindakan sekarang
[ tab Semua | Hilang | Rusak | Nonaktif ] [Lihat semua]
baris ringkas: pemilik, wilayah, umur kasus, tindakan utama

Analitik
[ tren 6 bulan: isi/kosong/tidak terjemput ]
[ komposisi kondisi kaleng ]

Khusus kecamatan
[ tabel perbandingan ranting ]
```

Pada mobile, kartu ringkasan menjadi list 2x2 atau satu kolom sesuai panjang nilai. Tabel perbandingan ranting berubah menjadi daftar ringkas yang membuka detail/filter ranting, bukan tabel horizontal yang dipaksa mengecil.

## Perubahan kode yang direncanakan

### `apps/web/src/app/dashboard/overview/page.tsx`

Refactor halaman secara bertahap:

1. Ganti `DashboardStatsData` lokal dengan type response overview dari `@lazisnu/shared-types` setelah fase 02.
2. Hilangkan perhitungan browser `month_count / active_cans`, `inactiveCans`, dan tren yang memakai penyebut bulan ini untuk bulan lalu.
3. Ganti teks “Selamat Datang” dengan judul tugas: **Overview kaleng** dan deskripsi scope/periode.
4. `ADMIN_RANTING` memanggil `/admin/branch/dashboard` tanpa filter ranting.
5. `ADMIN_KECAMATAN` memanggil `/admin/district/dashboard` dan dapat memilih `branch_id`; daftar ranting diambil dari endpoint aktual `GET /admin/branches`.
6. Jangan lagi render `data.district` untuk admin ranting. Blok ini berasal dari respons branch lama dan menjadi duplikasi informasi lintas scope.
7. Pertahankan state loading, error, dan retry, tetapi gunakan skeleton yang mengikuti struktur akhir agar layout tidak meloncat.

### Komponen baru yang disarankan

Buat komponen presentasional di bawah `apps/web/src/components/overview/` bila file halaman mulai terlalu besar:

| Komponen | Tanggung jawab |
|---|---|
| `OverviewHeader` | judul, scope, periode, filter ranting kecamatan, waktu pembaruan |
| `OperationalSummary` | empat ringkasan utama dengan definisi dan link drill-down |
| `ActionRequiredList` | daftar tindakan dan tab kondisi |
| `CollectionTrendChart` | tren enam bulan + fallback tabel/ringkasan |
| `ConditionBreakdown` | daftar/batang kondisi, bukan donut wajib |
| `BranchComparisonList` | perbandingan ranting untuk admin kecamatan |

Komponen menerima data siap tampil. Query API dan logika scope tetap di halaman/hook, bukan di setiap kartu.

## Isi ringkasan

| Kartu | Isi utama | Detail pendukung | Tujuan klik |
|---|---|---|---|
| Cakupan penempatan | `placement_coverage` | Aktif, Nonaktif, Rusak | daftar kaleng dengan kondisi terkait |
| Tugas periode ini | `task_closed / task_total` | `task_active` tugas belum; `task_uncollected` ditutup tanpa jemput | halaman assignment dengan periode aktif |
| Perlu tindakan | `action_required` | Hilang, Rusak, Nonaktif | daftar tindakan dengan filter kondisi |
| Infaq bulan ini | `collection_nominal` | `successful_collections` penjemputan berhasil; tren nominal bila data cukup | laporan collection periode berjalan |

Teks pendukung harus memakai kalimat pendek: “12 tugas belum ditutup”, bukan singkatan internal seperti `task_active`.

## Role dan interaksi

### Admin ranting

- Header menampilkan nama ranting dari respons server.
- Tidak ada dropdown scope ranting.
- Semua drill-down membawa filter ranting implisit dari sesi; tautan tidak harus mengirim `branch_id` yang dapat diedit pengguna.

### Admin kecamatan

- Tampilan awal adalah agregat kecamatan.
- Dropdown “Semua ranting” berada di header/filter, bukan pada setiap kartu.
- Setelah memilih ranting, label scope harus berubah jelas dan semua kartu, daftar tindakan, serta tren memakai scope sama.
- Tabel/list perbandingan ranting hanya tampil pada scope kecamatan agregat; setiap baris dapat menyetel filter ranting.

## Visual, aksesibilitas, dan polish

- Gunakan Lucide yang sudah dipakai halaman, bukan emoji; ikon melengkapi label teks.
- Beri badge teks selain warna: `Hilang`, `Rusak`, `Nonaktif`, `Dikembalikan`.
- Pastikan kontras teks normal minimum 4.5:1 dan fokus keyboard tetap terlihat.
- Tombol, tab, dan baris yang dapat ditekan memiliki target 44px; setiap target berdampingan berjarak minimal 8px.
- Tooltip hanya pelengkap. Definisi metrik penting harus tersedia dalam teks atau dialog yang dapat diakses keyboard.
- Chart tren menggunakan garis/batang dan label seri langsung; jangan membedakan isi, kosong, serta tidak terjemput hanya melalui warna. Sediakan ringkasan teks dan tabel data yang dapat dibaca.
- Gunakan transisi properti spesifik (`opacity`, `transform`, `color`) ≤200ms; `active:scale-[.96]`; hindari `transition-all`, animasi chart dekoratif, dan entrance bertingkat pada tiap refresh.
- Hormati `prefers-reduced-motion`. Hover hanya enhancement perangkat pointer presisi, bukan state penting.

## State khusus

| State | Isi yang harus muncul |
|---|---|
| Memuat pertama kali | skeleton header, ringkasan, dan daftar tindakan dengan tinggi tetap |
| Memuat setelah filter | pertahankan data lama dengan indikator kecil, atau skeleton area yang berubah; jangan blank seluruh halaman |
| Tidak ada tindakan | “Tidak ada kaleng yang perlu ditindak saat ini” dan link ke daftar kaleng |
| Tidak ada data periode | tampilkan angka nol dan jelaskan bahwa belum ada penjemputan pada periode itu |
| Gagal memuat | pesan penyebab yang jelas + tombol “Coba lagi” |
| Tidak berwenang | jangan tampilkan data lama dari scope sebelumnya |

## Kriteria penerimaan

- [ ] Layout valid pada 360px, 768px, 1024px, dan desktop lebar tanpa scroll horizontal halaman.
- [ ] Semua angka utama dapat dijelaskan dan sesuai respons server tanpa kalkulasi definisi di browser.
- [ ] Filter ranting tidak muncul untuk admin ranting.
- [ ] Filter kecamatan mengubah seluruh section pada satu sumber state.
- [ ] Setiap kondisi tindakan memiliki teks, aksi, dan drill-down yang relevan.
- [ ] Keyboard dapat memakai filter, tab, tombol retry, dan tautan daftar.
- [ ] Tidak ada informasi yang hanya tersedia dengan hover atau warna.
