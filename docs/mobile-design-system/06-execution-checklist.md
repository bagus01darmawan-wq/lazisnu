# Tahap 6 — Execution Checklist

Centang satu fase setelah test fase tersebut lulus.

## Fase A — Baseline

- [x] Buat branch khusus.
- [x] Catat status worktree.
- [x] Jalankan typecheck, lint, dan test.
- [x] Catat kegagalan yang sudah ada.

## Fase B — Tokens

- [x] Buat `colors.ts`.
- [x] Buat `spacing.ts`.
- [x] Buat `radius.ts`.
- [x] Buat `component-sizes.ts`.
- [x] Buat `typography.ts`.
- [x] Buat `shadows.ts`.
- [x] Update `theme/index.ts`.
- [x] Pertahankan alias lama.
- [x] Jalankan typecheck dan lint.

## Fase C — UI Components

- [x] Buat `AppButton`.
- [x] Buat `AppCard`.
- [x] Buat `StatusBadge`.
- [x] Buat `AppTextInput`.
- [x] Buat `SegmentedControl`.
- [x] Buat `AppHeader`.
- [x] Buat `SyncBanner`.
- [x] Buat barrel export.
- [x] Tambahkan unit test komponen kritis.
- [x] Jalankan typecheck, lint, dan test.

## Fase D — Auth

- [x] Migrasi Splash.
- [x] Migrasi Login.
- [x] Migrasi OTP.
- [x] Uji password login.
- [x] Uji OTP.
- [x] Uji cold start token valid.

## Fase E — Main UI

- [x] Migrasi Dashboard.
- [x] Migrasi Tasks.
- [x] Migrasi Scan tanpa mengubah scan guard.
- [x] Migrasi Collection tanpa mengubah payload.
- [x] Migrasi History tanpa melanggar immutable collections.
- [x] Migrasi Profile.
- [x] Migrasi tab bar.

## Fase F — Regression

- [x] Typecheck lulus.
- [x] Lint lulus.
- [x] Unit test lulus.
- [x] Build debug lulus.
- [x] Online submit lulus.
- [x] Offline queue lulus.
- [x] Auto-sync lulus.
- [x] QR error states lulus.
- [x] Resubmit lulus.
- [x] Logout lulus.
- [x] Simpan laporan testing bertanggal.

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

