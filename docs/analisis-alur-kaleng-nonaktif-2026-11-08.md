# Analisis Alur Kaleng NON_AKTIF — Backend, Web, dan APK

> **Tanggal analisis:** 8 November 2026
> **Lingkup:** siklus status `NON_AKTIF`, kemunculannya di APK, perilaku offline, tampilan web admin, dan dampaknya ke penugasan/laporan.
> **Sumber aturan utama:** `apps/backend/src/services/conditionRules.ts`
> **Status dokumen:** hasil analisis kode + verifikasi data staging.
>
> **Pembaruan 2026-11-08:** model final sudah diimplementasikan menjadi
> **tugas VISIT bulanan per petugas** (`assignments.kind`). Bagian 4-6 yang
> menjelaskan pool `/mobile/cans/visit-required` adalah perilaku **lama**.
> Lihat `docs/implementasi-kunjungan-nonaktif-2026-11-08.md` untuk model dan
> perubahan kode yang berlaku.

---

## 1. Ringkasan eksekutif

1. Kaleng `NON_AKTIF` **tidak muncul di tab Aktif**. Ia hanya muncul di
   **Tugas → tab Non-Aktif / Perlu Dikunjungi**, yang datanya berasal dari
   `GET /v1/mobile/cans/visit-required`.
2. Syarat muncul: `condition = NON_AKTIF`, berada di **ranting petugas**, dan
   **tidak punya assignment periode aksi berstatus `COMPLETED`**.
3. Jalur normal “6x penjemputan kosong” justru berpotensi membuat kaleng
   **tidak terlihat**: assignment periode berjalan ditutup `COMPLETED` lebih dulu,
   lalu condition diubah menjadi `NON_AKTIF`. Karena `visit-required` membuang
   assignment `COMPLETED`, kaleng itu hilang dari APK sampai periode berganti.
4. Di staging saat analisis **tidak ada satu pun kaleng `NON_AKTIF`**. Yang ada:
   2 `DIKEMBALIKAN`, 3 `RUSAK`, dan 2 `HILANG`, semuanya di PANINGGARAN TIMUR.
5. Web admin **belum punya UI** untuk menjadikan kaleng `NON_AKTIF` maupun
   mengembalikannya ke `AKTIF`. Yang tersedia hanya API dan alur proposal yang
   juga belum punya UI.
6. APK belum punya cache/optimistic update untuk daftar Non-Aktif, dan aksi
   kunjungan dari halaman detail masih **online-only**.

---

## 2. Model status kaleng

Sumber: `apps/backend/src/services/conditionRules.ts`, `apps/backend/src/database/schema.ts`.

| Condition | `is_active` | Cakupan penempatan | Dapat tugas penjemputan | Perlakuan |
|---|---:|---:|---:|---|
| `AKTIF` | `true` | ya | ya | dijemput normal |
| `NON_AKTIF` | `true` | ya | **tidak** | dikunjungi untuk verifikasi |
| `RUSAK` | `true` | tidak | ya | tetap dijemput, ganti unit |
| `HILANG` | `true` | tidak | ya | tetap dijemput, beri unit baru |
| `DIKEMBALIKAN` | `false` | tidak | tidak | keluar dari pelacakan |

Konstanta penting:

```ts
ASSIGNABLE_CONDITIONS   = ['AKTIF', 'RUSAK', 'HILANG']       // NON_AKTIF tidak masuk
PLACEMENT_CONDITIONS    = ['AKTIF', 'NON_AKTIF', 'RUSAK']
ACTION_REQUIRED_CONDITIONS = ['NON_AKTIF', 'RUSAK', 'HILANG']
EMPTY_STREAK_THRESHOLD  = 6
```

`is_active` adalah turunan: `condition !== 'DIKEMBALIKAN'`. Jadi `NON_AKTIF`
selalu `is_active = true`. Tidak ada constraint database yang menegakkan
invariant ini; semuanya dijaga di aplikasi.

Matriks transisi:

```
AKTIF        -> NON_AKTIF | RUSAK | HILANG | DIKEMBALIKAN
NON_AKTIF    -> AKTIF | RUSAK | HILANG | DIKEMBALIKAN
RUSAK        -> AKTIF | NON_AKTIF | HILANG | DIKEMBALIKAN
HILANG       -> AKTIF | NON_AKTIF | RUSAK | DIKEMBALIKAN
DIKEMBALIKAN -> AKTIF (hanya lewat pemasangan unit baru)
```

