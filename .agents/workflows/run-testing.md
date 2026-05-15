---
description: Testing strategy, regression checklist, dan UAT readiness untuk Lazisnu.
---

# Workflow: /run-testing

## Tujuan

Membantu user menjalankan testing bertahap sebelum merge, staging, UAT, atau deploy. Workflow ini tidak menganggap semua fitur sudah selesai; testing disesuaikan dengan area yang sedang dikerjakan.

## Langkah Agent

### 1. Tentukan Scope

Tanyakan atau infer:
- area yang dites: backend, web, mobile, shared-types, database, deploy;
- fitur yang berubah;
- apakah testing untuk bugfix, feature, UAT, atau release.

### 2. Baca Rule Terkait

Minimal:
- `AGENTS.md`
- `.agents/rules/04-business-rules.md`
- skill `lazisnu-testing` jika tersedia

Tambahan sesuai area:
- backend/API: `03-api-conventions.md`, `08-pedoman-backend.md`
- web: `07-pedoman-web.md`, `12-standar-ui-web.md`
- mobile: `06-pedoman-mobile.md`
- database: `02-arsitektur-database.md`

### 3. Test Layer Minimum

Shared:
```bash
pnpm build:shared
```

Backend:
```bash
pnpm build:backend
pnpm --filter lazisnu-backend test
```

Web:
```bash
pnpm build:web
pnpm --filter web lint
```

Mobile:
```bash
pnpm --filter lazisnu-collector-app lint
```

Jalankan hanya command yang relevan dan tersedia.

### 4. Manual Regression Checklist

Untuk setiap fitur, cek:
- happy path;
- invalid input;
- loading state;
- error state;
- empty state;
- role/permission;
- dampak ke backend-web-mobile;
- shared type mismatch;
- data integrity.

### 5. Critical Flow Lazisnu

Prioritaskan:
- login/auth;
- role-based access;
- QR scan;
- submit collection;
- re-submit;
- offline sync;
- WhatsApp queue;
- laporan/export;
- immutable collections.

### 6. Laporan

```md
## Testing Report

**Scope:** ...
**Tanggal:** ...

### Hasil
- [ ] ...

### Bug Kritis
- ...

### Bug Minor
- ...

### Siap lanjut?
YA / BELUM

## Learning Checkpoint
- Konsep:
- File penting:
- Latihan kecil:
```

Jika testing besar selesai, sarankan menyimpan laporan ke `docs/testing-report-[tanggal].md`.
