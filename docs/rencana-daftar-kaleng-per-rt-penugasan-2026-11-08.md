# Rencana Fitur: Daftar Kaleng yang Bisa Dibuka di Bawah Tiap Grup RT/RW

Tanggal: 8 November 2026
Repo: `bagus01darmawan-wq/lazisnu`
Status: **RENCANA SAJA — belum dilaksanakan.** Tidak ada perubahan kode, tidak ada build, tidak ada uji yang dijalankan. Menunggu keputusan Pion.
Diminta: Pion, 8 November 2026 — "susun rencana fitur baru daftar kaleng yang bisa dibuka di bawah tiap grup RT/RW, simpan di folder docs".
Dasar: konfirmasi balik 8 November 2026 (§1 di bawah) dan `docs/rencana-redesign-halaman-penugasan-2026-10-24.md`.
Berkas yang **kelak** disentuh bila disetujui (bukan sekarang): `apps/backend/src/services/assignmentWorkQueueService.ts`, `apps/web/src/components/assignments/types.ts`, `apps/web/src/components/assignments/UnassignedQueue.tsx`, dan berkas tes baru/pendamping.

---

## 0. Ringkasan untuk pembaca awam

**Kabar buruk dulu: ini bukan perbaikan bug, melainkan fitur baru.** Data kalengnya tidak hilang dan tidak gagal dimuat. Sistem sekarang berjalan persis seperti yang dirancang 24 Oktober 2026: grup RT/RW adalah **baris ringkasan** untuk dicentang, bukan wadah yang berisi daftar kaleng.

Rencana ini menambahkan satu kemampuan: di bawah tiap baris `RT … / RW …` ada tombol kecil untuk **membuka rincian**, lalu muncul daftar kaleng di RT itu — kode QR, nama pemilik, kondisi. Membuka rincian **tidak boleh** ikut mencentang grup.

---

## 1. Keadaan sekarang (sudah diverifikasi dari kode)

| Fakta | Bukti |
|---|---|
| Halaman detail memilih mode dukuh lewat `?kind=dukuh` | `apps/web/src/app/dashboard/assignments/[id]/page.tsx:99` |
| Tab **Kelola** memanggil `GET /admin/assignments/work-queue` dengan `dukuh_id`, `year`, `month` | `useAssignmentWorkQueue.ts:41-47` |
| Untuk scope dukuh, grup dibentuk per RT/RW (atau per pemilik kaleng bila RT/RW kosong) | `assignmentWorkQueueService.ts:233-275` (`buildDukuhGroups`) |
| Grup **hanya berisi kaleng yang belum ditugaskan** pada periode terpilih, aktif, dan berkondisi AKTIF/RUSAK/HILANG | `buildDukuhGroups` baris 250 (`isNull(assignments.id)` + `assignableFilter`) |
| Tiap grup menyimpan `canIds` (daftar ID kaleng) | baris 261, 271; ditegaskan di dokumen desain lama baris 473 |
| `canIds` dipakai **hanya saat menyimpan** penugasan, tidak pernah ditampilkan | `[id]/page.tsx:322` → `POST /admin/assignments/bulk-cans` |
| Baris grup cuma merender nama, label "RT / RW", angka "N belum", bilah progres, checkbox | `UnassignedQueue.tsx:126-149` |
| Tidak ada komponen rincian kaleng, tidak ada tombol buka/tutup | `UnassignedQueue.tsx` seluruhnya; component tree dokumen lama baris 314-316 |
| Lembar konfirmasi hanya ringkasan angka (Grup / Kaleng / Petugas) | `AssignmentConfirmSheet.tsx:32-38` |
| Data per-kaleng memang ada, tapi di tab **Riwayat** dan hanya untuk kaleng yang sudah ditugaskan | wireframe §5.2 dokumen lama; `AssignmentHistoryCard.tsx` |
| Desain lama tidak pernah menjanjikan rincian per grup | wireframe baris 105-120, baris 122, tabel komponen baris 339-340 |

**Artinya:** munculnya grup RT/RW itu sendiri sudah membuktikan kalengnya ada di baliknya. Kalau tidak ada kaleng, grup tidak terbentuk dan layar menampilkan *"Tidak ada grup yang tersisa"* atau *"Belum ada kaleng terdaftar"* (`page.tsx:573-583`, `UnassignedQueue.tsx:88-93`).

---

## 2. Tujuan & ruang lingkup

