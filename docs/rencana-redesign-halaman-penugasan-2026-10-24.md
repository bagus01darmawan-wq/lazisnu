# Rencana Redesign Halaman Penugasan

**Tanggal:** 2026-10-24  
**Status:** Diimplementasikan (backend + web)  
**Cakupan:** Web dashboard `/dashboard/assignments` dan `/dashboard/assignments/[id]`  
**Sumber:** Hasil tinjauan halaman penugasan saat ini + rancangan desktop + rancangan mobile/komponen/endpoint

---

## 1. Ringkasan

Halaman penugasan saat ini lebih berfungsi sebagai **ledger/monitoring penugasan** daripada **ruang kerja untuk mengatur penugasan**. Porsi terbesar halaman diisi tabel per kaleng dengan periode, status, transfer, dan hapus. Aksi utama `Tugaskan Petugas` hanya berupa tombol kecil di kanan atas dan seluruh prosesnya berada di dalam modal.

Redesign ini mengubah fokus halaman menjadi:

1. **Apa yang belum ditugaskan?**
2. **Siapa petugas yang tersedia dan bagaimana bebannya?**
3. **Bagaimana menugaskan wilayah tersebut secepat mungkin?**

Riwayat tetap tersedia, tetapi dipindahkan menjadi tab sekunder.

---

## 2. Diagnosis Halaman Saat Ini

### 2.1 Bukti orientasi riwayat

- Halaman index menulis: “Pilih wilayah untuk **melihat** penugasan”, bukan “mengelola penugasan”.
- Area utama halaman detail adalah tabel per kaleng dengan kolom:
  - pemilik/kaleng,
  - dukuh/RT/RW,
  - petugas,
  - periode,
  - status (`ASSIGNED`, `SELESAI`, `RE-ASSIGN`, `TERLEWAT`),
  - aksi transfer/hapus.
- Filter utama adalah periode dan pencarian. Tidak ada filter atau ringkasan “belum ditugaskan”.
- Baris tabel dipilih untuk `Re-Assign` atau `Hapus`. Ini operasi koreksi terhadap penugasan yang sudah ada, bukan perencanaan.
- Daftar dukuh yang belum ditugaskan baru diambil saat modal dibuka (`filter_assigned: true`), sehingga tidak terlihat di halaman utama.
- Unit kerja tabel adalah kaleng, padahal keputusan penugasan lebih natural dilakukan per dukuh/wilayah dan per petugas.

### 2.2 Kesimpulan diagnosis

Fungsi penugasan tidak hilang, tetapi menjadi fitur sekunder. Halaman saat ini menjawab:

> “Apa yang sudah ditugaskan bulan ini?”

Halaman seharusnya menjawab:

> “Apa yang belum ditugaskan, ke siapa, dan berapa cakupannya?”

---

## 3. Prinsip Desain

- Halaman detail adalah **ruang kerja penugasan**, bukan ledger.
- Pertanyaan pertama yang harus terjawab: **“Apa yang belum ditugaskan?”**
- Riwayat tetap ada, tetapi menjadi **tab sekunder**.
- Unit keputusan utama adalah **dukuh/wilayah**, bukan kaleng satu per satu.
- Aksi utama: pilih wilayah -> pilih petugas -> konfirmasi.
- Angka yang ditampilkan harus konsisten dengan aturan backend `bulk-branch`.
- Admin ranting tidak boleh melihat atau memilih branch lain.
- Setelah assign berhasil, queue dan coverage harus langsung berubah tanpa reload penuh.

---

## 4. Information Architecture

```text
/dashboard/assignments
└─ Kartu wilayah (tetap)
   └─ /dashboard/assignments/[id]
      ├─ Tab "Kelola"        <- default, fokus penugasan
      │  ├─ Header + periode + coverage
      │  ├─ Queue dukuh belum ditugaskan
      │  ├─ Panel petugas + beban kerja
      │  └─ Sticky action bar + konfirmasi
      └─ Tab "Riwayat"       <- tabel per kaleng yang sekarang
         ├─ Search + filter status/petugas
         ├─ Transfer / re-assign / hapus
         └─ Pagination
```