---

## 3. Bagaimana kaleng menjadi `NON_AKTIF`

### 3.1 Admin mengubah condition langsung (fast lane)

- Endpoint: `PUT /v1/admin/cans/:id` dengan body `{ "condition": "NON_AKTIF" }`.
- Service: `canService.updateCan` (`apps/backend/src/services/canService.ts`).
- Validasi hanya matriks transisi. `condition_reason_code` diterima schema tetapi
  **tidak pernah disimpan atau dipakai**.
- Tidak menulis baris proposal/history kondisi; hanya audit log umum.
- **Web admin tidak menyediakan tombol untuk ini.** Hanya bisa lewat API.

### 3.2 Proposal kondisi disetujui

- Buat: `POST /v1/admin/can-proposals` dengan `to_condition = 'NON_AKTIF'`.
- Setujui: `POST /v1/admin/can-proposals/:id/approve`.
- Service: `conditionProposalService.approveConditionProposal`.
- Approve menulis `cans.condition`, `is_active`, menandai proposal `APPROVED`,
  dan otomatis menolak proposal `PENDING` lain untuk kaleng yang sama.
- **Belum ada UI web** untuk membuat/menyetujui proposal. Mobile hanya bisa
  membaca status proposal, tidak bisa mengajukan.
- Rujukan: `docs/tech debt/debt-approve-nonaktif.md`.

### 3.3 Otomatis setelah 6x penjemputan kosong

- Service: `conditionProposalService.evaluateEmptyStreakForCan`.
- Dipanggil setelah:
  - submit collection mobile (`POST /mobile/collections`),
  - sync batch offline (`POST /mobile/collections/batch`),
  - salinan collection manual admin (`manualCollections.ts`).
- Jika 6 collection terakhir nominalnya 0, condition diubah ke `NON_AKTIF` dan
  proposal `APPROVED` bertanda `triggerSource: 'EMPTY_THRESHOLD'` ditulis.
- **Tidak ada cron/scheduler** untuk condition. Evaluasi hanya terpicu oleh
  adanya submit collection.
- Jika collection terakhir nominalnya > 0 dan condition sedang `NON_AKTIF`,
  jalur ini juga bisa **mengembalikan** ke `AKTIF` (`RESTORED_ACTIVE`), tetapi
  tidak menulis proposal sehingga tidak terhitung di metrik `reactivated`.

---

## 4. Efek terhadap assignment

Saat kaleng berubah menjadi `NON_AKTIF`:

- **Assignment lama tidak ditutup.** Assignment `ACTIVE` tetap `ACTIVE`.
- Generator periode, bulk-branch, bulk-cans, dan persiapan draft **tidak membuat
  assignment baru** untuk `NON_AKTIF`.
- Pengecualian yang tetap bisa membuat/mempertahankan assignment:
  1. `POST /v1/admin/assignments` (assignment manual satu kaleng) **tidak
     memeriksa condition**.
  2. `approveDraft` tidak memeriksa ulang condition — kaleng yang berubah
     `NON_AKTIF` setelah draft dibuat tetap bisa menjadi assignment.
  3. `POST /v1/mobile/cans/:canId/ensure-assignment` sengaja membuat assignment
     on-demand saat petugas menekan **Kaleng Isi**.
  4. `PUT /admin/assignments/:id` dan transfer assignment juga tidak memeriksa
     condition.
- Jadi kaleng `NON_AKTIF` **bisa** memiliki assignment `ACTIVE`, `UNCOLLECTED`,
  atau `COMPLETED`.

Konsekuensi penting:

- `NON_AKTIF` dengan assignment `ACTIVE` tetap muncul di `GET /mobile/tasks`,
  tetapi tab Aktif APK membuangnya; ia juga muncul di `visit-required`.
- `NON_AKTIF` dengan assignment `COMPLETED` **tidak muncul di kedua tempat**
  (lihat §6.1).

---

## 5. Alur munculnya di APK

### 5.1 Diagram

```
condition = NON_AKTIF
        │
        ▼
GET /v1/mobile/cans/visit-required
  filter: branch petugas + condition NON_AKTIF
  buang: assignment periode aksi berstatus COMPLETED
        │
        ▼
Tugas → tab "Non-Aktif" / "Perlu Dikunjungi"
        │
        ▼
Kartu TaskItem badge "Nonaktif"
        │
        ▼
Tap → Detail → aksi kunjungan
```

