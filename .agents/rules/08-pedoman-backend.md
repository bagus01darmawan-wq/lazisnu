---
trigger: model_decision
---

# Rule: Pedoman Backend API
# Scope: Backend agent — semua task yang menyentuh apps/backend/

---

## Stack & Versi

```
Runtime   : Node.js 20 LTS
Framework : Fastify 4.x + TypeScript
ORM       : Drizzle ORM
Database  : PostgreSQL 16
Cache     : Redis 7 via ioredis
Queue     : BullMQ
Scheduler : node-cron
Validator : Zod
```

---

## Struktur Plugin Fastify

```typescript
// apps/backend/src/app.ts
// Urutan plugin registration PENTING — jangan diubah:

app.register(fastifyHelmet)           // 1. Security headers
app.register(fastifyCors, corsOptions) // 2. CORS
app.register(fastifyRateLimit, rateOptions) // 3. Rate limiting
app.register(fastifyJwt, jwtOptions)  // 4. JWT plugin
app.register(dbPlugin)                // 5. Database connection
app.register(redisPlugin)             // 6. Redis connection
app.register(auditLoggerPlugin)       // 7. Audit trail middleware

// Routes — register setelah semua plugin:
app.register(authRoutes,       { prefix: '/auth' })
app.register(wilayahRoutes,    { prefix: '/wilayah' })
app.register(usersRoutes,      { prefix: '/users' })
app.register(kalengRoutes,     { prefix: '/kaleng' })
app.register(assignmentRoutes, { prefix: '/assignments' })
app.register(koleksiRoutes,    { prefix: '/koleksi' })
app.register(laporanRoutes,    { prefix: '/laporan' })
```

---

## Middleware yang Harus Dipasang

### JWT Auth Middleware
```typescript
// src/middleware/jwt-auth.ts
// Pasang sebagai preHandler di semua route protected

export async function jwtAuthMiddleware(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    // req.user sudah terisi dengan JwtPayload setelah ini
  } catch {
    throw new AppError('UNAUTHORIZED', 'Token tidak valid atau expired', 401)
  }
}
```

### Role Guard
```typescript
// src/middleware/role-guard.ts
// Factory function — buat untuk setiap kombinasi role yang diizinkan:

export const requireRole = (...allowedRoles: UserRole[]) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError('FORBIDDEN', 'Akses ditolak untuk role ini', 403)
    }
  }

// Contoh pemakaian di route:
{
  preHandler: [jwtAuthMiddleware, requireRole('admin_kecamatan')],
  handler: generateQrBatchHandler
}
```

### Audit Logger
```typescript
// src/middleware/audit-logger.ts
// Gunakan Fastify onResponse hook — berjalan SETELAH handler selesai

fastify.addHook('onResponse', async (req, reply) => {
  const shouldLog =
    ['POST', 'PUT'].includes(req.method) &&
    reply.statusCode >= 200 && reply.statusCode < 300 &&
    req.user != null &&
    !req.url.startsWith('/auth')

  if (!shouldLog) return

  await auditLogService.log({
    userId    : req.user.id,
    action    : `${req.method} ${req.routerPath}`,
    entity    : inferEntity(req.routerPath),
    entityId  : (req.params as any)?.id ?? null,
    oldValue  : req.auditContext?.oldValue ?? null,
    newValue  : req.auditContext?.newValue ?? null,
    ipAddress : req.headers['x-forwarded-for']?.toString() ?? req.ip,
  })
})
```

---

## Drizzle ORM — Konvensi

```typescript
// Schema definition (src/database/schema/koleksi.schema.ts):
export const koleksi = pgTable('koleksi', {
  id              : uuid('id').primaryKey().defaultRandom(),
  kalengId        : uuid('kaleng_id').notNull().references(() => kaleng.id),
  nominal         : bigint('nominal', { mode: 'number' }).notNull(),
  metodeBayar     : metodeBayarEnum('metode_bayar').notNull(),
  submitSequence  : integer('submit_sequence').notNull().default(1),
  isLatest        : boolean('is_latest').notNull().default(true),
  alasanResubmit  : text('alasan_resubmit'),
  createdAt       : timestamp('created_at').notNull().defaultNow(),
})

// Query pattern:
const tasks = await db
  .select()
  .from(assignments)
  .innerJoin(kaleng, eq(assignments.kalengId, kaleng.id))
  .where(and(
    eq(assignments.petugasId, userId),
    eq(assignments.periodeBulan, bulan),
    eq(assignments.isActive, true)
  ))
```