**Masuk lingkup:**
- Halaman Penugasan, tab **Kelola**, **scope dukuh** (kartu dukuh → `?kind=dukuh`) — kasus yang Pion laporkan (Bojongireng, ranting Lambanggelun).
- Tombol buka/tutup di tiap grup RT/RW.
- Daftar kaleng di dalam grup: **kode QR, nama pemilik, kondisi**; jumlah baris harus sama dengan angka "N belum".
- Rincian mengikuti **periode yang sedang dipilih** di halaman (bukan periode lain).

**Di luar lingkup (sengaja):**
- Scope ranting (`kind=branch`, grup berupa dukuh, `canIds: null`) — tidak diubah.
- Tab Riwayat, `AssignmentCoverage`, lembar konfirmasi, halaman Kelola Kaleng.
- Pencarian/filter/pengurutan di dalam panel rincian, dan aksi per-kaleng (tugaskan satu kaleng dari panel). Itu usulan terpisah kalau nanti Pion mau.

---

## 3. Keputusan desain: dari mana data kaleng diambil

### Opsi A (rekomendasi) — perluas respons `work-queue`
`buildDukuhGroups()` **sudah** mengambil `id`, `ownerName`, `rt`, `rw` dari tabel `cans` (baris 236-239). Tinggal menambah `qrCode` dan `condition`, lalu menyimpan detail itu per grup bersama `canIds` yang sudah ada.

Keuntungan:
- **Satu request**, tidak ada permintaan tambahan saat pengguna membuka panel.
- **Periode konsisten**: `work-queue` memakai `year`/`month` dari URL halaman.
- Tidak terkena pagination.
- `canIds` tetap utuh → alur submit `bulk-cans` tidak berubah.

### Opsi B (ditolak) — frontend memanggil `GET /admin/cans?dukuh_id=…` lalu memfilter RT sendiri
Tiga masalah nyata:
1. **Periode beda.** `routes/admin/cans.ts:27` memakai `resolveDisplayPeriod(user)` → `display_period` server (`periodState.ts:113-126`), bukan periode yang dipilih di halaman Penugasan. `display_period` bisa parkir di bulan lama karena tunggakan (mekanisme yang sama dengan kasus Bunda, Juli 2026). Hasilnya bisa tidak sinkron.
2. **Pagination.** `getCans` memakai `limit`/`offset` (`canService.ts:169-175`); dukuh dengan banyak kaleng bisa terpotong, sehingga panel tampak kehilangan data.
3. **Request tambahan + filter RT di klien**, dan endpoint itu belum punya filter `rt`/`rw` (`cans.ts:25`).

### Pilihan yang diminta Pion
Saya merekomendasikan **Opsi A**. Kalau Pion memilih B, rencana §4–§6 harus disusun ulang.

---

## 4. Perubahan persis yang kelak diperlukan

Nama field `cans` / tipe `WorkQueueCan` di bawah **usulan**, belum ada di kode saat ini.

### 4.1 Backend — `apps/backend/src/services/assignmentWorkQueueService.ts`
1. Tambah tipe:
   ```
   export interface WorkQueueCan {
     id: string;
     qrCode: string;
     ownerName: string;
     rt: string | null;
     rw: string | null;
     condition: string;
   }
   ```
2. Tambah field opsional `cans?: WorkQueueCan[]` pada `WorkQueueGroup` (baris 22-30). **`canIds` jangan dihapus** — dipakai `page.tsx:322`.
3. Di `buildDukuhGroups()`:
   - tambah `qrCode` dan `condition` pada `select` (baris 235-240);
   - saat membuat grup (baris 264-272) isi `cans: [detail]`;
   - saat menggabungkan kaleng ke grup yang sudah ada (baris 257-262) lakukan `existing.cans!.push(detail)` berdampingan dengan `existing.canIds!.push(can.id)`.
4. `buildBranchGroups()` **tidak diubah**: tetap `canIds: null`, tanpa `cans`.
5. Kontrak baru wajib dijaga: `cans.length === canIds.length === unassignedCans` untuk tiap grup scope dukuh.

### 4.2 Web — `apps/web/src/components/assignments/types.ts`
- Tambah `WorkQueueCan` yang sepadan, dan `cans?: WorkQueueCan[] | null` pada `WorkQueueGroup` (baris 7-15).
- **Perhatikan interceptor** `snake_case` → `camelCase` (dokumen desain lama baris 397): `qr_code` direspons backend terbaca `qrCode` di frontend.

