# Ringkasan Perbaikan Fase 1 — WA Monitor & Perbaikan Terkait

**Tanggal:** 2026-07-17  
**Scope:** Fase 1 — Statistik Historis WA Monitor + Perbaikan Layout/Sidebar + Perbaikan Halaman Re-submit + Perbaikan Overview Chart

---

## 1. File yang Diubah

| No | File | Jenis Perubahan |
|----|------|-----------------|
| 1 | `apps/backend/src/routes/admin/wa.ts` | **Major** — Tambah endpoint `GET /admin/wa/summary` |
| 2 | `apps/web/src/app/dashboard/wa-monitor/page.tsx` | **Major** — Rewrite halaman WA Monitor |
| 3 | `apps/web/src/components/ui/Card.tsx` | **Minor** — Tambah prop `contentClassName` |
| 4 | `apps/web/src/app/dashboard/layout.tsx` | **Major** — Sidebar toggle desktop + mobile |
| 5 | `apps/web/src/components/Sidebar.tsx` | **Major** — Props baru, aksesibilitas, toggle desktop |
| 6 | `apps/web/src/app/dashboard/overview/page.tsx` | **Major** — Perbaikan chart sizing + role-aware data |
| 7 | `apps/web/src/app/dashboard/resubmit/page.tsx` | **Major** — Rewrite halaman Re-submit (read-only) |
| 8 | `apps/web/src/middleware.ts` | **Minor** — (perubahan otomatis dari git, tidak sengaja) |

---

## 2. Detail Perubahan per File

### 2.1 `apps/backend/src/routes/admin/wa.ts` (+214 lines)

**Endpoint Baru:** `GET /admin/wa/summary`

**Fitur:**
- Filter berdasarkan role:
  - `ADMIN_RANTING` → hanya ranting sendiri
  - `ADMIN_KECAMATAN` → semua ranting di kecamatan (bisa filter `branch_id`)
  - `BENDAHARA` → semua data
- Parameter query:
  - `period` = `today` | `week` | `month` | `all`
  - `year`, `month` (untuk `period=month`)
  - `branch_id` (hanya Admin Kecamatan)
- Response:
  - `summary`: `total_sent`, `total_failed`, `total_pending`, `total`, `success_rate`
  - `daily_trends`: 7 hari terakhir (Min–Ming), isi nol untuk hari kosong
  - `by_branch`: per ranting (hanya Admin Kecamatan)
  - `period`: periode yang dipakai

**Import tambahan:** `gte`, `lt` dari drizzle-orm

---

### 2.2 `apps/web/src/app/dashboard/wa-monitor/page.tsx` (Rewrite total)

**Perubahan Utama:**
- **State baru:** `dbStats`, `dailyTrends`, `branchStats`, `dbLoading`, `period`
- **Fungsi baru:** `fetchWASummary()` memanggil `/admin/wa/summary`
- **Hook:** `useEffect` memanggil `fetchWAStatus` + `fetchWASummary` bersamaan
- **UI Baru:**
  - Periode selector (Hari Ini / 7 Hari / Bulan Ini / Semua)
  - 3 kartu Queue (Real-time BullMQ): Terkirim / Dalam Antrean / Gagal
  - 4 kartu DB Historis: Total Terkirim / Total Gagal / Success Rate / Total Pending
  - Mini Chart Tren 7 Hari (AreaChart Recharts) — hanya render jika data ada
  - Tabel Log Notifikasi (tetap sama)
  - DLQ Management (tetap sama)

**Perbaikan Teknis:**
- Menggunakan `React.useState` / `React.useEffect` (bukan named import) → menghilangkan warning `@typescript-eslint/no-unused-vars`
- Component `DailyTrendsChart` terpisah untuk menghindari error JSX conditional rendering
- Formatter tooltip handle `value | undefined`
- Import `Legend` dari recharts

---

### 2.3 `apps/web/src/components/ui/Card.tsx` (+2 lines)

```typescript
// Baru
contentClassName?: string;

// Di render:
<div className={cn('p-6', contentClassName)}>{children}</div>
```

**Tujuan:** Memungkinkan child chart mengontrol padding/height internal (mis. `contentClassName="p-0 flex flex-1 min-h-0 flex-col"`) agar `ResponsiveContainer height="100%"` bekerja.

---

### 2.4 `apps/web/src/app/dashboard/layout.tsx` (+19 lines)

**State Baru:**
```typescript
const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
const [isDesktopSidebarVisible, setIsDesktopSidebarVisible] = useState(true);
```

**Perubahan:**
- `Sidebar` props: `isMobileOpen`, `isDesktopVisible`, `onMobileClose`
- `main` margin dinamis: `isDesktopSidebarVisible ? "lg:ml-64" : "lg:ml-0"`
- **Tombol toggle desktop** di header (lg:flex):
  - Ikon `PanelLeftClose` / `PanelLeftOpen`
  - `aria-label`, `aria-expanded`, `aria-controls`
- Hamburger mobile: `aria-label`, `aria-expanded`, `aria-controls`, `type="button"`
- Wrapper content: tambah `min-w-0`

---

### 2.5 `apps/web/src/components/Sidebar.tsx` (+10 lines)

**Props Baru:**
```typescript
isMobileOpen?: boolean;
isDesktopVisible?: boolean;
onMobileClose?: () => void;
```

