# Sub-bab 02 — Backend Core

> **Target Minggu**: Minggu 2
> **Prasyarat**: Sub-bab 06 selesai (P0 + P1 kode diperbaiki)
> **Estimasi Total**: 2–3 hari
> **Keputusan**: D-05 (✅), D-06 (✅ Hapus Total auto-scheduler background)

---

## Konteks & Tujuan

Sub-bab ini memastikan **fondasi backend berjalan benar dan aman** setelah perbaikan auth (sub-bab 06):
1. Background scheduler worker yang dikomen dibersihkan dari backend (D-06)
2. JWT menggunakan dua secret terpisah (access vs refresh)
3. Role hantu dihapus dari type dan logika
4. Console.log diganti dengan structured logging (Pino)

Referensi analisis: `analisis-master-lazisnu.md` **Bab 5, 8, 13 (P1-4, P1-8), 19 (R-4, R-8)**

---

## Task List

### A — Bersihkan Dead Code Background Scheduler

> **Keputusan D-06**: Background auto-scheduler tanggal 1 dihapus total. Penugasan 100% via Admin Web (manual / bulk per dukuh).

- [ ] **A1** Buka `apps/backend/src/index.ts` — hapus baris import & registrasi `schedulerWorker` yang dikomen
- [ ] **A2** Hapus atau arsipkan file worker `apps/backend/src/workers/scheduler.worker.ts`
- [ ] **A3** Buka `apps/backend/src/services/assignmentGenerator.ts` — hapus helper `buildFirstOfficerAssignments` yang tidak terpakai
- [ ] **A4** Verifikasi startup backend bersih tanpa error registrasi worker

**Effort**: 1 jam | **Referensi**: D-06 (`decisions-log.md`)

---

### B — Pisahkan JWT Access & Refresh Secret

- [ ] **B1** Buka `apps/backend/src/config/env.ts`:
  - Ubah `JWT_ACCESS_SECRET` dan `JWT_REFRESH_SECRET` dari `optional()` menjadi `z.string().min(32)`
  - Tandai `JWT_SECRET` (tunggal) sebagai deprecated dengan komentar
- [ ] **B2** Buka `apps/backend/src/app.ts:39-42` — update registrasi `@fastify/jwt`:
  - Sign access token dengan `JWT_ACCESS_SECRET`
  - Verify access token dengan `JWT_ACCESS_SECRET`
- [ ] **B3** Buka `apps/backend/src/routes/auth.ts` — update `generateTokens()`:
  - Sign refresh token dengan `JWT_REFRESH_SECRET`
- [ ] **B4** Buka `apps/backend/src/middleware/auth.ts` — update `authenticate()`:
  - Verify access token dengan `JWT_ACCESS_SECRET`
- [ ] **B5** Buka `apps/backend/src/services/qr.ts:5` — perhatikan, ini mungkin memakai `JWT_SECRET` untuk QR — update jika perlu, atau gunakan secret terpisah `QR_SECRET`
- [ ] **B6** Update `.env` dan `.env.example`: tambah `JWT_ACCESS_SECRET` dan `JWT_REFRESH_SECRET`, isi dengan nilai berbeda (≥32 karakter random)
- [ ] **B7** Rotate: deployment pertama setelah perubahan ini akan membuat semua sesi lama mati (one-time event — acceptable)
- [ ] **B8** Test: `pnpm --filter lazisnu-backend test:unit` — semua hijau

**Effort**: ½ hari + test
**Referensi**: INFRA-15 (Bab 18.2) + I-7 (Bab 21)

---

### C — Hapus Role Hantu

