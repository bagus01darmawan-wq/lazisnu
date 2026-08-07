# Deployment Guide — Lazisnu

> Terakhir diperbarui: 2026-07-29

## Arsitektur

```
Tencent Cloud CVM (Singapore) — 43.128.98.52
├── nginx:alpine (SSL termination + reverse proxy, ports 80/443)
│   ├── api.lazisnu.site        → backend:3001
│   ├── dashboard.lazisnu.site  → web:3000  (+ /v1/ → backend:3001)
│   ├── staging-api.lazisnu.site   → backend-staging:4001
│   └── staging.lazisnu.site       → web-staging:4000 (+ /v1/ → backend-staging:4001)
├── backend:3001     (Fastify API, Node.js + TypeScript)
├── web:3000         (Next.js 16 standalone)
├── worker           (WhatsApp BullMQ, polling Redis)
├── redis:6379 (internal)  (Redis 7 Alpine, AOF + RDB persistence, 50MB)
├── backend-staging:4001  (staging API)
├── web-staging:4000      (staging web)
├── worker-staging        (staging WhatsApp worker)
└── redis-staging:6379    (staging Redis)

Supabase (PostgreSQL)    — Database production + staging
Cloudflare R2            — Object storage (file upload + backup)
Fonnte                   — WhatsApp API (OTP + notifikasi)
Hostinger                — DNS (api/dashboard/staging.lazisnu.site → 43.128.98.52)
```

---

## Blue-Green Deployment (Zero-Downtime)

> Strategi deploy tanpa downtime dengan dua environment identik: **blue** dan **green**.
> Satu environment live (melayani user), satunya idle. Deploy ke idle → switch nginx → live baru.
> Jika ada masalah, rollback instan dengan switch balik.

### Cara Kerja

```
User ──→ nginx ──→ backend_active ──→ blue-backend (port 3001)  ← LIVE
                                  └──→ green-backend (port 3101) ← IDLE
```

### Setup Pertama Kali

```bash
# Setup nginx untuk blue-green (sekali saja)
./scripts/deploy-blue-green.sh setup

# Atau lakukan manual:
# 1. Pastikan nginx.conf sudah include upstream.conf
# 2. Pastikan docker-compose.yml mount upstream.conf
# 3. docker compose up -d nginx
```

### Deploy

```bash
# Auto-detect idle color dan deploy
./scripts/deploy-blue-green.sh

# Atau deploy ke warna spesifik
./scripts/deploy-blue-green.sh blue
./scripts/deploy-blue-green.sh green
```

### Rollback Instan

```bash
# Switch ke environment sebelumnya (tanpa redeploy)
./scripts/deploy-blue-green.sh rollback
```

### Cek Status

```bash
./scripts/deploy-blue-green.sh status
```

### Environment Variables

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `GHCR_REPO` | `your-org/lazisnu` | GitHub Container Registry repo |
| `IMAGE_TAG` | `latest` | Tag image yang akan di-deploy |
| `HEALTH_RETRIES` | `12` | Maksimal retry health check |
| `HEALTH_INTERVAL` | `5` | Interval antar retry (detik) |

### Perbedaan dengan Deploy Rutin

| | Deploy Rutin | Blue-Green |
|---|---|---|
| Downtime | ~5-10 detik | **0 detik** |
| Rollback | `git revert` + build ulang | Switch nginx (~1 detik) |
| Resource | 5 container | 8 container (blue + green, Redis shared) |
| Kompleksitas | Rendah | Menengah |
| Gunakan saat | Update minor, jam sepi | Update major, jam sibuk |

---

## Setup Awal — VM Baru

### 1. Provision VM

| Setting | Value |
|---------|-------|
| Provider | Tencent Cloud |
| Region | Singapore |
| OS | Ubuntu 22.04 LTS |
| Instance | 2 vCPU, 4 GB RAM (minimal) |
| Disk | 40 GB SSD |
| Firewall | Open 22, 80, 443 |

### 2. SSH ke VM

```bash
ssh ubuntu@43.128.98.52
```

### 3. Install prasyarat

```bash
# Docker + Docker Compose
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable docker --now
sudo usermod -aG docker ubuntu

# PostgreSQL client (untuk backup/restore)
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt-get update
sudo apt-get install -y postgresql-client-17

# AWS CLI (untuk upload backup ke R2)
sudo apt-get install -y awscli

# Certbot (untuk SSL)
sudo apt-get install -y certbot
```

### 4. Clone repo

```bash
mkdir -p /opt/lazisnu
cd /opt
git clone <repo-url> lazisnu
cd lazisnu
```