### 5.2 Sumber data dan scope

- Endpoint: `GET /v1/mobile/cans/visit-required`
  (`apps/backend/src/routes/mobile/tasks.ts`).
- Scope: **seluruh kaleng `NON_AKTIF` di ranting petugas** (`cans.branch_id =
  officer.branch_id`). Bukan per Dukuh, bukan hanya yang pernah ditugaskan ke
  petugas tersebut. Semua petugas dalam satu ranting melihat daftar yang sama.
- Tidak ada pagination/limit. Semua kaleng `NON_AKTIF` di ranting dimuat.
- Data yang dikirim per item: `condition`, `is_active`, `assignment_id`,
  `assignment_status`, `last_visit*`, dan field alamat (Dukuh/RT/RW).
- Backend membuang item dengan `assignment_status === 'COMPLETED'`.
- Assignment yang dipakai adalah assignment pada **display period** (periode
  aksi), bukan bulan kalender.

### 5.3 Mapping ke kartu

Di `apps/mobile/src/screens/TasksScreen.tsx`, `VisitTask` dipetakan menjadi
`Task` untuk ditampilkan:

- `id`: `assignment_id` asli bila ada; jika tidak, `visit-<can_id>` (sintetis).
- `is_visit_task: true`
- `condition: 'NON_AKTIF'` (hard-coded, bukan dari response)
- `status: 'ACTIVE'`
- `period: ''` → chip periode kosong
- `owner_phone: ''` → nomor HP tampil `-`

Tab Aktif secara eksplisit membuang semua task dengan `condition ===
'NON_AKTIF'`. Jadi kaleng NON_AKTIF tidak pernah muncul di tab Aktif.

### 5.4 Aksi di APK dan efeknya

| Tombol APK | Endpoint | Efek server | Setelah aksi |
|---|---|---|---|
| **Kaleng Isi** | `POST /mobile/collections` dengan `visit_outcome: 'ISI'` (via CollectionScreen) | condition berubah ke `AKTIF`/`RUSAK`/`HILANG` pilihan petugas; collection dibuat; assignment selesai | **hilang** dari Non-Aktif |
| **Kaleng Kosong** | `POST /mobile/cans/:canId/visits` `{outcome:'KOSONG'}` | tetap `NON_AKTIF`, visit dicatat | **tetap** di daftar |
| **Kaleng Dikembalikan** | `POST /mobile/cans/:canId/visits` `{outcome:'DIKEMBALIKAN'}` | condition → `DIKEMBALIKAN`, `is_active=false`, semua assignment `ACTIVE` (semua periode) → `COMPLETED` | **hilang** dari daftar |
| **Tidak Dikunjungi** | `POST /mobile/cans/:canId/visits` `{outcome:'TIDAK_DIKUNJUNGI'}` | tetap `NON_AKTIF`, visit dicatat | **tetap** di daftar |
| **Tidak Dijemput** | khusus tugas biasa | assignment → `UNCOLLECTED` | bukan alur NON_AKTIF |

Catatan:

- `POST /mobile/cans/:canId/visits-filled` ada di backend, tetapi **tidak dipakai
  APK**. APK memakai jalur collection biasa + `visit_outcome: 'ISI'`.
- Untuk kaleng NON_AKTIF yang belum punya assignment, CollectionScreen memanggil
  `POST /mobile/cans/:canId/ensure-assignment` sebelum mengirim collection.
- `pending_return_visit_id` dikirim backend untuk tugas biasa, tetapi **tidak
  dipakai APK**. Tidak ada badge “menunggu penerimaan admin”.

### 5.5 Pintu masuk lain

- **Beranda:** `GET /mobile/dashboard` mengirim `visit_tasks`, tetapi tidak ada
  layar APK yang merendernya. Dashboard hanya menampilkan statistik.
- **Scan QR:** bukan pintu masuk normal. Kaleng NON_AKTIF biasanya tidak punya
  assignment → `GET /mobile/scan/:qr` menjawab `403 QR_NOT_ASSIGNED`. Response
  scan juga tidak membawa field `condition`, sehingga blok aksi NON_AKTIF di
  `ScanResultCard` praktis hanya bisa tercapai dari cache offline.

