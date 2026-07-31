# SOP Mount Bind File — Lazisnu

> Terakhir diperbarui: 2026-07-30 | Berlaku untuk VM `lazisnu` (production) dan staging

## Tujuan

Dokumen ini menjelaskan **prosedur standar** untuk me-mount file/direktori dari host ke dalam container Docker di proyek Lazisnu, baik untuk **konfigurasi read-only** maupun **data read-write**.

## Mengapa SOP Ini Penting

- Bind mount yang salah → container gagal start, service crash, atau perubahan tidak ter-apply
- Permission salah → container tidak bisa read/write (root cause insiden Sesi 31 `chown -R ubuntu`)
- File tidak ada di host → `docker-compose up` error `invalid mount config`
- Line endings salah (CRLF vs LF) → script di container gagal parse

---

## 1. Kapan Pakai Bind Mount

| Use Case | Bind Mount | Docker Volume |
|----------|:----------:|:------------:|
| File konfigurasi (nginx, prometheus, redis.conf) | ✅ | ❌ |
| Direktori provisioning (Grafana dashboards) | ✅ | ❌ |
| Direktori data persisten (postgres, redis) | ⚠️ | ✅ (default) |
| Sertifikat TLS (Let's Encrypt) | ✅ | ❌ |
| Backup file temporary | ❌ | ✅ |
| Cache data | ❌ | ✅ |

**Prinsip**:
- **Config & static asset** → bind mount (tracked di git, easy review)
- **Data dinamis** (write-heavy, frequent growth) → Docker volume (performance, snapshot)

## 2. Konvensi Proyek Lazisnu

### 2.1 Lokasi Direktori

Semua path bind mount **relatif terhadap root proyek** (`/opt/lazisnu` di VM):

| Service | Config Path (host) | Mount Path (container) | Mode |
|---------|-------------------|------------------------|:----:|
| Redis | `./redis/redis.conf` | `/usr/local/etc/redis/redis.conf` | ro |
| Prometheus | `./prometheus/prometheus.yml` | `/etc/prometheus/prometheus.yml` | ro |
| Prometheus | `./prometheus/alert.rules.yml` | `/etc/prometheus/alert.rules.yml` | ro |
| Grafana | `./grafana/provisioning` | `/etc/grafana/provisioning` | ro |
| Nginx | `./nginx/nginx.conf` | `/etc/nginx/nginx.conf` | ro |
| Nginx | `./nginx/upstream.conf` | `/etc/nginx/upstream.conf` | ro |
| Certbot | `./nginx/certbot/conf` | `/etc/letsencrypt` | rw |
| Certbot | `./nginx/certbot/www` | `/var/www/certbot` | rw |

### 2.2 Mode Default

- **Config file (`.yml`, `.conf`, `.cnf`)** → SELALU tambahkan `:ro` (read-only) di belakang
- **Provisioning direktori** → SELALU `:ro`
- **Sertifikat & certbot work dir** → `:rw` (butuh write)
- **Data volume** → tanpa mode (rw default, tapi Docker volume lebih disarankan)

### 2.3 Naming Convention

- Folder di host lowercase-hyphen: `redis-data/`, `prometheus-data/`, `grafana-data/`, `nginx/certbot/conf/`
- File konfigurasi lowercase: `redis.conf`, `prometheus.yml`, `alert.rules.yml`
- Dilarang: spasi, uppercase, nama generic seperti `config.yml` (tidak descriptive)

---

## 3. Cara Tambah Config File Baru (Step-by-Step)

### Contoh Kasus: Tambah file `prometheus/blackbox-exporter.yml` (konfigurasi baru untuk blackbox exporter)

#### Step 1 — Buat/edit file di host
```bash
# Lokasi harus di-tracking git
nano /opt/lazisnu/prometheus/blackbox-exporter.yml
```

**Penting**:
- **Line endings**: LF (Unix), BUKAN CRLF (Windows)
  - Cara cek: `file /opt/lazisnu/prometheus/blackbox-exporter.yml`
  - Output yang benar: `... ASCII text`
  - Output salah: `... ASCII text, with CRLF line terminators`
- **Indent**: 2 spasi (sesuai YAML convention), BUKAN tab
- **Owner**: `ubuntu:ubuntu` (akun SSH yang default)
- **Permission**: `0644` (rw-r--r--)

#### Step 2 — Tambah entry di `docker-compose.yml`

```yaml
  blackbox-exporter:                                       # service name
    image: prom/blackbox-exporter:latest
    restart: unless-stopped
    user: "65534:65534"                                    # match container default
    command:
      - "--config.file=/etc/blackbox_exporter/blackbox.yml"
    volumes:
      - ./prometheus/blackbox-exporter.yml:/etc/blackbox_exporter/blackbox.yml:ro
      - blackbox-exporter-data:/tmp
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

#### Step 3 — Verifikasi syntax docker-compose
```bash
cd /opt/lazisnu
sudo docker compose config --quiet
echo "Exit: $?"  # harus 0 (zero)
```

#### Step 4 — Pull image & start service
```bash
sudo docker compose pull blackbox-exporter
sudo docker compose up -d blackbox-exporter
```

#### Step 5 — Verifikasi container up dan file ter-mount
```bash
# Container up?
sudo docker ps --filter "name=blackbox-exporter" --format "{{.Status}}"

# File ter-mount dengan benar?
sudo docker exec blackbox-exporter ls -la /etc/blackbox_exporter/
# Expected: blackbox.yml ada, mode readable

# Isi file match dengan host?
sudo docker exec blackbox-exporter cat /etc/blackbox_exporter/blackbox.yml | head -5
# Compare dengan output: head -5 /opt/lazisnu/prometheus/blackbox-exporter.yml
```

#### Step 6 — Commit & push
```bash
cd /opt/lazisnu
git add docker-compose.yml prometheus/blackbox-exporter.yml
git commit -m "feat(monitoring): add blackbox-exporter service dengan config bind mount"
git push origin main
# CI auto deploy-staging
```

---

## 4. Verifikasi Mount Berhasil

### 4.1 Cek Mount Point Aktif
```bash
# Dari host
sudo docker inspect <container> --format '{{json .Mounts}}' | python3 -m json.tool

# Dari dalam container
mount | grep <mount_path>
# atau
df -h <mount_path>
```

### 4.2 Cek Permission File di Dalam Container
```bash
sudo docker exec <container> ls -la <mount_path>

# Harus match dengan:
ls -la <host_path>
```

### 4.3 Cek Service Bisa Read File
```bash
# Untuk service yang load config saat start
sudo docker logs <container> --tail 20

# Untuk service yang baca runtime (e.g. nginx reload)
sudo docker exec <container> <command> -t  # test command
# Contoh: sudo docker exec nginx nginx -t
```

### 4.4 Cek Volume Writeable (untuk data RW)
```bash
sudo docker exec <container> touch <mount_path>/.write-test
sudo docker exec <container> rm <mount_path>/.write-test
echo "OK"
# Jika "Permission denied" → lihat troubleshooting 5.1
```

---

## 5. Troubleshooting

### 5.1 "Permission Denied" saat Container Read/Write

**Penyebab**: File/dir di host dimiliki user yang tidak match dengan container user.

**Diagnosa**:
```bash
# Host side
ls -la /opt/lazisnu/<path>

# Container side
sudo docker exec <container> id
# Lihat uid/gid

# Apakah match?
# host: drwxr-xr-x ubuntu ubuntu
# container: uid=999(redis)
# → TIDAK MATCH (999 ≠ 1000)
```

**Solusi** (pilih salah satu):
- **A. Set `user:` directive** di docker-compose (recommended, root cause fix)
  ```yaml
  service:
    user: "999:999"  # match container default
  ```
- **B. Chown folder** ke UID container (incident recovery)
  ```bash
  sudo chown -R 999:999 /opt/lazisnu/<path>
  ```
  ⚠️ Risiko: setiap re-create container perlu chown ulang. Lihat `scripts/fix-volume-ownership.sh`.

### 5.2 "File Not Found" saat Container Start

**Penyebab**: Path host salah, atau file belum dibuat.

**Diagnosa**:
```bash
# Apakah file ada di host?
ls -la /opt/lazisnu/<path>

# Apakah path di docker-compose sesuai?
grep "<path>" /opt/lazisnu/docker-compose.yml
```

**Solusi**:
- Buat file di host jika belum ada
- Perbaiki path (case-sensitive!)

### 5.3 "Invalid Mount Config" / "Bind Source Doesn't Exist"

**Penyebab**: Folder parent tidak ada. Docker create parent folder tidak otomatis.

**Solusi**:
```bash
sudo mkdir -p /opt/lazisnu/<parent_dir>
```

### 5.4 Config Syntax Error di Container

**Gejala**: Service restart loop, log menampilkan "syntax error" atau "invalid config".

**Diagnosa**:
```bash
# Untuk nginx
sudo docker exec nginx nginx -t

# Untuk prometheus
sudo docker exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Untuk redis
sudo docker exec redis redis-server /usr/local/etc/redis/redis.conf --test
```

**Solusi**: Edit file di host, lalu restart container:
```bash
sudo docker compose restart <service>
```

### 5.5 Container Bisa Start tapi Config Tidak Kena

**Penyebab**: Service cache config lama, config file di-bind ke path yang salah, **atau container memegang inode lama** dari file yang dihost diganti.

**Diagnosa**:
```bash
# Cek file benar-benar ter-mount dengan path yang benar
sudo docker exec <container> cat <container_path>
# Output harus match dengan cat <host_path>
# Bandingkan:
docker exec <container> grep -c '<keyword-baru>' <container_path>
grep -c '<keyword-baru>' <host_path>
# Kalau container = 0 tapi host > 0 → container baca inode LAMA
```

**Solusi**:
- Perbaiki path di docker-compose
- **Biasanya cukup**: `docker compose restart <service>` (force re-read)
- **Jika config tetap tidak kena (inode lama)**: `restart`/`reload` TIDAK cukup — harus **recreate container**: `docker compose up -d <service>` (atau `--force-recreate`). Ini karena bind-mount file memegang inode file lama; container yang sama tetap baca file lama meski di-reload.

> ⚠️ **Penting**: Kalau file config yang di-recreate mereferensikan resource belum ada (mis. `ssl_certificate` sebelum certbot), recreate akan GAGAL start. Buat resource dulu (certbot), baru recreate.

---

## 6. Pitfall Umum

### 6.1 CRLF vs LF (Line Endings)

❌ **Salah**: File diedit di Windows Notepad → CRLF
- Gejala: Script di container `'\r': command not found`
- Fix: `dos2unix <file>` atau `sed -i 's/\r$//' <file>`

✅ **Benar**: File diedit di VS Code / Linux → LF

**Cek cepat**:
```bash
file /opt/lazisnu/<file>
# ASCII text                    = OK
# ASCII text, with CRLF line... = BUG
```

### 6.2 Tab vs Spasi untuk Indent

❌ **Salah**: YAML/JSON pakai tab
- Gejala: `found character '\t' that cannot start any token`
- Fix: `expand -t 2 <file> > <file>.new && mv <file>.new <file>`

✅ **Benar**: 2 spasi untuk YAML, sesuai linter

### 6.3 Absolute vs Relative Path

❌ **Salah**: Pakai absolute path
```yaml
volumes:
  - /home/ubuntu/lazisnu/data:/data  # Tidak portable
```

✅ **Benar**: Pakai relative path
```yaml
volumes:
  - ./data:/data  # Portable, jalan di dev/CI/VM
```

### 6.4 Lupa Tambah `:ro` untuk Config

❌ **Salah**: Config writable (security risk)
```yaml
- ./nginx/nginx.conf:/etc/nginx/nginx.conf
```

✅ **Benar**: Config read-only
```yaml
- ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
```

### 6.5 Path Conflict antara Volume dan Bind Mount

❌ **Salah**: 
```yaml
volumes:
  - prometheus-data:/prometheus          # Docker volume
  - ./prometheus-data:/prometheus        # bind mount — CONFLICT
```

Docker tidak menolak, tapi yang dipakai adalah bind mount (terakhir). Konflik silent, sulit di-debug.

**Solusi**: Jangan pakai nama yang sama. Gunakan prefix untuk volume:
```yaml
volumes:
  - prometheus_data:/prometheus          # underscore
  - ./prometheus-data:/prometheus        # dash
```

### 6.6 File dengan Spasi di Nama

❌ **Salah**: `penggalan riwayat.txt`
- PowerShell escape, Docker build, dan Git bisa bermasalah
- Tidak portable

✅ **Benar**: `penggalan-riwayat.txt` atau `penggalan_riwayat.txt`

---

## 7. Recap Perubahan Bind Mount

Untuk audit, tambahkan entry di tabel saat membuat/mengubah mount:

| Tanggal | Service | Aksi | Path | Issue |
|---------|---------|------|------|-------|
| 2026-07-24 | Redis | Tambah `redis.conf:ro` | `./redis/redis.conf:/usr/local/etc/redis/redis.conf:ro` | Fix permission error saat custom config |
| 2026-07-30 | Prometheus, Grafana, Redis | Tambah `user:` directive | n/a (compose change) | Fix volume ownership (Sesi 30 Lanjutan 5) |
| 2026-07-30 | Backup scripts | Tambah `secrets/` folder | `/opt/lazisnu/secrets/` | Konsolidasi env backup (RENCANA Phase 5) |

---

## 8. Referensi

- `docs/SOP-BACKUP-RESTORE.md` — SOP untuk backup & restore
- `docs/SOP-HOUSEKEEPING-VM.md` — SOP housekeeping bulanan (akan datang, RENCANA Phase 6)
- `scripts/fix-volume-ownership.sh` — Incident recovery untuk permission issue
- `docker-compose.yml` — Service definitions
- `docker-compose.prod.yml` — Production overrides (blue/green)
- `docker-compose.staging.yml` — Staging overrides

---

*SOP ini akan diupdate seiring waktu. Jika menemukan pitfall baru atau ada konvensi yang perlu diubah, tambahkan di section yang sesuai lalu commit.*
