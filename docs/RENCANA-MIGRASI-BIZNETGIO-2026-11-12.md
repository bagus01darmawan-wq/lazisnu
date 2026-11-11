# Rencana Migrasi Lazisnu: Oracle Cloud → Biznet Gio NEO Lite MS 4.2

> **Status: REVISI 2 — RENCANA. Belum ada perubahan infrastruktur yang dijalankan.**
> Disusun: 12 November 2026. Revisi ini menggabungkan tinjauan kode, koreksi key R2,
> temuan denylist Redis, drift `main`/`staging`, dan perbaikan rollback upstream nginx.
> Semua perintah dijalankan manual oleh operator. Jangan mencetak isi env/secret ke chat,
> commit, screenshot, atau log.

---

## 0. Putusan singkat

Rencana ini **belum boleh dieksekusi sampai Fase 0 lulus**. Enam kelompok masalah yang
harus ditutup lebih dulu:

1. **Kelengkapan konfigurasi** — env file tidak ikut bundel exporter lama; Compose akan
   gagal sebelum container pertama hidup.
2. **Bootstrap runtime** — `nginx/upstream.conf` tidak ada di clone, direktori volume
   belum dibuat, dan kepemilikan UID container belum benar.
3. **State keamanan Redis** — Redis menyimpan denylist refresh token, bukan hanya antrean.
   Kehilangan state ini bisa membuat token yang sudah dicabut diterima lagi.
4. **Handover cron** — cron tidak boleh aktif di VM baru sebelum cutover, dan cron VM lama
   harus dimatikan setelah cutover agar tidak terjadi eksekusi ganda.
5. **DNS/TLS** — `png.lazisnu.site` tidak punya vhost di `nginx.conf`; jangan pindahkan
   record sebelum ada keputusan layanan.
6. **Koordinasi CI** — deploy prod dan staging memakai checkout yang sama, secret bisa
   berasal dari environment, dan tag `v*` memicu rilis APK.

---

## 1. Perubahan dari versi sebelumnya

| Area | Versi lama | Revisi ini |
|---|---|---|
| Key R2 | `s3://bucket/migrasi/<r2_key>` padahal `<r2_key>` sudah mengandung `migrasi/` | Gunakan key lengkap **sekali**: `s3://$R2_BUCKET_NAME/$R2_KEY` |
| Env file | Dianggap ikut bundel | Daftar eksplisit + matriks kepemilikan; `.env.backup` disiapkan out-of-band |
| `nginx/upstream.conf` | “Dibuat nanti oleh deploy” | Bootstrap dari `nginx/upstream.conf.example` sebelum nginx start |
| Direktori volume | Langsung `chown` | `mkdir -p` dulu, lalu chown sesuai UID container |
| Flag backup | Tidak disebut | `backup-data/active` wajib; verifikasi `START` → `SUCCESS`, bukan `SKIPPED` |
| Kuma | Tidak dipulihkan | Backup + restore `kuma.db` sebelum start Kuma |
| Redis | Dianggap cache/antrean | Snapshot AOF konsisten + uji denylist sesi tercabut |
| Cron | Dipasang aktif di Fase 2 | Dipasang **nonaktif**; handover saat cutover |
| CI | Hanya secret repo | Periksa secret environment; freeze; deploy berurutan; jangan pakai tag `v*` |
| Rollback | DNS + `VM_HOST` | Tambah fix bug upstream nginx + penanganan state Redis |
| `png` | Ikut dipindah | Cek vhost efektif; tambah vhost atau hapus record |
| Drift infra | Tidak disebut | Pin commit checkout; exporter `main` dan `staging` berbeda |
| CPU alert | Tidak disebut | `HighCpuUsage` membagi 4 inti; target 2 vCPU perlu penyesuaian |

---

## 2. Tujuan & prinsip

**Tujuan:** memindahkan 13 container produksi/staging/monitoring dari VM Oracle Batam ke
VM Biznet Gio Jakarta tanpa kehilangan data dan dengan downtime seminimal mungkin.

| Hal | Sumber kebenaran | Dipindah? |
|---|---|---|
| Kode aplikasi | Git (`bagus01darmawan-wq/lazisnu`, publik) | Tidak — clone ulang via HTTPS |
| Database | Supabase eksternal (`DATABASE_URL`) | Tidak — tidak ada Postgres lokal |
| Backup DB / APK / artefak migrasi | Cloudflare R2 | Tidak |
| Image Docker | GHCR privat | Tidak — pull ulang |
| Rahasia, sertifikat, cron, sysctl | `/opt/lazisnu/` di VM | **YA** |
| Redis produksi/staging | `/opt/lazisnu/redis-data*` | **YA — state auth + antrean** |
| Kuma DB | `/opt/lazisnu/uptime-kuma/data/kuma.db` | **YA — dari backup R2** |
| Grafana/Prometheus history | `/opt/lazisnu/{grafana,prometheus}-data` | Opsional — keputusan operator |
| Identitas server / DNS | Cloudflare + GitHub Secrets | **YA** |

---

## 3. Fakta terverifikasi dan yang masih perlu dicek

| Item | Nilai |
|---|---|
| VM lama | `168.110.198.70`, `ap-batam-1`, `VM.Standard.E5.Flex` 2 OCPU / 8 GB |
| OS lama | Ubuntu 24.04.5 LTS, x86_64 |
| Zona waktu | `Asia/Jakarta` (WIB), NTP aktif, RTC bukan local time |
| Container | 13 aktif; blue aktif (`blue-backend:3001`, `blue-web:3000`) |
| RAM / disk | ±1,77 GB dari 7,9 GB; 12 GB dari 96 GB |
| Backup DB | 12 Nov 02:00 WIB SUCCESS ke `backups/` (646.804 byte); staging 11 Nov 02:30 (179.784 byte); **`backups-prod/` tidak ada** |
| Sertifikat | 5 `fullchain.pem`; expiry 20 Jan 2027 |
| DNS | 7 record A, TTL 300 s, **DNS only** |
| Repo | Publik; checkout VM `21757aa` (staging, detached); image produksi berjalan `bf0b083` (main) |
| CI/SSH | Environment `Production` & `staging` punya `VM_HOST`/`VM_USER`/`VM_SSH_KEY` sendiri; auth log: CI memakai `SHA256:CII...` = `lazisnu_vm.pub` |
| Infra drift | `docker-compose.yml` dan `vm-migration-export.sh` berbeda antara `main` dan `staging` |
| nginx | 6 hostname di `nginx.conf`: `api`, `dashboard`, `staging-api`, `staging`, `status`, `grafana` |
| Redis | AOF + RDB; live `revoked=1`, `refresh=8`, `dbsize=11`; AOF rewrite ok |
| Env mode | `.env`/`.env.alertmanager` 600; `apps/backend/.env` 644; `.env.staging` 664 — perlu dirapatkan |
| `png` | cert ada; **tidak ada server block**; TLS ke IP lama gagal (curl exit 60) |
| Mobile | Hardcode `https://api.lazisnu.site`; cukup ganti DNS |

**Wajib diverifikasi operator sebelum eksekusi:**

- Isi GitHub Secrets di level repo **dan** environment `Production`/`staging`.
- Apakah Oracle masih hidup dan berapa lama setelah trial berakhir.
- Apakah Supabase punya network restriction yang perlu meng-allow IP Biznet.
- Keputusan `png.lazisnu.site`: hapus record atau buat vhost.
- Keputusan pipeline `backups-prod`: perbaiki dan pertahankan, atau hentikan.
- Konfirmasi IP publik dan image Ubuntu 24.04 di portal Biznet.

