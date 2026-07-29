# Tahap 3 — Migrasi Auth Screens

Migrasikan satu screen, test, lalu lanjut ke screen berikutnya.

## 1. Splash

File aktual: `apps/mobile/src/navigation/AppNavigator.tsx`.

Target:

- Background Deep Green.
- Logo dan identitas utama.
- Loading state yang sederhana.
- Tidak menambah route baru hanya untuk styling.

Risiko:

- Jangan mengubah logika `isInitializing`.
- Jangan menyebabkan flash Login sebelum token selesai diperiksa.

## 2. Login

File: `apps/mobile/src/screens/LoginScreen.tsx`.

Komponen:

- `AppHeader` variant auth.
- `AppCard` variant glass/elevated.
- `SegmentedControl` untuk Kata Sandi dan WhatsApp OTP.
- `AppTextInput` untuk nomor HP dan kata sandi.
- `AppButton` untuk login/request OTP.

Pertahankan:

- `requestOTP`.
- validasi nomor HP dan password.
- loading/error.
- password visibility.
- navigasi ke OTP.

## 3. OTP

File: `apps/mobile/src/screens/OTPScreen.tsx`.

Komponen:

- `AppHeader` variant stack.
- `AppCard`.
- `AppButton`.
- `StatusBadge` atau text style untuk countdown.

Pertahankan:

- Enam digit.
- Auto-focus.
- Auto-submit.
- Countdown lima menit.
- Reset input setelah gagal.
- Navigasi kembali untuk request ulang.

## Acceptance Auth

- Token valid tidak menampilkan Login.
- Password login tetap bekerja.
- Request OTP membuka OTP dengan parameter `phone`.
- Hanya angka yang diterima pada OTP.
- Tombol dan input tidak tertutup keyboard.
- Tidak ada token/nominal/PII di log.

