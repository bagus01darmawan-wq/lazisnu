# Rencana Implementasi Mobile Design System LAZISNU

Dokumen ini menjadi pintu masuk untuk menerapkan konsep visual sembilan mockup ke aplikasi React Native Android di `apps/mobile`.

## Tujuan

- Menyatukan warna, tipografi, jarak, radius, dan bayangan.
- Mengurangi style yang ditulis berulang di setiap screen.
- Membuat komponen UI yang konsisten dan mudah dipahami developer pemula.
- Memigrasikan UI tanpa mengubah API, database, offline queue, atau aturan bisnis.

## Urutan Eksekusi

| Tahap | Dokumen | Hasil |
|---|---|---|
| 0 | [00-audit-dan-aturan.md](./00-audit-dan-aturan.md) | Baseline dan batas perubahan |
| 1 | [01-design-tokens.md](./01-design-tokens.md) | Token visual terpusat |
| 2 | [02-reusable-components.md](./02-reusable-components.md) | Komponen UI dasar |
| 3 | [03-migrasi-auth-screens.md](./03-migrasi-auth-screens.md) | Splash, Login, dan OTP |
| 4 | [04-migrasi-main-screens.md](./04-migrasi-main-screens.md) | Dashboard, Tasks, Scan, Collection, History, Profile |
| 5 | [05-testing-dan-acceptance.md](./05-testing-dan-acceptance.md) | Verifikasi otomatis dan manual |
| 6 | [06-execution-checklist.md](./06-execution-checklist.md) | Checklist pelaksanaan |

Kerjakan berurutan. Jangan memulai migrasi screen sebelum token dan komponen dasar lulus typecheck dan lint.

## Ruang Lingkup File

```text
apps/mobile/src/
├── theme/
│   ├── colors.ts
│   ├── component-sizes.ts
│   ├── radius.ts
│   ├── shadows.ts
│   ├── spacing.ts
│   ├── typography.ts
│   └── index.ts
├── components/
│   └── ui/
│       ├── AppButton.tsx
│       ├── AppCard.tsx
│       ├── AppHeader.tsx
│       ├── AppTextInput.tsx
│       ├── SegmentedControl.tsx
│       ├── StatusBadge.tsx
│       ├── SyncBanner.tsx
│       └── index.ts
└── screens/
    └── ...screen yang dimigrasikan bertahap
```

## Batas Penting

- Android saja; jangan menambahkan kode khusus iOS.
- Jangan mengubah kontrak API atau `packages/shared-types`.
- Jangan mengubah mekanisme MMKV, autentikasi, QR validation, atau offline sync.
- Jangan mengubah transaksi `collections`; koreksi tetap memakai resubmit.
- Tombol utama minimal 56 px dan target sentuh lain minimal 48 px.
- Pertahankan alias token lama selama migrasi agar screen yang belum dimigrasikan tidak rusak.

## Arti `testing-report-[tanggal].md`

Tanda kurung siku adalah placeholder, bukan nama file literal. Ganti `[tanggal]` dengan tanggal pengujian berformat `YYYY-MM-DD`.

Contoh:

```text
docs/testing-report-2026-07-04.md
```

File tersebut berisi catatan hasil typecheck, lint, test, build, dan pengujian manual. Tujuannya agar tim mengetahui apa yang benar-benar sudah diuji, kapan diuji, serta bug apa yang masih tersisa. Laporan hanya perlu dibuat setelah pengujian besar, sebelum merge, UAT, atau release; tidak wajib untuk perubahan kecil.

