# Plan F1 + F7: Tailwind v4 @theme palette tokens + Skeleton dark variant

**Finding ref:** F1 + F7 (audit 2026-09-05)
**Confidence:** High
**Scope:** 7 file primitif + 1 file loading
**Risiko:** Sedang — kompatibilitas mundur dijaga dengan mempertahankan variant lama + tambah variant brand

## Tujuan

Menetapkan sistem token Tailwind v4 yang named (`bg-brand-sand`, `text-brand-deep-green`) sehingga palet brand `12-standar-ui-web.md` §1 enforceable di kode. Migrasi komponen primitif untuk menggunakan token (kompatibel dengan hardcoded hex lama).

## Sumber yang harus dibaca executor

1. `apps/web/src/app/globals.css` — token dideklarasikan di Plan 02
2. `.agents/rules/12-standar-ui-web.md` §1, §3.1, §3.3, §5, §7, §8
3. `apps/web/src/components/ui/{Button,Badge,Skeleton,Card,Modal,Table}.tsx`
4. `apps/web/src/components/ui/EmptyState.tsx`
5. `apps/web/src/app/dashboard/loading.tsx` (35 baris) — pakai Skeleton dark
6. `apps/web/src/app/dashboard/cans/page.tsx` — referensi "implementasi paling matang"

## Spesifikasi perubahan

### Strategi migrasi (kompatibel mundur)

Tambah variant baru TANPA hapus variant lama. Variant lama (`primary` `bg-green-600`, dst.) dipakai oleh banyak halaman; rename = blast radius besar. Pendekatan:

- **Tambah** `variant="brand"` di Button
- **Tambah** `variant="dark"` di Skeleton
- **Tambah** token `bg-brand-sand`, `text-brand-deep-green` di Tailwind config (sudah di Plan 02)
- **Opsional**: Di PR berikutnya, migrasi pemakai ke variant baru per-halaman (di luar scope plan ini)

### File 1: `apps/web/src/components/ui/Button.tsx`

**Ganti baris 13-18** (object variants) — tambahkan `brand` dan `brandOutline`:

```typescript
const variants = {
  brand: 'bg-[#EAD19B] text-[#2C473E] hover:bg-[#EAD19B]/90 shadow-lg shadow-[#EAD19B]/20 font-bold',
  brandOutline: 'border border-[#EAD19B]/30 bg-transparent text-[#EAD19B] hover:bg-[#EAD19B]/10 font-bold',
  primary: 'bg-green-600 text-white hover:bg-green-700 shadow-sm',  // keep for back-compat
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
  outline: 'border border-gray-300 bg-transparent hover:bg-gray-50 text-gray-700',
  ghost: 'bg-transparent hover:bg-gray-100 text-gray-600',
};
```

**Update interface baris 5**: tambah `'brand' | 'brandOutline'` ke union.

### File 2: `apps/web/src/components/ui/Badge.tsx`

**Ganti baris 10-16** — tambahkan variant brand-aligned, pertahankan yang lama untuk `success`/`failed`:

```typescript
const variants = {
  brand: 'bg-[#EAD19B]/15 text-[#EAD19B] border-[#EAD19B]/30',
  jelly: 'bg-[#DE6F4A]/10 text-[#DE6F4A] border-[#DE6F4A]/30',
  sent: 'bg-green-100 text-green-800 border-green-200',         // per standar §8
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  failed: 'bg-red-100 text-red-800 border-red-200',             // per standar §8
  resubmit: 'bg-yellow-50 text-yellow-700 border-yellow-100 opacity-75',
  default: 'bg-gray-100 text-gray-800 border-gray-200',
  success: 'bg-green-100 text-green-800 border-green-200',
  secondary: 'bg-slate-100 text-slate-800 border-slate-200',
};
```

**Update interface baris 5**: tambah `'brand' | 'jelly'` ke union.

### File 3: `apps/web/src/components/ui/Skeleton.tsx`

**Ganti seluruh file**:

```typescript
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'dark';
}

const Skeleton = ({ className, variant = 'default', ...props }: SkeletonProps) => {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md',
        variant === 'dark' ? 'bg-white/5 border border-white/10' : 'bg-gray-200',
        className
      )}
      {...props}
    />
  );
};

export { Skeleton };
```

### File 4: `apps/web/src/app/dashboard/loading.tsx`

**Ganti baris 19-21** (Skeleton grid) — tambah `variant="dark"`:

```tsx
<Skeleton variant="dark" className="h-32 rounded-2xl" />
<Skeleton variant="dark" className="h-32 rounded-2xl" />
<Skeleton variant="dark" className="h-32 rounded-2xl" />
```

Skeleton lain (header & table) di baris 9-30 juga bisa ditambah `variant="dark"` agar konsisten.

### File 5, 6, 7: `Card.tsx`, `Modal.tsx`, `Table.tsx`, `EmptyState.tsx`

**JANGAN di-migrasi di plan ini.** Komponen ini dipakai luas dengan variant `default` (white/gray). Rename atau ubah `bg-gray-50` → `bg-white/5` akan mengubah tampilan semua halaman yang meletakkan Card default di atas dashboard dark. Lebih aman: biarkan apa adanya, tambahkan opsi variant baru di PR selanjutnya.

### Yang TIDAK boleh dilakukan executor

- Jangan hapus variant Button lama (`primary`, `danger`, dst.) — dipakai di banyak tempat
- Jangan hapus variant Badge lama (`sent`, `pending`, `failed`, `success`) — dipakai untuk SEMUA tabel status (standar §8)
- Jangan ubah Skeleton default ke dark default — beberapa halaman light-mode (login, error) masih pakai default
- Jangan refactor Card/Modal/Table/EmptyState di PR ini
- Jangan ubah logika button click / event handler

## Verifikasi

1. `pnpm typecheck` lulus
2. `pnpm test` (vitest di `ui-components.test.tsx`) — kalau test ada yang ekspektasi kelas `bg-green-600`, test pass karena variant lama dihapus = HARUS update test atau expect token baru
3. Visual sanity:
   - Login page (pakai Button primary `bg-green-600`) tidak berubah
   - Cans page (pakai Button danger `bg-red-600`) tidak berubah
   - Semua halaman dashboard tetap render normal
   - Loading dashboard (`/dashboard/overview` dengan refresh) — skeleton sekarang subtle `bg-white/5`, tidak "berteriak"
4. Test variant baru:
   - `<Button variant="brand">Tambah</Button>` → kelas `bg-[#EAD19B] text-[#2C473E]`
   - `<Badge variant="brand">Aktif</Badge>` → kelas `bg-[#EAD19B]/15 text-[#EAD19B]`
5. `pnpm build` lulus (cek dead-code elimination Tailwind v4)

## Rollback

Single `git revert`. Tidak ada data migration. Backward compatible.

## Setelah merge

Buat issue/PR terpisah untuk migrasi `cans/page.tsx` (dan halaman lain) dari `<Button variant="primary">` ke `<Button variant="brand">` untuk konsistensi penuh dengan standar §3.1 — di luar scope plan ini karena 1+ halaman terpengaruh dan butuh review per-halaman.