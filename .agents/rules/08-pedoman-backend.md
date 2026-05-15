---
trigger: manual
---

# Rule: Pedoman Backend API
# Scope: Backend agent — semua task yang menyentuh apps/backend/

---

## Stack & Versi

```
Runtime   : Node.js 20 LTS recommended
Minimum   : Node.js >=18 sesuai root package.json
Framework : Fastify 4.x + TypeScript
ORM       : Drizzle ORM
Database  : PostgreSQL 16 recommended / PostgreSQL 14+ compatible jika environment masih lama
Cache     : Redis 7 via ioredis
Queue     : BullMQ
Validator : Zod
```

Catatan:
- Ikuti `package.json` root dan `apps/backend/package.json` sebagai sumber kebenaran dependency aktual.
- Jangan memberi saran yang membutuhkan Node.js >20 kecuali dependency project sudah mendukung dan user menyetujui upgrade.
- Untuk deployment baru, gunakan Node.js 20 LTS agar konsisten dan aman.

---

## Struktur Plugin Fastify

```typescript
// apps/backend/src/app.ts
// Urutan plugin registration penting jika project memakai plugin terpisah:

app.register(fastifyCors, corsOptions)
app.register(fastifyRateLimit, rateOptions)
app.register(fastifyJwt, jwtOptions)
app.register(dbPlugin)
app.register(redisPlugin)
app.register(auditLoggerPlugin)

// Routes register setelah plugin dasar siap.
```

Jika implementasi aktual belum memakai semua plugin di atas, jangan menambahkan semuanya sekaligus tanpa alasan. Tambahkan hanya yang relevan dengan task.

---

## Middleware yang Harus Dipasang

### JWT Auth Middleware
```typescript
// Pasang sebagai preHandler di semua route protected.
export async function jwtAuthMiddleware(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    throw new AppError('UNAUTHORIZED', 'Token tidak valid atau expired', 401)
  }
}
```

### Role Guard
```typescript
export const requireRole = (...allowedRoles: UserRole[]) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError('FORBIDDEN', 'Akses ditolak untuk role ini', 403)
    }
  }
```

### Audit Logger
```typescript
// Gunakan hook/middleware setelah request berhasil untuk mencatat aksi penting.
// Jangan mencatat password, token, secret, atau data sensitif mentah.
```

---

## Drizzle ORM — Konvensi

Gunakan nama aktual implementasi database/API berbahasa Inggris untuk kode dan schema:

```typescript
// Contoh gaya penamaan yang disarankan:
collections
cans
assignments
paymentMethod
submitSequence
isLatest
reason
```

Label UI boleh tetap bahasa Indonesia seperti “Kaleng”, “Koleksi”, dan “Penugasan”. Jangan membuat field baru hanya karena perbedaan istilah bahasa.

Query harus:
- menerapkan role filter sebelum mengambil data;
- menghindari query tak terbatas untuk list besar;
- memakai pagination untuk endpoint laporan/list;
- menjaga constraint immutable untuk `collections`.

---

## BullMQ — WhatsApp Queue

```typescript
// Prinsip utama:
// 1. Insert collection berhasil.
// 2. Push job ke queue WhatsApp.
// 3. Response API tidak menunggu WA selesai.
// 4. Worker mengirim WA dan mencatat status.
```

Aturan:
- retry otomatis wajib ada;
- error WA tidak boleh menggagalkan transaksi collection yang sudah valid;
- log status WA harus bisa ditelusuri dari collection terkait;
- jangan log token WA atau nomor HP secara mentah di log level INFO/DEBUG.

---

## Scheduler

Scheduler hanya boleh membuat perubahan yang idempotent atau aman dijalankan ulang.

Sebelum membuat job terjadwal:
- jelaskan kapan job berjalan;
- jelaskan timezone;
- jelaskan apa yang terjadi jika job gagal di tengah jalan;
- jelaskan cara retry/manual recovery.

---

## Generate QR PDF

Untuk fitur QR PDF:
- generate QR dari token/kode yang sudah valid;
- layout PDF harus jelas untuk dicetak;
- upload file ke storage jika fitur storage aktif;
- return URL atau response sesuai API contract aktual;
- jangan menyimpan secret QR di frontend.

---

## Environment & Security

```
Rate limiting login wajib lebih ketat dari endpoint umum.
JWT_ACCESS_SECRET dan JWT_REFRESH_SECRET harus berbeda.
APP_SECRET untuk HMAC QR tidak boleh sama dengan JWT secret.
```

Jangan pernah log:
- password atau password hash;
- JWT token;
- APP_SECRET atau JWT secret;
- private key;
- access token WhatsApp;
- nomor HP pengguna di log level INFO/DEBUG.

---

## Learning Requirement

Untuk task backend, agent wajib menjelaskan:

- route mana yang menerima request;
- service mana yang menjalankan business logic;
- tabel mana yang terdampak;
- validasi Zod atau boundary validation yang digunakan;
- cara test endpoint atau build backend.

---

*Lazisnu Infaq Collection System — rules/08-pedoman-backend.md*