### 5. Konfigurasi .env

```bash
# Production: apps/backend/.env
cat > /opt/lazisnu/apps/backend/.env << 'ENVEOF'
NODE_ENV=production
PORT=3001

DATABASE_URL=postgresql://postgres.<project>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.<project>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres

REDIS_URL=redis://redis:6379

JWT_ACCESS_SECRET=<64-char-hex>
JWT_REFRESH_SECRET=<64-char-hex>
APP_SECRET=<64-char-hex>
INTERNAL_API_KEY=<32-char-hex>

JWT_REFRESH_TTL=365d

CORS_ORIGINS=https://dashboard.lazisnu.site
API_BASE_URL=https://api.lazisnu.site

WA_PROVIDER=fonnte
WA_BUSINESS_API_URL=https://api.fonnte.com
WA_ACCESS_TOKEN=<token>

ENVEOF

# Backup credentials: /opt/lazisnu/.env.backup
cat > /opt/lazisnu/.env.backup << 'ENVEOF'
DATABASE_URL=postgresql://postgres.<project>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.<project>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
R2_ACCOUNT_ID=<account-id>
R2_BUCKET_NAME=<bucket-name>
R2_ACCESS_KEY_ID=<access-key>
R2_SECRET_ACCESS_KEY=<secret-key>
ENVEOF
```

### 6. Setup Redis persistence

```bash
mkdir -p /opt/lazisnu/redis-data
# redis.conf sudah ada di repo: redis/redis.conf
# Konfigurasi: AOF + RDB, protected-mode no, maxmemory 50MB, volatile-lru
```

### 7. Build & Start

```bash
cd /opt/lazisnu
docker compose up -d --build
```

### 8. SSL Certificate (Let's Encrypt)

```bash
# Generate certificate
certbot certonly --webroot -w /opt/lazisnu/nginx/certbot/www \
  -d api.lazisnu.site -d dashboard.lazisnu.site \
  --email admin@lazisnu.site --agree-tos --non-interactive

# Restart nginx untuk pakai SSL
docker compose restart nginx

# Auto-renewal (cron, setiap Senin jam 03:00)
# Tidak menghentikan nginx: challenge memakai webroot, lalu nginx di-reload graceful.
chmod +x /opt/lazisnu/scripts/certbot-renew-safe.sh
# 0 3 * * 1 /usr/bin/flock -n /run/lock/lazisnu-certbot-renew.lock /usr/bin/timeout --foreground 15m /opt/lazisnu/scripts/certbot-renew-safe.sh
```

### 9. Setup backup cron

```bash
# Backup database setiap hari jam 02:00 WIB
# Script: scripts/backup.sh
chmod +x /opt/lazisnu/scripts/backup.sh
chmod +x /opt/lazisnu/scripts/backup-healthcheck.sh

# Backup hanya berjalan jika file flag ada:
touch /opt/lazisnu/backup-data/active

# Tambahkan baris berikut ke crontab root tanpa menghapus job cron lain:
# 0 2 * * * /usr/bin/flock -n /run/lock/lazisnu-backup.lock /usr/bin/timeout --foreground 15m /opt/lazisnu/scripts/backup.sh

# Health-check independen setiap jam pada menit 17
# Memeriksa marker sukses dan object backup aktual di R2.
install -m 0644 scripts/backup-healthcheck.cron /etc/cron.d/lazisnu-backup-health

# Verifikasi cron terdaftar
crontab -l
cat /etc/cron.d/lazisnu-backup-health
```

Backup menulis log ke `/opt/lazisnu/backups/backup.log` dan health-check ke
`/opt/lazisnu/backups/backup-health.log`. Setelah upload database diverifikasi,
script menulis marker `backup-status/lazisnu-latest.json` di R2. Webhook alert
opsional dikonfigurasi melalui `BACKUP_ALERT_WEBHOOK_URL` di env backup.

### 10. Verifikasi Production

```bash
# API health
curl https://api.lazisnu.site/health/ready
# → {"success":true,"status":"ready","checks":{"db":"ok","redis":"ok"}}

# Web dashboard
curl -I https://dashboard.lazisnu.site
# → HTTP/2 307 (redirect ke login, normal)

# Container status (harus 5/5 Up)
docker compose ps
```

---

## Deploy Update (Rutin)

```bash
cd /opt/lazisnu
git pull
docker compose up -d --build
# Build ulang hanya backend + web + worker. Nginx & Redis tidak berubah.
```

Jika hanya kode backend yang berubah (hemat waktu build):

```bash
git pull
docker compose up -d --build backend worker
docker compose restart nginx
```

