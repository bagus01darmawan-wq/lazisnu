# Visualisasi Struktur VM — Lazisnu Production

> Server: `43.128.98.52` — Tencent Cloud  
> OS: Ubuntu 22.04.5 LTS (GNU/Linux 5.15.0-181 x86_64)  
> User SSH: `ubuntu`  
> Terakhir diperbarui: 2026-07-24

---

## Root Filesystem

```
/
├── bin         → usr/bin               # symlink — program sistem (bash, ls, ssh, git)
├── boot/                               # kernel Linux & GRUB
├── data/                               # 📦 disk tambahan Tencent Cloud
├── dev/                                # device virtual
├── etc/                                # ⚙️ konfigurasi sistem (106 folder)
│   └── cron.d/                         # cron job: SSL auto-renewal (Senin 03:00)
├── home/
│   └── ubuntu/                         # 🏠 user SSH
│       ├── .ssh/
│       │   ├── authorized_keys         # public key untuk passwordless login
│       │   └── known_hosts
│       ├── .bashrc                     # bash config
│       ├── .bash_history               # command history
│       ├── .gitconfig                  # git config user
│       └── .npmrc                      # npm config
├── lib         → usr/lib               # symlink — system library
├── lib32       → usr/lib32
├── lib64       → usr/lib64
├── libx32      → usr/libx32
├── lost+found/                         # recovery ext4
├── media/                              # mount point (kosong)
├── mnt/                                # mount manual (kosong)
├── opt/                                # 📦 aplikasi pihak ketiga
│   └── laznisnu/                       # 🔥 PROYEK UTAMA (lihat bawah)
├── proc/                               # 💾 virtual filesystem kernel
├── root/                               # 👑 home user root
├── run/                                # 📡 runtime (33 proses)
│   └── docker.sock                     # socket komunikasi Docker
├── sbin        → usr/sbin              # symlink — system binary
├── snap/                               # 📦 snap packages (7 paket)
├── srv/                                # data layanan (kosong)
├── sys/                                # 💾 virtual filesystem kernel
├── tmp/                                # 🗑️ temporary (dibersihkan otomatis)
├── usr/                                # 📚 semua program & library
│   ├── bin/                            # bash, ls, ssh, git, docker, certbot
│   ├── lib/                            # library C, SSL, Python
│   └── local/                          # program install manual
└── var/                                # 📊 data aplikasi
    ├── lib/docker/                     # 🐳 SEMUA IMAGE & CONTAINER
    │   ├── overlay2/                   # layer filesystem container
    │   ├── containers/                 # metadata container
    │   └── volumes/                    # persistent data
    ├── log/                            # 📜 system log
    │   ├── syslog
    │   ├── auth.log                    # log SSH
    │   └── docker.log
    └── www/
```

---

## Proyek: `/opt/lazisnu/`