---

## 6. Kapan kaleng `NON_AKTIF` TIDAK muncul di APK

### 6.1 Punya assignment `COMPLETED` di periode aksi — dampak paling besar

`visit-required` membuang kaleng dengan `assignment_status = COMPLETED`.
Tab Aktif juga membuang `NON_AKTIF`. Hasilnya:

> Kaleng ada, butuh kunjungan, tetapi **tidak muncul di mana pun di APK**.

Ini bisa terjadi dari jalur 6x kosong: pada collection ke-6, `submitCollection`
menutup assignment menjadi `COMPLETED`, lalu `evaluateEmptyStreakForCan`
mengubah condition menjadi `NON_AKTIF` dalam transaksi yang sama. Kaleng itu
langsung tersaring dari `visit-required` sampai periode aksi berganti.

Contoh nyata di staging (periode aksi 2026-10):

- `bojong baru` (`LAZ-PNG-08-00011-868`) belum punya assignment → jika
  dijadikan NON_AKTIF, **akan muncul**.
- `bojong 5` (`LAZ-PNG-08-00010-282`) punya assignment `COMPLETED` 2026-10 →
  jika dijadikan NON_AKTIF sekarang, **tidak akan muncul** sampai periode
  berikutnya.

### 6.2 Offline / cold start

Daftar `visit-required` **tidak di-cache** di MMKV. Jika APK dibuka tanpa
internet, tab Non-Aktif kosong dan menampilkan “Tidak ada kaleng non-aktif”.

### 6.3 Fetch gagal

Error `getVisitRequired` ditelan (`catch {}`), tanpa tombol retry khusus. UI
hanya menampilkan empty state.

### 6.4 Di luar ranting petugas

Scope hanya `cans.branch_id = officer.branch_id`. Kaleng NON_AKTIF di ranting
lain tidak akan muncul.

### 6.5 Filter pencarian aktif

Kotak pencarian di tab Non-Aktif memakai query yang sama dengan tab Aktif.
Jika query tidak cocok, kartu hilang dan empty state tetap berbunyi “Tidak ada
kaleng non-aktif”.

### 6.6 Assignment `UNCOLLECTED`

Kartu masih muncul, tetapi tombol **Kaleng Isi** diblokir karena
`visitAlreadyCollectedThisPeriod` menganggap semua status selain `ACTIVE`
sebagai “sudah dijemput”. Padahal `UNCOLLECTED` berarti belum dijemput.

### 6.7 Assignment ganda / beda petugas

Query assignment di `visit-required` tidak memfilter `officerId`, lalu
di-collapse per `canId` dengan “baris terakhir menang”. Jika ada beberapa
assignment, status dan `assignment_id` yang ditampilkan bisa bukan milik
petugas yang login → submit bisa gagal `ASSIGNMENT_INVALID`.

### 6.8 Scan QR

Karena NON_AKTIF normalnya tanpa assignment, scan online menghasilkan 403.
Petugas tidak bisa memulai kunjungan dari kamera; harus dari tab Non-Aktif.

---

## 7. Perilaku offline

| Aksi | Offline? | Catatan |
|---|---|---|
| Kunjungan dari **ScanScreen** | Ya | Masuk `actionQueue` (`kind:'VISIT'`), replay saat online |
| Kunjungan dari **TaskDetailScreen** | **Tidak** | Langsung panggil API; offline hanya muncul alert gagal |
| **Kaleng Isi** (nominal) | Ya | Masuk `offlineQueue`; sync membuat assignment on-demand bila perlu |
| Daftar Non-Aktif | **Tidak di-cache** | Restart APK saat offline = daftar kosong |
| Optimistic removal | Tidak ada | Kartu tetap tampil sampai fetch ulang |
| Refresh setelah sync | Tidak | `triggerSync` tidak memanggil `getVisitRequired`; baru refresh saat tab difokuskan |

Aksi `VISIT` yang gagal permanen akan dibuang; yang sementara akan di-retry
maksimal 3 kali. Tidak ada tampilan riwayat kunjungan offline.

---

## 8. Tampilan web admin dan laporan

### 8.1 Kelola Kaleng

- Default filter halaman adalah `AKTIF`; ada filter `NON-AKTIF` di dropdown.
- **Tidak ada tombol** untuk mengubah condition menjadi `NON_AKTIF` atau
  mengembalikannya ke `AKTIF`.
