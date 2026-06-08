# Implementation Plan — Tema 6: Error Handling, Logging & Observability

> **Tujuan**: Menyatukan fondasi error handling & observability backend yang sudah ada menjadi satu jalur standar end-to-end, plus melengkapi readiness check, correlation ID, dan audit reliability.
>
> **Prinsip**:
> - **Single pipeline**: `requestId → route → service → AppError/ErrorCatalog → global handler → structured log → audit/metrics`.
> - **Error internal tidak bocor ke client** (selalu sanitize non-`AppError`).
> - **Audit tidak boleh silent data loss** untuk event finansial/security.
> - **Readiness ≠ liveness**: pisahkan endpoint agar deployment tidak salah menilai service siap.
> - Naming Inggris untuk code/log field, Indonesia untuk label UI/error message.

---

## Ringkasan Eksekutif

| Fase | Prioritas | Fokus | Kompleksitas |
|------|-----------|-------|--------------|
| 1 | P0 | Readiness + liveness check | Rendah–Sedang |
| 2 | P1 | Global error handler (`AppError` aware + sanitasi) | Sedang |
| 3 | P2 | Correlation ID / request ID end-to-end | Sedang |
| 4 | P3 | Audit failed security events + auth/ownership events | Sedang |
| 5 | P4 | Audit reliability (structured log + queue untuk event wajib) | Sedang–Tinggi |
| 6 | P5 | Konsolidasi error pattern (sisa `reply.status().send`, `throw { status,... }`) | Rendah–Sedang |
| 7 | P6 | Backend Sentry + `/metrics` sederhana | Sedang |

**Catatan urutan**: Fase 1 & 2 adalah fondasi. Fase 3 jadi prasyarat untuk Fase 4–6 (audit/metrics lebih baik kalau request ID ada). Fase 7 bisa partial.

---

## Fase 1 — P0: Readiness + Liveness Check

**Tujuan**: Deployment tidak salah menilai service siap padahal dependency (DB/Redis/queue) down.

### 1.1 Endpoint terpisah

| Method | Path | Tujuan | Return 200 jika |
|--------|------|--------|-----------------|
| `GET` | `/health/live` | Liveness (proses hidup) | selalu |
| `GET` | `/health/ready` | Readiness (siap layani) | DB ping OK, Redis ping OK, queue tidak down |
| `GET` | `/health` | Backward compat (alias ke `/health/live`) | sama dengan liveness |

### 1.2 Implementasi

- `apps/backend/src/routes/health.ts` — 3 endpoint dengan schema Fastify untuk dokumentasi.
- Pengecekan dependency:
  - **DB**: `await db.execute(sql\`SELECT 1\`)` dengan timeout 2 detik.
  - **Redis**: `await redisConnection.ping()` dengan timeout 2 detik.
  - **BullMQ**: cek apakah queue `whatsapp-queue` dapat di-`getJobCounts` (opsional, jika ada queue).
- Response shape:
  ```ts
  // 200 OK
  { success: true, status: 'ready', checks: { db: 'ok', redis: 'ok', queue: 'ok' } }

  // 503 Service Unavailable
  { success: false, status: 'not_ready', checks: { db: 'ok', redis: 'down: timeout', queue: 'ok' } }
  ```

### 1.3 Test

- Mock DB down → expect 503 + `db: 'down'`.
- Mock Redis down → expect 503 + `redis: 'down'`.
- Mock keduanya down → expect 503 dengan daftar check.

### Acceptance
- [ ] `/health/live` selalu return 200.
- [ ] `/health/ready` return 503 saat DB/Redis down.
- [ ] Tidak ada log misleading "Connected to PostgreSQL" tanpa test connection real.

---

## Fase 2 — P1: Global Error Handler `AppError`-Aware

**Tujuan**: Satukan jalur error handling. Semua error non-`AppError` di-sanitize sebelum dikirim ke client.

### 2.1 Audit & katalog error yang sudah ada

- `utils/AppError.ts` ✅
- `utils/errorCatalog.ts` ✅
- `isAppError()` type guard ✅
- `sendError` / `sendInternalError` ✅

Yang kurang: **satu pintu final** di `setErrorHandler` Fastify.

### 2.2 Modifikasi `app.ts` `setErrorHandler`

```ts
// Pseudocode
fastify.setErrorHandler((error, request, reply) => {
  const requestId = request.id;

  if (error instanceof AppError) {
    // Domain error: kirim code + message + statusCode
    request.log.warn({ err: error, requestId, code: error.code }, 'AppError');
    return reply.status(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message, request_id: requestId, details: error.details },
    });
  }

  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Input tidak valid', request_id: requestId, details: error.errors },
    });
  }

  // Fastify validation
  if (error.validation) {
    return reply.status(400).send({ ... });
  }

  // JWT error
  if (isJwtErrorLike(error)) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token tidak valid atau expired', request_id: requestId },
    });
  }

  // Sanitize: error tidak dikenal → log detail, response generik
  request.log.error({ err: error, requestId }, 'Unhandled error');
  return reply.status(500).send({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan server', request_id: requestId },
  });
});
```

