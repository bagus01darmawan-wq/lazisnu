# Rencana: Theme Switcher UI/UX LAZISNU (15 Tema)

Tanggal: 2026-09-10
Status: RENCANA (belum dieksekusi)
Konteks: User minta tombol pemilih warna tema di samping avatar header dashboard;
ganti tampilan "semudah pindah halaman" (instan + persist). Mode kreatif penuh:
15 kombinasi tema indah, tidak klise, tidak mengulang tampilan.

## 1. Tujuan
- Tombol pemilih tema di sebelah KIRI avatar (header kanan dashboard).
- Klik -> popover grid 15 tema, tiap item menampilkan preview swatch
  (canvas / primary / surface) + nama tema.
- Pilih -> SELURUH tampilan dashboard berubah instan & persist setelah reload.

## 2. Letak tombol
File: `apps/web/src/app/dashboard/layout.tsx`
- Avatar ada di baris ~98: `<div className="w-8 h-8 ... bg-[#EAD19B] ...">`.
- Tombol disisipkan di dalam `<div className="flex items-center gap-4">`
  (header kanan, baris ~93), di antara teks nama user dan avatar.
- Ikon: `Palette` dari `lucide-react` (sudah dipakai di project).

## 3. Arsitektur (kunci supaya "semudah pindah halaman")
- Token layer baru: `apps/web/src/styles/themes.css`
  - Mendefinisikan untuk 15 tema + default (`sawah-fajar` = brand saat ini):
    `--canvas, --surface, --primary, --primary-ink, --text, --muted,
     --border, --danger, --accent, --ink`
  - Selector: `:root[data-theme="x"] { ... }` dan fallback `:root` -> sawah-fajar.
- ThemeProvider (client component):
  - Set `data-theme` pada `<html>` + simpan ke `localStorage`.
  - Hindari FOUC: inline script kecil di layout membaca localStorage
    SEBELUM paint (pasang `suppressHydrationWarning` di `<html>`).
- ThemeSwitcher component:
  - Trigger ikon Palette -> popover grid 15 item.
  - Tiap item = 3 strip warna (canvas/primary/surface) + nama tema.
  - Klik item -> panggil `setTheme(name)`.

## 4. Migrasi token (hex hardcode -> var)
TEMUAN KRITIS: warna brand (`#2C473E`, `#F4F1EA`, `#EAD19B`, `#DE6F4A`) saat ini
di-HARDCODE sebagai hex di ratusan komponen, bukan CSS variable.
Agar tema benar-benar berubah, hex harus diganti `var(--...)`.

Urutan migrasi (prioritas visual dominan dulu):
1. `apps/web/src/app/dashboard/layout.tsx` (canvas/surface/primary/teks header+sidebar)
2. Komponen UI primitif: `Button.tsx`, `Badge.tsx`, `Card.tsx`, `Modal.tsx`, `Table.tsx`
3. Halaman dashboard lain (cans, reports, users, audit-log, assignments, resubmit, wa-monitor, master)
4. Sisa komponen (`DropdownFilter`, `ConfirmToast`, `EmptyState`, `Skeleton`, dll)

Catatan: globals.css saat ini pakai `--background/--foreground` (Tailwind v4 @theme).
Akan disesuaikan agar tidak bentrok dengan token tema baru.

## 5. 15 Tema (palet, karakter beda - bukan sekadar hue-shift)

| # | Nama             | Canvas  | Surface | Primary | Aksen   |
|---|------------------|---------|---------|---------|---------|
| 1 | Sawah Fajar (default brand) | #2C473E | #F4F1EA | #EAD19B | #DE6F4A |
| 2 | Lautan Tenang    | #0F5E63 | #F7F3EC | #E8A87C | #F2C57C |
| 3 | Senja NU         | #3B2A4A | #F5EBDD | #E0A458 | #C98BB9 |
| 4 | Batik Malam      | #1A1B3A | #F4F1EA | #D4AF37 | #8C7AE6 |
| 5 | Hutan Hujan      | #1F3D2B | #EAF0E4 | #A8C686 | #6B4423 |
| 6 | Terracotta Jawa  | #7A3B2E | #F3E9DC | #E4B363 | #2E2E2E |
| 7 | Langit Biru      | #2E5A88 | #F5F8FC | #F2C94C | #1B3A5B |
| 8 | Anggrek Ungu     | #5A4A6A | #F6F2F4 | #C9B8D4 | #9CAF88 |
| 9 | Kopi Tubruk      | #3B2417 | #F0E6D8 | #C68B59 | #A9744F |
|10 | Pasir Pantai     | #1F4E54 | #F7F0E1 | #F2A488 | #E8C07D |
|11 | Merah Putih      | #8B1E2D | #FBF8F3 | #E8C547 | #FFFFFF |
|12 | Gelap Elegan     | #14161A | #1E2228 | #5EEAD4 | #C0C6D0 |
|13 | Sakura Senja     | #6D4C5B | #FBEFF1 | #E9B7C0 | #C98A9B |
|14 | Zaitun Mediterania | #4A4E1F | #F3EFD9 | #C97B3C | #8A8B5C |
|15 | Neon Fajar       | #0B1B3A | #122244 | #2DD4BF | #FBBF24 |

Preview visual interaktif (grid klik -> mockup berubah):
`E:/unduhan/theme-preview-15.html`

## 6. Risiko (jujur)
- Ratusan hex di banyak file -> kemungkinan ada yang terlewat (jadi "noda"
  warna di tema tertentu). Mitigasi: prioritas UI primitif + layout dulu,
  sisanya incremental, bukan sekaligus.
- Hydration mismatch (client vs server). Mitigasi: inline script + suppressHydrationWarning.
- Cakupan: dibatasi ke DASHBOARD (tempat avatar ada). Login page TIDAK di-theme
  (kecuali user minta).

## 7. Verifikasi
- `pnpm lint && pnpm build` lulus.
- Staging: klik switcher -> 15 tema -> visual berubah instan, persist setelah reload.
- Cek tiap tema via browser (screenshot) untuk pastikan kontras teks layak.

## 8. Alur branch (sesuai konvensi user)
- 1 fokus kerja = 1 branch: `fix/web-theme-switcher-YYYY-MM-DD`
- User cek sendiri `git checkout <branch> && pnpm dev`, lalu merge manual `--no-ff`.
- BUKAN langsung ke `staging`.

## 9. Keputusan user yang masih ditunggu (sebelum eksekusi)
- [ ] Setujui 15 nama/palet (atau revisi dari tabel).
- [ ] Login page ikut di-theme atau tidak?
- [ ] Cakupan dashboard saja (default) -> OK.
