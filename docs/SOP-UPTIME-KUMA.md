# SOP Uptime Kuma — Lazisnu

> Terakhir diperbarui: 2026-07-31 (Lapis 3-4 implementasi)
> Status: 4 monitor aktif + 1 Discord binding (Lapis 1-2 selesai) | Lapis 3-4 menyusul

SOP ini mencakup:
- **Lapis 4a** — Backup `kuma.db` ke Cloudflare R2
- **Lapis 4b** — Public status page (`status.lazisnu.site`)
- **Lapis 3** — Migrasi Uptime Kuma dari `docker run` ke `docker-compose.yml`

---

## 1. Status Saat Ini (Lapis 1-2 — selesai)

| Aspek | Detail |
|-------|--------|
| Container | `uptime-kuma` (standalone, `docker run`, **belum** di compose) |
| Image | `louislam/uptime-kuma:1` |
| Data | Named volume `uptime-kuma` mount ke `/app/data` di container |
| Port | `3002:3001` (host:container) |
| Monitor aktif | 4 — Lazisnu API, Lazisnu Web, Staging API, Staging Web |
| Notification | 1 — Discord webhook (terikat ke semua 4 monitor) |
| Setup script | `scripts/kuma-setup-monitors.sh` (idempotent) |
| Public status page | ❌ Belum |
| Backup `kuma.db` | ❌ Belum |

---

## 2. Lapis 4a — Backup `kuma.db` ke R2

### Latar Belakang

Uptime Kuma menyimpan semua konfigurasi + history uptime di SQLite (`/app/data/kuma.db`). Saat ini TIDAK ada backup — kalau VM rusak / disk failure / kontainer corrupt, harus setup ulang 4 monitor dari nol + kehilangan 90 hari history.

### Prasyarat

- ✅ R2 credentials sudah ada di `/opt/lazisnu/.env.backup` (R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)
- ✅ `awscli` terinstall (`apt install -y awscli`)
- ✅ Container Uptime Kuma bernama `uptime-kuma` (default)
- ✅ Opsional: `sqlite3` CLI untuk online consistent backup (`apt install -y sqlite3`)

### Langkah Deploy

#### Step 1: Copy script ke VM

```bash
# Dari host lokal (Windows)
scp scripts/backup-kuma.sh ubuntu@lazisnu:/tmp/

# Di VM
sudo mv /tmp/backup-kuma.sh /opt/lazisnu/scripts/
sudo chmod +x /opt/lazisnu/scripts/backup-kuma.sh
```

#### Step 2: Test manual (1x)

```bash
sudo bash /opt/lazisnu/scripts/backup-kuma.sh
```

Verifikasi:
- File backup terbuat: `ls -la /opt/lazisnu/backups/kuma/`
- Log tanpa error: `tail -20 /opt/lazisnu/backups/kuma/backup-kuma.log`
- File ada di R2: cek dashboard Cloudflare R2 → bucket `lazisnu-backups` → folder `kuma/`

#### Step 3: Tambah ke crontab

```bash
sudo crontab -e
```

Tambah baris (jam 03:00 WIB, 1 jam setelah backup Postgres jam 02:00):

```cron
# Uptime Kuma database backup (Lapis 4a)
0 3 * * * bash /opt/lazisnu/scripts/backup-kuma.sh
```

Verifikasi:

```bash
sudo crontab -l | grep kuma
```

### Cara Restore (Disaster Recovery)

```bash
# 1. Stop container
docker stop uptime-kuma

# 2. Download backup terbaru dari R2
aws s3 cp s3://lazisnu-backups/kuma/YYYYMMDD/kuma_YYYYMMDD_HHMMSS.db.gz /tmp/ \
  --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com

# 3. Extract & replace kuma.db
gunzip /tmp/kuma_YYYYMMDD_HHMMSS.db.gz
docker cp /tmp/kuma_YYYYMMDD_HHMMSS.db uptime-kuma:/app/data/kuma.db
# (jika pakai named volume — extract manual ke /var/lib/docker/volumes/uptime-kuma/_data/)

# 4. Fix ownership (lihat fix-volume-ownership.sh)
sudo bash /opt/lazisnu/scripts/fix-volume-ownership.sh --dry-run
sudo bash /opt/lazisnu/scripts/fix-volume-ownership.sh

# 5. Start container
docker start uptime-kuma

# 6. Verifikasi
curl -I http://127.0.0.1:3002
# Login ke UI, cek 4 monitor + history
```