### 2.3 Refactor `sendInternalError` — defer ke global handler

Ubah `sendInternalError` agar melempar AppError bukan reply langsung. Ini memungkinkan global handler mencatat log + audit secara konsisten.

```ts
// utils/response.ts
export function sendInternalError(err: unknown, request: FastifyRequest, fastify: any): never {
  // Lempar AppError, biarkan global handler yang reply
  throw AppError.fromUnknown(err);
}
```

Atau alternatif: `sendInternalError` tetap reply langsung, tapi tambahkan path `throwOrReply` untuk kasus di mana kita ingin global handler yang handle.

### 2.4 Konvensi baru di route

- **Domain error**: `throw Errors.XXX(...)` → global handler reply.
- **Validation error**: `throw new ZodError(...)` atau pakai `validate(schema).parse(body)` di schema Fastify.
- **Unexpected error**: biarkan bubble up → global handler sanitize.

### Acceptance
- [ ] `setErrorHandler` mengenali `AppError`, `ZodError`, Fastify validation, dan JWT error.
- [ ] Error non-`AppError` di-sanitize (response generik, log detail).
- [ ] Setiap response error membawa `request_id`.

---

## Fase 3 — P2: Correlation ID / Request ID End-to-End

**Tujuan**: Setiap request punya ID yang bisa dilacak dari `mobile → backend → DB → BullMQ → worker → WhatsApp`.

### 3.1 Middleware correlation ID

`apps/backend/src/middleware/correlationId.ts`:

```ts
import { v4 as uuidv4 } from 'uuid';
import type { FastifyRequest, FastifyReply } from 'fastify';

export async function correlationIdHook(request: FastifyRequest, reply: FastifyReply) {
  const incoming = request.headers['x-request-id'] as string | undefined;
  const id = incoming || request.id || uuidv4();
  request.id = id;
  reply.header('x-request-id', id);

  // Child logger dengan request id
  request.log = request.log.child({ requestId: id });
}
```

Daftarkan sebagai `onRequest` hook global (paling awal).

### 3.2 Propagasi ke BullMQ job

- Saat `add()` ke queue, sertakan `requestId` di job data.
- Worker baca `requestId` dari job data, gunakan sebagai child logger.

### 3.3 Propagasi ke `activityLogs`

- Tambah kolom `request_id` (varchar 100) di tabel `activity_logs` (migration).
- Middleware audit logger isi `request_id` dari `request.id`.

### 3.4 Response header

- Setiap response (sukses maupun error) membawa `x-request-id`.

### 3.5 Test

- Request tanpa `x-request-id` → response berisi `x-request-id` baru.
- Request dengan `x-request-id` → response echo ID yang sama.
- Audit log entry menyimpan `request_id`.

### Acceptance
- [ ] `x-request-id` selalu di response header.
- [ ] Logger per-request berisi field `requestId`.
- [ ] BullMQ job meneruskan `requestId` ke worker.
- [ ] `activity_logs.request_id` terisi.

---

## Fase 4 — P3: Audit Failed Security Events

**Tujuan**: Audit bukan hanya mutation sukses, tapi juga failed security events (401/403, ownership violation, dll).

### 4.1 Extend `audit-logger.ts`

Tambah event types baru di `activityLogs.actionType`:

```sql
-- Tambah ke enum/check:
'AUTH_FAILED'
'OWNERSHIP_DENIED'
'SESSION_REVOKED'
'PASSWORD_CHANGED'
'LOGOUT'
'LOGOUT_OTHER_DEVICES'
```

### 4.2 Hook global

Tambah `onResponse` atau `onError` hook yang audit security events:

- Status 401 → audit `AUTH_FAILED` dengan route + ip.
- Status 403 dengan code `FORBIDDEN_SCOPE` → audit `OWNERSHIP_DENIED`.
- Endpoint `/auth/logout` sukses → audit `LOGOUT`.
- Endpoint `/auth/sessions/:id` DELETE → audit `SESSION_REVOKED`.

### 4.3 Manual audit di route tertentu

Di `routes/auth.ts` (sudah ada `LOGIN_SUCCESS`, `FAILED_LOGIN`, `FAILED_OTP`) — perluas dengan:
- `PASSWORD_CHANGED` saat endpoint change password (jika ada).
- `LOGOUT` sudah ter-handle via response hook.

