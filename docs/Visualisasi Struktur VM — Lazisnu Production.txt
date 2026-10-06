# Visualisasi Struktur VM — Lazisnu Production

> Server: `43.128.98.52` — Tencent Cloud (hostname `VM-0-6-ubuntu`)
> OS: Ubuntu 22.04.5 LTS (GNU/Linux 5.15.0-181 x86_64)
> Docker: 29.6.2 · Compose v5.3.1
> User SSH: `ubuntu`
> Terakhir diperbarui: 2026-08-08 (audit ulang langsung dari VM)

---

## Root Filesystem

```
/
├── bin         → usr/bin               # symlink — program sistem (bash, ls, ssh, git)
├── boot/                               # kernel Linux & GRUB
├── data/                               # 📦 kosong (bukan lagi mount terpisah — 
│                                       #    sudah di-merge ke /dev/vda2 sejak migrasi disk)
├── dev/                                # device virtual
├── etc/                                # ⚙️ konfigurasi sistem
│   └── cron.d/                         # cron: e2scrub, yunjing/sgagenttask (Tencent),
│                                       #       lazisnu-backup-health (healthcheck backup tiap jam)
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
│   └── lazisnu/                        # 🔥 PROYEK UTAMA (lihat bawah)
├── proc/                               # 💾 virtual filesystem kernel
├── root/                               # 👑 home user root (crontab: backup, SSL)
├── run/                                # 📡 runtime
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

> Git: **detached HEAD** di `ae05dc3` (sama dengan `origin/main`) — CI deploy selalu `git checkout -f <sha>`

```
/opt/lazisnu/                            # git root
│
├── .git/                                # git repository
├── .gitignore                           # exclude *.env, node_modules, nginx/certbot/
├── .dockerignore                        # exclude node_modules, .env, .git
├── .github/workflows/                   # CI/CD (ci.yml)
│
├── docker-compose.yml                   # ⚙️ compose utama (referensi service umum)
├── docker-compose.prod.yml              # 🟢 compose produksi (blue-green, dipakai CI)
├── docker-compose.staging.yml           # 🟡 compose staging (backend/web/worker/redis-staging)
├── docker-compose.blue-green.yml        # 🔵🔴 template blue-green (param ${COLOR})
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
│   │       │   └── redis.ts             # Redis connection
│   │       ├── database/
│   │       │   ├── schema.ts            # tabel Drizzle ORM
│   │       │   ├── seed.ts              # seeder (opsional)
│   │       │   ├── reset.ts             # reset DB
│   │       │   ├── manual_migrate.ts    # migration manual
│   │       │   └── migrations/          # 0000..0003 + immutable-rule.sql
│   │       ├── middleware/
│   │       │   ├── auth.ts              # JWT verify (access+refresh terpisah)
│   │       │   └── audit-logger.ts      # activity logging
│   │       ├── routes/
│   │       │   ├── auth.ts              # login, refresh, logout, verify-otp
│   │       │   └── admin/               # dashboard admin routes
│   │       ├── services/                # tokenService, sessionService, auditLogService, whatsapp
│   │       ├── utils/                   # response, serializer, error-guards
│   │       └── workers/
│   │           └── whatsapp.worker.ts   # antrian notifikasi WA
│   │       └── test-*.ts                # test-setup/test-db/test-redis (di VM)
│   │
│   ├── web/                             # ⭐ Dashboard (Next.js + TypeScript)
│   │   ├── Dockerfile                   # standalone build
│   │   ├── package.json
│   │   └── src/
│   │       ├── middleware.ts            # auth guard (JWT_ACCESS_SECRET)
│   │       ├── lib/                     # api (Axios) + auth helpers
│   │       ├── store/                   # useAuthStore (Zustand)
│   │       ├── components/
│   │       └── app/                     # (auth)/login + dashboard (overview, reports)
│   │
│   └── mobile/                          # 📱 React Native (Android APK)
│       └── src/                         # assets, components, config, navigation,
│                                        # screens, services, stores, theme, utils
│
├── packages/
│   └── shared-types/                    # TypeScript types (shared backend↔web↔mobile)
│
├── nginx/
│   ├── nginx.conf                       # reverse proxy + SSL termination (6 server block)
│   ├── upstream.conf                    # 🔵🔴 auto-generated oleh deploy-blue-green.sh
│   │                                      Active: BLUE — Tue Aug 4 2026
│   │                                      $backend_upstream = http://blue-backend:3001
│   │                                      $web_upstream     = http://blue-web:3000
│   ├── upstream.conf.example            # template upstream
│   └── certbot/                         # 🔐 SSL cert Let's Encrypt (diabaikan git)
│       ├── conf/live/
│       │   ├── api.lazisnu.site/        # exp: 2026-10-27
│       │   ├── staging-api.lazisnu.site/ # exp: 2026-10-29
│       │   └── status.lazisnu.site/     # exp: 2026-10-21
│       └── www/                         # acme-challenge
│
├── prometheus/                          # 📈 monitoring config
│   ├── prometheus.yml                   # scrape: prometheus + lazisnu-backend (green-backend:3101)
│   └── alert.rules.yml                  # HighCpuUsage, HighHttpErrorRate, HighEventLoopLag, BackendDown
├── prometheus-data/                     # data Prometheus (volume)
│
├── grafana/                             # 📊 Grafana provisioning
│   └── provisioning/
│       ├── datasources/prometheus.yml
│       └── dashboards/lazisnu-overview.json
├── grafana-data/                        # data Grafana (volume)
│
├── uptime-kuma/                         # ⏱️ Uptime Kuma (status page)
│   └── data/kuma.db                     # DB monitor + status page
│
├── redis/
│   └── redis.conf                       # config Redis (AOF + RDB, maxmemory-policy)
├── redis-data/                          # volume Redis produksi
├── redis-data-staging/                  # volume Redis staging
│
├── secrets/                             # 🔒 env files (env.backup-staging, dll — di luar git)
│
├── backups/                             # 🗄️ hasil backup DB prod (harian 02:00)
├── backups-staging/                     # 🗄️ hasil backup DB staging (harian 02:30)
├── backup-data/                         # staging area backup
├── backup-active/                       # marker/lock backup aktif
│
├── docs/                                # dokumentasi proyek (termasuk file ini)
├── scripts/                             # ✅ puluhan script operasional:
│   ├── deploy-blue-green.sh             #   🟢 deploy blue-green production (zero downtime)
│   ├── backup.sh                        #   🗄️ backup DB (prod & staging, via env)
│   ├── backup-healthcheck.sh            #   💓 verifikasi backup independen (cron tiap jam)
│   ├── backup-kuma.sh                   #   ⏱️ backup DB uptime-kuma
│   ├── certbot-renew-safe.sh            #   🔐 renew SSL tanpa stop nginx (cron Senin 03:00)
│   ├── kuma-setup-monitors.sh           #   ⏱️ setup monitor/status page Uptime Kuma
│   ├── vm-cleanup-weekly.sh             #   🧹 housekeeping mingguan
│   ├── phase2-prune.sh                  #   🧹 cleanup disk (build cache + dangling)
│   ├── vm-migration-export.sh           #   📦 export bundle untuk migrasi VM
│   ├── verify-vm.sh / verify-db.sh      #   🔍 verifikasi VM & DB
│   └── setup-tencent.sh, fix-ssh.sh, dll.
│
├── artifacts/ assets/ query/ scratch/   # artefak, aset, query, temp (scratch diabaikan git)
└── *.md                                 # README, ARCHITECTURE, dll.
```

---

## Container Docker — 12 container (semua running)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Blue-Green Production (deploy-blue-green.sh, ACTIVE: 🔵 BLUE)        │
│                                                                      │
│   blue-backend :3001 ──► Supabase PostgreSQL (cloud)                 │
│   blue-worker  :3001 ──► Redis :6379 (AOF) + Fonnte (WhatsApp)      │
│   blue-web     :3000 ──► API blue-backend                            │
│   (image: ghcr.io/.../backend|web:<sha> = tag v1.0.2)                │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ Staging (docker-compose.staging.yml)                                 │
│   backend-staging :3001  web-staging :3000  worker-staging :3001     │
│   redis-staging   :6379 (volume redis-data-staging/)                 │
│   (image: ghcr.io/.../backend:latest · web:staging)                  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ Monitoring & Infra                                                   │
│   nginx      :80/443 (reverse proxy + SSL, mount nginx.conf + certbot)│
│   redis      :6379 (shared prod, volume redis-data/, healthy)         │
│   prometheus :127.0.0.1:9090 (scrape backend metrics)                │
│   grafana    :127.0.0.1:3030 (dashboards provisioning)               │
│   uptime-kuma:127.0.0.1:3002 (status page: status.lazisnu.site)      │
└──────────────────────────────────────────────────────────────────────┘
```