### 4.3 Web — `apps/web/src/components/assignments/UnassignedQueue.tsx`
1. State `expandedIds: Set<string>` (lokal di komponen, supaya `page.tsx` tidak makin gemuk).
2. **Jebakan utama:** sekarang `<label>` membungkus checkbox **dan seluruh isi baris** (baris 104-150). Tombol buka rincian yang ditaruh di dalam `<label>` akan **ikut mencentang grup** saat diklik. Struktur harus dipisah:
   - `<li>` → `<div>` baris utama berisi checkbox + `<label>` yang **hanya** membungkus nama/angka;
   - tombol `type="button"` terpisah dengan `aria-expanded`, `aria-controls`, dan label yang jelas (mis. "Lihat 3 kaleng");
   - panel `<div id=…>` di bawah baris, **di luar** `<label>`.
3. Panel menampilkan daftar kaleng: kode QR, nama pemilik, kondisi. Tampilkan tombol hanya bila `cans?.length > 0`.
4. **Jangan menampilkan daftar kosong tanpa penjelasan.** Bila `cans` tidak ada (backend lama, respons belum terisi), tampilkan *"Rincian belum tersedia"* — supaya tidak mengulang kesan "data kaleng hilang" yang Pion laporkan.
5. Prune `expandedIds` saat `groups` berubah (pola yang sudah dipakai `page.tsx:158-168` untuk `selectedGroupIds`), supaya grup yang hilang setelah ganti periode tidak menyisakan state basi.
6. Untuk dukuh dengan kaleng sangat banyak: batasi tampilan awal (mis. 20 baris + "Lihat semua N") atau panel `max-h` + scroll. Ini **usulan**, bukan keharusan — belum ada angka ukuran dukuh yang bisa dipakai untuk memutuskannya.
7. Membuka rincian **tidak mengubah centang**; mencentang **tidak membuka rincian**; "Pilih semua" tetap bekerja seperti sekarang.

### 4.4 `apps/web/src/app/dashboard/assignments/[id]/page.tsx`
**Direncanakan tidak diubah.** `submitAssignment` tetap memakai `canIds` (baris 322) dan `bulk-cans` (baris 336-341). Kalau ternyata state expand harus naik ke parent, perubahan tambahan akan saya sebutkan lagi sebelum dikerjakan.

---

## 5. Rencana uji (pembuktian lewat GitHub Actions, bukan PC Pion)

### 5.1 Backend — `apps/backend/src/services/__tests__/assignmentWorkQueueService.integration.test.ts` (sudah ada)
Tambah kasus:
- scope dukuh → tiap grup `kind: 'rt'` punya `cans` dengan jumlah = `unassignedCans`;
- `cans.map(c => c.id)` **sama persis** dengan `canIds`;
- kaleng yang **sudah punya assignment** pada periode itu tidak masuk `cans`;
- kaleng non-aktif / `DIKEMBALIKAN` tidak masuk `cans`;
- scope branch tetap `canIds: null` dan tanpa `cans` (tidak ada regresi);
- dua kaleng dengan RT/RW sama tergabung dalam satu grup, berbeda RT jadi dua grup.

### 5.2 Web — tes komponen baru
Saat ini **belum ada tes** untuk `UnassignedQueue` (hasil penelusuran berkas `*test*`). Usulan tes React Testing Library:
- klik tombol rincian → panel muncul berisi kode QR, **centang grup tidak berubah**;
- `aria-expanded` berubah `false → true → false`;
- klik nama/checkbox → centang berubah, panel **tidak** ikut terbuka;
- grup tanpa `cans` → pesan "Rincian belum tersedia", bukan daftar kosong;
- setelah `groups` berubah, `expandedIds` yang sudah tidak relevan hilang;
- "Pilih semua" tetap mencentang seluruh grup.

### 5.3 Yang tidak boleh dilakukan saat menguji
Tidak menjalankan `next build`, `gradlew`, Jest/Vitest berat, atau instalasi paket di PC Pion. Semua pembuktian diserahkan ke CI. Butuh bukti runtime dari aplikasi staging → **tanya Pion dulu**.

---

## 6. Kriteria lulus (ditetapkan sebelum uji)

1. Di staging, buka kartu dukuh → grup RT/RW → tombol rincian → muncul daftar kaleng berisi kode QR + nama pemilik + kondisi.
2. Jumlah baris di panel **sama** dengan angka "N belum" dan dengan `canIds.length`.
3. Membuka rincian tidak mencentang; mencentang tidak membuka rincian.
4. Periode yang dipakai tetap periode di URL (bukan `display_period` server).
5. **Tidak ada request tambahan** per grup saat panel dibuka (Opsi A: cukup satu respons `work-queue`).
6. Alur simpan penugasan `bulk-cans` tidak berubah dan tetap berhasil.
7. Seluruh tes di CI hijau.

---

## 7. Risiko