---

## BullMQ — WhatsApp Queue

```typescript
// src/workers/wa-sender.ts
import { Worker, Queue } from 'bullmq'

export const waQueue = new Queue('wa-notifications', { connection: redis })

export const waWorker = new Worker('wa-notifications', async (job) => {
  const { koleksiId } = job.data

  // Ambil data yang dibutuhkan
  const detail = await getKoleksiDetail(koleksiId)

  // Kirim WA
  await sendWhatsApp({
    to      : detail.nomor_hp_pemilik,
    template: detail.submit_sequence === 1
                ? process.env.WA_TEMPLATE_SUBMIT!
                : process.env.WA_TEMPLATE_RESUBMIT!,
    params  : [detail.nama_pemilik, formatRupiah(detail.nominal), formatTanggal(detail.created_at)]
  })

  // Update wa_status di DB
  await db.update(koleksiTable)
    .set({ waStatus: 'sent', waSentAt: new Date() })
    .where(eq(koleksiTable.id, koleksiId))

}, {
  connection: redis,
  attempts  : 3,
  backoff   : { type: 'exponential', delay: 60_000 }, // 1 menit, 5 menit, 30 menit
})

waWorker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= 3) {
    await db.update(koleksiTable)
      .set({ waStatus: 'failed' })
      .where(eq(koleksiTable.id, job.data.koleksiId))
  }
})
```

---

## node-cron — Scheduler

```typescript
// src/jobs/assignment-generator.ts
import cron from 'node-cron'

// Jalankan tiap tanggal 1 pukul 00.00 WIB
cron.schedule('0 17 0 1 * *', async () => {
  // 17.00 UTC = 00.00 WIB
  const bulanSebelumnya = getPreviousMonth()
  const bulanBaru       = getCurrentMonth()

  const lastAssignments = await db.query.assignments.findMany({
    where: and(
      eq(assignments.periodeBulan, bulanSebelumnya.bulan),
      eq(assignments.periodeТahun, bulanSebelumnya.tahun),
      eq(assignments.isActive, true)
    )
  })

  // Duplikasi ke bulan baru
  await db.insert(assignments).values(
    lastAssignments.map(a => ({
      ...a,
      id           : randomUUID(),
      periodeBulan : bulanBaru.bulan,
      periodeТahun : bulanBaru.tahun,
      assignedBy   : SYSTEM_USER_ID,
      createdAt    : new Date(),
    }))
  )

  // Kirim FCM ke semua petugas
  await notificationService.broadcast('ASSIGNMENT_NEW', 'Assignment bulan baru tersedia')
}, { timezone: 'Asia/Jakarta' })
```

---

## Generate QR PDF

```typescript
// Gunakan library: pdfkit atau pdf-lib
// Layout per halaman A4: 2 kolom x 5 baris = 10 QR per halaman
// Setiap QR cell berisi:
//   - QR image (generated dari qr_token menggunakan library qrcode)
//   - kode_unik (teks kecil di bawah QR)
//   - nama_pemilik (teks di bawah kode)
//   - alamat singkat (truncate jika > 40 karakter)

// Setelah PDF dibuat:
// Upload ke Cloudflare R2 dengan nama: qr-batch-{timestamp}.pdf
// Return signed URL dengan expiry 1 jam untuk download
```

---

## Environment & Security

```
Rate limiting: 100 req/menit per IP untuk semua endpoint
Rate limiting login: 5 percobaan per menit per IP

JWT secret WAJIB di-rotate secara berkala di production
APP_SECRET untuk HMAC QR TIDAK BOLEH sama dengan JWT secret

Jangan pernah log:
- Password atau password hash
- JWT token
- APP_SECRET atau JWT secret
- Nomor HP pengguna di log level INFO atau DEBUG
```

---

*Lazisnu Infaq Collection System — rules/08-pedoman-backend.md*