Ringkasan status (audit 2026-08-08):

| Container | Image | Port | Umur |
|-----------|-------|------|------|
| blue-backend | ghcr.io/.../backend:v1.0.2 | 3001/tcp | Up 3 days |
| blue-worker | ghcr.io/.../backend:v1.0.2 | 3001/tcp | Up 3 days |
| blue-web | ghcr.io/.../web:v1.0.2 | 3000/tcp | Up 3 days |
| backend-staging | ghcr.io/.../backend:latest | 3001/tcp | Up 14 hours |
| web-staging | ghcr.io/.../web:staging | 3000/tcp | Up 14 hours |
| worker-staging | ghcr.io/.../backend:latest | 3001/tcp | Up 14 hours |
| redis-staging | redis:7-alpine | 6379/tcp | Up 14 hours (healthy) |
| nginx | nginx:alpine | 80, 443 | Up 4 days |
| redis | redis:7-alpine | 6379/tcp | Up 8 days (healthy) |
| prometheus | prom/prometheus | 127.0.0.1:9090 | Up 4 days |
| grafana | grafana/grafana | 127.0.0.1:3030 | Up 8 days |
| uptime-kuma | louislam/uptime-kuma:1 | 127.0.0.1:3002 | Up 7 days (healthy) |

---

## Nginx Routing (6 server block)