### 4.1 Perubahan halaman index

Halaman index tetap memakai kartu wilayah karena sudah menampilkan `unassigned`, `completed`, dan daftar petugas. Yang berubah:

- Copy: dari “Pilih wilayah untuk **melihat** penugasan” menjadi “Pilih wilayah untuk **mengelola** penugasan”.
- Angka utama kartu sebaiknya **belum ditugaskan**, bukan jumlah penugasan.
- Progres kartu sebaiknya **assigned/assignable**, bukan `completed/assignmentTotal`.
- CTA kartu diarahkan ke pengelolaan, bukan hanya melihat detail.

---

## 5. Rancangan Desktop / IA

### 5.1 Wireframe Tab “Kelola”

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ ←  PANINGGARAN TIMUR                                  [Oktober 2026 ▾]   │
│    Kelola penugasan · 128 kaleng · 4 petugas                             │
├──────────────────────────────────────────────────────────────────────────┤
│  [ Kelola ]  [ Riwayat ]                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│  128 kaleng    96 ditugaskan    32 belum    3 dukuh tersisa              │
│  ███████████████████████████░░░░░░  75% coverage                         │
├───────────────────────────────────────────────────┬──────────────────────┤
│  BELUM DITUGASKAN (32)             [Pilih semua]  │  PETUGAS             │
│                                                   │  ● Lulu  42 tugas    │
│  ☐  Dukuh A        12 belum   ██████░░  8/20      │    selesai 30        │
│  ☐  Dukuh B         8 belum   ██░░░░░░  0/8       │  ○  ...              │
│  ☐  Dukuh C        12 belum   ████░░░░  4/16      │                      │
│                                                   │  Beban petugas       │
│  ─────────────────────────────────────────────    │  ...                 │
│  [ Tugaskan 32 kaleng ke  (Pilih petugas ▾) ]     │                      │
├───────────────────────────────────────────────────┴──────────────────────┤
│  Penugasan bulan ini oleh petugas                  [Lihat riwayat →]    │
│  Lulu 42 · 30 selesai · 12 berjalan · 0 terlewat                        │
└──────────────────────────────────────────────────────────────────────────┘
```

Untuk `regionKind = dukuh`, baris queue berubah menjadi RT/RW atau pemilik kaleng, karena dukuh sudah dipilih dari halaman kartu.

### 5.2 Wireframe Tab “Riwayat”

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ ←  PANINGGARAN TIMUR                                  [Oktober 2026 ▾]   │
│    Riwayat penugasan                                                     │
├──────────────────────────────────────────────────────────────────────────┤
│  [ Kelola ]  [ Riwayat ]                                                 │
├──────────────────────────────────────────────────────────────────────────┤
│  [ Cari pemilik / QR / petugas ]   [Status ▾]   [Petugas ▾]             │
├──────────────────────────────────────────────────────────────────────────┤
│  Pemilik/Kaleng        Dukuh        Petugas      Periode      Status     │
│  Budi Santoso          Dukuh A      Lulu         Okt 2026     ASSIGNED   │
│  #QR-001 · RT 2/RW 1                                                     │
│                                                    [Transfer] [Hapus]   │
├──────────────────────────────────────────────────────────────────────────┤
│  Menampilkan 10 dari 96                                    ‹ 1/10 ›     │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Alur utama

1. Admin membuka wilayah.
2. Langsung melihat ringkasan coverage dan daftar dukuh yang belum tertangani.
3. Centang satu/beberapa dukuh, atau “Pilih semua”.
4. Pilih petugas dari panel kanan/dropdown.
5. Muncul action bar: `Tugaskan 32 kaleng ke Lulu`.
6. Konfirmasi menampilkan ringkasan:
   - wilayah,
   - periode,
   - dukuh terpilih,
   - jumlah kaleng,
   - petugas tujuan.
7. Setelah sukses: toast, queue berkurang, coverage berubah tanpa reload penuh.
8. Jika semua selesai: empty state “Semua kaleng sudah ditugaskan” + tombol `Lihat riwayat` / `Ganti periode`.

---

## 6. Rancangan Mobile

Asumsi:

- Lebar 360–430px.
- Bottom sheet untuk pemilih petugas dan konfirmasi.
- Tabel riwayat berubah menjadi kartu agar tidak horizontal-scroll.
- Action bar menempel di bawah dengan safe-area inset.

### 6.1 Frame 1 — Tab “Kelola” (default)

```text
┌──────────────────────────────────────────┐
│ ←  PANINGGARAN TIMUR        [Okt 2026 ▾] │
│    Kelola penugasan                      │
├──────────────────────────────────────────┤
│  [ Kelola ]   [ Riwayat ]                │
├──────────────────────────────────────────┤
│  124 dapat ditugaskan                    │
│  96 sudah · 28 belum                     │
│  3 dukuh tersisa · 4 petugas             │
│  ███████████████████░░░░  77%            │
├──────────────────────────────────────────┤
│  BELUM DITUGASKAN (28)      [Pilih semua]│
│                                          │
│  ☐ Dukuh A          12 belum    8/20     │
│    ██████░░░░░░░░                        │
│  ☐ Dukuh B           8 belum    0/8      │
│    ░░░░░░░░░░░░░░                        │
│  ☐ Dukuh C           8 belum    4/12     │
│    ████░░░░░░░░░░                        │
│                                          │
│  (scroll)                                │
├──────────────────────────────────────────┤
│  Pilih dukuh untuk mulai menugaskan      │
│  [ Tugaskan ]  (disabled)                │
└──────────────────────────────────────────┘
```

### 6.2 Frame 2 — Ada dukuh terpilih

```text
┌──────────────────────────────────────────┐
│  ...ringkasan tetap terlihat...          │
├──────────────────────────────────────────┤
│  ☑ Dukuh A          12 belum    8/20     │
│  ☑ Dukuh B           8 belum    0/8      │
│  ☐ Dukuh C           8 belum    4/12     │
│                                          │
│  (scroll)                                │
├──────────────────────────────────────────┤
│  20 kaleng · 2 dukuh                     │
│  Petugas: [ Lulu · 42 tugas        ▾ ]   │
│  [ Tugaskan 20 Kaleng ]                  │
└──────────────────────────────────────────┘
```

### 6.3 Frame 3 — Bottom sheet pilih petugas

```text
┌──────────────────────────────────────────┐
│  Pilih Petugas                    [X]    │
├──────────────────────────────────────────┤
│  ◉ Lulu        42 tugas · 30 selesai     │
│  ○ Ahmad       18 tugas · 12 selesai     │
│  ○ Siti        27 tugas · 20 selesai     │
│                                          │
│  Petugas non-aktif tidak ditampilkan.    │
├──────────────────────────────────────────┤
│  [ Simpan Pilihan ]                      │
└──────────────────────────────────────────┘
```

### 6.4 Frame 4 — Konfirmasi penugasan

```text
┌──────────────────────────────────────────┐
│  Konfirmasi Penugasan             [X]    │
├──────────────────────────────────────────┤
│  Wilayah   Paninggaran Timur             │
│  Periode   Oktober 2026                  │
│  Dukuh     2 dipilih                     │
│  Kaleng    20                            │
│  Petugas   Lulu                          │
│                                          │
│  Kaleng yang sudah punya jadwal bulan    │
│  ini tidak akan ditugaskan ulang.        │
├──────────────────────────────────────────┤
│  [ Batal ]        [ Tugaskan 20 Kaleng ] │
└──────────────────────────────────────────┘
```

### 6.5 Frame 5 — Tab “Riwayat”

```text
┌──────────────────────────────────────────┐
│ ←  PANINGGARAN TIMUR        [Okt 2026 ▾] │
│    Riwayat penugasan                     │
├──────────────────────────────────────────┤
│  [ Kelola ]   [ Riwayat ]                │
├──────────────────────────────────────────┤
│  [ Cari pemilik / QR / petugas       ]   │
│  [ Status ▾ ]  [ Petugas ▾ ]             │
├──────────────────────────────────────────┤
│  Budi Santoso              ASSIGNED      │
│  #QR-001 · Dukuh A · RT 2/RW 1           │
│  Petugas: Lulu · Okt 2026                │
│  [ Transfer ]  [ Hapus ]                 │
├──────────────────────────────────────────┤
│  Siti Aminah               SELESAI       │
│  #QR-002 · Dukuh B · RT 1/RW 3           │
│  Petugas: Ahmad · Okt 2026               │
│  [ Transfer ]  [ Hapus ]                 │
├──────────────────────────────────────────┤
│  Menampilkan 10 dari 96      ‹ 1/10 ›    │
└──────────────────────────────────────────┘
```

### 6.6 Frame 6 — Empty state semua sudah ditugaskan

```text
┌──────────────────────────────────────────┐
│                                          │
│  ✓ Semua sudah ditugaskan                │
│                                          │
│  124 kaleng di Paninggaran Timur sudah   │
│  punya petugas untuk Oktober 2026.       │
│                                          │
│  [ Lihat Riwayat ]  [ Ganti Periode ]    │
│                                          │
└──────────────────────────────────────────┘
```

Empty state lain:

- **Belum ada petugas aktif:** `Belum ada petugas aktif` + tombol `Buka Data Petugas`.
- **Belum ada kaleng:** `Belum ada kaleng terdaftar` + tombol `Buka Kelola Kaleng`.
- **Ranting tanpa data dukuh:** fallback ke daftar pemilik/kaleng.

---

## 7. Component Tree

```text
AssignmentsDetailPage
├─ AssignmentHeader
│  ├─ BackButton
│  ├─ RegionTitle
│  └─ PeriodPicker
├─ AssignmentTabs
├─ AssignmentCoverage
├─ Tab Kelola
│  ├─ UnassignedQueue
│  │  ├─ QueueToolbar (Pilih semua)
│  │  └─ UnassignedGroupRow[]
│  ├─ AssignmentActionBar
│  │  └─ OfficerPickerButton
│  └─ AssignmentConfirmSheet
├─ Tab Riwayat
│  ├─ HistoryFilters
│  ├─ AssignmentHistoryCard[]  (mobile)
│  ├─ Table                      (desktop)
│  └─ Pagination
├─ OfficerPickerSheet
└─ AssignmentEmptyState
```

---

## 8. Rincian Komponen

| Komponen | Tanggung jawab | Props utama |
|---|---|---|
| `AssignmentsDetailPage` | Orkestrasi tab, periode, fetch, selection, submit | `params`, `searchParams` |
| `AssignmentHeader` | Back, judul wilayah, periode | `region`, `period`, `onPeriodChange`, `onBack` |
| `AssignmentTabs` | Tab `Kelola`/`Riwayat`, aksesibel | `activeTab`, `onChange` |
| `AssignmentCoverage` | Ringkasan coverage + progress | `summary`, `loading` |
| `UnassignedQueue` | Daftar grup yang belum ditugaskan | `groups`, `selectedIds`, `onToggle`, `onToggleAll`, `loading`, `onRetry` |
| `UnassignedGroupRow` | Satu dukuh/RT, checkbox, angka belum | `group`, `selected`, `onToggle` |
| `AssignmentActionBar` | Sticky action: jumlah, petugas, CTA | `selectedGroups`, `officers`, `selectedOfficerId`, `onOfficerChange`, `onSubmit`, `submitting` |
| `OfficerPickerSheet` | Bottom sheet pilih petugas + beban | `open`, `officers`, `selectedId`, `onSelect`, `onClose` |
| `AssignmentConfirmSheet` | Ringkasan sebelum submit | `open`, `summary`, `onConfirm`, `onClose`, `submitting` |
| `HistoryFilters` | Search, status, petugas | `filters`, `onChange` |
| `AssignmentHistoryCard` | Kartu riwayat mobile | `item`, `onTransfer`, `onDelete`, `canDelete` |
| `AssignmentEmptyState` | Empty/error/no-officer | `variant`, `onAction` |
| `useAssignmentWorkQueue` | Fetch/cache/refetch work queue | `regionId`, `period` |

Komponen existing yang dipakai ulang:

- `PeriodPicker`
- `GlassSelect` untuk filter desktop
- `Modal` sebagai basis bottom sheet
- `Table` untuk desktop riwayat
- `Card`, `Badge`, `Button`, `Skeleton`, `EmptyState`
- `ConfirmToast` untuk hapus/transfer

Komponen baru yang disarankan:

- `BottomSheet` generik: focus trap, overlay, safe-area bottom.
- `AssignmentHistoryCard` untuk mobile.
- `StickyActionBar` dengan `padding-bottom: env(safe-area-inset-bottom)`.

---

## 9. State dan Interaksi

State lokal halaman:

```text
activeTab: 'kelola' | 'riwayat'
period: { year, month }
selectedGroupIds: Set<string>
selectedOfficerId: string
isOfficerSheetOpen: boolean
isConfirmOpen: boolean
submitting: boolean
```

Aturan:

- Ganti periode -> reset `selectedGroupIds`, `selectedOfficerId`, refetch.
- Ganti tab -> periode tetap; data riwayat di-fetch lazy.
- Setelah submit sukses -> refetch work queue, kosongkan selection, toast.
- Jika grup terpilih hilang setelah refetch -> prune selection.
- CTA disabled jika `selectedGroups.length === 0` atau `!selectedOfficerId`.
- Cegah double submit dengan `submitting`.
- Jika `unassigned = 0` -> tampilkan empty state, bukan queue kosong.
- Jika `officers.length = 0` -> disable CTA dan tampilkan arahan tambah petugas.
- Simpan `tab`, `year`, `month` di URL agar back/refresh konsisten.
- Jika bottom sheet terbuka, tombol back menutup sheet terlebih dahulu, bukan keluar halaman.

---

## 10. Endpoint

Catatan: backend mengirim `snake_case`, frontend menerima `camelCase` lewat interceptor. Kontrak di bawah ditulis dalam camelCase.

### 10.1 `GET /admin/assignments/work-queue`

Endpoint baru. Menggabungkan summary, queue, dan beban petugas dalam satu request.

Query:

```text
year=2026
month=10
branch_id=<uuid>        // opsional; ADMIN_RANTING dipaksa dari JWT
dukuh_id=<uuid>         // opsional; untuk scope dukuh
```

Response:

```json
{
  "success": true,
  "data": {
    "period": { "year": 2026, "month": 10 },
    "region": {
      "kind": "branch",
      "id": "uuid",
      "name": "PANINGGARAN TIMUR",
      "branchId": "uuid",
      "branchName": "PANINGGARAN TIMUR"
    },
    "summary": {
      "totalCans": 128,
      "assignableCans": 124,
      "assignedAssignableCans": 96,
      "unassignedAssignableCans": 28,
      "nonAssignableCans": 4,
      "completed": 30,
      "uncollected": 2,
      "officerCount": 4,
      "activeOfficerCount": 4,
      "groupCount": 3
    },
    "groups": [
      {
        "kind": "dukuh",
        "id": "uuid",
        "name": "DUKUH A",
        "totalCans": 20,
        "assignedCans": 8,
        "unassignedCans": 12,
        "canIds": null
      }
    ],
    "officers": [
      {
        "id": "uuid",
        "fullName": "Lulu",
        "employeeCode": "OFF-001",
        "isActive": true,
        "dukuhId": "uuid",
        "dukuhName": "DUKUH A",
        "assignedCount": 42,
        "completedCount": 30,
        "uncollectedCount": 0
      }
    ]
  }
}
```

Aturan data:

- `assignableCans` = kaleng aktif dengan kondisi `AKTIF`, `RUSAK`, atau `HILANG`.
- `unassignedAssignableCans` = assignable dan belum punya assignment di periode itu.
- `nonAssignableCans` = `NON_AKTIF` + `DIKEMBALIKAN`.
- Angka `unassignedAssignableCans` harus sama dengan total `unassignedCans` di `groups`.
- Untuk scope `branch`, `groups.kind = "dukuh"` dan `canIds = null`.
- Untuk scope `dukuh`, `groups.kind = "rt"` atau `"can"` dan `canIds` diisi.
- `officers` hanya petugas aktif di branch yang sama.

### 10.2 `POST /admin/assignments/bulk-branch`

Endpoint existing. Dipakai untuk assign per dukuh.

Request:

```json
{
  "branch_id": "uuid",
  "officer_id": "uuid",
  "dukuh_ids": ["uuid", "uuid"],
  "period_year": 2026,
  "period_month": 10
}
```

Response:

```json
{
  "success": true,
  "assignedCount": 20,
  "period": "10/2026"
}
```

Perilaku:

- `period_year`/`period_month` opsional; default periode berjalan (kompatibel dengan pemanggil lama).
- `ADMIN_RANTING` ditolak jika `branch_id` bukan branch miliknya.
- Dukuh harus milik branch tersebut.
- Kaleng yang sudah punya assignment pada periode terpilih dilewati.
- Jika tidak ada kaleng tersisa -> `400 ALREADY_ASSIGNED`.

### 10.3 `POST /admin/assignments/bulk-cans`

Endpoint baru, hanya jika tab Kelola pada scope dukuh mengizinkan pilih sebagian RT/pemilik.

Request:

```json
{
  "officer_id": "uuid",
  "can_ids": ["uuid", "uuid"],
  "period_year": 2026,
  "period_month": 10
}
```

Response:

```json
{
  "success": true,
  "assignedCount": 12,
  "skippedCount": 2,
  "period": "10/2026"
}
```

Validasi:

- Semua `can_ids` harus berada di branch user.
- Officer harus berada di branch yang sama.
- Hanya kaleng assignable dan belum ditugaskan yang diproses.
- Batasi maksimal `can_ids` per request, misalnya 500.

Jika ingin menunda endpoint ini, v1 bisa membatasi scope dukuh untuk assign seluruh dukuh saja.

### 10.4 `GET /admin/assignments`

Endpoint existing untuk tab Riwayat.

Query saat ini:

```text
year, month, officer_id, branch_id, dukuh_id, search, page, limit
```

Tambahan yang diperlukan:

```text
status=ACTIVE|COMPLETED|REASSIGNED|UNCOLLECTED
```

Response existing sudah memuat:

```text
can.ownerName, can.qrCode, can.dukuhName, can.rt, can.rw,
officer.fullName, periodMonth, periodYear, status, assignedAt
```

### 10.5 Endpoint pendukung existing

- `GET /admin/assignments/region-cards` -> kartu index.
- `GET /admin/officers?branch_id=...` -> dropdown desktop.
- `POST /admin/assignments/:id/transfer` -> transfer (jejak assignment lama dipertahankan).
- `PUT /admin/assignments/:id` -> update status/catatan; mengganti `officer_id` ditolak dengan `USE_TRANSFER_ENDPOINT`.
- `DELETE /admin/assignments/:id` -> hapus, khusus `ADMIN_KECAMATAN`.

---

## 11. Semantik Data dan Konsistensi Angka

Saat ini `RegionSummary.unassigned` dihitung sebagai `total - assignmentTotal`, sehingga bisa ikut menghitung `NON_AKTIF` dan `DIKEMBALIKAN`. Padahal `bulk-branch` hanya menugaskan `AKTIF`, `RUSAK`, dan `HILANG`.

Akibatnya angka “belum ditugaskan” di kartu bisa lebih besar daripada jumlah yang benar-benar bisa ditugaskan.

Rekomendasi:

- Tambahkan `assignableCans` dan `unassignedAssignableCans` pada response kartu.
- Gunakan `unassignedAssignableCans` sebagai angka aksi di halaman Kelola.
- Tetap tampilkan `nonAssignableCans` sebagai info sekunder.
- Pastikan angka queue, preview konfirmasi, dan hasil `bulk-branch` berasal dari aturan yang sama.

---

## 12. Spesifikasi Mobile dan Aksesibilitas

- Header: 56px, tombol back 44x44.
- Tab: 44px, indikator aktif jelas.
- Summary: grid 2x2, angka 20–24px, label 10px uppercase.
- Progress bar: 6px, warna hijau `#1F8243`.
- Queue row: minimal 64px, checkbox hit area 44x44.
- Action bar: sticky bottom, 72px + safe-area inset, backdrop blur.
- Bottom sheet: max-height 85vh, handle bar, focus trap, tutup via overlay/Escape.
- Riwayat mobile: kartu, bukan tabel horizontal.
- Tombol hapus hanya muncul untuk `ADMIN_KECAMATAN`.
- Status memakai label + warna, bukan warna saja.
- `aria-live` untuk “20 kaleng dipilih”.
- Hormati `prefers-reduced-motion`.
- Jangan tampilkan tombol aksi yang tidak tersedia untuk role.

