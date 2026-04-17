---
description: 
---

# Workflow: /build-backend-auth
# Trigger: Ketik /build-backend-auth di chat Antigravity
# Tujuan: Scaffold dan build API autentikasi backend (FASE 2 — Sprint 1)
# Prasyarat: FASE 0 dan FASE 1 sudah selesai, repo sudah ada

---

## Instruksi untuk Agent

Bantu user membangun fondasi backend API untuk project Lazisnu Infaq System.
Baca dulu `.agents/rules/08-pedoman-backend.md` dan `.agents/rules/05-konvensi-kode.md` sebelum menulis kode apapun.

---

### LANGKAH 1 — Setup Project Backend

Jalankan di terminal WSL2 dari folder `apps/backend/`:
```bash
npm init -y
npm install fastify @fastify/jwt @fastify/cors @fastify/helmet @fastify/rate-limit
npm install drizzle-orm drizzle-kit pg
npm install ioredis bullmq node-cron
npm install bcrypt uuid zod
npm install -D typescript ts-node @types/node @types/bcrypt nodemon eslint prettier
npx tsc --init
```

### LANGKAH 2 — Buat Struktur Folder Backend

Buat struktur berikut:
```
apps/backend/src/
├── routes/
├── handlers/
├── services/
├── database/
│   ├── schema/
│   └── migrations/
├── middleware/
│   ├── jwt-auth.ts
│   ├── role-guard.ts
│   └── audit-logger.ts
├── workers/
├── jobs/
└── utils/
    ├── hmac-qr.ts
    ├── response.ts
    └── errors.ts
```

### LANGKAH 3 — Generate File Migrasi Database

Buat 7 file migrasi SQL berdasarkan schema di `.agents/rules/02-arsitektur-database.md`:
- `migrations/001_create_wilayah.sql`
- `migrations/002_create_users.sql`
- `migrations/003_create_kaleng.sql`
- `migrations/004_create_assignments.sql`
- `migrations/005_create_koleksi.sql` ← WAJIB include IMMUTABLE RULE
- `migrations/006_create_wa_logs.sql`
- `migrations/007_create_audit_logs.sql`

**KRITIS untuk migrasi 005**: Sertakan PostgreSQL RULE berikut:
```sql
CREATE RULE no_delete_koleksi AS ON DELETE TO koleksi DO INSTEAD NOTHING;
CREATE RULE no_update_nominal_koleksi AS ON UPDATE TO koleksi
  WHERE OLD.nominal IS DISTINCT FROM NEW.nominal DO INSTEAD NOTHING;
```

### LANGKAH 4 — Buat Endpoint Auth

Buat semua endpoint auth berikut mengikuti pola handler tipis + service tebal:
- `POST /auth/login` — validasi bcrypt, return JWT access + refresh token
- `POST /auth/logout` — blacklist refresh token di Redis
- `POST /auth/refresh` — return access token baru dari refresh token valid
- `GET /auth/me` — return profil user berdasarkan JWT

Format response WAJIB mengikuti konvensi:
```typescript
{ success: true, data: T }
{ success: false, error: { code: string, message: string } }
```

### LANGKAH 5 — Buat Middleware

Buat 3 middleware:
1. `jwt-auth.ts` — verifikasi JWT di setiap request protected
2. `role-guard.ts` — factory function `requireRole(...roles)`
3. `audit-logger.ts` — Fastify `onResponse` hook, catat POST/PUT yang berhasil

### LANGKAH 6 — Setup CI/CD GitHub Actions

Buat `.github/workflows/deploy-staging.yml`:
- Trigger: push ke branch `develop`
- Steps: install deps → lint → test → deploy ke Railway staging

### LANGKAH 7 — Buat Seed Data

Buat `src/database/seed.ts` dengan:
- 1 admin kecamatan
- 2 wilayah ranting
- 5 petugas dummy
- 10 kaleng dummy

### LANGKAH 8 — Verifikasi

Setelah semua selesai:
1. Jalankan migrasi: `npx drizzle-kit push`
2. Jalankan seed: `npx ts-node src/database/seed.ts`
3. Start server: `npm run dev`
4. Test semua endpoint auth via REST Client atau Postman
5. Verifikasi immutable constraint: coba `DELETE FROM koleksi` langsung via psql — harus gagal

Laporkan hasil verifikasi ke user, lalu update `.agents/rules/10-sprint-aktif.md`.