```
/opt/lazisnu/                            # git root: feature/sync-sprint-cleanup
│
├── .git/                                # git repository
├── .gitignore                           # exclude *.env, node_modules, nginx/certbot/
├── .dockerignore                        # exclude node_modules, .env, .git
├── .github/workflows/                   # CI/CD (ci.yml)
│
├── docker-compose.yml                   # orchestrator 4 service
├── pnpm-workspace.yaml                  # monorepo config
├── package.json                         # root scripts
├── pnpm-lock.yaml                       # lockfile
│
├── apps/
│   ├── backend/                         # ⭐ API Fastify (Node.js + TypeScript)
│   │   ├── Dockerfile                   # multi-stage build
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts            # ORM config (drizzle-orm)
│   │   └── src/
│   │       ├── app.ts                   # entry point server (Fastify)
│   │       ├── index.ts                 # bootstrap
│   │       ├── worker.ts                # entry point WhatsApp worker
│   │       ├── config/
│   │       │   ├── database.ts          # Supabase PostgreSQL connection
│   │       │   ├── env.ts               # env validation
│   │       │   ├── redis.ts             # Upstash Redis connection
│   │       │   └── sentry.ts            # error monitoring
│   │       ├── database/
│   │       │   ├── schema.ts            # tabel Drizzle ORM
│   │       │   ├── seed.ts              # seeder (opsional)
│   │       │   ├── reset.ts             # reset DB
│   │       │   ├── manual_migrate.ts    # migration manual
│   │       │   └── migrations/
│   │       │       ├── 0000_tired_toxin.sql     # initial schema
│   │       │       ├── 0001_long_blur.sql       # rename nominal
│   │       │       ├── 0002_great_virginia_dare.sql  # collection integrity
│   │       │       ├── 0003_calm_ultron.sql     # device_id + fcm_token + drop sync_queues
│   │       │       └── immutable-rule.sql       # DB rules
│   │       ├── middleware/
│   │       │   ├── auth.ts              # JWT verify (access+refresh terpisah)
│   │       │   └── audit-logger.ts      # activity logging
│   │       ├── routes/
│   │       │   ├── auth.ts              # login, refresh, logout, verify-otp
│   │       │   └── admin/               # dashboard admin routes
│   │       │       ├── index.ts
│   │       │       ├── dashboard.ts
│   │       │       ├── district.ts
│   │       │       └── ...
│   │       ├── services/
│   │       │   ├── tokenService.ts      # generate/store/validate/revoke tokens
│   │       │   ├── sessionService.ts    # DB session CRUD
│   │       │   ├── auditLogService.ts   # activity log insert
│   │       │   └── whatsapp.ts          # notifikasi WhatsApp (Fonnte)
│   │       ├── utils/
│   │       │   ├── response.ts          # response helpers (sendError, sendSuccess)
│   │       │   ├── serializer.ts        # serialisasi data
│   │       │   └── error-guards.ts      # type guards
│   │       └── workers/
│   │           └── whatsapp.worker.ts   # antrian notifikasi WA
│   │
│   ├── web/                             # ⭐ Dashboard (Next.js 16 + TypeScript)
│   │   ├── Dockerfile                   # standalone build
│   │   ├── package.json
│   │   └── src/
│   │       ├── middleware.ts            # auth guard (JWT_ACCESS_SECRET)
│   │       ├── lib/
│   │       │   ├── api.ts               # Axios instance
│   │       │   └── auth.ts              # auth helpers
│   │       ├── store/
│   │       │   └── useAuthStore.ts      # Zustand auth state
│   │       └── app/
│   │           ├── (auth)/
│   │           │   └── login/           # halaman login
│   │           └── dashboard/
│   │               ├── layout.tsx       # layout utama dashboard
│   │               ├── overview/        # statistik & ringkasan
│   │               └── reports/         # laporan keuangan
│   │
│   └── mobile/                          # 📱 React Native (Android APK)
│       └── src/services/api.ts          # Axios instance (domain lazisnu.site)
│
├── packages/
│   └── shared-types/                    # TypeScript types (shared backend↔web↔mobile)
│
├── nginx/
│   ├── nginx.conf                       # reverse proxy + SSL termination
│   │                                      port 80 → redirect ke 443
│   │                                      port 443:
│   │                                        api.lazisnu.site → backend:3001
│   │                                        dashboard.lazisnu.site:
│   │                                          /v1/ → backend:3001
│   │                                          /    → web:3000
│   └── certbot/                         # 🔐 SSL cert Let's Encrypt (diabaikan git)
│       ├── conf/                        # fullchain.pem + privkey.pem
│       └── www/                         # acme-challenge
│
├── docs/
│   ├── DEPLOYMENT.md
│   ├── SECURITY.md
│   └── implementation/                  # 📋 semua rencana & tracking
│       ├── README.md
│       ├── MASTER-GOAL-LIST.md
│       ├── SESSION-2026-07-23.md
│       ├── decisions-log.md
│       └── 01..09 sub-bab dokumen
│
├── scripts/
│   ├── deploy-fix-login.sh
│   └── setup-tencent.sh
│
└── scratch/                             # file temporary dev (diabaikan git)
```

---

## Container Docker (Production)

