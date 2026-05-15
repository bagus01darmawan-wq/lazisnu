---
description: Debug error sistematis di backend, web, mobile, database, dan monorepo Lazisnu.
---

# Workflow: /debug-error

## Tujuan

Mendiagnosis error tanpa menebak terlalu cepat. Workflow ini melatih user membaca error, mengisolasi penyebab, lalu memperbaiki dengan aman.

## Langkah Agent

### 1. Kumpulkan Fakta

Minta atau baca:
- pesan error lengkap;
- stack trace;
- command yang dijalankan;
- layer error: backend, web, mobile, database, shared-types;
- perubahan terakhir sebelum error.

Jika informasi sudah diberikan, jangan bertanya ulang.

### 2. Identifikasi Area

Backend:
```bash
pnpm dev:backend
pnpm build:backend
```

Web:
```bash
pnpm dev:web
pnpm build:web
```

Shared types:
```bash
pnpm build:shared
```

Mobile:
```bash
pnpm start:mobile
pnpm --filter lazisnu-collector-app lint
```

Gunakan command yang relevan saja.

### 3. Cek Rule Terkait

- collections/resubmit/financial audit: `02-arsitektur-database.md`, `04-business-rules.md`
- API/backend/auth: `03-api-conventions.md`, `08-pedoman-backend.md`
- web/UI: `07-pedoman-web.md`, `12-standar-ui-web.md`
- mobile/offline/QR: `06-pedoman-mobile.md`

### 4. Diagnosis

Berikan 2-4 hipotesis, lalu langkah verifikasi kecil. Jangan langsung rewrite besar.

### 5. Fix dan Verifikasi

Setelah root cause cukup jelas:
- jelaskan penyebab;
- berikan patch kecil;
- jelaskan risiko;
- sebut command test/build/lint.

## Output

```md
## Debug Report

**Error:** ...
**Layer:** ...
**Kemungkinan penyebab:**
1. ...

**Langkah cek:**
1. ...

**Fix:** ...
**Verifikasi:** ...

## Learning Checkpoint
- Konsep:
- File penting:
- Latihan kecil:
```