- Tombol “Aktifkan Kembali” hanya muncul untuk `is_active = false` (yaitu
  `DIKEMBALIKAN`), sehingga tidak bisa dipakai untuk `NON_AKTIF`.
- Edit modal hanya mengubah data pemilik/alamat; tidak ada field condition.
- Admin **tidak bisa melihat petugas mana yang mengunjungi** kaleng NON_AKTIF
  dari daftar. Detail kunjungan tersedia di API `GET /admin/cans/:id`, tetapi
  web tidak memanggilnya.

### 8.2 Region card dan work queue

- Region card: `total` mencakup NON_AKTIF; `assignableCans` tidak; ada badge
  `non-aktif`.
- Angka “belum ditugaskan” dihitung dari `total − assignmentTotal`, sehingga
  NON_AKTIF ikut terlihat sebagai “belum” — bisa terasa dobel dengan badge
  `non-aktif`.
- Work queue penugasan membuang NON_AKTIF. Dukuh yang isinya hanya NON_AKTIF
  tidak muncul sebagai grup; hanya `summary.nonAssignableCans` yang tersisa.

### 8.3 Laporan

- Collection dari kaleng NON_AKTIF tetap dihitung di laporan (tidak ada filter
  condition).
- Overview menghitung `condition_breakdown` termasuk NON_AKTIF.
- `assignable` mengecualikan NON_AKTIF.
- `action_required` dihitung backend, tetapi tidak dirender di web.
- Metrik `reactivated` hanya menghitung proposal `APPROVED`; restore otomatis
  dan fast-path `PUT` tidak menulis proposal sehingga under-count.

### 8.4 Penerimaan kaleng dikembalikan

- Endpoint `POST /admin/cans/:id/return-receipt` ada di backend.
- **Belum ada UI** dan belum ada dokumentasi API.
- Endpoint ini **tidak memeriksa scope** branch/district; admin ranting mana pun
  bisa menerima pengembalian kaleng di ranting lain.

---

## 9. Data staging saat analisis

Periode aksi: **2026-10** (`period_calendar` OPEN, toleransi sampai 2026-11-09).

Rekap kondisi:

| Ranting | AKTIF | RUSAK | HILANG | DIKEMBALIKAN | NON_AKTIF |
|---|---:|---:|---:|---:|---:|
| BOTOSARI | 2 | 0 | 0 | 0 | 0 |
| DOMIYANG | 1 | 0 | 0 | 0 | 0 |
| KALIOMBO | 2 | 0 | 0 | 0 | 0 |
| KOTAK TAQWA | 64 | 0 | 0 | 0 | 0 |
| LAMBANGGELUN | 11 | 0 | 0 | 0 | 0 |
| PANIGGARAN BARAT | 1 | 0 | 0 | 0 | 0 |
| PANINGGARAN TIMUR | 11 | 3 | 2 | 2 | 0 |
| SAWANGAN | 2 | 0 | 0 | 0 | 0 |

Lambanggelun:

- 10 kaleng punya assignment 2026-10:
  - 7 `ACTIVE`
  - 1 `UNCOLLECTED` (`bojong tidak dijemput`)
  - 1 `COMPLETED` (`bojong 5`)
- 1 kaleng belum punya assignment: `bojong baru`
  (`LAZ-PNG-08-00011-868`).

---

## 10. Resep uji di staging

1. Ambil admin token.
2. Ubah `bojong baru`
   (`214c868b-fc03-4c4f-8723-3fb02e5ce9f7`) menjadi NON_AKTIF:

   ```http
   PUT /v1/admin/cans/214c868b-fc03-4c4f-8723-3fb02e5ce9f7
   Content-Type: application/json

   { "condition": "NON_AKTIF" }
   ```

3. Login APK sebagai `PPK TAMBAH BARU` (Lambanggelun).
4. Buka **Tugas → Non-Aktif**, tarik refresh. Kartu “bojong baru” harus muncul.
5. Untuk membuktikan lubang §6.1, ubah `bojong 5`
   (`52fbef63-b3c8-43d4-87a9-54f85edd0d92`, assignment `COMPLETED`) menjadi
   NON_AKTIF. Kartu itu **tidak akan muncul** sampai periode berganti.

