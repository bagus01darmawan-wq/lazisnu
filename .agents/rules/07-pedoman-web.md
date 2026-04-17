---
trigger: model_decision
---

# Rule: Pedoman Web Dashboard
# Scope: Web agent — semua task yang menyentuh apps/web/

---

## Target Pengguna & Platform

```
Pengguna  : Admin Kecamatan, Admin Ranting, Bendahara
Platform  : Browser desktop (utama) + browser HP (responsive)
Framework : Next.js 14 App Router + TypeScript + Tailwind CSS

Catatan: Admin Ranting mengakses dashboard ini dari HP via browser.
Pastikan semua halaman responsive dan nyaman dipakai di layar 360px.
```

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

## UI Design Tokens

```css
/* Gunakan Tailwind classes yang konsisten: */

/* Primary action: bg-green-700 hover:bg-green-800 text-white */
/* Danger action:  bg-red-600 hover:bg-red-700 text-white */
/* Secondary:      border border-gray-300 text-gray-700 hover:bg-gray-50 */

/* Status badge: */
/* sent    → bg-green-100 text-green-800 */
/* pending → bg-yellow-100 text-yellow-800 */
/* failed  → bg-red-100 text-red-800 */

/* is_latest = false (data lama) → bg-yellow-50, opacity-75 */
/* is_latest = true (data terbaru) → normal */
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
