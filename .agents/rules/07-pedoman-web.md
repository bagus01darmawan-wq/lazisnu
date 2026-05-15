---
trigger: manual
---

# Rule: Pedoman Web Dashboard
# Scope: Web agent — semua task yang menyentuh apps/web/

---

## Target Pengguna & Platform

```
Pengguna  : Admin Kecamatan, Admin Ranting, Bendahara
Platform  : Browser desktop (utama) + browser HP (responsive)
Framework : Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4

Catatan: Admin Ranting mengakses dashboard ini dari HP via browser.
Pastikan semua halaman responsive dan nyaman dipakai di layar 360px.
```

---

## Catatan Kompatibilitas Stack Aktual

- Ikuti versi aktual di `apps/web/package.json` sebagai sumber kebenaran.
- Hindari memberi solusi yang spesifik untuk Next.js 14 jika API/perilakunya sudah berubah di Next.js 16.
- Gunakan pola App Router modern, Server/Client Component boundary yang jelas, dan hindari dependensi baru tanpa alasan kuat.

---

## Halaman yang Harus Ada per Role

### Admin Kecamatan (akses penuh)
```
/overview            → statistik keseluruhan + progress per ranting
/kaleng              → list + tambah + edit + generate QR + cetak PDF
/kaleng/[id]         → detail + riwayat koleksi semua periode
/users               → list + tambah + edit + nonaktifkan + reset password
/assignments         → list + override/reassign
/laporan             → laporan keuangan + export CSV
/resubmit            → re-submit tracker
/audit-log           → log aktivitas semua admin
/wa-monitor          → daftar WA yang gagal + retry manual
```

### Admin Ranting (akses terbatas — filter by wilayah)
```
/overview            → statistik rantingnya saja
/kaleng              → list + edit kepemilikan (nama/HP/alamat) kaleng rantingnya
/assignments         → list + override assignment rantingnya
/laporan             → laporan rantingnya saja + export CSV
```

### Bendahara (read-only)
```
/laporan             → laporan keuangan lengkap + export CSV
/resubmit            → re-submit tracker (perbandingan nominal lama vs baru)
/overview-ops        → data operasional: progress petugas dan kaleng
```

---

## Sidebar Berbasis Role

```typescript
// apps/web/lib/menu-config.ts
// Sidebar TIDAK boleh hardcode — generate dari config ini:

export const MENU_CONFIG = {
  admin_kecamatan: [
    { label: 'Overview',       href: '/overview',    icon: 'LayoutDashboard' },
    { label: 'Kaleng',         href: '/kaleng',      icon: 'Package' },
    { label: 'Pengguna',       href: '/users',       icon: 'Users' },
    { label: 'Assignment',     href: '/assignments', icon: 'ClipboardList' },
    { label: 'Laporan',        href: '/laporan',     icon: 'FileText' },
    { label: 'Re-Submit',      href: '/resubmit',    icon: 'RefreshCw' },
    { label: 'Audit Log',      href: '/audit-log',   icon: 'Shield' },
    { label: 'Monitor WA',     href: '/wa-monitor',  icon: 'MessageSquare' },
  ],
  admin_ranting: [
    { label: 'Overview',       href: '/overview',    icon: 'LayoutDashboard' },
    { label: 'Kaleng',         href: '/kaleng',      icon: 'Package' },
    { label: 'Assignment',     href: '/assignments', icon: 'ClipboardList' },
    { label: 'Laporan',        href: '/laporan',     icon: 'FileText' },
  ],
  bendahara: [
    { label: 'Laporan',        href: '/laporan',     icon: 'FileText' },
    { label: 'Re-Submit',      href: '/resubmit',    icon: 'RefreshCw' },
    { label: 'Operasional',    href: '/overview-ops', icon: 'Activity' },
  ],
}
```

---

## Halaman Laporan & Tabel Koleksi

```typescript
// Default tampilan: is_latest = true (hanya data terbaru per kaleng per periode)
// Toggle "Tampilkan Riwayat Re-Submit":
//   → tampilkan SEMUA record termasuk yang lama
//   → beri penanda visual berbeda (background kuning, badge "Revisi")

// Kolom tabel koleksi default:
// Tanggal | Petugas | Kaleng (nama pemilik) | Nominal | Metode | Status WA

// Kolom tambahan saat tampil riwayat:
// + Urutan Submit | Alasan Revisi

// Filter yang tersedia:
// - Periode (bulan + tahun)
// - Ranting (admin kecamatan saja)
// - Petugas
// - Metode bayar (cash/transfer)
// - Status WA (sent/failed/pending)
```

---

## Fitur Generate & Cetak QR PDF

