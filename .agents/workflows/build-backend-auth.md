---
description: Audit, lanjutkan, atau perbaiki auth backend Lazisnu tanpa scaffold ulang jika backend sudah ada.
---

# Workflow: /build-backend-auth

## Tujuan

Membantu membangun atau mengecek auth backend Lazisnu. Karena repo saat ini sudah berjalan, workflow ini harus dimulai dari audit implementasi aktual, bukan langsung scaffold ulang.

## Kapan Dipakai

- Membuat auth dari nol di branch baru.
- Memperbaiki login, refresh token, logout, atau `/me`.
- Audit keamanan auth sebelum deploy.
- Menyinkronkan auth backend dengan web/mobile.

## Langkah Agent

### 1. Audit Implementasi Aktual

Cek file terkait di `apps/backend`:
- route auth;
- service auth;
- middleware JWT;
- role guard;
- Redis blacklist/session handling;
- response helper;
- shared types jika ada.

Jangan membuat ulang struktur jika file sudah ada.

### 2. Rule yang Wajib Dibaca

- `AGENTS.md`
- `.agents/rules/03-api-conventions.md`
- `.agents/rules/05-konvensi-kode.md`
- `.agents/rules/08-pedoman-backend.md`
- `.agents/rules/09-environment-variables.md`

### 3. Endpoint Auth yang Harus Dicek

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `GET /auth/me`

Cek:
- format response `{ success, data }` atau `{ success, error }`;
- password hashing;
- access token dan refresh token;
- refresh token blacklist/logout;
- role payload;
- error code yang konsisten.

### 4. Dampak ke Web dan Mobile

Pastikan:
- web memakai cookie/token sesuai implementasi aktual;
- mobile menyimpan token di MMKV;
- interceptor refresh token tidak membuat infinite loop;
- logout membersihkan token lokal dan server-side blacklist jika ada.

### 5. Verifikasi

```bash
pnpm build:backend
pnpm --filter lazisnu-backend test
```

Manual test:
- login valid;
- login invalid;
- refresh valid;
- logout lalu refresh lagi harus gagal;
- `/me` tanpa token harus 401;
- `/me` dengan token valid harus 200.

## Output

```md
## Backend Auth Plan/Review

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