```
                ┌─────────── 80: redirect → 443 ───────────┐
                │        443 (SSL termination)             │
                └──────────────┬───────────────────────────┘
                               │
   api.lazisnu.site            │            → $backend_upstream   (blue-backend:3001)
   dashboard.lazisnu.site      │  /v1/ → $backend_upstream
                               │  /    → $web_upstream          (blue-web:3000)
   staging-api.lazisnu.site    │            → $staging_backend    (backend-staging:3001)
   staging.lazisnu.site        │  /v1/ → $staging_backend
                               │  /    → $staging_web           (web-staging:3000)
   status.lazisnu.site         │            → http://uptime-kuma:3001
```

- `$backend_upstream` / `$web_upstream` didefinisikan di `nginx/upstream.conf` yang **ditulis ulang otomatis** oleh `deploy-blue-green.sh` saat switch warna.
- Nama upstream memakai **variabel** (`proxy_pass $var`) agar nginx re-resolve DNS per-request → tanpa restart saat container blue/green berganti.

---

## Relasi: Host ↔ Container

```
HOST (/)
 │
 ├── /opt/lazisnu/nginx/nginx.conf ═══mount══▶ container nginx:/etc/nginx/nginx.conf
 ├── /opt/lazisnu/nginx/upstream.conf ══mount══▶ container nginx (dibaca nginx.conf)
 ├── /opt/lazisnu/nginx/certbot/   ═══mount══▶ container nginx:/etc/letsencrypt
 ├── /opt/lazisnu/redis/redis.conf ═══mount══▶ container redis:/usr/local/etc/redis/redis.conf
 ├── /opt/lazisnu/redis-data/      ═══mount══▶ container redis:/data
 ├── /opt/lazisnu/redis-data-staging/ ══mount══▶ container redis-staging:/data
 │
 ├── /opt/lazisnu/prometheus-data/ ═══volume══▶ container prometheus
 ├── /opt/lazisnu/grafana-data/    ═══volume══▶ container grafana
 ├── /opt/lazisnu/uptime-kuma/data/═══volume══▶ container uptime-kuma
 │
 ├── /opt/lazisnu/apps/backend/    ═══COPY═══▶ image lazisnu-backend (via CI build)
 ├── /opt/lazisnu/apps/web/        ═══COPY═══▶ image lazisnu-web
 │
 ├── /var/lib/docker/overlay2/               ◀── layer filesystem container
 ├── /var/lib/docker/containers/             ◀── metadata container
 ├── /var/log/docker.log                     ◀── log Docker daemon
 │
 └── /var/run/docker.sock                   ◀── komunikasi Docker CLI → daemon
```

---

## Layanan Cloud Eksternal