### Troubleshooting

| Gejala | Penyebab | Fix |
|--------|----------|-----|
| `ERROR: container 'uptime-kuma' tidak jalan` | Container stopped/renamed | `docker ps -a`, start atau rename container |
| `WARNING: R2 credentials not set` | `/opt/lazisnu/.env.backup` missing R2 vars | Cek file env, restart cron context |
| `backup file kosong` | sqlite3 gagal atau path salah | Cek log detail, pastikan `/app/data/kuma.db` ada di container |
| `upload to R2 gagal` | Network/R2 issue | File lokal tetap ada, retry manual dengan `aws s3 cp` |

---

## 3. Lapis 4b — Public Status Page

### Latar Belakang

User/pengurus/admin cabang saat ini harus chat admin untuk tanya "apakah sistem down?". Public status page menjawab sendiri, real-time, tanpa login. Standar industri (UptimeRobot, Atlassian Status, dll).

### Prasyarat

- ✅ Uptime Kuma sudah berjalan (Lapis 1-2 selesai)
- ✅ Subdomain `status.lazisnu.site` tersedia (DNS di **Hostinger** — nameserver `*.dns-parking.com`, BUKAN Cloudflare)
- ✅ nginx + certbot sudah setup (sudah untuk `api.lazisnu.site` dan `dashboard.lazisnu.site`)
- ✅ SSL certificate akan otomatis ter-generate oleh certbot untuk subdomain baru

### Langkah Deploy

#### Step 1: Enable Status Page di Uptime Kuma UI

1. Login ke `http://<VM-IP>:3002` (via SSH tunnel: `ssh -L 3002:127.0.0.1:3002 lazisnu`)
2. Menu **Status Pages** → **New Status Page**
3. Konfigurasi:
   - **Name**: `Lazisnu Status`
   - **Slug**: `lazisnu` (untuk URL `/status/lazisnu`)
   - **Theme**: Light (atau sesuai preferensi)
   - **Show Tags**: ✅ Yes
   - **Show Powered By**: ❌ No (opsional, branding)
4. Tambah **monitor** yang mau di-expose:
   - Lazisnu API ✅
   - Lazisnu Web Dashboard ✅
   - Staging API ✅
   - Staging Web ✅
   - (Jangan expose monitor internal / sensitive)
5. **Description** (opsional): "Status sistem Lazisnu — real-time monitoring kolektor, dashboard, dan backend API."
6. Save → catat URL internal: `http://127.0.0.1:3002/status/lazisnu`

#### Step 2: Setup nginx reverse proxy

Edit `/opt/lazisnu/nginx/nginx.conf` (file ini di-mount ke container nginx). Tambahkan 2 server block (HTTP redirect + SSL proxy) **sebelum** closing `}` di akhir file. Contoh konfigurasi lihat Section 4 di bawah atau langsung di `nginx.conf` (sudah ditambahkan untuk Lapis 4b).

Jika menggunakan konfigurasi custom:

```nginx
# Di akhir nginx.conf, sebelum closing }
server {
    listen 80;
    server_name status.lazisnu.site;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name status.lazisnu.site;

    ssl_certificate /etc/letsencrypt/live/status.lazisnu.site/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/status.lazisnu.site/privkey.pem;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proxy ke Uptime Kuma (via service name 'uptime-kuma' di docker network)
    location / {
        proxy_pass http://uptime-kuma:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # WebSocket — long-lived connection untuk real-time updates
        proxy_read_timeout 86400;
    }
}
```

Reload nginx:

```bash
docker compose exec nginx nginx -t  # validasi konfigurasi
docker compose restart nginx
```