```
┌────────────────────────────────────────────────────────────────┐
│ Docker Compose                                                  │
│                                                                 │
│  ┌─────────────────┐     ┌──────────────────────────────┐      │
│  │ nginx:alpine     │     │ 🔐 SSL Let's Encrypt         │      │
│  │ (reverse proxy)  │────▶│ expires: 2026-10-21          │      │
│  │ ports: 80, 443   │     │ auto-renew: cron Senin 03:00 │      │
│  └───┬─────────┬────┘     └──────────────────────────────┘      │
│      │         │                                                │
│   /v1/          /                                               │
│      │         │                                                │
│      ▼         ▼                                                │
│  ┌────────┐ ┌────────┐                                          │
│  │backend │ │  web   │                                          │
│  │:3001   │ │ :3000  │                                          │
│  │Fastify │ │Next.js │                                          │
│  └───┬────┘ └────────┘                                          │
│      │                                                          │
│      ├──▶ Supabase PostgreSQL (cloud)                            │
│      ├──▶ Redis :6379 (container, AOF persistence)              │
│      └──▶ Fonnte API (WhatsApp)                                 │
│                                                                 │
│  ┌────────┐     ┌────────┐                                      │
│  │ worker │     │ redis  │   Redis v7-alpine                    │
│  │ :3001  │────▶│ :6379  │   AOF + RDB snapshot                 │
│  └────────┘     └───┬────┘   50MB max, volatile-lru             │
│                     │                                           │
│                     ▼                                           │
│              ./redis-data/                                       │
│              (volume mount)                                      │
└────────────────────────────────────────────────────────────────┘
```

## Relasi: Host ↔ Container

```
HOST (/)
 │
 ├── /opt/lazisnu/nginx/nginx.conf ═══mount══▶ container nginx:/etc/nginx/nginx.conf
 ├── /opt/lazisnu/nginx/certbot/   ═══mount══▶ container nginx:/etc/letsencrypt
 ├── /opt/lazisnu/redis-data/      ═══mount══▶ container redis:/data
 │
 ├── /opt/lazisnu/apps/backend/    ═══COPY═══▶ image lazisnu-backend
 ├── /opt/lazisnu/apps/web/        ═══COPY═══▶ image lazisnu-web
 │
 ├── /var/lib/docker/overlay2/               ◀── layer filesystem container
 ├── /var/lib/docker/containers/             ◀── metadata container
 ├── /var/log/docker.log                     ◀── log Docker daemon
 │
 └── /var/run/docker.sock                   ◀── komunikasi Docker CLI → daemon
```

## Layanan Cloud Eksternal

```
┌─────────────────────────────────────┐
│ Layanan Cloud (tidak di VM)         │
│                                     │
│  Supabase (PostgreSQL)              │
│  ├── Database production            │
│  └── Connection: DATABASE_URL .env  │
│                                     │
│  Redis (container)                 │
│  ├── Cache + Session store          │
│  ├── Keys: refresh:{uid}:{did}      │
│  ├── AOF persistence on disk        │
│  └── Connection: REDIS_URL .env     │
│                                     │
│  Fonnte (WhatsApp API)              │
│  └── Notifikasi OTP + pesan        │
│                                     │
│  Cloudflare R2 (Object Storage)     │
│  └── Upload file + backup          │
│                                     │
│  Hostinger (DNS)                    │
│  ├── api.lazisnu.site → 43.128.98.52│
│  └── dashboard.lazisnu.site → ...  │
└─────────────────────────────────────┘
```

## Alur Request Sederhana

```
Browser ──▶ https://dashboard.lazisnu.site
    │
    ▼
nginx:443 (SSL terminated)
    │
    ├── /v1/admin/district/dashboard ──▶ backend:3001 ──▶ Supabase DB
    │
    └── /* (halaman dashboard) ──▶ web:3000 (Next.js SSR)
                                      │
                                      │ server-side fetch
                                      └──▶ backend:3001 ──▶ DB/Redis
```

## Resource Usage

| Resource | Kapasitas | Terpakai | Note |
|----------|-----------|----------|------|
| Disk | 19.58 GB | 76% (14.9 GB) | Bersihkan Docker cache jika >85% |
| RAM | ~4 GB | 39% | Aman |
| CPU Cores | 2 | Load 0.01 | Santai |
| Swap | - | 0% | Tidak digunakan |
| Container | 5 (semua running) | 5 | backend, web, worker, nginx, redis |

## Perintah Berguna

```bash
# Cek status container
docker compose ps

# Lihat log real-time
docker compose logs -f backend

# Cek penggunaan disk
df -h /

# Bersihkan Docker cache
docker system prune -a

# Restart service setelah deploy
docker compose up -d --build web backend
docker compose restart nginx
```