---

## 13. Perbandingan Sekarang vs Usulan

| Aspek | Sekarang | Usulan |
|---|---|---|
| Fokus halaman | Riwayat/monitoring | Kerja penugasan |
| Area terbesar | Tabel per kaleng | Queue dukuh belum ditugaskan |
| Aksi utama | Tombol kecil + modal | Pilih dukuh + sticky action bar |
| Metrik utama | Jumlah penugasan/selesai | Coverage dan belum ditugaskan |
| Unit kerja | Kaleng | Dukuh/RT |
| Riwayat | Default | Tab terpisah |
| Risiko salah pilih | Branch dropdown bebas | Wilayah terkunci dari route/role |
| Langkah assign | Buka modal, pilih petugas, pilih branch, pilih dukuh, submit | Pilih dukuh, pilih petugas, konfirmasi |

---

## 14. Acceptance Criteria

- Dalam satu viewport desktop, admin langsung melihat jumlah dan daftar yang belum ditugaskan.
- Di mobile, ringkasan dan queue terlihat sebelum action bar.
- Assign satu dukuh selesai dalam maksimal 3 interaksi utama.
- Riwayat dapat diakses dalam 1 klik.
- Tidak ada pilihan branch lintas ranting untuk `ADMIN_RANTING`.
- Angka “belum ditugaskan” sama dengan hasil assign massal.
- Setelah assign, queue dan coverage berubah tanpa reload halaman penuh.
- Layout tetap usable di lebar 360px.
- Empty, error, dan no-officer state memiliki aksi yang jelas.
- Tidak ada double submit atau assignment ganda pada periode yang sama.