> ⚠️ **PENTING (pengalaman 2026-08-01)**: Jika nginx.conf di host sudah di-update tapi container masih baca config LAMA (`grep -c 'status.lazisnu.site' <(docker exec nginx cat /etc/nginx/nginx.conf)` = 0), maka `restart`/`reload` TIDAK cukup — container bind-mount file memegang **inode lama**. Solusi: recreate container (`docker compose up -d nginx`), bukan restart. Juga pastikan cert SSL sudah ter-generate SEBELUM recreate (config baru punya `ssl_certificate` yang mereferensikan file cert — jika cert belum ada, nginx gagal start).

#### Step 3: Setup SSL dengan Certbot

```bash
# Opsional A — webroot (jika nginx sudah jalan dgn acme-challenge location):
docker compose exec nginx nginx -t
# Opsional B — standalone (pola crontab renewal: stop nginx dulu):
cd /opt/lazisnu && docker compose stop nginx
docker run --rm -p 80:80 \
  -v /opt/lazisnu/nginx/certbot/conf:/etc/letsencrypt \
  certbot/certbot certonly --standalone -d status.lazisnu.site \
  --non-interactive --agree-tos -m admin@lazisnu.site
docker compose up -d nginx
```

Certbot akan otomatis edit config nginx untuk tambah SSL + redirect HTTP → HTTPS.

#### Step 4: DNS — tambah A record

Di **Hostinger** dashboard (bukan Cloudflare — nameserver `*.dns-parking.com`):
- Type: `A`
- Name: `status`
- Content: `<IP-VM>` (mis. `43.128.98.52`)
- TTL: Auto

#### Step 5: Verifikasi

```bash
# 1. DNS resolve
dig status.lazisnu.site +short

# 2. HTTPS response
curl -I https://status.lazisnu.site
# Expected: HTTP/2 200

# 3. Status page accessible
curl -I https://status.lazisnu.site/status/lazisnu
# Expected: HTTP/2 200, content-type: text/html

# 4. Monitor status muncul
# Buka di browser: https://status.lazisnu.site/status/lazisnu
# Expected: 4 monitor dengan status indicator (hijau = up)
```

### Testing Alert Real Flow

Setelah status page live, test alert Discord end-to-end:

1. **Pause salah satu monitor** di Kuma UI (mis. Lazisnu API)
2. **Tunggu heartbeat berikutnya** (max 60 detik)
3. Monitor jadi status **DOWN** merah di status page ✅
4. Discord notification diterima ✅
5. **Unpause** monitor → status kembali UP hijau
6. Discord notification "RECOVERED" diterima ✅

**Atau test manual via Discord webhook**:
- Kuma UI → Settings → Notifications → Discord → klik **Test** → cek Discord channel

---

## 4. Lapis 3 — Migrasi ke docker-compose

### Latar Belakang

Saat ini Uptime Kuma jalan via `docker run` standalone. Konfigurasi tidak reproducible (harus ingat command), tidak tracked di git, inkonsisten dengan service lain (redis, prometheus, grafana, dll sudah di compose).

### Tujuan

- ✅ Konfigurasi tracked di `docker-compose.yml` (versioned)
- ✅ Bind mount `./uptime-kuma/data:/app/data` (bukan named volume — lebih mudah backup Lapis 4a via `cp` langsung, tidak perlu `docker exec`)
- ✅ `user:` directive sesuai image default (lihat fix-volume-ownership.sh)
- ✅ Port restriction `127.0.0.1:3002:3001` (bind ke localhost, akses via SSH tunnel atau reverse proxy — bukan public)
- ✅ Healthcheck
- ✅ Restart policy `unless-stopped`

### Prasyarat

- ✅ Lapis 4a selesai (backup `kuma.db` terbaru ada di R2)
- ✅ Data existing aman di backup (kalau migrasi gagal, bisa restore)
- ✅ VM ini punya file `docker-compose.yml` (sudah ada di `/opt/lazisnu/`)

### Langkah Deploy

#### Step 1: Edit `docker-compose.yml`

Tambah service `uptime-kuma`:

