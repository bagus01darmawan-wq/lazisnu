# Tahap 4 — Migrasi Main Screens

## Urutan

1. Dashboard
2. Tasks
3. Scan
4. Collection
5. History
6. Profile
7. Navigator/tab styling

Urutan ini membuat komponen umum stabil sebelum menyentuh alur finansial.

## Dashboard

File: `apps/mobile/src/screens/DashboardScreen.tsx`.

Gunakan:

- `AppHeader`
- `SyncBanner`
- `AppCard`
- `AppButton`
- `StatusBadge`

Pertahankan fetch dashboard, refresh, `pendingCount`, dan `permanentFailedCount`.

## Tasks

File: `apps/mobile/src/screens/TasksScreen.tsx`.

Gunakan:

- `SegmentedControl`
- `AppCard`
- `StatusBadge`
- `AppButton`

Pisahkan `TaskItem` menjadi komponen domain hanya setelah styling stabil. Jangan mencampur filter UI dengan fetch logic.

## Scan

File: `apps/mobile/src/screens/ScanScreen.tsx`.

Gunakan token untuk overlay, frame, tombol, modal, dan state permission.

Pertahankan:

- Kamera segera disabled setelah QR terbaca.
- Guard `processingRef`.
- Validasi server.
- Manual input dan image picker.
- Pesan error QR.
- Permission denied/blocked.

Jangan mengganti library kamera dalam refactor visual.

## Collection

File: `apps/mobile/src/screens/CollectionScreen.tsx`.

Gunakan:

- `AppHeader` stack.
- `AppCard`.
- `AppTextInput`.
- `SegmentedControl`.
- `AppButton`.

Pertahankan:

- Nominal integer.
- Maksimum Rp10.000.000.
- `assignment_id`, `can_id`, `offline_id`.
- Offline queue.
- Cash/Transfer tetap `CASH`/`TRANSFER`.
- Success state dan status sinkronisasi.

Styling tidak boleh mengubah payload.

## History

File: `apps/mobile/src/screens/HistoryScreen.tsx`.

Gunakan:

- `SegmentedControl` atau filter chips.
- `AppCard`.
- `StatusBadge`.
- `AppButton` outline untuk koreksi.

Aturan wajib:

- Koreksi membuat resubmit versi baru.
- Jangan menambahkan aksi DELETE/UPDATE transaksi.
- Tampilkan perbedaan synced/pending/failed.
- Alasan koreksi tetap wajib.

## Profile

File: `apps/mobile/src/screens/ProfileScreen.tsx`.

Gunakan:

- `AppHeader`.
- `AppCard`.
- row menu reusable lokal jika diperlukan.
- `AppButton` danger untuk logout.

Catatan: route `EditProfile`, `NotificationSettings`, `SecuritySettings`, dan `Help` harus diverifikasi sebelum menu dianggap aktif. Jangan membuat route atau screen kosong hanya untuk menutup error.

## Navigator

File:

- `apps/mobile/src/navigation/AppNavigator.tsx`
- `apps/mobile/src/navigation/types.ts`

Target:

- Tab bar memakai palette baru.
- Active/inactive state konsisten.
- Central Scan boleh ditonjolkan setelah navigasi tetap stabil.
- Jangan menggunakan route yang tidak tercantum dalam param list.

## Acceptance Main Flow

```text
Login
  -> Dashboard
  -> Tasks
  -> Scan
  -> QR valid
  -> Collection
  -> Simpan online/offline
  -> History
```

Seluruh alur harus tetap bekerja sebelum dan sesudah migrasi visual.