---

## Rollback

### Rollback kode (git)

```bash
cd /opt/lazisnu
# Lihat log commit terakhir
git log --oneline -5

# Kembali ke commit sebelumnya
git checkout <commit-hash>

# Build ulang
docker compose up -d --build backend web worker
docker compose restart nginx

# Verifikasi
curl https://api.lazisnu.site/health/ready
```

### Rollback image Docker (jika pakai GHCR)

```bash
# Lihat image yang tersedia di GHCR
docker pull ghcr.io/lazisnu/backend:<tag-sebelumnya>
docker pull ghcr.io/lazisnu/web:<tag-sebelumnya>

# Update tag di docker-compose.prod.yml atau override:
IMAGE_TAG=<tag-sebelumnya> docker compose -f docker-compose.prod.yml up -d
```

### Rollback .env / konfigurasi

```bash
# Jika ada backup .env (dari sesi rotasi kredensial)
cp apps/backend/.env.backup-2026-07-24 apps/backend/.env
docker compose up -d --build backend worker

# Atau edit manual variabel yang salah
vim apps/backend/.env
docker compose restart backend worker
```

### Rollback DB migration (hati-hati!)

```bash
# Supabase menyediakan Point-in-Time Recovery di dashboard.
# Jika tidak ada PITR, restore dari backup terbaru:
# Lihat section "Restore Backup" di bawah.
```

---

## Restore Backup

### 1. Cari backup terbaru di R2

```bash
# List backup di R2
aws s3 ls s3://<bucket>/backups/ \
  --endpoint-url "https://<account-id>.r2.cloudflarestorage.com"
```

### 2. Download dan restore

```bash
cd /opt/lazisnu/backups

# Download dari R2
aws s3 cp "s3://<bucket>/backups/lazisnu_20260729_020001.sql.gz" . \
  --endpoint-url "https://<account-id>.r2.cloudflarestorage.com"

# Hentikan worker sementara (supaya tidak proses job saat restore)
docker compose stop worker

# Restore ke database
gunzip -c lazisnu_20260729_020001.sql.gz | \
  psql "$DIRECT_URL" 2>&1 | tee restore.log

# Verifikasi: hitung baris di tabel utama
psql "$DATABASE_URL" -c "SELECT count(*) FROM collections;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM users;"

# Nyalakan worker kembali
docker compose start worker

# Verifikasi health
curl https://api.lazisnu.site/health/ready
```

### 3. Jika restore dari backup lokal VM

```bash
cd /opt/lazisnu/backups
ls -t *.sql.gz | head -5   # lihat 5 backup terbaru

gunzip -c lazisnu_20260729_020001.sql.gz | psql "$DIRECT_URL"
```

---

## Troubleshooting

### Container tidak start / exit terus

```bash
# Lihat log container yang bermasalah
docker compose logs backend      # 50 baris terakhir
docker compose logs backend -f   # follow real-time

# Cek apakah .env ada dan valid
cat apps/backend/.env | head -20

# Cek image bisa di-build
docker compose build backend --no-cache
```

### Redis connection refused (EPIPE / ECONNREFUSED)

```bash
# Cek Redis container status
docker compose ps redis

# Cek apakah protected-mode no
docker compose exec redis redis-cli CONFIG GET protected-mode
# → harus "no"

# Test koneksi dari backend container
docker compose exec backend sh -c 'npx ioredis-cli -h redis -p 6379 PING'
# → harus "PONG"

# Restart Redis (data aman karena AOF persistence)
docker compose restart redis
docker compose restart backend worker
```

### 502 Bad Gateway / 504 Gateway Timeout

```bash
# 1. Cek apakah backend hidup
docker compose ps backend
curl http://localhost:3001/health/ready

# 2. Cek log nginx
docker compose logs nginx --tail 20

# 3. Test koneksi nginx → backend
docker compose exec nginx wget -qO- http://backend:3001/health/ready

# 4. Jika backend mati: cek log backend
docker compose logs backend --tail 50

# 5. Restart nginx setelah perbaikan
docker compose restart nginx
```

### Disk VM penuh (>85%)

```bash
# Cek penggunaan
df -h /

# Bersihkan Docker (image lama, container stopped, volume orphan)
docker system prune -a --volumes

# Cek ukuran folder redis-data
du -sh /opt/lazisnu/redis-data

# Cek folder backups
du -sh /opt/lazisnu/backups
```

### SSL expired / certificate error

