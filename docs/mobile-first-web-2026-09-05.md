# Mobile-First Web Dashboard (Android 360px) — 2026-09-05

Target: Admin Ranting mengakses dashboard via browser HP Android 360px.
Acuan: Chrome DevTools 360×640 + HP Android fisik.
Aturan permanen: `.agents/rules/12-standar-ui-web.md` §14, `.agents/rules/07-pedoman-web.md`, `apps/web/AGENTS.md`.

## Bagian 1 — Perbaikan Toolbar & Tabel (SELESAI)

Commit `005edc7` di branch `fix/web-mobile-first-360px`.
Verifikasi: `tsc` bersih, eslint 0 error (1 warning lama wa-monitor, tak terkait).

| # | Temuan | Perbaikan | File |
|---|--------|-----------|------|
| 1 | Search fix `w-[160px]`, teks terpotong di 360px | `w-full` mobile, `lg:w-80`/`md:w-80` desktop | 7 toolbar: reports/FilterDropdown, assignments, cans, resubmit, users, wa-monitor, master |
| 2 | Container `items-center` menjepit grup filter | `items-stretch` mobile, `lg:items-center` | 7 toolbar di atas |
| 3 | Padding `p-5` boros di HP | `p-4 md:p-5` | assignments, cans, resubmit, users, wa-monitor |
| 4 | `xs:block` — breakpoint tak ada di Tailwind, breadcrumb tak tampil | `sm:block` | dashboard/layout.tsx |
| 5 | Sel tabel `px-6` boros di HP | `px-3 py-3` mobile, `md:px-6 md:py-4` | components/ui/Table.tsx |
| 6 | Chart `h-[450px]` + kartu Backup `justify-between` berdesakan | `h-[320px] md:h-[450px]`, stack `flex-col sm:flex-row` | overview/page.tsx |
| 7 | Kartu login `p-8` sempit di HP | `p-6 md:p-8` | (auth)/login/page.tsx |
| 8 | FilterPills berpotensi terjepit | `max-w-full overflow-x-auto` | FilterPills.tsx |

Dipertahankan (pola benar): `min-w-[800px]`/`min-w-[1230px]` + `overflow-x-auto` (scroll horizontal tabel),
kontrol toolbar h-35/36 (bahasa desain), grid statistik responsif.

## Bagian 2 — Audit Penuh Per Elemen (SELESAI — commit menyusul, tsc bersih, eslint 0 error)

Metode: grep pola + baca file. Cakupan: 10 halaman (login, overview,
reports, assignments, cans, resubmit, users, users/[id], wa-monitor,
master, audit-log), dashboard layout, Sidebar, 15 komponen `ui/*`.

### Bug (berantakan di 360px — wajib fix)

| # | Lokasi | Masalah | Fix |
|---|--------|---------|-----|
| B1 | audit-log/page.tsx:232 | Toolbar `items-center` (lolos Bagian 1) | `items-stretch md:items-center` |
| B2 | reports/page.tsx:309 | Toolbar `items-center` | sama seperti B1 (standardisasi) |
| B3 | DropdownFilter.tsx:126-127 | Popover `absolute left-0 min-w-max`, opsi `whitespace-nowrap` — dari trigger kanan, meluber keluar viewport | popover + `max-w-[calc(100vw-2rem)] overflow-x-auto` |
| B4 | PeriodPicker.tsx:83 | Popover `absolute left-0 min-w-[280px]` — sama | + `max-w-[calc(100vw-2rem)]` |
| B5 | GlassSelect.tsx:130 | Popover `absolute left-0 w-64` — sama | + `max-w-[calc(100vw-2rem)]` |
| B6 | ExportButton.tsx:97 | Grid tanggal `grid-cols-2` (~132px/kolom); kalender trigger kanan luber | `grid-cols-1 sm:grid-cols-2` |
| B7 | GlassDatePicker.tsx:93 | Popup kalender `absolute left-0` tanpa batas | + `max-w-[calc(100vw-2rem)]` |
| B8 | ConfirmToast.tsx:37 | `w-[350px]` fix — luber ±20px | `w-[calc(100vw-3rem)] max-w-[350px]` |

### Minor (polish — opsional)

| # | Lokasi | Masalah | Fix |
|---|--------|---------|-----|
| M1 | Modal.tsx:69,97 | Body `p-6`, header `px-6`, tombol close `p-1` (~28px) | `p-4 md:p-6`, `px-4 md:px-6`, close `p-2` |
| M2 | Pagination 8 halaman (cans:915,924, dst.) | Panah `w-8 h-8` (32px < 44px) | `w-10 h-10` |
| M3 | Stat cards overview/reports/wa-monitor | Nominal `text-2xl` (Rp miliaran) wrap berdempetan ikon | `text-xl md:text-2xl` + `break-words` |
| M4 | users/[id]/page.tsx:288 | Footer modal `flex justify-end` belum verifikasi isi | cek saat eksekusi; stack bila >2 tombol |

### OK — pola benar, JANGAN disentuh

Sidebar drawer, header layout, form login, semua grid statistik,
users/[id] + ProfileCard + DonorList, form modal master, chart
(ResponsiveContainer + tick truncate), scroll tabel, FilterPills,
grid RT/RW, tombol aksi baris dalam tabel scroll.

## Verifikasi tiap eksekusi: `tsc` + `eslint` + cek 360px.
