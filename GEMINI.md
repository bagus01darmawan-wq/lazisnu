# GEMINI.md — Lazisnu Infaq Collection System

> Baca file ini sebelum membantu menulis kode apapun untuk project ini.
> File ini adalah sumber kebenaran tunggal untuk konteks, konvensi, dan aturan bisnis project.

---

## 1. Ringkasan Project

Sistem pengumpulan infaq/sodaqoh digital untuk lembaga **Lazisnu**. Petugas lapangan (~100 orang) menggunakan aplikasi mobile untuk scan QR code pada kaleng/kotak infaq di rumah donatur, input nominal yang diterima, lalu submit. Sistem otomatis mengirim notifikasi WhatsApp ke pemilik kaleng berisi nominal aktual sebagai mekanisme anti-fraud.

**Tiga pilar utama sistem:**
1. **Immutable audit trail** — data koleksi tidak bisa dihapus atau diubah, hanya re-submit
2. **WhatsApp sebagai verifikasi eksternal** — pemilik kaleng menerima nominal langsung dari sistem
3. **Offline-first** — petugas beroperasi di area tanpa sinyal, data di-queue lokal dan sync otomatis

---

## 2. Tech Stack

### Mobile (apps/mobile/)
```
React Native + TypeScript
React Navigation (Stack Navigator)
react-native-mmkv           # Secure local storage & offline queue
react-native-camera-kit     # QR scanner
react-native-code-push      # OTA update via App Center
@react-native-firebase/crashlytics
@react-native-community/netinfo  # Online/offline detection
axios                       # HTTP client
```

### Backend (apps/backend/)
```
Node.js + Fastify + TypeScript
drizzle-orm + drizzle-kit   # ORM & migrations
pg                          # PostgreSQL driver
ioredis                     # Redis client
bullmq                      # Background job queue
node-cron                   # Scheduler
bcrypt + uuid + zod         # Utils
```

### Web Dashboard (apps/web/)
```
Next.js 14 (App Router) + TypeScript
Tailwind CSS
SWR                         # Data fetching
react-hook-form + zod       # Form validation
@tanstack/react-table       # Data tables
recharts                    # Charts
lucide-react                # Icons
js-cookie                   # Token storage (httpOnly cookie)
@sentry/nextjs              # Error monitoring
```

### Infrastructure
```
Database    : PostgreSQL 16
Cache/Queue : Redis 7
Storage     : Cloudflare R2 (QR PDF files)
Notifikasi  : Firebase Cloud Messaging (FCM)
WhatsApp    : WhatsApp Business API (Meta Graph API)
Monitoring  : Firebase Crashlytics (mobile) + Sentry (backend)
OTA Update  : Microsoft App Center CodePush
Security    : Google Play Integrity API
CI/CD       : GitHub Actions → Railway (staging & production)
```

---

## 3. Struktur Folder Project

```
lazisnu-infaq-system/           # Monorepo root
├── apps/
│   ├── mobile/                 # React Native Android
│   │   ├── src/
│   │   │   ├── screens/        # Layar aplikasi
│   │   │   │   ├── auth/       # Login, Splash
│   │   │   │   ├── dashboard/  # Dashboard petugas
│   │   │   │   ├── scanner/    # QR scanner
│   │   │   │   ├── collection/ # Input nominal, konfirmasi, sukses
│   │   │   │   └── resubmit/   # Form re-submit
│   │   │   ├── navigation/     # React Navigation config
│   │   │   ├── services/       # API calls (auth, koleksi, dll)
│   │   │   ├── store/          # MMKV storage (token, offline queue)
│   │   │   ├── hooks/          # Custom hooks
│   │   │   ├── components/     # Shared UI components
│   │   │   └── utils/          # Helper functions
│   │   └── ...
│   │
│   ├── web/                    # Next.js Web Dashboard
│   │   ├── app/
│   │   │   ├── (auth)/         # Login page
│   │   │   ├── (dashboard)/    # Protected dashboard routes
│   │   │   │   ├── overview/
│   │   │   │   ├── kaleng/     # Manajemen kaleng + cetak QR
│   │   │   │   ├── users/      # Manajemen pengguna
│   │   │   │   ├── assignments/
│   │   │   │   ├── laporan/    # Laporan keuangan + export CSV
│   │   │   │   ├── resubmit/   # Re-submit tracker
│   │   │   │   └── audit-log/  # Log aktivitas admin
│   │   │   └── api/            # Next.js API routes (proxy ke backend)
│   │   ├── components/
│   │   │   ├── ui/             # Design system components
│   │   │   └── shared/         # Shared business components
│   │   ├── lib/                # Utils, API client, auth helpers
│   │   └── middleware.ts        # Auth & role-based route protection
│   │
│   └── backend/                # Fastify API Server
│       └── src/
│           ├── routes/         # Route definitions (grouping endpoint)
│           ├── handlers/       # Request handlers (thin layer)
│           ├── services/       # Business logic (fat layer)
│           ├── database/
│           │   ├── schema/     # Drizzle schema definitions
│           │   └── migrations/ # SQL migration files
│           ├── middleware/     # JWT auth, role RBAC, audit trail logger
│           ├── workers/        # BullMQ workers (WA sender)
│           ├── jobs/           # node-cron scheduled jobs
│           └── utils/          # HMAC QR, validators, helpers
│
├── packages/
│   ├── shared-types/           # TypeScript interfaces bersama
│   └── shared-utils/           # Fungsi utility bersama
│
├── .github/workflows/          # CI/CD GitHub Actions
├── docker-compose.yml          # Local dev (PostgreSQL + Redis)
└── GEMINI.md                   # File ini
```