### 3.1 Hasil preflight 12 Nov 2026 02:18 WIB

Dijalankan read-only dengan `scripts/migration-preflight.sh`:

- **Timezone WIB terkonfirmasi.** Root crontab: backup prod `02:00`, staging `02:30`,
  Kuma `03:00`, certbot Senin `03:00`. `/etc/cron.d/lazisnu-backup-prod` berjalan
  `19:30` WIB — bukan 02:30. Tidak ada tumpang tindih dengan root crontab.
- **`backups-prod/` tidak ada.** Cron prod kedua memakai redirection
  `>> /opt/lazisnu/backups-prod/cron.log`; karena direktori tidak ada, shell gagal
  sebelum `backup-prod.sh` jalan. Pipeline ini belum pernah sukses dari cron.
  `backup-prod-data/active` dan `scripts/backup-prod.sh` ada.
- **Kutipan cron healthcheck hilang.** Baris staging (`18`) dan prod (`19`) di
  `/etc/cron.d/lazisnu-backup-health` memakai `bash -c` tanpa kutip, sehingga hanya
  assignment variabel yang dijalankan; healthcheck staging/prod tidak pernah dieksekusi.
  Template repo `scripts/backup-healthcheck.cron` sudah diperbaiki.
- **Image produksi terkonfirmasi `bf0b083`.** Checkout repo di VM adalah `21757aa`
  (staging, detached), sedangkan container blue menjalankan `bf0b083` (main).
- **TLS `png` gagal.** `curl --resolve png.lazisnu.site:443:168.110.198.70` keluar
  dengan kode 60 (sertifikat tidak cocok/tidak valid); tidak ada vhost `png` di
  `nginx -T`, meskipun cert `png` ada. Tidak ada referensi `png.lazisnu.site` di repo
  (pencarian hanya menemukan `upzispng.lazisnu.site`). Rekomendasi default: hapus record
  `png` saat cutover, kecuali operator tahu layanan eksternal yang memakainya.
- **Mode env terlalu terbuka.** `apps/backend/.env` = 644, `apps/backend/.env.staging`
  = 664; `.env` dan `.env.alertmanager` = 600; `secrets/` = 700 dengan file 600.
- **Redis live:** `revoked=1`, `refresh=8`, `dbsize=11`; AOF aktif dan rewrite ok.
- **Secret GitHub dua level.** Repo punya `VM_HOST`; environment `Production` dan `staging`
  masing-masing juga punya `VM_HOST`/`VM_USER`/`VM_SSH_KEY`. Environment secret
  **menimpa** repo secret, jadi `VM_HOST` wajib diubah di kedua environment.
- **Key CI terverifikasi.** Auth log VM lama menunjukkan login dari IP GitHub/Azure
  memakai ED25519 `SHA256:CIIuw/0SetbKAjvgG9Opp4D+sEfCrohR9fEpz5bUXRw`, sama dengan
  `lazisnu_vm.pub`. Import public key itu ke Biznet. Key RSA `qUz...` dan key Tencent
  hanya legacy.

### 3.2 Hasil eksekusi Fase 0 — 12 Nov 2026 02:34 WIB

| Item | Nilai |
|---|---|
| Kuma backup | `kuma/20261112/kuma_20261112_023405.db.gz` — 1.837.972 byte |
| Bundel migrasi | `migrasi/lazisnu-vm-export-20261112_023415.tar.gz` — 30.871 byte |
| Isi bundel | `.env`, `.env.alertmanager`, `.env.backup`, `.env.backup-prod`, `apps/backend/.env*`, 5 cron.d, certbot (termasuk symlink `live/*.pem`), `scripts/backup-prod.sh`, `REVISION 21757aa`, `MANIFEST.txt` |
| Redis baseline | `revoked=1`, `refresh=8`, `dbsize=11` |
| CI saat eksekusi | tidak ada run in-progress/queued |
| Catatan | `.env.staging` top-level tidak ada; `cron/lazisnu-backup-health` di bundel masih versi lama yang kutipannya rusak — Fase 2.3 menggantinya dengan template repo; `cron/root-crontab` masih berisi QCloud — hapus sebelum dipasang |

`.env.backup` tetap harus disiapkan out-of-band (scp/token baca R2) untuk mengunduh bundel;
arsip tidak bisa mengunduh dirinya sendiri.

### 3.3 Hasil Fase 1 — VM Biznet

| Item | Nilai |
|---|---|
| IP publik | **139.190.106.152** |
| Hostname | `lazispaninggaran` |
| OS | Ubuntu 24.04.4 LTS, x86_64 |
| User | `ubuntu` uid 1000, sudo passwordless, group `docker` |
| Docker | 29.9.3; Compose v5.7.1 |
| AWS CLI | 2.40.0 (`/usr/local/bin/aws`) |
| pg_dump | 17.11 (`/usr/lib/postgresql/17/bin/pg_dump`) |
| Swap | 2 GB (`/swapfile`, masuk `/etc/fstab`) |
| Timezone | `Asia/Jakarta` (WIB) |
| UFW | active; 22/80/443 |
| Repo | HTTPS clone di `21757aa`; patch exporter/rollback/healthcheck/alert di-scp |
| Bootstrap | `nginx/upstream.conf` dari example; direktori volume + flag backup dibuat |
| Catatan | Repo VM menunjukkan modifikasi lokal dari patch; CI reset ke `main` nanti akan menimpa — pastikan patch masuk commit produksi |

### 3.4 Hasil Fase 2 — restore artefak

| Item | Nilai |
|---|---|
| Bundel | Diekstrak; `MANIFEST.txt` + `REVISION 21757aa` |
| Sertifikat | 5 domain di `nginx/certbot/conf/live`; symlink `*.pem` ada |
| Cron | Staged di `cron/staged/`; template healthcheck 17/18/19; QCloud dihapus |
| Kuma | `kuma.db` 6,7 MB direstore; `/dashboard` HTTP 200 |
| Env | `.env`, `.env.alertmanager`, `apps/backend/.env*` = 600 ubuntu; `secrets/` = 700 root; `.env.backup*` = 600 root |
| Compose | `docker compose config` base + staging OK; deploy blue-green sukses |
| Catatan | Ekstraksi tar sebagai root mengubah `apps/` dan `scripts/` menjadi root:700; sudah diperbaiki ke ubuntu:ubuntu 755. Redis preliminer belum disalin; snapshot final di Fase 5.1. |

### 3.5 Hasil Fase 3–4 — stack dan uji pra-DNS

| Item | Nilai |
|---|---|
| Container | **13** aktif |
| Blue-green | Blue active, `blue-backend` HEALTHY, green DOWN |
| Prod health | `/health/ready` → db ok, redis ok; web `/api/health` ok |
| Staging health | backend/web via nginx → ok |
| Backup default | `backups/lazisnu_20261112_030004.sql.gz` — 647.170 byte, SUCCESS |
| Backup prod-specific | `backups-prod/lazisnu_20261112_030042.sql.gz` — 647.171 byte, SUCCESS |
| Healthcheck | default, staging, prod-specific → SUCCESS |
| Config drift | `PROD_OK`, `STAGING_OK`, `SUCCESS` |
| TLS | `api`, `dashboard`, `staging-api`, `staging`, `status`, `grafana` valid **tanpa `-k`** |
| Auth probe | LOGIN_OK, ME_OK, PREFETCH_OK, REFRESH_OK, ME_AFTER_REFRESH_OK |
| Kuma | `/dashboard` 200; DB restored |
| `png` | Belum dipindah; keputusan hapus/vhost masih pending |
| GHCR | Login manual via token `gh`; CI akan memakai token sendiri |

