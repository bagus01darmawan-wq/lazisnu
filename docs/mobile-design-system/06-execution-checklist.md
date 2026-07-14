# Tahap 6 — Execution Checklist

Centang satu fase setelah test fase tersebut lulus.

## Fase A — Baseline

- [ ] Buat branch khusus.
- [ ] Catat status worktree.
- [ ] Jalankan typecheck, lint, dan test.
- [ ] Catat kegagalan yang sudah ada.

## Fase B — Tokens

- [ ] Buat `colors.ts`.
- [ ] Buat `spacing.ts`.
- [ ] Buat `radius.ts`.
- [ ] Buat `component-sizes.ts`.
- [ ] Buat `typography.ts`.
- [ ] Buat `shadows.ts`.
- [ ] Update `theme/index.ts`.
- [ ] Pertahankan alias lama.
- [ ] Jalankan typecheck dan lint.

## Fase C — UI Components

- [ ] Buat `AppButton`.
- [ ] Buat `AppCard`.
- [ ] Buat `StatusBadge`.
- [ ] Buat `AppTextInput`.
- [ ] Buat `SegmentedControl`.
- [ ] Buat `AppHeader`.
- [ ] Buat `SyncBanner`.
- [ ] Buat barrel export.
- [ ] Tambahkan unit test komponen kritis.
- [ ] Jalankan typecheck, lint, dan test.

## Fase D — Auth

- [ ] Migrasi Splash.
- [ ] Migrasi Login.
- [ ] Migrasi OTP.
- [ ] Uji password login.
- [ ] Uji OTP.
- [ ] Uji cold start token valid.

## Fase E — Main UI

- [ ] Migrasi Dashboard.
- [ ] Migrasi Tasks.
- [ ] Migrasi Scan tanpa mengubah scan guard.
- [ ] Migrasi Collection tanpa mengubah payload.
- [ ] Migrasi History tanpa melanggar immutable collections.
- [ ] Migrasi Profile.
- [ ] Migrasi tab bar.

## Fase F — Regression

- [ ] Typecheck lulus.
- [ ] Lint lulus.
- [ ] Unit test lulus.
- [ ] Build debug lulus.
- [ ] Online submit lulus.
- [ ] Offline queue lulus.
- [ ] Auto-sync lulus.
- [ ] QR error states lulus.
- [ ] Resubmit lulus.
- [ ] Logout lulus.
- [ ] Simpan laporan testing bertanggal.

## Aturan Stop

Hentikan migrasi dan perbaiki sebelum lanjut jika:

- Typecheck gagal akibat kontrak navigasi.
- QR dapat diproses dua kali.
- Nominal berubah menjadi decimal/string pada payload.
- Offline record tidak tersimpan.
- Transaksi lama di-update/delete saat koreksi.
- Login/token initialization mengalami regresi.

## Learning Checkpoint

Setelah setiap fase, jawab:

1. Token atau komponen apa yang baru dibuat?
2. Duplikasi apa yang berhasil dihapus?
3. Business logic apa yang sengaja tidak diubah?
4. Test apa yang membuktikan perubahan aman?
5. Apa satu hal yang masih belum dipahami?