---

## 4. Database Schema

> **ATURAN KRITIS**: Tabel `koleksi` bersifat **IMMUTABLE** — tidak ada DELETE dan UPDATE.
> Diimplementasikan via PostgreSQL RULE. Jangan pernah tulis query DELETE atau UPDATE pada tabel ini.

### wilayah
```sql
id          UUID PRIMARY KEY
nama        VARCHAR(100) NOT NULL
tipe        ENUM('kecamatan', 'ranting') NOT NULL
parent_id   UUID REFERENCES wilayah(id)   -- null jika kecamatan
is_active   BOOLEAN DEFAULT true
created_at  TIMESTAMP DEFAULT NOW()
```

### users
```sql
id            UUID PRIMARY KEY
nama          VARCHAR(100) NOT NULL
nomor_hp      VARCHAR(20) UNIQUE NOT NULL
email         VARCHAR(100)
password_hash VARCHAR(255) NOT NULL        -- bcrypt
role          ENUM('admin_kecamatan', 'admin_ranting', 'petugas', 'bendahara')
wilayah_id    UUID REFERENCES wilayah(id)
is_active     BOOLEAN DEFAULT true
last_login_at TIMESTAMP
created_at    TIMESTAMP DEFAULT NOW()
updated_at    TIMESTAMP DEFAULT NOW()
```

### kaleng
```sql
id               UUID PRIMARY KEY
kode_unik        VARCHAR(20) UNIQUE NOT NULL  -- format: LZN-KEC01-0001
qr_token         VARCHAR(255) UNIQUE          -- HMAC-signed, untuk QR code
nama_pemilik     VARCHAR(100) NOT NULL
nomor_hp_pemilik VARCHAR(20) NOT NULL         -- tujuan WA notification
alamat           TEXT NOT NULL
wilayah_id       UUID REFERENCES wilayah(id)
is_active        BOOLEAN DEFAULT true
qr_generated_at  TIMESTAMP
created_by       UUID REFERENCES users(id)
created_at       TIMESTAMP DEFAULT NOW()
updated_at       TIMESTAMP DEFAULT NOW()
```

### assignments
```sql
id             UUID PRIMARY KEY
petugas_id     UUID REFERENCES users(id)
kaleng_id      UUID REFERENCES kaleng(id)
periode_bulan  INTEGER NOT NULL              -- 1-12
periode_tahun  INTEGER NOT NULL
is_active      BOOLEAN DEFAULT true          -- false jika di-override
catatan        TEXT                          -- alasan reassign
assigned_by    UUID REFERENCES users(id)
created_at     TIMESTAMP DEFAULT NOW()
updated_at     TIMESTAMP DEFAULT NOW()

UNIQUE(kaleng_id, periode_bulan, periode_tahun, is_active)
  WHERE is_active = true
```