Catatan: mengubah condition lewat API tidak menulis proposal/alasan; hanya audit
log. Untuk pengujian, ini cukup. Untuk operasional, gunakan alur yang disetujui.

---

## 11. Temuan dan gap

| # | Temuan | Dampak | Prioritas |
|---|---|---|---|
| 1 | `visit-required` membuang NON_AKTIF yang assignment periode aksinya `COMPLETED` | Kaleng hilang dari seluruh APK; bisa terjadi dari jalur 6x kosong | **Kritis** |
| 2 | Daftar NON_AKTIF tidak di-cache dan tidak ada optimistic update | Tab kosong saat offline; kartu tetap tampil setelah aksi offline | **Tinggi** |
| 3 | Aksi kunjungan di TaskDetailScreen online-only, berbeda dari ScanScreen | Petugas kehilangan aksi saat offline | **Tinggi** |
| 4 | Web tidak punya UI set/restore NON_AKTIF | Operasional bergantung pada API/proposal yang juga tanpa UI | **Tinggi** |
| 5 | Assignment manual dan approveDraft tidak memeriksa condition | NON_AKTIF bisa mendapat tugas penjemputan | **Tinggi** |
| 6 | `visitAlreadyCollectedThisPeriod` memblokir `UNCOLLECTED` | “Kaleng Isi” tidak bisa dipakai meski belum dijemput | Sedang |
| 7 | Assignment lookup `visit-required` mengabaikan `officerId`, last-row-wins | Status/assignment_id bisa salah; submit gagal | Sedang |
| 8 | `pending_return_visit_id` tidak dipakai APK | Tidak ada status “menunggu penerimaan admin” | Sedang |
| 9 | `return-receipt` tanpa UI dan tanpa scope check | Risiko operasional/keamanan | Sedang |
| 10 | Dashboard menghitung “kunjungan selesai” dari visit mana pun | Siklus NON_AKTIF baru bisa langsung dianggap selesai | Sedang |
| 11 | `DIKEMBALIKAN` menutup semua assignment ACTIVE semua periode tanpa `completedAt` | Riwayat/statistik periode tidak akurat | Sedang |
| 12 | Tidak ada constraint DB untuk `is_active` vs `condition` | Data bisa tidak konsisten | Rendah |
| 13 | Fast-path admin tidak menyimpan alasan perubahan condition | Audit tidak lengkap | Rendah |
| 14 | Riwayat mobile tidak menampilkan outcome kunjungan | Petugas tidak bisa menelusuri kunjungan | Rendah |
| 15 | Badge sync tidak menghitung aksi kunjungan | Pekerjaan tertunda tidak terlihat | Rendah |

---

## 12. Rekomendasi

### Prioritas 0 — perbaiki agar kaleng tidak hilang

1. **Ubah dasar filter `visit-required`.** Jangan buang kaleng hanya karena
   assignment `COMPLETED`. Gunakan siklus kunjungan: tampilkan kaleng
   `NON_AKTIF` yang belum memiliki visit setelah condition berubah, atau yang
   visit terakhirnya bukan `ISI`/`DIKEMBALIKAN` pada siklus berjalan.
2. **Tutup/realokasi assignment saat condition berubah menjadi NON_AKTIF** bila
   keputusan produknya adalah assignment periode berjalan tidak boleh lagi
   menjadi tugas penjemputan.
3. Tambahkan regression test untuk kasus “6x kosong → NON_AKTIF → tetap muncul
   di visit-required”.

### Prioritas 1 — konsistensi operasional

4. Cache daftar `visit-required` di MMKV + optimistic removal + refresh setelah
   sync.
5. Samakan perilaku offline TaskDetailScreen dengan ScanScreen (queue `VISIT`).
6. Tambah UI web untuk set/restore `NON_AKTIF` dan penerimaan `DIKEMBALIKAN`.
7. Tambah validasi condition pada assignment manual, update/transfer assignment,
   dan `approveDraft`.

### Prioritas 2 — kualitas data dan riwayat

8. Tampilkan `pending_return_visit_id` dan outcome kunjungan di Riwayat.
9. Perbaiki hitungan “kunjungan selesai” dashboard agar per siklus.
10. Isi `completedAt` saat menutup assignment karena `DIKEMBALIKAN`; batasi ke
    periode yang relevan.
