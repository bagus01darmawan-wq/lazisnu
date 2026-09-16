# Plan F4: globals.css tokens & font harmonization

**Finding ref:** F4 (audit 2026-09-05)
**Confidence:** Medium
**Scope:** 1 file
**Risiko:** Rendah — variabel CSS saja, tidak ada efek visual langsung pada komponen

## Tujuan

Menyamakan CSS root variables dengan sistem brand yang dipakai komponen, dan menghapus override `prefers-color-scheme: dark` yang tidak relevan (dashboard adalah dark-by-design, bukan dark-by-system). Definisikan token sebagai single source of truth agar `body` fallback aman untuk halaman tanpa wrapper (error page, edge cases).

## Sumber yang harus dibaca executor

1. `apps/web/src/app/globals.css` (54 baris) — file utama
2. `.agents/rules/12-standar-ui-web.md` §1 — palet brand
3. `apps/web/src/app/layout.tsx` baris 22-26 — `body` saat ini pakai CSS var

## Spesifikasi perubahan

**File: `apps/web/src/app/globals.css`** (ganti SELURUH isi)

```css
@import "tailwindcss";

/* Brand tokens — single source of truth (12-standar-ui-web.md §1) */
:root {
  --bg-dashboard: #2C473E;
  --bg-sidebar: #F4F1EA;
  --fg-on-dark: #F4F1EA;
  --fg-on-light: #2C473E;
  --accent-primary: #EAD19B;       /* CTA primer, ikon header */
  --accent-danger: #DE6F4A;         /* filter aktif, danger */
  --accent-toolbar: #6B9E9F;        /* toolbar bg */
  --accent-error-soft: #D97A76;     /* logout, error ringan */
  --accent-emerald: #1F8243;        /* hover/aksen sekunder */
}

@theme inline {
  --color-brand-deep-green: var(--bg-dashboard);
  --color-brand-warm-beige: var(--bg-sidebar);
  --color-brand-sand: var(--accent-primary);
  --color-brand-jelly-slug: var(--accent-danger);
  --color-brand-muted-teal: var(--accent-toolbar);
  --color-brand-muted-sand: var(--accent-error-soft);
  --color-brand-emerald: var(--accent-emerald);
  --color-background: var(--bg-dashboard);
  --color-foreground: var(--fg-on-dark);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--bg-dashboard);
  color: var(--fg-on-dark);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}

/* Custom Scrollbar for Glass Elements */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-button {
  display: none;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent !important;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(244, 241, 234, 0.3) !important;
  border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(244, 241, 234, 0.5) !important;
}

.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(244, 241, 234, 0.3) transparent !important;
}
```

## Yang TIDAK boleh dilakukan executor

- Jangan hapus `@import "tailwindcss"` — wajib untuk Tailwind v4
- Jangan ubah warna hex apapun dari standar
- Jangan tambah dark mode `@media (prefers-color-scheme: dark)` — dashboard selalu dark, bukan system-driven
- Jangan ubah `custom-scrollbar` (dipakai banyak komponen glass)

## Verifikasi

1. `pnpm typecheck` (seharusnya tidak relevan tapi cek)
2. Visual: `body` di setiap halaman dashboard harus tetap `#2C473E`
3. Visual: teks default body harus `var(--fg-on-dark)` = `#F4F1EA`
4. Login page (yang override `bg-[#0d1a15]` sendiri) tidak boleh berubah
5. Test Tailwind v4 `@theme inline` classes: `<div className="bg-brand-deep-green">` harus render `#2C473E`

## Rollback

Single `git revert`. Tidak ada efek samping.