### koleksi  ⚠️ IMMUTABLE — INSERT ONLY
```sql
id                UUID PRIMARY KEY
kaleng_id         UUID REFERENCES kaleng(id)
petugas_id        UUID REFERENCES users(id)
assignment_id     UUID REFERENCES assignments(id)
periode_bulan     INTEGER NOT NULL
periode_tahun     INTEGER NOT NULL
nominal           BIGINT NOT NULL              -- rupiah, bukan DECIMAL
metode_bayar      ENUM('cash', 'transfer') NOT NULL
submit_sequence   INTEGER NOT NULL DEFAULT 1  -- 1=pertama, 2=re-submit, dst
is_latest         BOOLEAN NOT NULL DEFAULT true
alasan_resubmit   TEXT                        -- WAJIB jika sequence > 1
wa_status         ENUM('pending', 'sent', 'failed') DEFAULT 'pending'
wa_sent_at        TIMESTAMP
offline_created_at TIMESTAMP                  -- waktu dibuat di device
synced_at         TIMESTAMP                   -- waktu sync ke server
created_at        TIMESTAMP DEFAULT NOW()

INDEX(kaleng_id, periode_bulan, periode_tahun)
INDEX(petugas_id, periode_bulan, periode_tahun)
INDEX(is_latest)
```

### wa_logs
```sql
id           UUID PRIMARY KEY
koleksi_id   UUID REFERENCES koleksi(id)
nomor_hp     VARCHAR(20) NOT NULL
pesan        TEXT NOT NULL
sequence     INTEGER NOT NULL               -- 1=pertama, 2=re-submit
status       ENUM('pending', 'sent', 'failed')
response_api JSONB                          -- raw response Meta API
sent_at      TIMESTAMP
```

### audit_logs
```sql
id          UUID PRIMARY KEY
user_id     UUID REFERENCES users(id)
action      VARCHAR(50) NOT NULL            -- CREATE, UPDATE, GENERATE_QR, dll
entity      VARCHAR(50) NOT NULL            -- kaleng, users, assignments, dll
entity_id   UUID
old_value   JSONB
new_value   JSONB
ip_address  VARCHAR(45)
created_at  TIMESTAMP DEFAULT NOW()

INDEX(user_id, created_at)
INDEX(entity, entity_id)
```

---

## 5. API Conventions

### Base URL
```
Development : http://localhost:3001
Staging     : https://api-staging.lazisnu.app
Production  : https://api.lazisnu.app
```

### Authentication
- Semua route protected menggunakan **JWT Bearer Token**
- Header: `Authorization: Bearer <access_token>`
- Access token expiry: **15 menit**
- Refresh token expiry: **30 hari** (disimpan di Redis, bisa di-blacklist)

### Response Format — Selalu konsisten
```typescript
// Success
{
  success: true,
  data: T,
  meta?: { page, limit, total }  // untuk list
}

// Error
{
  success: false,
  error: {
    code: string,     // misal: "UNAUTHORIZED", "QR_ALREADY_SUBMITTED"
    message: string   // pesan untuk developer
  }
}
```

### Role-Based Access
```
admin_kecamatan → akses semua endpoint
admin_ranting   → akses endpoint wilayahnya sendiri saja
petugas         → akses task yang diassign kepadanya saja
bendahara       → akses GET laporan dan koleksi saja, tidak bisa edit
```

### Endpoint Ringkas
```
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
GET    /auth/me

GET    /wilayah
POST   /wilayah
PUT    /wilayah/:id

GET    /users
POST   /users
PUT    /users/:id
POST   /users/:id/reset-password

GET    /kaleng
POST   /kaleng
GET    /kaleng/:id
PUT    /kaleng/:id
POST   /kaleng/:id/generate-qr
POST   /kaleng/generate-qr/batch
GET    /kaleng/scan/:qr_token           # validasi scan dari petugas

GET    /assignments
POST   /assignments/generate            # auto-generate bulanan
PUT    /assignments/:id                 # override/reassign
GET    /assignments/my-tasks            # task untuk petugas yang login

POST   /koleksi                         # submit pengambilan
POST   /koleksi/batch-sync              # sync offline records
POST   /koleksi/:id/resubmit            # koreksi dengan alasan
GET    /koleksi
GET    /koleksi/:id
GET    /koleksi/resubmit-list

GET    /laporan/summary
GET    /laporan/export/csv
GET    /laporan/petugas/:id
GET    /laporan/kaleng/:id
```

---

## 6. Business Rules Kritis

> Ini adalah aturan bisnis yang TIDAK BOLEH dilanggar saat menulis kode.

### 6.1 Immutable Koleksi
```
❌ DILARANG: UPDATE koleksi SET ...
❌ DILARANG: DELETE FROM koleksi WHERE ...
✅ HARUS: INSERT INTO koleksi ... (selalu tambah record baru)

Saat re-submit:
1. UPDATE koleksi SET is_latest = false WHERE kaleng_id = X AND periode = Y AND is_latest = true
   ⚠️  Ini DIIZINKAN karena update is_latest bukan update data nominal
2. INSERT INTO koleksi (submit_sequence = N+1, is_latest = true, alasan_resubmit = ...)
```

