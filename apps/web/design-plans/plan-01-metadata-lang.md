# Plan F2: Metadata root & html lang

**Finding ref:** F2 (audit 2026-09-05)
**Confidence:** High
**Scope:** 2 file
**Risiko:** Rendah — metadata only, tidak ada perubahan logika

## Tujuan

Mengganti metadata default Next.js (`"Create Next App"`) dengan brand LAZISNU, dan memperbaiki `<html lang>` ke bahasa konten aktual (id-ID). Mempengaruhi SEO, share preview (OG), dan a11y (screen reader).

## Sumber yang harus dibaca executor

1. `apps/web/src/app/layout.tsx` (40 baris) — file utama
2. `apps/web/src/app/(auth)/login/page.tsx` baris 75-160 — halaman publik-facing yang perlu `noindex`
3. `apps/web/.env*` atau README untuk SITE_URL default

## Aturan dari standar

- `fixing-metadata` prioritas-1: title & description harus deterministic & aman
- Standar §1 (lazisnu-web-rules): mobile-first + dashboard — tidak ada override untuk metadata, jadi gunakan best practice Next.js metadata API

## Spesifikasi perubahan

### File 1: `apps/web/src/app/layout.tsx`

**Ganti baris 15-18** (eksport metadata):
```typescript
export const metadata: Metadata = {
  title: {
    default: "Dashboard LAZISNU",
    template: "%s · LAZISNU",
  },
  description:
    "Sistem manajemen zakat, infaq, dan sedekah LAZISNU — dashboard operasional untuk admin kecamatan, ranting, petugas, dan bendahara.",
  applicationName: "LAZISNU",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://dashboard.lazisnu.org"
  ),
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "LAZISNU",
    title: "Dashboard LAZISNU",
    description:
      "Sistem manajemen zakat, infaq, dan sedekah LAZISNU.",
  },
  icons: {
    icon: "/logolzs.svg",
    shortcut: "/logolzs.svg",
    apple: "/logolzs.svg",
  },
};
```

**Ganti baris 31** (`<html lang="en">`):
```tsx
<html
  lang="id"
  className={`${geistSans.variable} ${geistMono.class} h-full antialiased`}
>
```

**Catatan:** `robots: { index: false, follow: false }` sesuai sifat dashboard admin (login wall — tidak ingin diindeks Google). Untuk halaman publik `lazisnu.org` (yang tidak di repo ini), metadata berbeda dan bukan tanggung jawab sini.

### File 2: `apps/web/src/app/(auth)/login/page.tsx`

Tambah `metadata` eksport lokal di atas komponen (login publik-facing tetap `noindex` karena juga di belakang subdomain admin, tapi OG perlu untuk share preview internal):

```typescript
export const metadata: Metadata = {
  title: "Masuk",
  description: "Halaman masuk dashboard LAZISNU.",
  robots: { index: false, follow: false },
};
```

Login adalah `'use client'` (cek baris 1) — Next.js masih izinkan `export const metadata` di client component untuk static metadata sederhana (tanpa `generateMetadata`). Jika ragu, pindahkan metadata ke file `layout.tsx` lokal `(auth)/layout.tsx` baru.

## Yang TIDAK boleh dilakukan executor

- Jangan ubah `className` body atau styling apapun
- Jangan hapus import existing
- Jangan tambah metadata yang tidak relevan (JSON-LD Organization di dashboard tidak perlu; landing publik punya sendiri)
- Jangan hardcode URL absolut — pakai `metadataBase`

## Verifikasi (self-test)

1. `cd apps/web && pnpm typecheck` — harus lulus
2. Start dev server, buka DevTools → inspect `<title>` dan `<meta name="description">` di `/dashboard/overview` (setelah login) — title harus `"Dashboard LAZISNU"`, bukan lagi `"Create Next App"`
3. Buka `/login` — title harus `"Masuk · LAZISNU"`
4. Lihat `<html lang>` di DevTools — harus `"id"` bukan `"en"`
5. `openGraph` harus berisi `locale: "id_ID"`, `siteName: "LAZISNU"`
6. Diff `git diff apps/web/src/app/layout.tsx apps/web/src/app/(auth)/login/page.tsx` — hanya metadata, tidak ada perubahan styling/logika

## Rollback

Single `git revert` jika PR. Tidak ada data migration.