### 3.6 Hasil Fase 5 — cutover 12 Nov 2026 03:21 WIB

| Item | Nilai |
|---|---|
| DNS | 6 record A → `139.190.106.152`; `png` → NXDOMAIN (dihapus) |
| Redis final | prod `revoked=1`, `refresh=8`, DBSIZE 10; staging DBSIZE 45; AOF rewrite ok |
| Cron Biznet | root crontab + 5 cron.d; baris healthcheck prod memakai kutipan |
| Cron Oracle | root crontab dihapus; cron.d dipindah ke `/root/cron.d.disabled` |
| CI secrets | `VM_HOST` repo + `Production` + `staging` = `139.190.106.152` |
| Public | api ready, dashboard ok, staging-api ok, staging 307, status 302, grafana 200, auth/me 401 |
| Auth probe | public `LOGIN_OK` → `SUCCESS` |
| Config/health | config drift OK; tiga healthcheck SUCCESS |
| Container | 13; blue HEALTHY |
| Old VM | penulis blue/staging stop; cron off; Alertmanager stop; rollback mungkin |
| CI deploy | **BELUM dijalankan** — patch belum masuk `main`/`staging` |

**Sisa pekerjaan:**

1. Merge patch ke `main` dan `staging` **sebelum** push/CI deploy. CI `git reset --hard`
   akan menimpa patch lokal di VM.
   - `migration/biznetgio-main` — `9cc289b` (patch main-based).
   - `migration/biznetgio-2026-11-12` — patch staging-based + log eksekusi.
2. Jalankan deploy CI staging lalu produksi secara berurutan; jangan buat tag `v*`.
3. E2E yang belum diuji: OTP WhatsApp, aplikasi Android/sync, unduh APK per-ABI,
   test-down Discord Kuma, dan backup 02:00 WIB berikutnya.
4. Teardown Oracle setelah 48–72 jam stabil.

---

## 4. Target: Biznet Gio NEO Lite MS 4.2

| Item | Nilai |
|---|---|
| Paket | NEO Lite **MS 4.2** — Rp139.000/bulan (belum pajak) |
| Spek | **2 vCPU / 4 GB RAM / 60 GB SSD**, KVM, root access |
| Region | Jakarta, Indonesia |
| OS | Ubuntu 24.04 LTS x86_64 |
| SSH key | Import `~/.ssh/lazisnu_vm.pub`, username `ubuntu` |
| Firewall | 22, 80, 443 (provider + UFW) |

**Catatan kapasitas:** beban lama ±1,75 GB; blue-green menambah ±234 MiB sementara.
Ukur ulang saat kedua warna hidup. Karena target hanya **2 vCPU**, ubah denominator
`prometheus/alert.rules.yml` dari 4 menjadi 2 (atau buat dinamis).

**Sebelum lanjut:** pastikan IP yang diberikan adalah IP publik, bukan `10.x`, `172.16.x`,
atau `192.168.x`. Catat sebagai `<IP_BARU>`.

---

## 5. Peta artefak dan kepemilikan

### 5.1 Yang dipindah

```
/opt/lazisnu/
├── .env                         # GRAFANA_ADMIN_PASSWORD (Compose interpolation)
├── .env.alertmanager            # DISCORD_WEBHOOK_PROMETHEUS
├── .env.backup                  # kredensial R2 untuk backup/export
├── .env.backup-prod             # kredensial R2 backup prod (jika ada)
├── .env.staging                 # jika ada
├── apps/backend/
│   ├── .env                     # produksi: DATABASE_URL, JWT, R2, Fonnte, Firebase
│   └── .env.staging
├── secrets/                     # auth-probe, scheduler-staging, backup staging
├── nginx/certbot/               # conf + www (5 domain)
├── scripts/backup-prod.sh       # wrapper VM-local, tidak ada di Git
├── cron/                        # hasil exporter: root-crontab + semua cron.d
├── redis-data/                  # WAJIB: denylist + antrean
├── redis-data-staging/
├── uptime-kuma/data/kuma.db     # restore dari R2
├── backup-data/active           # flag backup default
├── backup-prod-data/active      # flag pipeline prod-specific (19:30 WIB)
├── backups/ backups-prod/ backups-staging/
└── (opsional) grafana-data/ prometheus-data/
```

**Jangan dibundel:** source repo (Git), backup DB (R2), backup Kuma (R2), dan AOF Redis
langsung dari container yang sedang berjalan. Redis dibuat snapshot konsisten terpisah.

### 5.2 Matriks kepemilikan

| Path | Owner/mode | Alasan |
|---|---|---|
| `secrets/` | `root:root`, dir `700`, file `600` | Dibaca cron root |
| `.env.backup`, `.env.backup-prod` | `root:root 600` | Kredensial R2, cron root |
| `.env` | `ubuntu:ubuntu 600` | Compose interpolation dijalankan sebagai ubuntu |
| `.env.alertmanager` | `ubuntu:ubuntu 600` | `env_file` Compose dibaca sebagai ubuntu |
| `apps/backend/.env`, `.env.staging` | `ubuntu:ubuntu 600` | `env_file` Compose + backup CI |
| `nginx/certbot` | `root:root`; private key `600` | Certbot/nginx container root |
| `scripts/backup-prod.sh` | `root:root 700` atau `755` | Dipanggil cron root |
| `redis-data*` | `999:999` | User redis:7-alpine |
| `prometheus-data`, `alertmanager-data` | `65534:65534` | User nobody |
| `grafana-data` | `472:472` | User grafana |
| `uptime-kuma/data` | `1000:1000` | Container chown sendiri saat start |
| `backup-data` | `ubuntu:ubuntu` atau root | Ditulis backend container + script |

**Jangan** menjalankan `chown -R ubuntu:ubuntu /opt/lazisnu` setelah `secrets/` diamankan.
Itu membalik proteksi dan membuat private key cert bisa dibaca `ubuntu`.

### 5.3 Key R2 — gunakan sekali

Exporter mencetak key **lengkap**:

```
migrasi/lazisnu-vm-export-20261112_010203.tar.gz
```

Unduh dengan:

```bash
aws s3 cp "s3://$R2_BUCKET_NAME/$R2_KEY" - \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
```

Jangan menulis `s3://bucket/migrasi/$R2_KEY` — itu menjadi `migrasi/migrasi/...`.

Arsip tidak bisa mengunduh dirinya sendiri. Siapkan `.env.backup` lewat scp (root `0600`)
atau token R2 read-only sebelum mengunduh.

---

## 6. Urutan migrasi

### FASE 0 — Bekukan, pin commit, snapshot, ekspor

#### 0.1 Bekukan deploy

- Umumkan tidak ada push ke `main`/`staging` selama migrasi.
- Jangan membuat tag `v*`: `release.yml` membangun dan mengunggah APK lalu dispatch deploy.
- Catat bahwa `deploy`, `deploy-staging`, dan `preview-staging` memakai checkout
  `/opt/lazisnu` yang sama; mereka bisa saling menimpa.

