# Deployment Guide — Lazisnu

> Terakhir diperbarui: 2026-07-23

## Arsitektur

```
Tencent Cloud CVM (Singapore)
├── nginx (SSL termination + reverse proxy)
│   ├── api.lazisnu.app → backend:3001
│   └── dashboard.lazisnu.app → web:3000
├── backend (Fastify API)
├── web (Next.js standalone)
└── worker (WhatsApp BullMQ)

Supabase (ap-southeast-1) — PostgreSQL
Upstash — Redis (BullMQ + session)
Cloudflare R2 — file storage
```

## Setup Awal — Tencent Cloud CVM

### 1. Provision VM

| Setting | Value |
|---------|-------|
| Region | Singapore |
| OS | Ubuntu 22.04 LTS |
| Instance | 2 vCPU, 4 GB RAM (minimal) |
| Disk | 40 GB SSD |
| Firewall | Open 22, 80, 443 |

### 2. SSH ke VM

```bash
ssh root@<VM_IP>
```

### 3. Jalankan setup script

```bash
# Dari lokal: copy script ke VM
scp scripts/setup-tencent.sh root@<VM_IP>:/root/

# Di VM:
chmod +x /root/setup-tencent.sh
bash /root/setup-tencent.sh
```

### 4. Deploy kode

```bash
# Dari lokal:
rsync -av --exclude 'node_modules' --exclude '.git' --exclude 'apps/mobile' \
  ./ root@<VM_IP>:/opt/lazisnu/

# Atau git clone:
# ssh root@<VM_IP>
# cd /opt && git clone <repo-url> lazisnu
```

### 5. Konfigurasi .env

```bash
# Di VM: buat file .env
cat > /opt/lazisnu/apps/backend/.env << 'EOF'
NODE_ENV=production
PORT=3001

DATABASE_URL=postgresql://...@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
REDIS_URL=rediss://...@...upstash.io:6379

JWT_SECRET=<random-32-chars>
JWT_ACCESS_SECRET=<random-32-chars>
JWT_REFRESH_SECRET=<random-32-chars>

CORS_ORIGINS=https://dashboard.lazisnu.app
API_BASE_URL=https://api.lazisnu.app

WA_PROVIDER=fonnte
WA_BUSINESS_API_URL=https://api.fonnte.com
WA_ACCESS_TOKEN=<token>

INTERNAL_API_KEY=<random-32-chars>
APP_SECRET=<random-32-chars>
EOF
```

### 6. Build & Start

```bash
cd /opt/lazisnu
docker compose up -d --build
```

### 7. SSL Certificate

```bash
# Install certbot
apt-get install -y certbot

# Generate certificate
certbot certonly --webroot -w /opt/lazisnu/nginx/certbot/www \
  -d api.lazisnu.app -d dashboard.lazisnu.app \
  --email admin@lazisnu.app --agree-tos --non-interactive

# Restart nginx untuk pakai SSL
docker compose restart nginx

# Auto-renewal
echo "0 3 * * * certbot renew --quiet && docker compose restart nginx" | crontab -
```

### 8. Verifikasi

```bash
curl https://api.lazisnu.app/health/ready
# → {"status":"ready","checks":{"db":"ok","redis":"ok"}}

curl https://dashboard.lazisnu.app
# → HTML dashboard
```

## Deploy Update

```bash
cd /opt/lazisnu
git pull
docker compose up -d --build
```

## Rollback

```bash
# Lihat image sebelumnya
docker images lazisnu-backend

# Rollback ke tag tertentu
docker compose down
IMAGE_TAG=<tag> docker compose up -d
```

## Database Migration

```bash
# Setelah deploy yang mengubah schema.ts:
docker compose exec backend node apps/backend/node_modules/.bin/drizzle-kit push --force

# Atau via migrate:
docker compose exec backend sh -c "cd apps/backend && npx drizzle-kit migrate"
```

## Backup Database

Supabase menyediakan daily backup otomatis. Tambahan manual:

```bash
# Cron harian di VM (jam 02:00 WIB):
0 2 * * * pg_dump "$DATABASE_URL" | gzip > /opt/backups/lazisnu-$(date +\%Y\%m\%d).sql.gz
```

## Monitoring

```bash
curl https://api.lazisnu.app/metrics
# → Prometheus metrics (CPU, memory, event loop lag)
```