- [ ] **C1** Buka `apps/backend/src/middleware/auth.ts:12` — hapus `ADMIN_PUSAT` dan `ADMIN_KABUPATEN` dari type `JWTPayload.role`
- [ ] **C2** Buka `apps/backend/src/middleware/ownership.ts:29` — hapus/ubah `case 'ADMIN_PUSAT'` yang bypass semua scope
- [ ] **C3** Buka `apps/backend/src/middleware/ownership.ts:62` — hapus/ubah `assertDistrictAccess` untuk `ADMIN_KABUPATEN`
- [ ] **C4** Pastikan hanya 4 role valid: `ADMIN_KECAMATAN`, `ADMIN_RANTING`, `BENDAHARA`, `PETUGAS` (sesuai `schema.ts:5`)
- [ ] **C5** Run TypeScript check: `pnpm --filter lazisnu-backend exec tsc --noEmit`
- [ ] **C6** Test: pastikan semua route masih berfungsi dengan 4 role yang valid

**Effort**: 2 jam
**Referensi**: P2 #10 (Bab 14) + R-9/#10 (Bab 19)

---

### D — Structured Logging Pino (mengganti console.log)

- [ ] **D1** Buka `apps/backend/src/app.ts` — tambah konfigurasi logger Fastify:
  ```typescript
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    redact: {
      paths: ['req.headers.authorization', 'body.password', 'body.otp'],
      censor: '[REDACTED]'
    }
  }
  ```
- [ ] **D2** Buka `apps/backend/src/workers/whatsapp.worker.ts:13,37-45` — ganti semua `console.log`/`console.error` dengan logger Fastify atau Pino logger bersama
- [ ] **D3** Buka `apps/backend/src/workers/scheduler.worker.ts` — ganti semua 10+ `console.log` dengan logger
- [ ] **D4** Buka `apps/backend/src/services/whatsapp.ts:128,170,211` — ganti `console.log`/`console.error`
- [ ] **D5** Verifikasi: output log di local adalah JSON (bukan pretty-print)
- [ ] **D6** Verifikasi: field `authorization`, `password`, `otp` tidak muncul di log output

**Effort**: 1–2 hari
**Referensi**: INFRA-11 (Bab 18.2) + I-11 (Bab 21)

---

### E — Cleanup Hygiene P3 Backend

- [ ] **E1** Buka `apps/backend/src/routes/admin/index.ts:18-25` — putuskan: hapus atau daftarkan `collections.ts`
  - Jika dihapus: `rm apps/backend/src/routes/admin/collections.ts`
  - Jika didaftarkan: pastikan tidak duplikat dengan `bendahara.ts` + report services
- [ ] **E2** Buka `apps/backend/src/routes/bendahara.ts:5` — hapus unused import `getRoleScope`
- [ ] **E3** Run lint: `pnpm --filter lazisnu-backend run lint` — tidak ada error

**Effort**: 1 jam
**Referensi**: Temuan P3 (Bab 15)

---

## Verifikasi & Done Criteria

Checklist wajib sebelum sub-bab ini dinyatakan selesai:

- [ ] `pnpm --filter lazisnu-backend test:unit` — semua hijau ✅
- [ ] `pnpm --filter lazisnu-backend run lint` — tidak ada error ✅
- [ ] `pnpm --filter lazisnu-backend exec tsc --noEmit` — tidak ada error ✅
- [ ] Log output: JSON, field sensitif di-redact ✅
- [ ] Dead code background scheduler dibersihkan ✅
- [ ] D-06 sudah diputuskan (Hapus Total) ✅

---

## Catatan Risiko

> ⚠️ **B7 — JWT Secret Rotation**: semua sesi aktif akan mati saat pertama deploy dengan secret baru. Informasikan ke semua user. Di mobile, petugas cukup login ulang (1x) lalu aktifkan biometrik (Sub-bab 05).

---

## Referensi

- `analisis-master-lazisnu.md`: Bab 5 (struktur backend), Bab 8 (scheduler), Bab 13 (P1-4, P1-8), Bab 14 (P2 #10), Bab 19 (R-4, R-8, R-9/#10)
- `docs/implementation/decisions-log.md`: D-05, D-06
- File yang dimodifikasi: `index.ts`, `env.ts`, `app.ts`, `routes/auth.ts`, `middleware/auth.ts`, `middleware/ownership.ts`, `services/qr.ts`, `workers/whatsapp.worker.ts`, `services/whatsapp.ts`, `routes/bendahara.ts`, `routes/admin/collections.ts` (delete atau register)