### 6.2 QR Token — HMAC-SHA256
```typescript
// Generate token:
const payload = `${kaleng.id}:${kaleng.kode_unik}:${timestamp}`
const token   = crypto.createHmac('sha256', process.env.APP_SECRET)
                       .update(payload)
                       .digest('hex')

// Validasi scan:
// 1. Decode token, verifikasi HMAC signature
// 2. Cek kaleng is_active = true
// 3. Cek assignment aktif untuk petugas yang scan
// 4. Cek belum ada koleksi is_latest=true untuk periode ini
// Jika salah satu gagal → return error spesifik
```

### 6.3 WhatsApp Notification — Wajib Setelah Setiap Submit
```
Submit koleksi → INSERT ke DB → push job ke BullMQ → return response ke client
                                      ↓ (async, tidak blocking)
                              Worker kirim WA → simpan ke wa_logs
                              Retry 3x: 1 menit, 5 menit, 30 menit
                              Jika gagal semua → wa_status = 'failed'
```

### 6.4 Offline Queue di Mobile
```typescript
// Struktur offline queue di MMKV:
interface OfflineRecord {
  tempId        : string        // UUID lokal, untuk tracking
  kalengId      : string
  assignmentId  : string
  nominal       : number
  metodeBayar   : 'cash' | 'transfer'
  offlineCreatedAt : string     // ISO timestamp
}

// Key MMKV: 'offline_queue' → JSON.stringify(OfflineRecord[])

// Saat sync: call POST /koleksi/batch-sync
// Backend handle: skip duplikat berdasarkan tempId + kalengId + periode
```

### 6.5 Role Filter di Backend
```typescript
// Admin ranting WAJIB difilter by wilayah_id:
// Semua query yang melibatkan kaleng, koleksi, users
// harus ditambahkan WHERE wilayah_id = user.wilayah_id
// jika role === 'admin_ranting'

// Petugas WAJIB difilter by assignment:
// GET /assignments/my-tasks → WHERE petugas_id = user.id
// POST /koleksi → validasi kaleng ada di assignment aktif petugas ini
```

### 6.6 Audit Trail — Otomatis di Middleware
```typescript
// Middleware audit_trail_logger.ts mencatat ke tabel audit_logs
// untuk setiap request yang BERHASIL dengan method POST / PUT:
{
  user_id   : dari JWT token
  action    : method + path (misal: "UPDATE /kaleng/:id")
  entity    : nama tabel yang diubah
  entity_id : ID record yang diubah
  old_value : data sebelum (jika UPDATE)
  new_value : data sesudah
  ip_address: dari request headers
}
// Middleware ini TIDAK mencatat GET request
// Middleware ini TIDAK mencatat request yang gagal (4xx/5xx)
```

---

## 7. Konvensi Kode

### TypeScript
```typescript
// Selalu gunakan TypeScript strict mode
// tsconfig.json: "strict": true

// Naming:
// - Variables & functions : camelCase
// - Types & Interfaces    : PascalCase
// - Constants             : UPPER_SNAKE_CASE
// - Files                 : kebab-case.ts
// - Database columns      : snake_case

// Selalu definisikan return type fungsi async:
async function getKaleng(id: string): Promise<Kaleng | null> { ... }

// Gunakan Zod untuk validasi input di semua handler:
const schema = z.object({
  nominal: z.number().positive().int(),
  metodeBayar: z.enum(['cash', 'transfer']),
})
```

### Backend Pattern (Fastify)
```typescript
// Handler tipis — hanya parsing dan delegasi ke service:
async function submitKoleksi(req: FastifyRequest, reply: FastifyReply) {
  const body = submitKoleksiSchema.parse(req.body)
  const result = await koleksiService.submit(body, req.user)
  return reply.send({ success: true, data: result })
}

// Service tebal — semua business logic di sini:
async function submit(body: SubmitKoleksiDto, user: JwtPayload) {
  // 1. Validasi assignment
  // 2. Cek belum disubmit periode ini
  // 3. INSERT ke koleksi
  // 4. Push job ke BullMQ
  // return record baru
}
```

