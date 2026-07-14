# Tahap 0 — Audit dan Aturan Perubahan

## Kondisi Awal

- Theme saat ini berada di `apps/mobile/src/theme/index.ts`.
- Palet aktif masih menggunakan Emerald dan Blue lama.
- Beberapa screen sudah memakai `Colors`, `Spacing`, `Typography`, dan `Shadows`.
- Beberapa screen lain masih memiliki warna dan ukuran hardcoded.
- Folder reusable UI `apps/mobile/src/components/ui/` belum tersedia.

## Audit Sebelum Menulis Kode

Jalankan:

```powershell
rg -n "Colors\.|Spacing\.|Typography\.|Shadows\.|#[0-9A-Fa-f]{6}" apps/mobile/src
pnpm --filter lazisnu-collector-app typecheck
pnpm --filter lazisnu-collector-app lint
pnpm --filter lazisnu-collector-app test
```

Simpan hasil sebagai baseline. Jika baseline sudah gagal, catat kegagalannya dan jangan menganggapnya disebabkan oleh design system.

## Keputusan Arsitektur

1. Token UI tetap lokal di `apps/mobile`, bukan `packages/shared-types`, karena token bukan kontrak API.
2. `theme/index.ts` tetap menjadi public entry point agar import lama tidak langsung rusak.
3. Token dipisah per tanggung jawab agar mudah dicari.
4. Komponen dasar tidak boleh memanggil store atau API.
5. Screen tetap bertanggung jawab atas data, navigasi, dan business state.

## Strategi Kompatibilitas

Pertahankan key lama sementara:

```ts
export const Colors = {
  brand: {
    deepGreen: '#2C473E',
    warmBeige: '#F4F1EA',
    emerald: '#1F8243',
    mutedSand: '#EAD19B',
    mutedTeal: '#6B9E9F',
  },

  // Alias sementara untuk screen lama.
  primary: {
    main: '#1F8243',
    dark: '#2C473E',
    light: '#E7F3EA',
    contrast: '#FFFFFF',
  },
};
```

Hapus alias hanya setelah `rg "Colors\.primary|Colors\.secondary" apps/mobile/src` tidak menghasilkan pemakaian aktif.

## Definition of Done Tahap 0

- Baseline test tercatat.
- Tidak ada perubahan API/database.
- File terdampak telah dipetakan.
- Strategi alias lama dipahami.