#### 0.2 Pin konfigurasi infra

```bash
ssh -i ~/.ssh/lazisnu_vm ubuntu@168.110.198.70
cd /opt/lazisnu
git rev-parse HEAD | tee /tmp/lazisnu-infra-commit.txt
git status --short
git log -1 --oneline
```

Putuskan commit mana yang dipakai. Exporter `main` memakai
`secrets/env.backup-2026-07-27`, sedangkan `staging` memakai `.env.backup`. Jangan
mencampur. Selalu set `EXPORT_ENV_FILE` eksplisit.

**Perubahan repo yang wajib tersedia lebih dulu:**

- `scripts/vm-migration-export.sh` — patch env/cron/manifest.
- `scripts/deploy-blue-green.sh` — fix rollback upstream + bootstrap `upstream.conf`.
- `prometheus/alert.rules.yml` — denominator CPU 4 → 2 (target 2 vCPU).
- `scripts/backup-healthcheck.cron` — kutipan `bash -c` untuk staging/prod.
- `scripts/migration-preflight.sh` — inspeksi read-only Fase 0.

Commit/push ke branch yang akan di-clone **dan** ke commit produksi (`main`) yang akan
di-reset CI. Jika belum di-commit, scp kedua script ke VM baru setelah clone dan sebelum
Fase 3; untuk Fase 6, patch `deploy-blue-green.sh` tetap harus ada di commit `main`.

#### 0.3 Rekam runtime

```bash
timedatectl
date
sudo crontab -l
ls -l /etc/cron.d/lazisnu-*
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
docker inspect blue-backend --format '{{.Config.Image}}'
ls -l /opt/lazisnu/scripts/backup-prod.sh
ls -l /opt/lazisnu/backup-prod-data/active
ls -ld /opt/lazisnu/backups-prod 2>&1 || true
```

Atau jalankan `scripts/migration-preflight.sh` (read-only). Hasil 12 Nov 2026 sudah
dicatat di §3.1. Catat: timezone efektif, warna aktif, image tag, jadwal cron, target
DB/prefix/marker setiap job, dan keberadaan `backup-prod.sh`.

#### 0.4 Backup Kuma

```bash
sudo bash /opt/lazisnu/scripts/backup-kuma.sh
```

Catat key `kuma/YYYYMMDD/kuma_YYYYMMDD_HHMMSS.db.gz` dan verifikasi objeknya di R2.
Tanpa ini, `status.lazisnu.site` akan kosong di VM baru.

#### 0.5 Baseline Redis (state autentikasi)

Catat baseline **tanpa menghentikan produksi**:

```bash
docker exec lazisnu-redis-1 redis-cli --scan --pattern 'revoked:*' | wc -l
docker exec lazisnu-redis-1 redis-cli --scan --pattern 'refresh:*' | wc -l
```

Snapshot preliminer boleh dibuat untuk persiapan/uji:

1. `docker exec lazisnu-redis-1 redis-cli BGREWRITEAOF`
2. Tunggu `aof_rewrite_in_progress:0` dan `aof_rewrite_scheduled:0`.
3. Salin **seluruh** `redis-data/` dan `redis-data-staging/` (termasuk `appendonlydir`).
4. Catat checksum dan jumlah key.

Snapshot **final** dilakukan di Fase 5 saat cutover, dengan freeze singkat. Jangan
menghentikan penulis di Fase 0; itu akan membuat downtime terlalu awal.

`SAVE` saja **tidak cukup**: dengan `appendonly yes`, Redis memuat AOF saat restart.
Jika memilih tidak memindahkan Redis, tulis eksplisit bahwa sesi yang dicabut bisa
diterima lagi dan siapkan forced re-login/revoke.

#### 0.6 Ekspor artefak

Gunakan versi exporter yang sudah dipatch. Jika patch belum ada di VM lama, scp ke `/tmp`
(jangan reset working tree produksi):

```bash
# dari laptop
scp scripts/vm-migration-export.sh ubuntu@168.110.198.70:/tmp/vm-migration-export.sh

# di VM lama
sudo EXPORT_ENV_FILE=/opt/lazisnu/.env.backup bash /tmp/vm-migration-export.sh
```

Catat `r2_key` **lengkap**. Verifikasi:

```bash
aws s3 ls "s3://$R2_BUCKET_NAME/$R2_KEY" \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
```

Periksa `MANIFEST.txt` di arsip untuk memastikan env file, semua cron.d, sertifikat, dan
`backup-prod.sh` ikut.

#### 0.7 Siapkan secret out-of-band

- scp `.env.backup` ke VM baru lebih dulu (root `0600`), atau gunakan token R2 read-only.
- Pastikan `apps/backend/.env`, `.env.staging`, `.env`, `.env.alertmanager`,
  `.env.backup-prod`, dan `scripts/backup-prod.sh` ada di bundel/manifest.
- Jangan mencetak isi file.

**Acceptance Fase 0:** commit infra tercatat, image tag aktual tercatat, preflight
read-only dijalankan dan temuan §3.1 dikonfirmasi, level secret GitHub dicatat, key Kuma
dan checksum Redis tercatat, `r2_key` + ukuran objek terverifikasi, manifest lengkap, dan
CI dibekukan.

---

### FASE 1 — Provision & bootstrap OS

#### 1.1 Portal Biznet

Ubuntu 24.04 LTS x86_64, import `lazisnu_vm.pub`, username `ubuntu`, port 22/80/443,
catat `<IP_BARU>`. Key ini juga dipakai CI (terverifikasi auth log 12 Nov). Uji SSH
langsung tanpa password.

```bash
ssh -i ~/.ssh/lazisnu_vm ubuntu@<IP_BARU>
id ubuntu
sudo -n true && echo "sudo passwordless OK"
```

#### 1.2 Paket dasar

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git unzip cron ufw lsb-release postgresql-common

sudo systemctl enable --now cron
systemctl is-active cron
```

Docker CE dari repo resmi:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

AWS CLI v2 (bukan `apt install awscli`):

```bash
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
sudo /tmp/aws/install
aws --version
```

`pg_dump` 17 untuk `scripts/backup.sh`:

```bash
sudo install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | sudo tee /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc >/dev/null
. /etc/os-release
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
sudo apt update
sudo apt install -y postgresql-client-17
/usr/lib/postgresql/17/bin/pg_dump --version
```

Catatan: `apt.postgresql.org.sh` meminta Enter dan gagal di sesi non-interaktif. Langkah
repo manual di atas sudah terbukti di VM Biznet.

#### 1.3 Swap, sysctl, firewall

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

echo 'vm.overcommit_memory=1' | sudo tee -a /etc/sysctl.conf
sudo sysctl --system

sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

#### 1.4 Docker group

```bash
sudo usermod -aG docker ubuntu
# PENTING: keluar dan login ulang sebelum perintah docker sebagai ubuntu.
exit
ssh -i ~/.ssh/lazisnu_vm ubuntu@<IP_BARU>
docker info >/dev/null && echo "docker OK"
```

#### 1.5 Clone repo (HTTPS, repo publik)

```bash
sudo mkdir -p /opt/lazisnu
sudo chown ubuntu:ubuntu /opt/lazisnu
git clone https://github.com/bagus01darmawan-wq/lazisnu.git /opt/lazisnu
cd /opt/lazisnu
git rev-parse HEAD
# opsional: checkout commit infra yang sudah dipilih di Fase 0
```

Jika patch `vm-migration-export.sh` / `deploy-blue-green.sh` belum masuk commit, scp
file-nya ke `/opt/lazisnu/scripts/` sebelum Fase 3. Jangan jalankan deploy dengan versi
lama.

#### 1.6 Bootstrap nginx dan direktori volume

```bash
cd /opt/lazisnu
cp nginx/upstream.conf.example nginx/upstream.conf
test -f nginx/upstream.conf && echo "upstream bootstrap OK"