---

## 15. Urutan Implementasi

1. **Fondasi:** endpoint `work-queue`, tab, summary, queue, action bar, `bulk-branch`.
2. **Riwayat:** pindahkan tabel ke tab, tambah kartu mobile, filter status.
3. **Penyempurnaan:** `bulk-cans` untuk subset dukuh, empty/error states, aksesibilitas, analytics.

---

## 16. Keputusan yang Masih Terbuka

| # | Keputusan | Rekomendasi |
|---|---|---|
| 1 | Tab `Kelola` + `Riwayat` dalam satu route, atau halaman terpisah? | Satu route dengan tab, periode tersimpan di URL |
| 2 | Assign per dukuh atau per kaleng? | Per dukuh untuk scope ranting; per RT/pemilik untuk scope dukuh |
| 3 | Metrik utama: coverage atau completion? | Coverage untuk tab Kelola, completion untuk Riwayat |
| 4 | Panel petugas: dropdown atau panel beban kerja? | Panel beban kerja + pilihan target di action bar |
| 5 | Riwayat mobile: kartu atau tabel horizontal? | Kartu |
| 6 | Apakah `bulk-cans` masuk v1? | Masuk jika scope dukuh perlu assign sebagian |

---

## 17. File Terkait

| File | Peran |
|---|---|
| `apps/web/src/app/dashboard/assignments/page.tsx` | Layer kartu wilayah |
| `apps/web/src/app/dashboard/assignments/[id]/page.tsx` | Halaman detail yang akan di-redesign |
| `apps/web/src/components/region/RegionCards.tsx` | Kartu coverage wilayah |
| `apps/web/src/components/ui/Modal.tsx` | Basis bottom sheet |
| `apps/web/src/components/ui/Table.tsx` | Tabel desktop riwayat |
| `apps/web/src/components/ui/PeriodPicker.tsx` | Pemilih periode |
| `apps/backend/src/routes/admin/assignments.ts` | Endpoint assignment existing |
| `apps/backend/src/routes/admin/dukuhs.ts` | Data dukuh untuk queue |
| `apps/backend/src/routes/admin/district.ts` | Daftar branch |
| `apps/backend/src/services/regionCardService.ts` | Agregasi coverage wilayah |
| `apps/backend/src/services/assignmentGenerator.ts` | Aturan pembuatan assignment |