```typescript
// Trigger: tombol "Cetak QR Massal" di halaman /kaleng
// Flow:
// 1. Admin pilih filter (semua ranting, atau ranting tertentu)
// 2. Klik generate → POST /kaleng/generate-qr/batch
// 3. Backend generate PDF → upload ke Cloudflare R2 → return URL
// 4. Browser otomatis download PDF
// 5. Tampil toast sukses: "PDF berhasil dibuat — X kaleng"

// Layout PDF: 10 QR per halaman A4
// Setiap QR dilengkapi label: kode_unik + nama_pemilik + alamat singkat

// Tombol generate juga ada per kaleng individual di /kaleng/[id]
```

---

## Export CSV

```typescript
// Filter yang tersedia di form export:
// - Periode bulan + tahun (wajib)
// - Ranting (opsional)
// - Petugas (opsional)
// - Termasuk riwayat re-submit? (checkbox)

// Kolom CSV yang dihasilkan:
// id, tanggal, petugas_nama, kaleng_kode, kaleng_nama_pemilik,
// nominal, metode_bayar, submit_sequence, is_latest,
// alasan_resubmit, wa_status, wa_sent_at

// PENTING: Gunakan BOM UTF-8 agar Excel Indonesia tidak garbled:
const BOM = '\uFEFF'
const csvContent = BOM + rows.join('\n')
```

---

## Re-Submit Tracker

```typescript
// Tampilkan semua record yang pernah di-re-submit
// dengan perbandingan yang jelas:

// Kolom tabel:
// Tanggal Submit Pertama | Petugas | Kaleng | Nominal Pertama |
// Tanggal Revisi | Nominal Revisi | Selisih | Alasan Revisi

// Visual:
// Nominal Pertama → coret (strikethrough) dengan warna merah
// Nominal Revisi → warna hijau, bold
// Selisih → positif hijau, negatif merah
```

---

## Identitas Visual & Design Tokens

```css
/* Palet Warna "Earthy & Premium" */
/* -- Background Utama (Layout): #2C473E (Deep Forest Green) */
/* -- Background Kartu/Sidebar: #F4F1EA (Warm Beige/Cream) */
/* -- Brand/Positif:            #1F8243 (Emerald Green) */
/* -- Aksen Utama/Tombol/Ikon:  #EAD19B (Muted Sand) */
/* -- Aksen Aktif (Sidebar):    #DE6F4A (Terracotta) */
/* -- Aksen Statistik Tambahan: #F0CC10 (Mustard), #6B9E9F (Teal), #D97A76 (Rose) */

/* Standar Tombol Utama (Primary Action): */
/* Gaya: Solid Sand, Teks Hijau Tua, Shadow lembut */
/* Class: bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 rounded-xl font-bold transition-all active:scale-95 */

/* Standar Tombol Sekunder/Utilitas (Secondary Action): */
/* Gaya: Outline Sand */
/* Class: border-[#EAD19B] text-[#EAD19B] hover:bg-[#EAD19B]/10 rounded-xl font-bold transition-all active:scale-95 */

/* Standar Header Halaman (Premium Layout): */
/* 1. Judul & Ikon: */
/*    - Ikon: size={28}, text-[#EAD19B] */
/*    - H1:   text-2xl, font-bold, text-[#F4F1EA] (Krem) */
/*    - Desc: text-sm, text-[#F4F1EA]/60 (Krem Transparan) */

/* 2. Topbar Navigasi: */
/*    - Judul H1 di Topbar: text-[#F4F1EA] */

/* 3. Status Badge (Tetap): */
/*    - sent    → bg-green-100 text-green-800 */
/*    - pending → bg-yellow-100 text-yellow-800 */
/*    - failed  → bg-red-100 text-red-800 */
```

---

## Standar Header & Toolbar (Gold Standard)