11. Tambah scope check pada `return-receipt`.
12. Simpan alasan perubahan condition pada fast-path admin.
13. Tambah constraint/check database untuk `is_active` vs `condition`.

---

## 13. Pertanyaan keputusan produk

1. Apakah kaleng NON_AKTIF yang sudah punya assignment `COMPLETED` pada periode
   berjalan harus tetap bisa dikunjungi pada periode yang sama? (Rekomendasi: ya.)
2. Apakah semua petugas dalam satu ranting boleh mengunjungi semua kaleng
   NON_AKTIF, atau seharusnya dibatasi per Dukuh/petugas?
3. Apakah kunjungan `KOSONG` / `TIDAK_DIKUNJUNGI` boleh diulang berkali-kali
   dalam satu periode, atau perlu batas satu kali per periode?
4. Apakah `RUSAK`/`HILANG` yang 6x kosong boleh otomatis turun menjadi
   NON_AKTIF? Saat ini ya, sehingga label tindakan “ganti unit/beri unit baru”
   bisa hilang.

---

## 14. Peta file untuk dipelajari

### Backend

| File | Isi |
|---|---|
| `apps/backend/src/services/conditionRules.ts` | Sumber aturan condition, transisi, outcome kunjungan, label |
| `apps/backend/src/services/conditionProposalService.ts` | Proposal, approve/reject, evaluasi 6x kosong |
| `apps/backend/src/services/canService.ts` | CRUD kaleng, filter status, update condition |
| `apps/backend/src/services/collectionSubmission.ts` | Submit collection, penutupan assignment, perubahan condition |
| `apps/backend/src/routes/mobile/tasks.ts` | `visit-required`, `/tasks`, `/scan`, `/visits`, `ensure-assignment` |
| `apps/backend/src/routes/mobile/collections.ts` | Submit collection + evaluasi empty streak |
| `apps/backend/src/services/mobileSyncService.ts` | Sync offline, assignment on-demand untuk kunjungan |
| `apps/backend/src/routes/admin/cans.ts` | Fast lane admin, `return-receipt` |
| `apps/backend/src/services/regionCardService.ts` | Agregasi kartu wilayah |
| `apps/backend/src/services/assignmentWorkQueueService.ts` | Work queue penugasan |

### Mobile

| File | Isi |
|---|---|
| `apps/mobile/src/screens/TasksScreen.tsx` | Tab Aktif/Non-Aktif, fetch `visit-required`, mapping kartu |
| `apps/mobile/src/screens/TaskDetailScreen.tsx` | Aksi kunjungan dari detail |
| `apps/mobile/src/screens/scan/ScanScreen.tsx` | Aksi kunjungan dari scan + queue offline |
| `apps/mobile/src/screens/scan/ScanResultCard.tsx` | Blok tombol NON_AKTIF |
| `apps/mobile/src/screens/CollectionScreen.tsx` | Kaleng Isi, `ensure-assignment`, submit collection |
| `apps/mobile/src/stores/useCollectionStore.ts` | Queue collection offline, optimistic update |
| `apps/mobile/src/services/offline/actionQueue.ts` | Antrean aksi kunjungan |
| `apps/mobile/src/services/offline/queue.ts` | Antrean collection offline |
| `apps/mobile/src/services/offline/sync.ts` | Replay aksi kunjungan dan collection |
| `apps/mobile/src/utils/taskSearch.ts` | Pencarian kartu (termasuk Dukuh/RT/RW) |

### Web

| File | Isi |
|---|---|
| `apps/web/src/app/dashboard/cans/[id]/page.tsx` | Tabel kaleng, filter status, aksi reactivate/withdraw |
| `apps/web/src/components/region/RegionCards.tsx` | Badge non-aktif dan angka kartu wilayah |
| `apps/web/src/app/dashboard/overview/page.tsx` | Breakdown kondisi |

### Dokumen terkait

- `docs/rancangan-skema-status-kaleng-2026-09-12.md`
- `docs/audit/rancangan-skema-status-kaleng-2026-09-12.md`
- `docs/tech debt/debt-approve-nonaktif.md`
- `docs/audit/rencana-implementasi-overview-kaleng/04-integrasi-status-dan-operasional.md`
- `docs/audit/checklist-uji-mobile-staging-2026-09-18.md`
- `docs/periode-berbasis-aksi-2026-11-03.md`
