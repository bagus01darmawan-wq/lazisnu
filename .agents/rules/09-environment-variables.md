---
trigger: model_decision
---

# Rule: Environment Variables
# Scope: Semua agent — referensi saat membuat config, Dockerfile, atau CI/CD

---

## ⚠️ Aturan Keamanan

```
DILARANG commit file .env ke git.
File .env sudah ada di .gitignore — pastikan tidak dihapus dari .gitignore.

Yang boleh di-commit: .env.example (tanpa nilai asli, hanya key dan komentar)
Yang TIDAK boleh di-commit: .env, .env.local, .env.production, .env.staging
```

---

## apps/backend/.env

```bash
# ── Database ─────────────────────────────────────────────────────
DATABASE_URL=postgresql://lazisnu_dev:password_dev_123@localhost:5432/lazisnu_db
# Production: ganti dengan URL Railway PostgreSQL

# ── Redis ────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379
# Production: ganti dengan URL Redis Railway atau Upstash

# ── JWT ──────────────────────────────────────────────────────────
JWT_ACCESS_SECRET=ganti_dengan_random_string_min_64_karakter
JWT_REFRESH_SECRET=ganti_dengan_random_string_lain_min_64_karakter
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=30d
# JANGAN gunakan secret yang sama untuk access dan refresh

# ── QR Token ─────────────────────────────────────────────────────
APP_SECRET=ganti_dengan_random_string_untuk_hmac_qr
# JANGAN sama dengan JWT_ACCESS_SECRET

# ── WhatsApp Business API ─────────────────────────────────────────
WA_API_URL=https://graph.facebook.com/v18.0
WA_PHONE_NUMBER_ID=isi_dari_meta_developer_console
WA_ACCESS_TOKEN=isi_dari_meta_developer_console
WA_TEMPLATE_SUBMIT=lazisnu_infaq_notif
WA_TEMPLATE_RESUBMIT=lazisnu_infaq_notif_revisi

# ── Cloudflare R2 ─────────────────────────────────────────────────
CLOUDFLARE_R2_ENDPOINT=https://[account_id].r2.cloudflarestorage.com
CLOUDFLARE_R2_ACCESS_KEY=isi_dari_cloudflare_dashboard
CLOUDFLARE_R2_SECRET_KEY=isi_dari_cloudflare_dashboard
CLOUDFLARE_R2_BUCKET=lazisnu-qr-pdf
CLOUDFLARE_R2_PUBLIC_URL=https://r2.lazisnu.app
# PUBLIC_URL untuk signed URL download PDF

# ── Firebase (untuk FCM push notification) ───────────────────────
FIREBASE_PROJECT_ID=lazisnu-infaq
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@lazisnu-infaq.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
# Private key dari Firebase Admin SDK service account JSON

# ── App Config ────────────────────────────────────────────────────
PORT=3001
NODE_ENV=development
# nilai: development | staging | production

# ── Sentry (backend error monitoring) ────────────────────────────
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

---

## apps/mobile/.env

```bash
# ── API ───────────────────────────────────────────────────────────
API_BASE_URL=http://10.0.2.2:3001
# CATATAN: 10.0.2.2 adalah alias localhost dari Android emulator
# Untuk device fisik: ganti dengan IP komputer di jaringan yang sama
# Staging : https://api-staging.lazisnu.app
# Production: https://api.lazisnu.app

# ── CodePush OTA Update ───────────────────────────────────────────
CODEPUSH_KEY_STAGING=isi_dari_app_center_staging
CODEPUSH_KEY_PRODUCTION=isi_dari_app_center_production

# ── Google Play Integrity ─────────────────────────────────────────
PLAY_INTEGRITY_NONCE_SECRET=random_string_untuk_nonce_generation
# Digunakan untuk generate nonce yang dikirim ke Google Play Integrity API
```

---

## apps/web/.env.local

```bash
# ── API ───────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:3001
# NEXT_PUBLIC_ prefix agar bisa diakses di client-side component
# Staging: https://api-staging.lazisnu.app
# Production: https://api.lazisnu.app

API_URL=http://localhost:3001
# Tanpa NEXT_PUBLIC_ — hanya untuk server-side fetch (Server Components)
# Ini bisa berbeda dengan NEXT_PUBLIC_API_URL di production (internal network)

# ── App ───────────────────────────────────────────────────────────
NEXT_PUBLIC_APP_NAME=Lazisnu Infaq System

# ── Sentry (web error monitoring) ────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ORG=lazisnu
SENTRY_PROJECT=lazisnu-web
```

---

## Perbedaan Environment per Stage

| Variable | Development | Staging | Production |
|---|---|---|---|
| `DATABASE_URL` | localhost:5432 | Railway staging DB | Railway production DB |
| `NODE_ENV` | development | staging | production |
| `API_BASE_URL` | 10.0.2.2:3001 | api-staging.lazisnu.app | api.lazisnu.app |
| `WA_ACCESS_TOKEN` | Token test (sandbox) | Token live terbatas | Token live penuh |
| `CODEPUSH_KEY` | - | KEY_STAGING | KEY_PRODUCTION |

---

## Cara Generate Secret yang Aman

```bash
# Di terminal WSL2 atau Linux:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Gunakan output berbeda untuk setiap secret:
# JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, APP_SECRET
# JANGAN pakai string pendek atau mudah ditebak
```

---

*Lazisnu Infaq Collection System — rules/09-environment-variables.md*