```css
/* 1. Header Halaman: */
/* Container: flex flex-col md:flex-row md:items-center justify-between gap-4 */
/* Left: Icon (size 28, text-[#EAD19B]) + Stacked Title (text-2xl, font-bold, text-[#F4F1EA]) + Description (text-sm, text-[#F4F1EA]/60) */
/* Right: Primary Button (bg-[#EAD19B], hover:bg-[#EAD19B]/90, text-[#2C473E], shadow-[#EAD19B]/20, h-11, px-6, rounded-xl) */

/* 2. Toolbar & Filters: */
/* Container: bg-white p-4 rounded-2xl border border-slate-100 shadow-sm justify-between */
/* Left: Search Input (w-full md:w-80, py-2.5, focus:ring-4 focus:ring-green-500/10, rounded-xl) */
/* Right: Filter Group (flex items-center gap-3 justify-end) */
/* Urutan Filter: Status (Aktif/Non-aktif) -> Ranting (Semua Ranting) */
/* Terminologi Wilayah: Wajib menggunakan "SEMUA RANTING" untuk filter tingkat kecamatan */

/* 3. Standar Toast Notification (Acuan: Halaman Kelola Kaleng): */

/* FORMAT KONFIRMASI: toast((t) => JSX, { duration, position })                  */
/* - duration: 5000ms untuk aksi Hapus/Non-aktifkan                              */
/* - duration: 3000ms untuk aksi Aktifkan Kembali                                */
/* - position: TIDAK perlu diset per-toast (sudah global di <Toaster>)           */
/* - Ikon aksi permanen (Hapus): AlertTriangle size={18} className="text-red-600" */
/* - Ikon aksi non-permanen (Non-aktifkan): Trash2/UserMinus size={18} className="text-slate-400" */
/* - Ikon aksi reaktivasi: RotateCcw size={18} className="text-blue-600"         */

/* FORMAT TOMBOL KONFIRMASI:                                                      */
/* - Batal: variant="outline" h-8 text-xs font-bold rounded-lg                  */
/* - Hapus Permanen: bg-red-600 hover:bg-red-700 shadow-red-100                 */
/* - Non-aktifkan: bg-slate-800 hover:bg-slate-900 shadow-slate-200             */
/* - Aktifkan: bg-blue-600 hover:bg-blue-700                                    */
/* - Semua tombol aksi: h-8 text-xs font-bold rounded-lg text-white shadow-sm transition-all active:scale-95 */

/* FORMAT RESULT TOAST (DILARANG menggunakan toast.promise):                     */
/* WAJIB menggunakan try-catch + if (response.success):                          */
/*   try {                                                                        */
/*     const response: any = await api.delete/post/put(...);                     */
/*     if (response.success) {                                                    */
/*       fetchData();   ← Refresh data via re-fetch, bukan reload halaman        */
/*       toast.success('...');                                                    */
/*     }                                                                          */
/*   } catch (error: any) {                                                       */
/*     toast.error(error.error?.message || error.message || 'Pesan fallback');   */
/*   }                                                                            */

/* URUTAN DALAM BLOK if (response.success):                                      */
/* - Aksi Non-aktifkan / Hapus Permanen: fetchData() LALU toast.success()        */
/* - Aksi Reaktivasi & Bulk: toast.success() LALU fetchData()                   */

/* 4. Standar Pesan Toast per Aksi (warna otomatis dari react-hot-toast):        */
/*                                                                                */
/* NON-AKTIFKAN (Kaleng/Petugas):                                                 */
/*   toast.success('Data kaleng berhasil dinonaktifkan')                         */
/*   toast.success('Petugas berhasil dinonaktifkan')                             */
/*                                                                                */
/* HAPUS PERMANEN (Kaleng/Petugas):                                              */
/*   toast.success('Data kaleng berhasil dihapus permanen')                      */
/*   toast.success('Petugas berhasil dihapus permanen')                          */
/*                                                                                */
/* REAKTIVASI (Kaleng/Petugas):                                                  */
/*   toast.success('Data kaleng berhasil diaktifkan kembali')                    */
/*   toast.success('Petugas berhasil diaktifkan kembali')                        */
/*                                                                                */
/* ERROR (Semua aksi): toast.error(error.error?.message || error.message || ...) */

/* BADGE STATUS: Aktif = variant="success" (hijau), Non-aktif = variant="failed" (merah) */

/* 5. Standar Tombol Aksi di Baris Tabel (Icon Button):                          */
/* - Edit (row aktif): hover:bg-green-50 hover:text-green-600 hover:border-green-200 */
/* - Non-aktifkan (row aktif): hover:bg-red-50 hover:text-red-600 hover:border-red-200 */
/* - Hapus Permanen (row non-aktif): hover:bg-red-600 hover:text-white hover:border-red-600 */
/* - Reaktivasi (row non-aktif): hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 */
/* - Semua icon button: h-8 w-8 p-0 rounded-lg transition-all border-slate-200 group */

/* BACKEND: Endpoint DELETE wajib mengembalikan sendSuccess(reply, null) (HTTP 200) */
/* bukan reply.status(204).send(), agar if (response.success) di frontend berfungsi. */
```

---

## Middleware Auth & Route Protection

```typescript
// apps/web/middleware.ts
// Proteksi semua route di (dashboard)
// Redirect ke /login jika tidak ada token atau token expired

// Role check per route:
// /users → hanya admin_kecamatan
// /audit-log → hanya admin_kecamatan
// /wa-monitor → hanya admin_kecamatan
// /kaleng (edit) → admin_kecamatan + admin_ranting
// /laporan (semua) → semua role kecuali petugas
```

---

*Lazisnu Infaq Collection System — rules/07-pedoman-web.md*