### Acceptance
- [ ] `AUTH_FAILED` ter-insert untuk setiap 401.
- [ ] `OWNERSHIP_DENIED` ter-insert untuk setiap 403 `FORBIDDEN_SCOPE`.
- [ ] `LOGOUT` ter-insert untuk setiap logout.
- [ ] `SESSION_REVOKED` ter-insert untuk setiap DELETE `/auth/sessions/:id`.

---

## Fase 5 — P4: Audit Reliability

**Tujuan**: Audit finansial/security **wajib** tidak boleh silent data loss.

### 5.1 Replace `console.error` dengan structured logger

- `apps/backend/src/middleware/audit-logger.ts`: ganti `console.error` ke `fastify.log.error`.
- Semua worker (whatsapp, scan-qr, sync) yang pakai `console.log/error` → ganti ke `fastify.log` atau logger yang di-inject.

### 5.2 Audit queue untuk event wajib

- BullMQ queue `audit-queue` untuk event bertag `CRITICAL` (mis. `RESUBMIT_COLLECTION`, `PAYMENT_RECEIVED`, `PASSWORD_CHANGED`).
- Worker `auditWorker` insert ke `activityLogs` dengan retry policy (3× retry, exponential backoff).
- Jika gagal setelah retry → dead-letter Redis list `audit:dlq` + alert log.

### 5.3 Best-effort vs wajib

Pisahkan 2 jalur:
- **Best-effort**: `activityLogs.insert()` langsung (untuk event monitoring).
- **Wajib**: enqueue ke `audit-queue` (untuk event finansial/security). Worker yang commit ke DB.

### 5.4 Alert

Tambah log level `error` untuk setiap audit insert failure (sudah ada, tapi verifikasi).

### Acceptance
- [ ] Tidak ada `console.error` di `middleware/audit-logger.ts`.
- [ ] Queue `audit-queue` dibuat dan worker berjalan.
- [ ] DLQ list untuk event wajib yang gagal.

---

## Fase 6 — P5: Konsolidasi Error Pattern

**Tujuan**: Migrasikan sisa pola error non-standar.

### 6.1 Sisa `reply.status().send()` manual

Cari dan refactor:
- `middleware/auth.ts` (authenticate)
- `admin/dukuhs.ts` (sudah ada, sisa 1 di DUKUH_IN_USE)
- `admin/dashboard.ts`
- Fallback di `app.ts`

Untuk `DUKUH_IN_USE` di dukuhs.ts: ganti dengan `throw Errors.DUKUH_IN_USE()` (tambah code baru di catalog).

### 6.2 Sisa `throw { status, code, message }`

- `routes/mobile/collections.ts` line ~44 (pattern throw object). Ganti dengan `throw Errors.FORBIDDEN_SCOPE()` atau `throw Errors.MISMATCH()` (tambah jika perlu).

### 6.3 Sisa `throw new Error('CODE')`

Dari Tema 4 sudah diselesaikan. Verifikasi `grep -r "throw new Error" apps/backend/src` hasilnya kosong (atau hanya di test files).

### 6.4 Tambah ErrorCode baru

```ts
DUKUH_IN_USE: 'Dukuh tidak bisa dihapus karena masih digunakan oleh kaleng yang sedang AKTIF'
COLLECTION_IN_USE: 'Tidak bisa dihapus karena masih ada data terkait'
```

### Acceptance
- [ ] `grep -r "reply.status().send" apps/backend/src/routes` ≤ 2 (hanya untuk yang memang butuh custom shape, mis. 401 authenticate).
- [ ] `grep -r "throw { status" apps/backend/src` kosong.
- [ ] `grep -r "throw new Error" apps/backend/src` kosong.

---

## Fase 7 — P6: Backend Sentry + `/metrics`

**Tujuan**: Error capture ke Sentry dan metrics minimal.

### 7.1 Sentry init

- Tambah `@sentry/node` ke dependencies.
- `apps/backend/src/config/sentry.ts`:
  ```ts
  import * as Sentry from '@sentry/node';
  export function initSentry() {
    if (!config.SENTRY_DSN) return;
    Sentry.init({
      dsn: config.SENTRY_DSN,
      environment: config.NODE_ENV,
      tracesSampleRate: 0.1,
      beforeSend(event) {
        // Sanitize: hapus data sensitif dari event
        return event;
      },
    });
  }
  ```
- Panggil `initSentry()` di `app.ts` **sebelum** fastify.
- Integrasi dengan Fastify: `fastify.register(Sentry.fastifyIntegration())` (atau pakai manual error capture di `setErrorHandler`).

### 7.2 `/metrics` endpoint