- **Respons membengkak.** Menyertakan detail tiap kaleng menambah ukuran `work-queue`. Mitigasi: hanya 6 field per kaleng; belum ada ukuran dukuh terbesar yang bisa dipakai untuk memastikan, jadi ini **belum terukur**. Kalau nanti ternyata besar, pertimbangkan lazy-load per grup sebagai tahap 2.
- **Struktur `<label>` berubah.** Ini bagian paling rawan: salah menaruh tombol bisa membuat klik rincian ikut mencentang, atau sebaliknya merusak "Pilih semua". Itu sebabnya tes §5.2 wajib.
- **Data berubah antara fetch dan simpan.** Kaleng bisa keburu ditugaskan orang lain. `bulk-cans` sudah punya pengaman (kaleng berjadwal dilewati), tetapi panel bisa menampilkan kaleng yang sudah tidak tersedia sampai di-refetch. Sebut di UI bila perlu, jangan diam-diam.
- **`snake_case` vs `camelCase`.** Salah baca `qr_code`/`qrCode` membuat kolom QR kosong.
- **Periode ganda.** Jangan tanpa sengaja memakai `resolveDisplayPeriod` (alasan Opsi B ditolak).
- **Kaleng tanpa RT/RW** (`kind: 'can'`) tetap muncul sebagai grup nama pemilik; pastikan tombol rincian juga konsisten untuk grup ini (1 kaleng).

---

## 8. Yang TIDAK dikerjakan dalam rencana ini

- Tidak mengubah tab Riwayat, `AssignmentCoverage`, `AssignmentConfirmSheet`, halaman Kelola Kaleng, atau `GET /admin/cans`.
- Tidak mengubah logika penugasan `bulk-branch` / `bulk-cans`, tidak menghapus `canIds`.
- Tidak mengubah scope ranting (`kind=branch`).
- Tidak menambah pencarian, filter, pengurutan, atau aksi per-kaleng di panel.
- Tidak mengubah `docs/rencana-redesign-halaman-penugasan-2026-10-24.md` (boleh diusulkan addendum terpisah, tapi tidak termasuk paket ini).
- Tidak menjalankan build/tes di PC Pion, tidak menyentuh database staging, tidak menggabungkan PR.
- Tidak mengubah `MEMORY.md` atau berkas lain selain dokumen rencana ini.
- **Dokumen ini bukan pelaksanaan.** Semua perubahan di §4 masih menunggu keputusan Pion.

---

## 9. Urutan & keputusan yang diminta Pion

1. Pion mengonfirmasi **Opsi A** (disarankan) atau memilih Opsi B.
2. Pion mengonfirmasi ruang lingkup: **hanya scope dukuh** (sesuai kasus Bojongireng), atau sekalian scope ranting.
3. Sebelum menyentuh berkas mana pun, saya **mengulang rencana ini lagi** — perubahan persis, berkas, dan yang tidak dikerjakan — lalu menunggu Pion membenarkan (protokol 23 September 2026).
4. Pengerjaan disarankan **satu PR**: backend + tipe + UI + tes, supaya kontrak `cans`/`canIds` tidak pernah setengah terpasang. Pembuktian lewat GitHub Actions.

---

## 10. Sumber data (bisa diaudit ulang)

- `apps/web/src/app/dashboard/assignments/[id]/page.tsx` — baris 99, 158-168, 315-343, 559-641.
- `apps/web/src/components/assignments/UnassignedQueue.tsx` — seluruh berkas (158 baris).
- `apps/web/src/components/assignments/types.ts` — baris 5-15, 50-56.
- `apps/web/src/components/assignments/useAssignmentWorkQueue.ts` — baris 41-47.
- `apps/web/src/components/assignments/AssignmentConfirmSheet.tsx` — baris 32-38.
- `apps/backend/src/services/assignmentWorkQueueService.ts` — baris 22-30, 233-275, 278-333.
- `apps/backend/src/routes/admin/cans.ts` — baris 22-38; `apps/backend/src/services/canService.ts` — baris 80-102, 169-195.
- `apps/backend/src/services/periodState.ts` — baris 113-126 (`resolveDisplayPeriod`).
- `apps/backend/src/services/__tests__/assignmentWorkQueueService.integration.test.ts` — berkas tes existing.
- `docs/rencana-redesign-halaman-penugasan-2026-10-24.md` — baris 105-122, 303-347, 395-474.

---

Dokumen ini sengaja memisahkan **"sudah diverifikasi"** (§1) dari **"rencana, belum diuji"** (§3–§7). Bila ada keputusan atau angka yang berubah, tambahkan revisi bertanggal; jangan menimpa catatan lama.