---

## 18. Catatan Status Implementasi

Sudah diimplementasikan di working tree (belum di-commit):

- Backend:
  - `GET /admin/assignments/work-queue` via `assignmentWorkQueueService.ts`.
  - `POST /admin/assignments/bulk-cans` (validasi branch/district, assignable, belum ditugaskan, maks 500).
  - Filter `status` pada `GET /admin/assignments`.
  - `regionCardService` mengirim `assignableCans`, `assignedAssignableCans`, `unassignedAssignableCans`, `nonAssignableCans`.
- Web:
  - Tab `Kelola`/`Riwayat` dengan state di URL, coverage, queue dukuh/RT, panel beban petugas, action bar sticky, bottom sheet petugas/konfirmasi, empty/error/no-officer state.
  - Riwayat: filter status/petugas, tabel desktop, kartu mobile, transfer/hapus.
  - `RegionCards` memakai `unassignedAssignableCans` dan coverage `assigned/assignable`.
  - `Modal` mendukung `position="bottom"` untuk bottom sheet mobile.
- Verifikasi: typecheck backend/web, lint web (0 error), `vitest` web 45 test, integration `regionCardService` 8 test + `assignmentWorkQueueService` 5 test + route `bulk-cans` 3 test, dan `next build` lulus.

Perbaikan sementara `ADMIN_RANTING` (branch dikunci dari JWT) tetap berlaku. Perubahan mobile di luar cakupan ini (`SignSheet.tsx`, `SetoranScreen.tsx`, `DashboardScreen.tsx`) masih belum di-commit.