- Tambah `prom-client` (atau `fastify-metrics`).
- `apps/backend/src/routes/metrics.ts`:
  ```
  GET /metrics (text/plain; Prometheus format)
  ```
- Metrics minimum:
  - `http_request_total{method,route,status}`
  - `http_request_duration_seconds{method,route,status}` (histogram)
  - `audit_log_insert_total{status}` (success/fail)
  - `whatsapp_job_total{status}` (success/fail/queued)
  - `bullmq_queue_size{queue}` (depth)

### 7.3 Queue metrics

- Hook ke BullMQ event listener (`completed`, `failed`, `waiting`).
- Increment counter Prometheus.

### 7.4 Test manual

- Trigger 1 error → cek Sentry dashboard.
- Trigger `/metrics` → cek response Prometheus.

### Acceptance
- [ ] `@sentry/node` terinstall dan `initSentry()` jalan.
- [ ] `GET /metrics` return text Prometheus.
- [ ] Counter `http_request_total` ter-increment per request.
- [ ] Error capture ke Sentry untuk error non-`AppError`.

---

## File yang Akan Disentuh / Dibuat

### Baru
- `apps/backend/src/routes/health.ts`
- `apps/backend/src/middleware/correlationId.ts`
- `apps/backend/src/services/auditQueue.ts`
- `apps/backend/src/config/sentry.ts`
- `apps/backend/src/routes/metrics.ts`
- `apps/backend/src/utils/auditLogger.ts` (refactor dari middleware/audit-logger.ts)
- `apps/backend/migrations/0003_audit_request_id.sql`

### Diubah
- `apps/backend/src/app.ts` (setErrorHandler, onRequest hook, register routes baru)
- `apps/backend/src/utils/errorCatalog.ts` (tambah `DUKUH_IN_USE`, `COLLECTION_IN_USE`)
- `apps/backend/src/utils/response.ts` (`sendInternalError` defer ke global handler)
- `apps/backend/src/middleware/auth.ts` (sisa `reply.status().send` → `throw AppError`)
- `apps/backend/src/middleware/audit-logger.ts` (console.error → structured log, tambah event types)
- `apps/backend/src/database/schema.ts` (`activityLogs.requestId` column)
- `apps/backend/src/services/whatsapp.ts` (propagate requestId, log via fastify.log)
- `apps/backend/src/routes/mobile/collections.ts` (`throw { status }` → `throw Errors.X`)
- `apps/backend/src/routes/admin/dukuhs.ts` (sisa manual reply → AppError)
- `apps/backend/src/config/env.ts` (`SENTRY_DSN` optional)
- `apps/backend/.env.example` (tambah Sentry, audit queue)

---

## Strategi Rollout

1. **Fase 1 (readiness)** paling aman dan berdiri sendiri — deploy dulu.
2. **Fase 2 (global handler)** butuh extra hati-hati, deploy dengan monitoring.
3. **Fase 3 (request ID)** non-breaking, deploy setelah Fase 2 siap (handler pakai requestId).
4. **Fase 4 (audit security)** butuh skema baru, deploy migration dulu → kode.
5. **Fase 5 (audit queue)** butuh setup BullMQ worker.
6. **Fase 6 (konsolidasi)** cleanup, bisa kapan saja.
7. **Fase 7 (Sentry/metrics)** optional, bisa partial (Sentry dulu, metrics kemudian).

---

## Validasi Akhir

- [ ] `pnpm --filter backend lint` hijau
- [ ] `pnpm --filter backend test` hijau (test readiness, error handler, correlation ID, audit events)
- [ ] `pnpm --filter backend typecheck` hijau
- [ ] `/health/live` return 200
- [ ] `/health/ready` return 503 saat DB/Redis disimulasikan down
- [ ] Setiap response error membawa `x-request-id` di header
- [ ] `setErrorHandler` mengenali `AppError`, `ZodError`, Fastify validation, JWT error
- [ ] Audit events `AUTH_FAILED`, `OWNERSHIP_DENIED`, `LOGOUT`, `SESSION_REVOKED` ter-insert
- [ ] `audit-queue` berjalan dengan retry policy
- [ ] `grep -r "reply.status().send" apps/backend/src/routes` ≤ 2
- [ ] `grep -r "throw { status" apps/backend/src` kosong
- [ ] `grep -r "throw new Error" apps/backend/src` kosong
- [ ] Sentry dashboard menerima event dari backend
- [ ] `GET /metrics` return Prometheus format

---

## Out of Scope (untuk Tema lain)

- Distributed tracing (OpenTelemetry) end-to-end
- APM tool commercial (DataDog, NewRelic)
- Custom dashboards (Grafana)
- Alert system (PagerDuty, Slack)