mkdir -p redis-data redis-data-staging prometheus-data alertmanager-data \
         grafana-data backup-data backup-prod-data uptime-kuma/data \
         backups backups-prod backups-staging
touch backup-data/active backup-prod-data/active

sudo chown -R ubuntu:ubuntu /opt/lazisnu
sudo chown -R 999:999 redis-data redis-data-staging
sudo chown -R 65534:65534 prometheus-data alertmanager-data
sudo chown -R 472:472 grafana-data
```

Jangan menjalankan `chown -R ubuntu:ubuntu` lagi setelah secrets dipulihkan.

#### 1.7 Timezone

```bash
sudo timedatectl set-timezone Asia/Jakarta
timedatectl
```

Setelah Fase 0, cocokkan ulang jadwal cron. Jangan menyalin `30 19 * * *` tanpa tahu
timezone VM lama.

**Acceptance Fase 1:** `docker compose version`, `pg_dump --version` 17.x, `aws --version`
v2, `swapon --show` terisi, `cron` aktif, `nginx/upstream.conf` file biasa, dan direktori
volume memiliki owner yang benar.

---

### FASE 2 — Restore artefak, env, Kuma, Redis

#### 2.1 Unduh dan ekstrak bundel

Pastikan `.env.backup` sudah ada (scp, root `0600`) atau token baca R2 tersedia.

```bash
sudo EXPORT_KEY='<R2_KEY_LENGKAP>' bash -c '
  set -a; . /opt/lazisnu/.env.backup; set +a
  export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-${R2_ACCESS_KEY_ID:-}}"
  export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${R2_SECRET_ACCESS_KEY:-}}"
  aws s3 cp "s3://$R2_BUCKET_NAME/$EXPORT_KEY" - \
    --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
    | tar -xzf - -C /opt/lazisnu --strip-components=1
'
```

Verifikasi manifest tanpa mencetak isi secret:

```bash
cat /opt/lazisnu/MANIFEST.txt
cat /opt/lazisnu/REVISION
ls -l /opt/lazisnu/.env* /opt/lazisnu/apps/backend/.env* /opt/lazisnu/scripts/backup-prod.sh
```

#### 2.2 Restore sertifikat

Bundel menyimpan sertifikat di `letsencrypt/certbot/`, sedangkan Compose membaca
`nginx/certbot/`. Jangan lewati langkah copy ini.

```bash
sudo mkdir -p /opt/lazisnu/nginx/certbot
sudo cp -a /opt/lazisnu/letsencrypt/certbot/. /opt/lazisnu/nginx/certbot/
test -f /opt/lazisnu/nginx/certbot/conf/live/api.lazisnu.site/fullchain.pem \
  && echo "cert api OK"
ls -1 /opt/lazisnu/nginx/certbot/conf/live/
```

#### 2.3 Restore cron dalam keadaan nonaktif

Jangan pasang cron aktif dulu. Simpan di direktori staged:

```bash
mkdir -p /opt/lazisnu/cron/staged
cp -a /opt/lazisnu/cron/lazisnu-* /opt/lazisnu/cron/staged/
cp -a /opt/lazisnu/cron/root-crontab /opt/lazisnu/cron/staged/root-crontab

# File healthcheck dari VM lama kehilangan kutipan bash -c pada baris staging/prod.
# Ganti dengan template repo yang sudah diperbaiki (17/18/19).
cp /opt/lazisnu/scripts/backup-healthcheck.cron /opt/lazisnu/cron/staged/lazisnu-backup-health
```

Jadwal terverifikasi: backup prod `02:00`, staging `02:30`, Kuma `03:00`, prod-specific
`19:30` WIB. Pastikan `/opt/lazisnu/backups-prod/` ada sebelum memasang
`lazisnu-backup-prod`: cron memakai `>> /opt/lazisnu/backups-prod/cron.log`, dan
redirection gagal jika direktori belum ada.

Hapus **kedua baris** QCloud (komentar dan perintah) dari `root-crontab` sebelum dipasang
nanti. Verifikasi timezone, command, target DB, prefix R2, dan marker tiap job. Jika file
diedit dari Windows, buang CRLF:

```bash
sed -i 's/\r$//' /opt/lazisnu/cron/staged/root-crontab /opt/lazisnu/cron/staged/lazisnu-*
```

#### 2.4 Restore Kuma

```bash
# Kuma belum boleh start dengan DB kosong.
aws s3 cp "s3://$R2_BUCKET_NAME/kuma/<TANGGAL>/kuma_<TS>.db.gz" /tmp/ \
  --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
gunzip /tmp/kuma_<TS>.db.gz
mkdir -p /opt/lazisnu/uptime-kuma/data
cp /tmp/kuma_<TS>.db /opt/lazisnu/uptime-kuma/data/kuma.db
sudo chown -R 1000:1000 /opt/lazisnu/uptime-kuma/data
```

Jika container sudah telanjur start: stop dulu, restore, baru start.

#### 2.5 Restore Redis

Salin snapshot `redis-data/` dan `redis-data-staging/` dari VM lama/laptop, lalu:

```bash
sudo chown -R 999:999 /opt/lazisnu/redis-data /opt/lazisnu/redis-data-staging
# setelah Redis start:
docker exec lazisnu-redis-1 redis-cli --scan --pattern 'revoked:*' | wc -l
```

Jumlah key harus sama dengan yang dicatat di Fase 0. Ini restore **preliminer**;
snapshot final menggantikannya di Fase 5.1.

#### 2.6 History monitoring (opsional)

Jika exporter dijalankan dengan `--with-data`:

```bash
sudo cp -a /opt/lazisnu/data/grafana-data/. /opt/lazisnu/grafana-data/
sudo cp -a /opt/lazisnu/data/prometheus-data/. /opt/lazisnu/prometheus-data/
sudo chown -R 472:472 /opt/lazisnu/grafana-data
sudo chown -R 65534:65534 /opt/lazisnu/prometheus-data
```

Jika tidak, catat bahwa history Grafana/Prometheus memang dilepas.

#### 2.7 Kepemilikan selektif

```bash
sudo chown -R root:root /opt/lazisnu/secrets
sudo chmod 700 /opt/lazisnu/secrets
sudo find /opt/lazisnu/secrets -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} +

sudo chown root:root /opt/lazisnu/.env.backup /opt/lazisnu/.env.backup-prod
sudo chmod 600 /opt/lazisnu/.env.backup /opt/lazisnu/.env.backup-prod

sudo chown ubuntu:ubuntu /opt/lazisnu/.env /opt/lazisnu/.env.alertmanager \
  /opt/lazisnu/apps/backend/.env /opt/lazisnu/apps/backend/.env.staging