**Perubahan:**
- Transform desktop: `isDesktopVisible ? "lg:translate-x-0 lg:visible" : "lg:-translate-x-full lg:invisible"`
- Transform mobile: `isMobileOpen ? "translate-x-0 visible" : "-translate-x-full invisible lg:visible"`
- Loading state juga pakai `isDesktopVisible`
- `aria-hidden={!isDesktopVisible && !isMobileOpen}`
- Tombol close mobile: `p-3`, ikon `X`, `aria-label="Tutup menu"`
- `onClick` nav link: `onMobileClose` (bukan `onClose`)
- Prop rename: `isOpen` → `isMobileOpen`, `onClose` → `onMobileClose`

---

### 2.6 `apps/web/src/app/dashboard/overview/page.tsx` (+31 lines)

**Perbaikan Chart:**
- `contentClassName="p-0 flex flex-1 min-h-0 flex-col"` pada Card
- Chart host: `className="flex-1 w-full min-h-0 mt-4 px-2"`
- `ResponsiveContainer height="100%"` kini dapat tinggi nyata dari flex parent
- **Role-aware data selection** dikembalikan:
  - Admin Kecamatan: `data.by_branch` + `branch_name` (barSize 48)
  - Admin Ranting: `data.by_officer` + `officer_name` (barSize 24)
- Y-axis formatter: "3.5M", "1.2K"
- X-axis tickFormatter: potong nama >12 char
- `minPointSize={2}` agar batang nol tetap terlihat tipis
- AreaChart: `isAnimationActive={false}`, margin eksplisit

---

### 2.7 `apps/web/src/app/dashboard/resubmit/page.tsx` (Rewrite total -107 lines)

**Perubahan Konseptual:**
- **Read-only** — hapus form koreksi modal, hapus re-submit logic
- Endpoint: `/bendahara/resubmits` (bukan `/bendahara/collections`)
- Tipe data: `ResubmitTrackerItem` (shared types)
- Kolom 7 (tanpa Selisih):
  1. Tanggal Koreksi (160px)
  2. Petugas (200px)
  3. Kaleng/Pemilik (220px)
  4. Nominal Awal — coret merah (140px)
  5. Nominal Revisi — hijau bold (140px)
  6. Alasan Koreksi (280px)
  6. Versi — badge kuning (90px)
- `PAGE_SIZE = 20` konstan
- Toolbar standar: Search Pill glassmorphism + Reset button
- Pagination standar: Summary badge + Smart Control Pill
- Scroll horizontal tabel: `min-w-[1230px]`
- Empty state & error state

---

### 2.8 `apps/web/src/middleware.ts` (Perubahan otomatis)

File ini berubah otomatis dari git (bukan perubahan Fase 1). Bisa di-restore jika tidak perlu.

---

## 3. Verifikasi Kualitas

| Check | Hasil |
|-------|-------|
| `pnpm --filter web typecheck` | ✅ PASS |
| `pnpm --filter web lint` | ✅ PASS (8 warning non-error) |
| `pnpm --filter web build` | ✅ PASS |
| `pnpm --filter backend typecheck` | ✅ PASS |

---

## 4. Learning Checkpoint

| Konsep | Penjelasan |
|--------|------------|
| **Flex chain untuk chart height** | `Card(contentClassName="p-0 flex flex-1 min-h-0 flex-col")` → child `flex-1 min-h-0` → `ResponsiveContainer height="100%"` |
| **Role-aware data selection** | Gunakan `user?.role` untuk memilih `data.by_branch` vs `data.by_officer` di overview |
| **Separate chart component** | Hindari conditional JSX di dalam return utama; buat component terpisah (`DailyTrendsChart`) agar JSX parser tidak bingung |
| **React.useState vs useState** | Pakai `React.useState` di file yang sudah `import React` untuk menghindari warning unused import |
| **Formatter handle undefined** | `(value as number ?? 0).toLocaleString()` untuk tooltip Recharts |
| **contentClassName pada Card** | Pola non-invasif untuk mengontrol internal wrapper tanpa mengubah API luar |

---

## 5. Risiko & Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Endpoint `/wa/summary` belum punya test | Tambah unit test di backend untuk role matrix & period filter |
| Chart belum responsif di mobile < 360px | `min-w-[1230px]` pada tabel memastikan horizontal scroll; chart pakai `width="100%"` |
| Sidebar toggle state tidak persist | Bisa ditambah `localStorage` di Fase 2 jika diperlukan |
| `middleware.ts` berubah tidak sengaja | Restore manual: `git checkout apps/web/src/middleware.ts` jika tidak perlu |

---

## 6. Langkah Selanjutnya (Fase 2)

1. **WA Monitor Fase 2:**
   - Tabel aksi: tombol Retry per baris (panggil `/admin/wa/retry/:id`)
   - Tooltip error detail (`failedReason`)
   - Filter status di toolbar (Semua/Terkirim/Gagal/Pending)

2. **Overview Chart Polish:**
   - Sparkline 7 hari di kartu ringkasan
   - Tooltip formatting konsisten

3. **Persist Sidebar Preference:**
   - `localStorage.setItem('sidebarVisible', isDesktopSidebarVisible)`

4. **Restore middleware.ts** jika tidak diperlukan.

---

*Dokumen ini dibuat otomatis berdasarkan git diff pada 2026-07-17.*