### Mobile Pattern (React Native)
```typescript
// Pisahkan API call ke services/:
// src/services/koleksiService.ts

// Gunakan custom hook untuk data fetching:
// src/hooks/useMyTasks.ts

// MMKV hanya diakses via store layer:
// src/store/offlineQueue.ts
// src/store/authStore.ts
// Jangan akses MMKV langsung dari komponen atau screen
```

### Web Pattern (Next.js)
```typescript
// Gunakan Server Components untuk halaman yang tidak butuh interaksi
// Gunakan Client Components ('use client') hanya untuk form dan interaksi

// Data fetching di Server Component:
async function LaporanPage() {
  const data = await fetch(`${process.env.API_URL}/laporan/summary`, {
    headers: { Authorization: `Bearer ${getServerToken()}` }
  })
  ...
}

// Client Component gunakan SWR:
const { data, error, isLoading } = useSWR('/laporan/summary', fetcher)
```

---

## 8. Environment Variables

### Backend (.env)
```bash
DATABASE_URL=postgresql://lazisnu_dev:password@localhost:5432/lazisnu_db
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=random_string_panjang
JWT_REFRESH_SECRET=random_string_panjang_lain
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d
APP_SECRET=secret_untuk_hmac_qr_token
WA_API_URL=https://graph.facebook.com/v18.0
WA_PHONE_NUMBER_ID=xxx
WA_ACCESS_TOKEN=xxx
WA_TEMPLATE_SUBMIT=lazisnu_infaq_notif
WA_TEMPLATE_RESUBMIT=lazisnu_infaq_notif_revisi
CLOUDFLARE_R2_ENDPOINT=xxx
CLOUDFLARE_R2_ACCESS_KEY=xxx
CLOUDFLARE_R2_SECRET_KEY=xxx
CLOUDFLARE_R2_BUCKET=lazisnu-qr-pdf
PORT=3001
NODE_ENV=development
```

### Mobile (.env)
```bash
API_BASE_URL=http://10.0.2.2:3001    # 10.0.2.2 = localhost dari Android emulator
CODEPUSH_KEY_STAGING=xxx
CODEPUSH_KEY_PRODUCTION=xxx
PLAY_INTEGRITY_NONCE_SECRET=xxx
```

### Web (.env.local)
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
API_URL=http://localhost:3001         # server-side
NEXT_PUBLIC_APP_NAME=Lazisnu Infaq System
```

---

## 9. Sprint Aktif Saat Ini

> Update bagian ini setiap berganti sprint/fase.

```
FASE AKTIF : FASE 1 — Mobile & Backend Core Development
MINGGU     : 3–4
TARGET     : Mobile build stabil, Integrasi API dasar, UI Auth & Dashboard

SEDANG DIKERJAKAN:
- [x] Instalasi WSL2 + Ubuntu di Windows (Selesai)
- [x] Setup Node.js via NVM di WSL2 (Selesai)
- [x] Setup PostgreSQL & Redis di WSL2 (Selesai)
- [x] Setup VS Code + extensions (Selesai)
- [x] Setup Android Studio + emulator (Selesai)
- [x] Fix Android Build Conflict (androidx.core downgrade to 1.12.0) (Selesai)
- [x] Fix API Service (Fetch Timeout implementation) (Selesai)
- [x] Initial Push to GitHub Main Branch (Selesai)
- [/] Koneksi Mobile ke Backend Local (adb reverse)
- [/] Debugging Login Flow di Mobile
- [ ] UI Design: Dashboard & Collection Form

SELANJUTNYA (FASE 2 — Minggu 5–6):
- QR Scanner implementation (react-native-camera-kit)
- Offline Queue management (MMKV)
- WhatsApp Template registration to Meta
- Docker Compose for production-like staging
```

---

## 10. Hal yang Sering Ditanyakan ke Gemini

Saat meminta bantuan, selalu sebutkan konteks spesifik:

```
✅ "Buatkan Fastify handler untuk POST /koleksi sesuai konvensi project ini"
✅ "Buatkan Drizzle schema untuk tabel koleksi dengan immutable constraint"
✅ "Buatkan React Native screen untuk QR scanner yang memanggil /kaleng/scan/:token"
✅ "Buatkan middleware audit trail logger untuk Fastify"

❌ "Buatkan API untuk menyimpan data"     (terlalu umum)
❌ "Buatkan database"                      (terlalu umum)
```

---

*Lazisnu Infaq Collection System — GEMINI.md v1.0 — April 2026*
*Update file ini setiap ada perubahan arsitektur, schema, atau sprint aktif.*
