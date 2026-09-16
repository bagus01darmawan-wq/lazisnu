# Plan F5 + F6: error.tsx palette + ConfirmToast warning variant

**Finding ref:** F5 + F6 (audit 2026-09-05)
**Confidence:** Medium (F5) + Low (F6)
**Scope:** 2 file
**Risiko:** Rendah — cosmetic only

## Tujuan

Migrating error page ke palet brand, dan menurunkan dominasi visual tombol confirm `warning` variant agar tidak ambigu dengan CTA Primer (yang juga `bg-[#EAD19B]` per standar §3.1).

## Spesifikasi perubahan

### File 1: `apps/web/src/app/dashboard/error.tsx`

**Ganti baris 19-55** (return JSX):

```tsx
return (
  <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center animate-in zoom-in duration-300">
    <div className="w-20 h-20 bg-[#D97A76]/10 border border-[#D97A76]/30 rounded-full flex items-center justify-center mb-6">
      <AlertCircle size={40} className="text-[#D97A76]" aria-hidden="true" />
    </div>

    <h2 className="text-2xl font-bold text-[#F4F1EA] mb-2">Terjadi Kesalahan</h2>
    <p className="text-[#F4F1EA]/60 max-w-md mb-8">
      Maaf, sistem gagal memuat data. Hal ini mungkin disebabkan oleh masalah koneksi atau sesi yang berakhir.
    </p>

    <div className="flex flex-col sm:flex-row gap-3">
      <Button
        onClick={() => reset()}
        className="bg-[#EAD19B] hover:bg-[#EAD19B]/90 text-[#2C473E] rounded-xl shadow-lg shadow-[#EAD19B]/20"
      >
        <RefreshCcw size={18} className="mr-2" />
        Coba Lagi
      </Button>
      <Link href="/dashboard">
        <Button variant="outline" className="rounded-xl w-full sm:w-auto border-[#F4F1EA]/20 text-[#F4F1EA] hover:bg-white/5">
          <Home size={18} className="mr-2" />
          Kembali ke Beranda
        </Button>
      </Link>
    </div>

    {process.env.NODE_ENV === 'development' && (
      <div className="mt-12 p-4 bg-black/30 border border-white/10 rounded-lg text-left overflow-auto max-w-2xl w-full">
        <p className="text-xs font-mono text-[#F4F1EA]/80 whitespace-pre-wrap">
          {error.message}
          {error.stack}
        </p>
      </div>
    )}
  </div>
);
```

**Yang berubah:** `bg-slate-900/slate-100/slate-900` → palet brand (`#D97A76` container, `#EAD19B` CTA primer, `#F4F1EA` teks). Development-only stack trace jadi kontras rendah di dark bg.

### File 2: `apps/web/src/components/ui/ConfirmToast.tsx`

**Ganti baris 69-73** (kelas untuk variant warning di tombol confirm):

**Sebelum:**
```tsx
className={`flex-1 h-10 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-lg ${
  variant === 'danger'
    ? 'bg-[#DE6F4A] text-white hover:bg-[#DE6F4A]/90 shadow-[#DE6F4A]/20'
    : 'bg-[#EAD19B] text-[#2C473E] hover:bg-[#EAD19B]/90 shadow-[#EAD19B]/20'
}`}
```

**Sesudah:**
```tsx
className={`flex-1 h-10 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-lg ${
  variant === 'danger'
    ? 'bg-[#DE6F4A] text-white hover:bg-[#DE6F4A]/90 shadow-[#DE6F4A]/20'
    : 'bg-[#EAD19B]/20 text-[#EAD19B] border border-[#EAD19B]/40 hover:bg-[#EAD19B]/30 shadow-none'
}`}
```

**Penjelasan:** Warning variant (mis. "Ya, Nonaktifkan" di cans page) sekarang kontras lebih rendah — `bg-[#EAD19B]/20 text-[#EAD19B]` dengan border — tidak lagi "berkompetisi" dengan tombol Tambah Data Primer (`bg-[#EAD19B] solid`). Hierarki: Danger > Primary CTA > Warning confirm > Cancel (ghost).

## Yang TIDAK boleh dilakukan executor

- Jangan ubah icon mapping, alert color, decorative glow (baris 27-44)
- Jangan ubah `title`/`description` copy
- Jangan ubah `cancelLabel` default
- Jangan refactor toast ke AlertDialog — di luar scope
- Jangan ubah Button variant API

## Verifikasi

1. **error.tsx visual:** trigger error dengan navigate ke route yang salah (mis. `/dashboard/tidak-ada` di Next.js 16) → harus tampil di atas dashboard dark dengan hierarki visual jelas (icon soft-red, CTA sand-colored)
2. **ConfirmToast warning:**
   - Buka `cans/page.tsx`, pilih 1 baris, klik "Hapus Terpilih" → toast warning muncul dengan tombol confirm kontras rendah (border + sand/20)
   - Klik "Hapus Permanen" (status NON_ACTIVE) → toast danger dengan tombol `#DE6F4A` solid
   - Konfirmasi hierarki visual: tombol Tambah (`bg-[#EAD19B] solid` Primer) vs tombol "Ya, Nonaktifkan" (`bg-[#EAD19B]/20`) — Primer harus jelas lebih dominan
3. `pnpm typecheck` & `pnpm build` lulus

## Rollback

Single `git revert`. Tidak ada efek samping.

## Catatan

F6 (ConfirmToast warning) adalah Low confidence. Opsional. Anda bisa skip plan ini jika khawatir tonal shift pada hierarki CTA. Namun konsistensi dengan standar §3.1 (satu `bg-[#EAD19B] solid` untuk CTA Primer) adalah invariant yang dijaga.