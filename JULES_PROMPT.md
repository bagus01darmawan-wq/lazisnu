<instruction>You are an expert software engineer. You are working on a WIP branch. Please run `git status` and `git diff` to understand the changes and the current state of the code. Analyze the workspace context and complete the mission brief.</instruction>
<workspace_context>
<artifacts>
--- IMPLEMENTATION PLAN ---
# Implementation Plan - Finalisasi Remediasi Audit Teknis

Dokumen ini merinci langkah-langkah untuk menyelesaikan sisa temuan audit teknis yang belum tuntas, dengan fokus pada integritas data (immutability), keandalan aplikasi mobile (offline-first), dan modernisasi distribusi aplikasi.

## User Review Required

> [!IMPORTANT]
> **Keputusan Arsitektur Immutability:** Kita akan menghapus kolom `is_latest` dari database. Sebagai gantinya, logika "terbaru" akan ditentukan secara dinamis melalui kueri SQL. Hal ini untuk mematuhi aturan `STRICTLY IMMUTABLE` di mana kita tidak boleh melakukan `UPDATE` pada tabel `collections`.

> [!WARNING]
> **Migrasi CodePush:** Microsoft akan menghentikan layanan App Center/CodePush. Rencana ini mencakup persiapan migrasi, namun eksekusi penuh mungkin memerlukan akses ke akun Expo/EAS.

## Proposed Changes

---

### 1. Database & Backend: Pembersihan Flag `isLatest`

Kita akan menghapus redundansi data yang berpotensi menyebabkan inkonsistensi.

#### [MODIFY] [schema.ts](file:///home/bagus01darmawan/lazisnu/apps/backend/src/database/schema.ts)
- Hapus kolom `isLatest` dari tabel `collections`.
- Pertahankan `submitSequence` sebagai penanda urutan koreksi.

#### [MODIFY] [collections.ts (Admin)](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/admin/collections.ts)
- Hapus pengisian `isLatest: true` pada saat `insert`.
- Pastikan logika validasi tetap menggunakan `max(submitSequence)` untuk memastikan hanya record terbaru yang bisa di-resubmit.

#### [MODIFY] [bendahara.ts](file:///home/bagus01darmawan/lazisnu/apps/backend/src/routes/bendahara.ts)
- Pastikan semua query `latestCollectionCondition` sudah menggunakan subquery `max(submitSequence)` (saat ini sudah sebagian besar menggunakan ini, perlu verifikasi menyeluruh).

---

### 2. Mobile App: Penyempurnaan Offline-First & Sync Feedback

Memastikan petugas mendapatkan informasi yang akurat tentang status sinkronisasi.

#### [MODIFY] [useCollectionStore.ts](file:///home/bagus01darmawan/lazisnu/apps/mobile/src/stores/useCollectionStore.ts)
- Ubah `submitCollection` agar mengembalikan status yang lebih deskriptif (misal: `{ success: true, synced: false }` jika tersimpan offline tapi gagal sync).
- Jangan langsung mengembalikan `true` jika `autoSync` gagal tanpa memberikan indikasi visual yang jelas di UI.

#### [MODIFY] [sync.ts](file:///home/bagus01darmawan/lazisnu/apps/mobile/src/services/offline/sync.ts)
- Implementasikan mekanisme *Retry* dengan *Exponential Backoff*.
- Tambahkan validasi *Deduplication* berdasarkan `offlineId` sebelum melakukan *batch submit* ke server.

---

### 3. Web Dashboard: Finalisasi & Polish

#### [MODIFY] [ExportButton.tsx](file:///home/bagus01darmawan/lazisnu/apps/web/src/app/dashboard/reports/ExportButton.tsx)
- Tambahkan validasi tanggal agar user tidak bisa memilih `start_date` lebih besar dari `end_date`.
- Tambahkan notifikasi progress (loading toast) yang lebih informatif.

---

### 4. DevOps & Maintenance

#### [MODIFY] [package.json (Mobile)](file:///home/bagus01darmawan/lazisnu/apps/mobile/package.json)
- Dokumentasikan rencana migrasi ke Expo EAS Update.
- Persiapkan *environment variables* untuk pemisahan distribusi *staging* dan *production*.

#### [NEW] [ARCHITECTURE.md](file:///home/bagus01darmawan/lazisnu/ARCHITECTURE.md)
- Dokumentasikan pola *Append-only Ledger* dan alasan penghapusan flag `is_latest`.
- Dokumentasikan alur sinkronisasi offline-first.

## Verification Plan

### Automated Tests
- Menjalankan `pnpm -r exec tsc --noEmit` untuk memastikan perubahan skema tidak merusak tipe data di seluruh aplikasi.
- Menjalankan kueri manual ke database untuk memastikan tidak ada dua baris data koleksi yang dianggap "terbaru" secara bersamaan.

### Manual Verification
1. **Scenario Resubmit:** Lakukan koreksi data koleksi melalui dashboard, lalu pastikan di halaman laporan hanya nilai terbaru yang muncul.
2. **Scenario Offline Mobile:** Matikan internet pada emulator, lakukan *submit* koleksi. Nyalakan internet, pastikan data tersinkronisasi otomatis tanpa intervensi manual.
3. **Scenario Export:** Unduh file CSV dan pastikan nominal serta nama donatur sesuai dengan data di dashboard.
</artifacts>
</workspace_context>
<mission_brief>[Describe your task here...]</mission_brief>