sudo chmod 600 /opt/lazisnu/.env /opt/lazisnu/.env.alertmanager \
  /opt/lazisnu/apps/backend/.env /opt/lazisnu/apps/backend/.env.staging

sudo chown -R root:root /opt/lazisnu/nginx/certbot
sudo chmod 600 /opt/lazisnu/nginx/certbot/conf/live/*/privkey.pem 2>/dev/null || true
```

#### 2.8 Validasi Compose

```bash
cd /opt/lazisnu
docker compose config >/dev/null
docker compose -f docker-compose.staging.yml config >/dev/null
```

**Acceptance Fase 2:** manifest lengkap, env terbaca oleh user yang benar, Kuma DB ada,
Redis key count cocok, cron staged nonaktif, dan kedua `docker compose config` lulus.

---

### FASE 3 — Jalankan stack dan deploy blue

#### 3.1 Login GHCR

Siapkan PAT `read:packages`, atau scp `~/.docker/config.json` dari VM lama (ubuntu `0600`).

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u bagus01darmawan-wq --password-stdin
```

#### 3.2 Start infra

```bash
cd /opt/lazisnu
docker compose up -d --no-deps redis prometheus alertmanager grafana uptime-kuma
docker compose up -d --no-deps nginx
docker exec lazisnu-nginx-1 nginx -t
```

Jika `nginx -t` gagal, periksa `nginx/upstream.conf`, cert, dan `nginx.conf`. Jangan
lanjut sebelum lulus.

#### 3.3 Start staging

```bash
docker compose -f docker-compose.staging.yml up -d
docker compose -f docker-compose.staging.yml ps
```

#### 3.4 Deploy produksi blue

Gunakan image tag yang dicatat di Fase 0, bukan tag dari dokumen lama:

```bash
GHCR_REPO=bagus01darmawan-wq/lazisnu \
IMAGE_TAG='<TAG_IMAGE_TERVERIFIKASI>' \
  bash scripts/deploy-blue-green.sh blue
```

Verifikasi:

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
curl -sf http://localhost:3001/health/ready
curl -sf http://localhost:3000/api/health
bash scripts/deploy-blue-green.sh status
cat nginx/upstream.conf
```

Jumlah container harus 13: 6 infra + 4 staging + 3 blue.

#### 3.5 Uji backup manual

Flag `backup-data/active` sudah dibuat di Fase 1.

```bash
sudo bash /opt/lazisnu/scripts/backup.sh
tail -n 10 /opt/lazisnu/backups/backup.log
```

Log harus menunjukkan `START` lalu `SUCCESS`; **bukan** `SKIPPED`. Jika
`scripts/backup-prod.sh` ada, pastikan `backup-prod-data/active` dan `backups-prod/`
sudah dibuat:

```bash
ls -l /opt/lazisnu/backup-prod-data/active
sudo bash /opt/lazisnu/scripts/backup-prod.sh
tail -n 10 /opt/lazisnu/backups-prod/backup.log
```

Log juga harus `START` → `SUCCESS`, bukan `SKIPPED`. Verifikasi objek dan marker R2
untuk kedua pipeline.

**Acceptance Fase 3:** 13 container hidup, health backend/web OK, `nginx -t` OK, blue
active, dan backup manual sukses ke R2.

---

### FASE 4 — Uji pra-DNS (wajib)

#### 4.1 TLS per hostname tanpa `-k`

```bash
curl -sv --resolve api.lazisnu.site:443:<IP_BARU> https://api.lazisnu.site/health/ready
curl -sv --resolve dashboard.lazisnu.site:443:<IP_BARU> https://dashboard.lazisnu.site/
curl -sv --resolve staging-api.lazisnu.site:443:<IP_BARU> https://staging-api.lazisnu.site/health
curl -sv --resolve staging.lazisnu.site:443:<IP_BARU> https://staging.lazisnu.site/
curl -sv --resolve status.lazisnu.site:443:<IP_BARU> https://status.lazisnu.site/
curl -sv --resolve grafana.lazisnu.site:443:<IP_BARU> https://grafana.lazisnu.site/
```

**Jangan pakai `-k`.** Jika validasi TLS gagal, berhenti. Periksa SAN/chain/expiry:

```bash
echo | openssl s_client -servername api.lazisnu.site -connect <IP_BARU>:443 2>/dev/null \
  | openssl x509 -noout -subject -dates -ext subjectAltName
```

`dashboard` memakai cert `api`; `staging` memakai cert `staging-api`. Itu sudah sesuai
`nginx.conf`; yang perlu dibuktikan adalah SAN dan masa berlaku aktual.

#### 4.2 `png.lazisnu.site`

Cek konfigurasi efektif di VM lama:

```bash
ssh ubuntu@168.110.198.70 'docker exec lazisnu-nginx-1 nginx -T 2>/dev/null | grep -n png || true'
```

Jika tidak ada vhost: putuskan **(a)** tambahkan server block/reverse proxy di VM baru,
atau **(b)** hapus record DNS. Jangan memindahkan record tanpa salah satu keputusan itu.
Berdasarkan preflight (TLS gagal + tidak ada referensi di repo), default yang disarankan
adalah **(b) hapus record**, kecuali ada layanan eksternal yang diketahui memakainya.

#### 4.3 Uji fungsional

- `/v1/auth/me` tanpa token → 401.
- Login dashboard produksi dan staging.
- OTP via Fonnte benar-benar masuk WhatsApp.
- Mobile: login, sync offline-first, deduplication `offline_id`.
- APK per-ABI dari `apk.lazisnu.site`.
- Kuma: daftar monitor dan status page sama dengan VM lama.
- Redis: cabut satu sesi uji, lalu pastikan refresh ditolak.
- `config-drift-check.sh` lokal tanpa temuan.
- `auth-probe.sh` ditunda sampai DNS cutover, atau jalankan dengan `/etc/hosts` sementara
  yang mengarahkan hostname ke `<IP_BARU>`.

**Jangan lanjut ke Fase 5 jika ada yang merah.**

---

### FASE 5 — Cutover DNS dan handover cron

#### 5.1 Redis cutover final (freeze singkat)

Lakukan setelah VM baru lulus Fase 4, tepat sebelum DNS.

1. Catat jumlah `revoked:*` dan `refresh:*` di Redis lama dan baru.
2. Hentikan penulis lama — jangan hentikan nginx/web jika tidak perlu:
   ```bash
   # di VM lama
   docker stop blue-backend blue-worker
   docker compose -f docker-compose.staging.yml stop backend-staging worker-staging
   ```
3. `docker exec lazisnu-redis-1 redis-cli BGREWRITEAOF`; tunggu
   `aof_rewrite_in_progress:0` dan `aof_rewrite_scheduled:0`.
4. Dari laptop, salin `redis-data/` dan `redis-data-staging/` dari VM lama ke VM baru.
5. Di VM baru, hentikan Redis + penulis baru, ganti isi volume, lalu start ulang:
   ```bash
   docker stop blue-backend blue-worker
   docker compose stop redis
   docker compose -f docker-compose.staging.yml stop redis-staging backend-staging worker-staging
   # ganti isi redis-data/ dan redis-data-staging/
   sudo chown -R 999:999 redis-data redis-data-staging
   docker compose start redis
   docker compose -f docker-compose.staging.yml start redis-staging
   docker start blue-backend blue-worker
   docker compose -f docker-compose.staging.yml start backend-staging worker-staging
   ```
6. Verifikasi jumlah key sama, lalu smoke test backend.
7. Segera lanjut ke DNS. Setelah DNS, penulis baru boleh menerima trafik.

Jika langkah ini dilewati, token yang sudah dicabut bisa diterima lagi karena
`isDeviceRevoked` fail-open saat key Redis hilang.

#### 5.2 DNS

Ubah record A dari `168.110.198.70` ke `<IP_BARU>`, tetap **DNS only**, TTL 300 s:

`api`, `dashboard`, `staging`, `staging-api`, `status`, `grafana`, dan `png`
(hanya jika keputusan Fase 4.2 sudah diambil).

Verifikasi otoritatif:

```bash
nslookup api.lazisnu.site dell.ns.cloudflare.com
```

Verifikasi resolusi klien sebelum mempercayai smoke test:

```bash
getent ahostsv4 api.lazisnu.site | head
```

#### 5.3 Aktifkan cron VM baru

```bash
# root crontab (QCloud sudah dihapus)
sudo crontab /opt/lazisnu/cron/staged/root-crontab
sudo crontab -l

# cron.d
sudo cp /opt/lazisnu/cron/staged/lazisnu-* /etc/cron.d/
sudo chown root:root /etc/cron.d/lazisnu-*
sudo chmod 644 /etc/cron.d/lazisnu-*
ls -l /etc/cron.d/lazisnu-*
```

Jalankan manual satu kali untuk memastikan target benar, terutama
`scheduler-staging.sh` (sekarang menunjuk staging baru) dan `auth-probe.sh`.

#### 5.4 Matikan cron VM lama

Jangan matikan VM/container; hanya hentikan otomasinya agar rollback tetap mungkin:

```bash
ssh ubuntu@168.110.198.70
sudo crontab -l | sudo tee /root/crontab.pre-migration.txt
sudo crontab -r
sudo mkdir -p /root/cron.d.disabled
sudo mv /etc/cron.d/lazisnu-* /root/cron.d.disabled/
```

Catat cara mengembalikannya untuk rollback.

#### 5.5 Backup dari Biznet

```bash
sudo bash /opt/lazisnu/scripts/backup.sh
sudo bash /opt/lazisnu/scripts/backup-healthcheck.sh
tail -n 10 /opt/lazisnu/backups/backup.log
tail -n 10 /opt/lazisnu/backups/backup-health.log

# Staging
sudo bash -c 'BACKUP_ENV_FILE=/opt/lazisnu/secrets/env.backup-staging bash /opt/lazisnu/scripts/backup-healthcheck.sh'
tail -n 10 /opt/lazisnu/backups-staging/backup-health.log

# Prod-specific (marker/prefix/folder terpisah)
sudo bash -c 'BACKUP_ENV_FILE=/opt/lazisnu/.env.backup-prod R2_STATUS_KEY=backup-status/lazisnu-prod-latest.json BACKUP_R2_PREFIX=backups-prod BACKUP_DIR=/opt/lazisnu/backups-prod bash /opt/lazisnu/scripts/backup-healthcheck.sh'
tail -n 10 /opt/lazisnu/backups-prod/backup-health.log
```

Jika ada pipeline prod terpisah:

```bash
sudo bash /opt/lazisnu/scripts/backup-prod.sh
tail -n 10 /opt/lazisnu/backups-prod/backup.log
```

Pastikan marker R2 berasal dari eksekusi di Biznet, bukan sisa Oracle. Jangan menganggap
`backup-health.log` default sudah mewakili staging/prod-specific; ketiganya punya marker
dan log sendiri.

**Acceptance Fase 5:** DNS mengarah ke `<IP_BARU>`, cron baru aktif, cron lama nonaktif,
backup baru sukses, dan Kuma/Discord hijau.

---

### FASE 6 — CI/CD

#### 6.1 Periksa secret di dua level

GitHub → Settings → Secrets and variables → Actions:

- Repository secrets.
- Environment `Production` dan `staging` (environment secrets **menimpa** repo secrets).

Kedua environment sudah punya `VM_HOST`/`VM_USER`/`VM_SSH_KEY` (terverifikasi 12 Nov).
Ubah `VM_HOST` di **keduanya** — mengubah repo secret saja tidak cukup. `VM_USER=ubuntu`.
Auth log VM lama menunjukkan CI memakai `SHA256:CIIuw/0SetbKAjvgG9Opp4D+sEfCrohR9fEpz5bUXRw`
= `lazisnu_vm.pub`; key ini sudah benar, tidak perlu membuat key baru.

#### 6.2 Deploy berurutan

- Jangan biarkan `deploy` (prod) dan `deploy-staging` berjalan bersamaan; keduanya
  `git reset --hard` di `/opt/lazisnu` yang sama.
- Freeze `preview-staging` selama cutover.
- Jangan membuat tag `v*` untuk uji: `release.yml` akan build/upload APK dan dispatch
  deploy. Gunakan push `main` atau `workflow_dispatch` pada `ci.yml`.

#### 6.3 Verifikasi sumber respons

Smoke test CI memakai DNS publik. Sebelum mempercayai hasil hijau:

```bash
getent ahostsv4 api.lazisnu.site | head
```

Atau tambahkan pengecekan eksplisit bahwa respons berasal dari `<IP_BARU>`. Jika cache
DNS masih menunjuk Oracle, hentikan deploy.

#### 6.4 Drift infra

Deploy produksi akan `git reset --hard` ke commit `main`. `docker-compose.yml` di `main`
dan `staging` berbeda (mount file vs mount direktori), dan patch `deploy-blue-green.sh`
harus ada di `main`. Sebelum deploy, putuskan: samakan infra di `main`, atau pin commit
yang dipakai dan pastikan container infra tidak di-recreate dengan konfigurasi berbeda.

**Acceptance Fase 6:** deploy prod dan staging hijau, `VM_HOST` efektif benar, dan tidak ada
deploy bersamaan.

---

### FASE 7 — Verifikasi end-to-end

- [ ] `curl https://api.lazisnu.site/health/ready` → 200, `db ok`, `redis ok`.
- [ ] `dashboard.lazisnu.site` → 307/200; `/api/health` → `{"status":"ok","service":"web"}`.
- [ ] `staging-api.lazisnu.site/health` → 200; `staging.lazisnu.site` → 200.
- [ ] `status.lazisnu.site` → Kuma dengan monitor yang sama; `grafana.lazisnu.site` → login
      dengan password non-default.
- [ ] TLS valid **tanpa** `-k` untuk setiap hostname yang dipindah; SAN/chain/expiry benar.
- [ ] `/v1/auth/me` tanpa token → 401.
- [ ] Login dashboard produksi dan staging.
- [ ] OTP Fonnte masuk WhatsApp.
- [ ] Android: login, sync offline-first, deduplication `offline_id`.
- [ ] `GET /v1/mobile/version` + unduh APK per-ABI dari `apk.lazisnu.site`.
- [ ] Sesi yang dicabut tetap ditolak setelah migrasi (Redis denylist).
- [ ] Kuma semua monitor UP + notifikasi Discord (uji satu test-down).
- [ ] Backup 02:00 WIB berikutnya `START` → `SUCCESS` di `backups/` **dan** `backups-prod/`
      (jika dipertahankan), plus `backup-health.log` default, staging, dan prod-specific.
- [ ] Backup staging di `backups-staging/backup.log`; healthcheck staging sukses.
- [ ] `backup-prod-data/active` ada dan pipeline prod-specific tidak `SKIPPED`.
- [ ] `config-drift-check` tanpa temuan; `auth-probe` hijau.
- [ ] Deploy CI hijau; `scripts/deploy-blue-green.sh status` konsisten.
- [ ] `HighCpuUsage` sudah memakai denominator 2 vCPU dan diuji.
- [ ] `png` sesuai keputusan (vhost berfungsi atau record dihapus).

---

## 7. Rollback

### 7.1 Sebelum cutover: uji rollback upstream nginx

`scripts/deploy-blue-green.sh` sudah diperbaiki: `reload_nginx` menerima warna sebelumnya
dan tidak lagi membaca ulang file yang sudah ditimpa. Uji dengan menyimpan upstream lama,
lalu pastikan bila `nginx -t` gagal, file lama dipulihkan dan nginx reload.

### 7.2 Rollback antar-VM

1. Hentikan cron VM Biznet terlebih dahulu.
2. Aktifkan kembali cron Oracle:
   ```bash
   sudo crontab /root/crontab.pre-migration.txt
   sudo mv /root/cron.d.disabled/lazisnu-* /etc/cron.d/
   ```
3. Kembalikan 6 record A ke `168.110.198.70` (dan buat ulang `png` bila memang perlu).
4. Kembalikan `VM_HOST` di level secret efektif (repo + environment).
5. Pastikan VM Oracle masih hidup dan melayani; hidupkan kembali penulis + Alertmanager:
   ```bash
   docker start blue-backend blue-worker lazisnu-alertmanager-1
   docker compose -f docker-compose.staging.yml start backend-staging worker-staging
   ```
6. Tangani state Redis: perubahan denylist/sesi dari Biznet tidak otomatis ada di Oracle.
   Salin balik snapshot Redis, atau paksa re-login/revoke dan terima risikonya. Uji satu
   sesi yang dicabut.
7. Diagnosa VM Biznet tanpa tekanan, lalu ulangi Fase 4.

**Batas keras:** rollback hanya valid selama VM Oracle masih ada. Konfirmasi kondisi
tenancy/trial sebelum mengandalkan jendela 48–72 jam.

---

## 8. Teardown & dokumentasi

Setelah 48–72 jam stabil:

- [ ] **Stop** VM Oracle — jangan langsung hapus. Hapus setelah 1 minggu tanpa masalah.
- [ ] Hentikan antrean Ampere:
      `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\lazisnu-ampere-retry.cmd`
      dan proses `retry-ampere.ps1`.
- [ ] Perbarui dokumen: `docs/DEPLOYMENT.md`, `docs/VM-STRUCTURE.md`,
      `docs/SOP-UPTIME-KUMA.md`, `docs/MIGRASI-ORACLE-2026-10-17.md`,
      `docs/MIGRATION-VM.md`, dan dokumen ini.
- [ ] Catat `<IP_BARU>`, tanggal cutover, `r2_key` bundle, key Kuma, checksum Redis,
      image tag, dan commit infra.
- [ ] Pastikan cadangan keystore APK (`KEYSTORE_*` di GitHub Secrets) tetap aman.

---

## Lampiran A — Perintah verifikasi cepat

```bash
lsb_release -a; uname -m; id ubuntu; timedatectl
docker --version; docker compose version
docker ps --format '{{.Names}} | {{.Status}} | {{.Image}}'
/usr/lib/postgresql/17/bin/pg_dump --version
aws --version
swapon --show
sysctl vm.overcommit_memory
cd /opt/lazisnu
git rev-parse HEAD
test -f nginx/upstream.conf && echo "upstream OK"
docker compose config >/dev/null && echo "compose OK"
docker compose -f docker-compose.staging.yml config >/dev/null && echo "staging compose OK"
bash scripts/deploy-blue-green.sh status
tail -5 backups/backup.log
tail -5 backups-prod/backup.log 2>/dev/null || true
sudo crontab -l
ls -1 /etc/cron.d/lazisnu-*
```

## Lampiran B — Jebakan yang sudah ditemukan

1. R2 key lengkap jangan diberi prefix `migrasi/` dua kali.
2. `.env.backup` tidak bisa mengunduh dirinya sendiri; scp/token terpisah.
3. `nginx/upstream.conf` tidak ada di clone; copy `upstream.conf.example`.
4. Docker membuat direktori jika bind-mount file tidak ada.
5. Direktori volume root-owned membuat Redis/Prometheus/Alertmanager/Grafana gagal.
6. `backup-data/active` hilang → backup dan healthcheck `SKIPPED` exit `0`.
7. Kuma DB tidak ikut bundel default; restore dari R2.
8. Redis AOF menyimpan denylist; `SAVE` saja tidak cukup.
9. Cron VM baru sebelum cutover memanggil hostname yang masih menunjuk Oracle.
10. Cron VM lama setelah cutover membuat backup/alert/scheduler ganda.
11. `png` tidak punya vhost; jangan pindahkan record tanpa keputusan.
12. `--resolve` tanpa `-k` untuk membuktikan TLS, bukan menyembunyikannya.
13. Repo publik: clone/fetch via HTTPS, bukan SSH tanpa key.
14. `main` dan `staging` berbeda pada Compose/exporter; pin commit.
15. `VM_HOST` bisa berasal dari environment secret, bukan hanya repo secret.
16. Tag `v*` memicu `release.yml` (APK + dispatch deploy).
17. `HighCpuUsage` membagi 4 inti; target 2 vCPU perlu denominator 2.
18. Rollback upstream nginx lama membaca file yang sudah ditimpa; sudah diperbaiki.
19. Cron healthcheck staging/prod memakai `bash -c` tanpa kutip → skrip tidak pernah
    dieksekusi. Gunakan `scripts/backup-healthcheck.cron` yang sudah diperbaiki.
20. Cron `lazisnu-backup-prod` menulis ke `backups-prod/cron.log`; direktori harus ada
    sebelum cron dipasang, atau redirection gagal sebelum script jalan.
21. `backup-prod-data/active` adalah flag terpisah dari `backup-data/active`; membuat
    `backups-prod/` saja tidak cukup.

## Lampiran C — Referensi internal

- `docs/MIGRATION-VM.md` — runbook pindah VM.
- `docs/MIGRASI-ORACLE-2026-10-17.md` — kondisi VM Oracle, OCID, DNS, CI secrets.
- `docs/DEPLOYMENT.md` — bagian prasyarat sudah ketinggalan.
- `scripts/vm-migration-export.sh` — exporter yang sudah dipatch.
- `scripts/backup.sh` — backup DB; flag `backup-data/active`.
- `scripts/backup-kuma.sh` — backup SQLite Kuma.
- `scripts/backup-prod.sh` — wrapper VM-local (jika ada).
- `scripts/certbot-renew-safe.sh` — renewal lewat image certbot.
- `scripts/deploy-blue-green.sh` — deploy + rollback upstream yang sudah diperbaiki.
- `nginx/upstream.conf.example` — bootstrap upstream.
- `prometheus/alert.rules.yml` — denominator CPU.
- `.github/workflows/ci.yml` — deploy prod/staging.
- `.github/workflows/release.yml` — rilis APK pada tag `v*`.
- `.github/workflows/preview-staging.yml` — deploy preview staging.
- `apps/mobile/src/services/api.ts` — hardcode `https://api.lazisnu.site`.
