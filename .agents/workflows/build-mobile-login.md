---
description: Audit, lanjutkan, atau perbaiki login mobile Android Lazisnu.
---

# Workflow: /build-mobile-login

## Tujuan

Membantu membangun atau mengecek fondasi login mobile Android Lazisnu. Karena project mungkin sudah punya mobile app, mulai dari audit kondisi aktual dan hindari scaffold ulang.

## Kapan Dipakai

- Login mobile belum selesai.
- Token refresh/logout bermasalah di mobile.
- Splash screen salah redirect.
- MMKV/token storage bermasalah.
- Perlu audit mobile auth sebelum testing.

## Rule yang Wajib Dibaca

- `.agents/rules/06-pedoman-mobile.md`
- `.agents/rules/05-konvensi-kode.md`
- `.agents/rules/03-api-conventions.md`

## Langkah Agent

### 1. Audit Struktur Aktual

Cek di `apps/mobile`:
- navigation/root navigator;
- auth screens;
- auth service;
- API client/interceptor;
- auth store/MMKV;
- dashboard skeleton;
- env API base URL.

Jangan menjalankan `react-native init` jika app sudah ada.

### 2. Checklist Login

Pastikan:
- splash cek token;
- login valid menyimpan access token, refresh token, dan profile;
- login invalid menampilkan pesan manusiawi;
- API base URL benar untuk emulator/device;
- interceptor attach Bearer token;
- refresh token tidak membuat infinite loop;
- logout membersihkan MMKV dan memanggil backend logout jika tersedia.

### 3. Android-first

- Jangan menambahkan iOS-specific code.
- Fokus emulator/device Android.
- Gunakan MMKV untuk data sensitif, bukan AsyncStorage.

### 4. Verifikasi

```bash
pnpm start:mobile
pnpm --filter lazisnu-collector-app lint
```

Manual test:
- buka app tanpa token -> login;
- login valid -> dashboard;
- token expired -> refresh atau logout aman;
- logout -> kembali login;
- network error -> pesan jelas.

## Output

```md
## Mobile Login Plan/Review

**Status aktual:** ...
**File terdampak:** ...
**Masalah utama:** ...
**Langkah perbaikan:** ...
**Cara test:** ...

## Learning Checkpoint
- Konsep:
- File penting:
- Latihan kecil:
```
