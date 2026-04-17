---
description: 
---

# Workflow: /build-web-dashboard
# Trigger: Ketik /build-web-dashboard di chat Antigravity
# Tujuan: Bangun web dashboard untuk admin dan bendahara (FASE 6 — Sprint 2)
# Prasyarat: Backend API semua endpoint sudah selesai

---

## Instruksi untuk Agent

Bantu user membangun web dashboard Next.js untuk project Lazisnu Infaq System.
Baca dulu `.agents/rules/07-pedoman-web.md` dan `.agents/rules/05-konvensi-kode.md` sebelum mulai.

---

### LANGKAH 1 — Setup Next.js Project

```bash
cd ~/lazisnu-infaq-system/apps
npx create-next-app@latest web --typescript --tailwind --app
cd web
npm install axios swr
npm install react-hook-form zod @hookform/resolvers
npm install @tanstack/react-table
npm install recharts lucide-react
npm install js-cookie @types/js-cookie
npm install @sentry/nextjs
```

### LANGKAH 2 — Design System (Komponen UI Dasar)

Buat komponen berikut di `components/ui/` sebelum membangun halaman:
- `Button.tsx` — variant: primary (hijau), danger (merah), secondary (abu)
- `Input.tsx` — dengan label dan pesan error
- `Card.tsx` — container dengan shadow
- `Badge.tsx` — variant: sent (hijau), pending (kuning), failed (merah)
- `Modal.tsx` — dengan overlay dan close button
- `Table.tsx` — wrapper `@tanstack/react-table` dengan sorting dan pagination
- `Skeleton.tsx` — loading placeholder
- `EmptyState.tsx` — tampilan saat data kosong

**Warna status yang konsisten (Tailwind classes):**
```
sent/selesai  → bg-green-100 text-green-800
pending       → bg-yellow-100 text-yellow-800
failed/error  → bg-red-100 text-red-800
re-submit     → bg-yellow-50 opacity-75 (untuk data lama)
```

### LANGKAH 3 — Auth & Middleware

**`middleware.ts` di root web:**
- Proteksi semua route di `(dashboard)/`
- Redirect ke `/login` jika tidak ada cookie token
- Role check per route:
  - `/users`, `/audit-log`, `/wa-monitor` → hanya `admin_kecamatan`
  - `/kaleng` (edit) → `admin_kecamatan` + `admin_ranting`
  - `/laporan` → semua role kecuali `petugas`

**`lib/auth.ts`:** helper get/set/clear token dari httpOnly cookie

### LANGKAH 4 — Sidebar Role-Based

Buat sidebar yang berubah sesuai role dari `lib/menu-config.ts`:
```typescript
// Jangan hardcode menu — generate dari konfigurasi
export const MENU_CONFIG = {
  admin_kecamatan: ['overview','kaleng','users','assignments','laporan','resubmit','audit-log','wa-monitor'],
  admin_ranting  : ['overview','kaleng','assignments','laporan'],
  bendahara      : ['laporan','resubmit','overview-ops'],
}
```

### LANGKAH 5 — Halaman yang Harus Dibangun

Bangun halaman sesuai urutan prioritas berikut:

**Prioritas 1 — Admin Kecamatan:**
- `/overview` → card statistik + chart progress per ranting
- `/kaleng` → list + search + filter + tambah + edit + tombol Generate QR + tombol Cetak PDF Massal
- `/kaleng/[id]` → detail kaleng + riwayat koleksi (toggle is_latest vs semua)
- `/users` → list + tambah + edit + nonaktifkan + reset password
- `/assignments` → list per periode + form override dengan alasan wajib

**Prioritas 2 — Bendahara:**
- `/laporan` → filter periode/ranting/petugas + tabel koleksi + export CSV
- `/resubmit` → tabel perbandingan nominal lama vs baru + alasan
- `/wa-monitor` → daftar WA gagal + retry manual

**Prioritas 3 — Semua Admin:**
- `/audit-log` → tabel aktivitas admin dengan filter

### LANGKAH 6 — Fitur Generate & Cetak QR PDF

Di halaman `/kaleng`:
- Tombol "Generate QR" per baris → call `POST /kaleng/:id/generate-qr`
- Tombol "Cetak QR Massal" → form pilih filter → call `POST /kaleng/generate-qr/batch`
- Setelah response → browser otomatis download PDF
- Toast sukses: "PDF berhasil dibuat — X kaleng"

### LANGKAH 7 — Tabel Koleksi dengan Riwayat Re-Submit

Di semua halaman yang menampilkan data koleksi:
- Default: tampilkan `is_latest = true` saja
- Toggle "Tampilkan Riwayat Re-Submit":
  - Tampil semua record termasuk yang lama
  - Record lama (is_latest=false): background kuning, badge "Revisi", opacity-75
  - Record terbaru: normal, badge "Terbaru" jika ada re-submit

### LANGKAH 8 — Export CSV

Filter yang tersedia:
- Periode bulan + tahun (wajib)
- Ranting (opsional)
- Petugas (opsional)
- Termasuk riwayat re-submit (checkbox)

**WAJIB**: Tambahkan BOM UTF-8 agar Excel Indonesia tidak garbled:
```typescript
const BOM = '\uFEFF'
const csvContent = BOM + headers.join(',') + '\n' + rows.join('\n')
```

### LANGKAH 9 — Verifikasi per Role

Test akses dashboard dengan setiap role:
```
✅ Login sebagai admin_kecamatan → semua menu tampil
✅ Login sebagai admin_ranting   → hanya 4 menu (overview, kaleng, assignments, laporan)
✅ Login sebagai bendahara       → hanya menu laporan + resubmit + operasional
✅ Coba akses /users sebagai admin_ranting → redirect atau 403
✅ Generate QR → PDF berhasil didownload
✅ Export CSV → file terbuka normal di Excel dengan karakter Indonesia
✅ Toggle riwayat re-submit → data lama tampil dengan visual berbeda
```

Update `.agents/rules/10-sprint-aktif.md` setelah semua test lulus.