### Penindaklanjutan hasil audit (2026-10-24, sesudah commit e506472)

Audit eksekusi menemukan dua bug dan beberapa penyimpangan kecil; semuanya sudah diperbaiki:

- **Angka work-queue menggelembung saat kaleng pernah di-transfer** — `count(*)` di atas LEFT JOIN assignments diganti `count(DISTINCT cans.id)` (kaleng ter-transfer punya 2 baris pada periode yang sama: REASSIGNED + ACTIVE). Test regresi ditambahkan di `assignmentWorkQueueService.integration.test.ts`.
- **Assignment ganda level DB** — semua jalur penulisan (`POST /assignments`, `bulk-branch`, `bulk-cans`, `transfer`, `PUT /assignments/:id`, `scheduler/generate-tasks`) kini mengunci baris kaleng `FOR UPDATE` di dalam transaksi dan memeriksa ulang assignment pada snapshot yang sama, sehingga request bersamaan menjadi serial (yang kedua melewati/menolak, bukan menduplikasi). Indeks unik parsial `(can_id, period)` sengaja TIDAK ditambahkan: data lama bisa melanggar (preseden migrasi 0015) dan butuh dedup data produksi. `PUT` juga menolak menghidupkan baris REASSIGNED saat penugasan berjalan lain ada (409). Test: `assignments-integrity.integration.test.ts`.
- `GET /admin/assignments` memvalidasi `year`/`month` (400 bila tidak valid, bukan 500 NaN); periode default work-queue/bulk memakai `currentOperationalPeriod()` (Asia/Jakarta) di `operationalTimeZone.ts`.
- Test `regionCardService` kini mengunci field assignable baru.
- Web: `prefers-reduced-motion` dihormati, bottom sheet diberi handle bar + prop `dismissible` (sheet konfirmasi tidak tertutup Escape/overlay saat submit), tombol back menutup sheet lebih dulu (entri history ditumpuk saat sheet terbuka), fetch riwayat di-debounce 300 ms + stale-guard, kegagalan parsial bulk kini toast peringatan yang menjelaskan dan menyisakan grup gagal terpilih untuk diulang, dead export `Loader2` dihapus dari `RegionCards`.