```bash
# Cek tanggal expire
openssl x509 -enddate -noout -in /opt/lazisnu/nginx/certbot/conf/live/api.lazisnu.site/fullchain.pem

# Renew manual
certbot renew --webroot -w /opt/lazisnu/nginx/certbot/www

# Restart nginx
docker compose restart nginx

# Pastikan cron auto-renewal aktif
crontab -l | grep certbot
```

### Login dashboard gagal / redirect loop

```bash
# 1. Cek JWT_ACCESS_SECRET di apps/backend/.env
grep JWT_ACCESS_SECRET apps/backend/.env

# 2. Cek middleware web apakah pakai secret yang sama
#    (middleware.ts harus baca JWT_ACCESS_SECRET, bukan JWT_SECRET)

# 3. Cek Redis (session store)
docker compose exec redis redis-cli KEYS "refresh:*"
# → harus ada beberapa key

# 4. Restart backend + clear Redis (force all user re-login)
docker compose restart backend
docker compose exec redis redis-cli FLUSHDB
```

### Rate limit / 429 Too Many Requests

```bash
# Rate limit 5 request/menit per IP untuk login
# Reset otomatis setelah 1 menit. Tidak perlu tindakan.

# Jika perlu naikkan limit sementara, edit nginx.conf:
#   limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
#   docker compose restart nginx
```

---

## Checklist Pasca-Deploy

Setelah setiap deploy, verifikasi 10 item ini:

- [ ] `curl https://api.lazisnu.site/health/ready` → `{"db":"ok","redis":"ok"}`
- [ ] `docker compose ps` → semua container **Up** (5/5)
- [ ] `curl -I https://dashboard.lazisnu.site` → HTTP 307 (redirect login)
- [ ] Login dashboard → berhasil masuk ke overview
- [ ] Halaman Reports → data tampil (tidak kosong)
- [ ] Halaman WA Monitor → daftar job muncul
- [ ] `docker compose logs backend --tail 5` → tidak ada error flood
- [ ] `docker compose logs worker --tail 5` → worker initialized, tidak crash loop
- [ ] `df -h /` → disk usage < 85%
- [ ] Kirim test OTP → WA masuk ke HP

---

## Staging Environment

### Arsitektur Staging

```
docker-compose.staging.yml (network: lazisnu_default)
├── redis-staging:6379    (Redis 7 Alpine)
├── backend-staging:4001  (API, port 4001)
├── worker-staging        (WhatsApp worker)
└── web-staging:4000      (Next.js, port 4000)

Endpoint:
  http://staging-api.lazisnu.site/health/ready   → backend-staging:4001
  http://staging.lazisnu.site/                    → web-staging:4000
```

### Deploy ke Staging

```bash
cd /opt/lazisnu
git pull

# Build ulang staging
docker compose -f docker-compose.staging.yml up -d --build

# Verifikasi
curl http://staging-api.lazisnu.site/health/ready
# → {"db":"ok","redis":"ok"}

curl -I http://staging.lazisnu.site
# → HTTP 307
```

### Perbedaan Production vs Staging

| Aspek | Production | Staging |
|-------|-----------|---------|
| Compose file | `docker-compose.yml` | `docker-compose.staging.yml` |
| Backend port | 3001 | 4001 |
| Web port | 3000 | 4000 |
| Redis | `redis:6379` | `redis-staging:6379` |
| Network | `lazisnu_default` (default) | `lazisnu_default` (external) |
| DB Supabase | Production project | Staging project (`ngskcwwjwxsvjrswomkf`) |
| Env file | `apps/backend/.env` | `apps/backend/.env.staging` |
| SSL | HTTPS (Let's Encrypt) | HTTPS (Let's Encrypt, sejak 2026-07-29) |
| Redis data | `./redis-data` | `./redis-data-staging` |

### Menjalankan staging berdampingan dengan production

Kedua compose file menggunakan Docker network yang sama (`lazisnu_default`), sehingga nginx production bisa proxy ke container staging. Jalankan staging dengan project name terpisah untuk menghindari orphan warning:

```bash
docker compose -f docker-compose.staging.yml -p staging up -d --build
docker compose -p staging ps
```

---

## Perintah Berguna

```bash
# Status container
docker compose ps
docker compose -f docker-compose.staging.yml ps

# Log real-time
docker compose logs -f backend
docker compose logs -f worker

# Restart service tertentu
docker compose restart backend
docker compose restart nginx

# Masuk ke container
docker compose exec backend sh
docker compose exec redis redis-cli

# Build ulang satu service
docker compose up -d --build web

# Bersihkan cache Docker
docker system prune -a

# Cek penggunaan resource VM
df -h /
free -h
uptime
```