```yaml
  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    restart: unless-stopped
    user: "1000:1000"  # node user default di image Uptime Kuma
    ports:
      - "127.0.0.1:3002:3001"  # localhost only — akses via SSH tunnel atau nginx (Lapis 4b)
    volumes:
      - ./uptime-kuma/data:/app/data
      - /etc/localtime:/etc/localtime:ro
    healthcheck:
      test: ["CMD", "node", "extra/healthcheck.js"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

#### Step 2: Stop container lama & migrate data

```bash
# 1. Stop container lama (standalone, di luar compose)
docker stop uptime-kuma

# 2. Copy data dari named volume ke host bind-mount path
docker run --rm \
  -v uptime-kuma:/from \
  -v /opt/lazisnu/uptime-kuma/data:/to \
  alpine cp -a /from/. /to/

# 3. Fix ownership (sesuai user directive 1000:1000)
sudo chown -R 1000:1000 /opt/lazisnu/uptime-kuma/data

# 4. Verifikasi
ls -la /opt/lazisnu/uptime-kuma/data/
# Expected: kuma.db, data-files/, dll
```

#### Step 3: Start via compose

```bash
cd /opt/lazisnu
docker compose up -d uptime-kuma

# Verifikasi
docker compose ps uptime-kuma
# Expected: Up X minutes (healthy)

# Cek log
docker compose logs --tail=50 uptime-kuma
```

#### Step 4: Verifikasi fungsi

```bash
# 1. Container up
docker ps --filter name=uptime-kuma

# 2. HTTP response
curl -I http://127.0.0.1:3002
# Expected: HTTP/1.1 200 OK

# 3. Login UI
# SSH tunnel: ssh -L 3002:127.0.0.1:3002 lazisnu
# Browser: http://127.0.0.1:3002
# Verifikasi: 4 monitor masih ada, history uptime intact

# 4. Status page (jika Lapis 4b sudah live)
curl -I https://status.lazisnu.site/status/lazisnu
```

#### Step 5: Cleanup volume named lama

```bash
# Hanya setelah compose confirmed jalan minimal 24 jam
# (container lama SUDAH dihapus saat migrasi Step 2 — jangan jalankan docker rm uptime-kuma lagi,
#  nama itu sekarang dipakai container compose yang aktif!)

# Hapus volume named LAMA (data sudah di bind-mount, sudah aman)
# NAMA VOLUME = uptime-kuma-data (BUKAN uptime-kuma)
docker volume rm uptime-kuma-data
```

#### Step 6: Update backup script

Edit `scripts/backup-kuma.sh`:
- Ganti `docker cp $KUMA_CONTAINER:$KUMA_DB_PATH` 
- Dengan `cp /opt/lazisnu/uptime-kuma/data/kuma.db` (langsung dari host, tanpa docker)

(Karena pakai bind mount, lebih simple & cepat.)

### Troubleshooting

| Gejala | Penyebab | Fix |
|--------|----------|-----|
| Container exit setelah restart | Volume ownership salah | `sudo bash scripts/fix-volume-ownership.sh` |
| 401 di UI / monitor missing | Data belum ter-copy / kuma.db corrupt | Restore dari backup Lapis 4a |
| Healthcheck failed | Port salah atau app crash | `docker compose logs uptime-kuma` |
| Disk usage naik tajam | Log tidak di-rotate | Tambah logging driver (lihat compose di atas) |

---

## 5. Cron Schedule (Final)

Setelah Lapis 4a deploy, crontab VM:

```cron
# Backup database Postgres (Sesi 31)
0 2 * * * bash /opt/lazisnu/scripts/backup.sh

# Backup Uptime Kuma database (Lapis 4a)
0 3 * * * bash /opt/lazisnu/scripts/backup-kuma.sh

# Certbot renew SSL (existing)
0 0 * * 0 certbot renew --quiet
```

---

## 6. Referensi

- Script backup: `scripts/backup-kuma.sh`
- Setup monitor: `scripts/kuma-setup-monitors.sh`
- Fix volume ownership: `scripts/fix-volume-ownership.sh`
- Sesi catatan: `docs/implementation/SESSION-2026-07-30.md` Lanjutan 6
- SOP Backup & Restore (Postgres): `docs/SOP-BACKUP-RESTORE.md`
- SOP Mount Bind File: `docs/SOP-MOUNT-BIND-FILE.md`