```
┌─────────────────────────────────────┐
│ Layanan Cloud (tidak di VM)         │
│                                     │
│  Supabase (PostgreSQL)              │
│  ├── Project production             │
│  ├── Project staging                │  ← project id ngskcwwjwxsvjrswomkf
│  └── Connection: DATABASE_URL .env  │
│                                     │
│  Redis (container di VM)            │
│  ├── Cache + Session store          │
│  ├── Keys: refresh:{uid}:{did}      │
│  ├── AOF persistence on disk        │
│  └── Connection: REDIS_URL .env     │
│                                     │
│  Fonnte (WhatsApp API)              │
│  └── Notifikasi OTP + pesan        │
│                                     │
│  Cloudflare R2 (Object Storage)     │
│  ├── Upload file + backup          │
│  └── Backups: prod + staging + kuma │
│                                     │
│  Rollbar (error tracking)           │
│  └── Backend & web (Sentry dihapus) │
│                                     │
│  Hostinger (DNS)                    │
│  ├── api.lazisnu.site → 43.128.98.52│
│  ├── dashboard.lazisnu.site → ...   │
│  ├── staging*.lazisnu.site → ...    │
│  └── status.lazisnu.site → ...      │
└─────────────────────────────────────┘
```

---

## Cron Jobs

**Root crontab (`sudo crontab -l`)**

| Jadwal | Job | Fungsi |
|--------|-----|--------|
| `*/5 * * * *` | QCloud Stargate agent | Agent Tencent Cloud (system) |
| `0 3 * * 1` | `certbot-renew-safe.sh` | 🔐 Renew SSL Let's Encrypt (Senin 03:00, tanpa stop nginx, lock+timeout) |
| `0 2 * * *` | `backup.sh` | 🗄️ Backup DB production ke R2 (02:00, lock+timeout 15m) |
| `30 2 * * *` | `backup.sh` (env staging) | 🗄️ Backup DB staging ke R2 (02:30) |
| `0 3 * * *` | `backup-kuma.sh` | ⏱️ Backup DB uptime-kuma (03:00) |

**`/etc/cron.d/lazisnu-backup-health`**

| Jadwal | Fungsi |
|--------|--------|
| `17 * * * *` | 💓 Healthcheck backup prod — verifikasi marker backup-status terbaru |
| `18 * * * *` | 💓 Healthcheck backup staging (env `secrets/env.backup-staging`) |

> Keduanya memakai `flock` (anti tumpang tindih) + `timeout` — pelajaran dari insiden backup senyap (exec-bit hilang saat git checkout).

---

## Alur Request Sederhana

```
Browser ──▶ https://dashboard.lazisnu.site
    │
    ▼
nginx:443 (SSL terminated)
    │
    ├── /v1/admin/district/dashboard ──▶ $backend_upstream (blue-backend:3001) ──▶ Supabase DB
    │
    └── /* (halaman dashboard) ──▶ $web_upstream (blue-web:3000, Next.js SSR)
                                      │
                                      │ server-side fetch
                                      └──▶ blue-backend:3001 ──▶ DB/Redis

Browser ──▶ https://staging.lazisnu.site ──▶ nginx:443 ──▶ staging-web / staging-backend
Browser ──▶ https://status.lazisnu.site ──▶ nginx:443 ──▶ uptime-kuma:3001 (status page)
```

---

## Resource Usage (audit 2026-08-08)

| Resource | Kapasitas | Terpakai | Note |
|----------|-----------|----------|------|
| Disk `/dev/vda2` | 20 GB | 76% (15 GB) | Satu filesystem (tidak ada /data terpisah). Bersihkan Docker cache jika >85% (`phase2-prune.sh`) |
| RAM | 3.6 GiB | 1.2 GiB (33%) | Aman |
| CPU Cores | 2 | Load 0.18 | Santai |
| Swap | - | 0% | Tidak digunakan |
| Container | 12 (semua running) | 12 | 3 blue-green + 4 staging + nginx/redis/prometheus/grafana/uptime-kuma |

---

## Perintah Berguna

```bash
# Cek status container (semua compose stack)
docker ps -a

# Lihat warna blue-green aktif
cat /opt/lazisnu/nginx/upstream.conf

# Log real-time
docker logs -f blue-backend
docker logs -f backend-staging

# Cek penggunaan disk
df -h /

# Cleanup disk (build cache + dangling)
bash /opt/lazisnu/scripts/phase2-prune.sh

# Deploy produksi blue-green manual (via CI tag v*)
git tag v1.0.3 && git push origin v1.0.3

# Deploy staging (auto via CI push main)

# Cek backup terbaru
ls -lt /opt/lazisnu/backups/ | head
ls -lt /opt/lazisnu/backups-staging/ | head

# Verify VM
bash /opt/lazisnu/scripts/verify-vm.sh
```
