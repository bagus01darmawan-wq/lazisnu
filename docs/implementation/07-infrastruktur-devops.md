# Sub-bab 07 — Infrastruktur & DevOps

> **Target Minggu**: Minggu 1 (quick wins) + Minggu 2–3 (fondasi) + Bulan 2–3 (maturity)
> **Prasyarat**: Sub-bab 06 selesai sebelum mulai containerization
> **Estimasi Total**: 5–7 hari (tersebar beberapa minggu)
> **Keputusan diperlukan**: D-05 ✅, D-10 (⏳ sync_queues)

---

## Konteks dan Tujuan

Sub-bab ini memperkuat lapisan infrastruktur yang saat ini masih **early-stage**:
- Tidak ada Docker, tidak ada IaC, tidak ada backup terjadwal
- Deploy masih manual via SSH
- Test tidak dijalankan di CI
- Tidak ada monitoring/alerting

Dikerjakan secara bertahap — **quick wins Minggu 1 tidak memerlukan Docker** dan bisa langsung dilakukan.

Referensi analisis: `analisis-master-lazisnu.md` Bab 17–18 (gap + INFRA-1 s/d 26), Bab 21 (I-1 s/d I-23), Bab 22 (CI/CD ideal)

---

## Kelompok A — Quick Wins Minggu 1 (Tanpa Docker)

### A1 — Aktifkan Scheduler Worker (1 jam)

> Selesaikan D-05 dan D-06 sebelum mengerjakan ini.

- [ ] **A1-1**: Buka `apps/backend/src/index.ts` — uncomment baris 6 (import scheduler worker)
- [ ] **A1-2**: Uncomment baris 20-22 (registrasi cron bulanan)
- [ ] **A1-3**: Uncomment baris 33 (`schedulerWorker.close()` di graceful shutdown)
- [ ] **A1-4**: Seragamkan strategi generator sesuai D-06
- [ ] **A1-5**: Verifikasi log startup: cron terdaftar
- [ ] **A1-6**: Pertahankan HTTP `/v1/scheduler/*` sebagai fallback manual (sudah ada, guard sudah fix di Sub-bab 06 P0-B)

**Effort**: 1 jam | **Referensi**: INFRA-1, I-23

---

### A2 — Test Unit di CI (1 jam)

- [ ] **A2-1**: Buka `.github/workflows/ci.yml`
- [ ] **A2-2**: Tambah step setelah typecheck:
  ```yaml
  - name: Run unit tests
    run: |
      pnpm --filter lazisnu-backend test:unit
      pnpm --filter lazisnu-collector-app test
  ```
- [ ] **A2-3**: Test: buat PR → CI harus menjalankan unit test
- [ ] **A2-4**: (Tahap berikutnya) Tambah integration test dengan GitHub Actions services postgres + redis

**Effort**: 1 jam | **Referensi**: INFRA-4, I-3

---

### A3 — Install prom-client (30 menit)

- [ ] **A3-1**: `pnpm --filter lazisnu-backend add prom-client`
- [ ] **A3-2**: Verifikasi: `curl http://localhost:3001/metrics` → output metrics Prometheus (bukan 501 lagi)
- [ ] **A3-3**: Verifikasi default metrics ada: CPU, memory, event loop lag

**Effort**: 30 menit | **Referensi**: INFRA-10, I-10

---

### A4 — Audit & Rotate Secrets (setengah hari)

- [ ] **A4-1**: Cek apakah `.env` pernah ter-commit ke git:
  ```bash
  git log --all -- apps/backend/.env apps/web/.env
  git log --all -- **/.env
  ```
- [ ] **A4-2**: Jika pernah ter-commit: **rotate SEMUA kredensial** (DB password, JWT_SECRET, WA token, R2 keys, Firebase key)
- [ ] **A4-3**: Verifikasi `.gitignore` sudah mencakup semua file `.env*`
- [ ] **A4-4**: Dokumentasikan prosedur: "jika kredensial bocor, langkah pertama adalah..."

**Effort**: setengah hari | **Referensi**: INFRA-7, I-6

---

## Kelompok B — Containerization & Deploy (Minggu 2)

### B1 — Dockerfile Backend + Web (1–2 hari)

- [ ] **B1-1**: Buat `apps/backend/Dockerfile` multi-stage:
  - Stage deps: `node:20-alpine` + corepack pnpm → `pnpm fetch` + `pnpm install --frozen-lockfile`
  - Stage build: `pnpm build:shared && pnpm --filter lazisnu-backend build`
  - Stage runtime: hanya `dist/` + node_modules produksi via `pnpm deploy --prod`
- [ ] **B1-2**: Buat `apps/web/Dockerfile`:
  - Next.js `output: 'standalone'` di `next.config.js`
  - Runtime: hanya `.next/standalone` + `.next/static`
- [ ] **B1-3**: Buat `.dockerignore` di root: `node_modules`, `.git`, `docs`, `*.md`, `.env*`
- [ ] **B1-4**: Buat `docker-compose.yml` dev:
  ```yaml
  services:
    postgres:  # image postgres:16
    redis:     # image redis:7
    backend:   # build dari apps/backend/Dockerfile
    web:       # build dari apps/web/Dockerfile
  ```
- [ ] **B1-5**: Test: `docker compose up` → semua service healthy

**Effort**: 1–2 hari | **Referensi**: INFRA-2, I-1

---

### B2 — CI Build & Push Docker Image (1 hari, setelah B1)

- [ ] **B2-1**: Tambah job `build-image` di `ci.yml`:
  - Trigger: push ke `main`
  - Step: `docker build` backend + web → push ke GHCR dengan tag SHA
- [ ] **B2-2**: Tambah job `deploy` (manual trigger `workflow_dispatch` atau tag `v*`):
  - Gunakan `appleboy/ssh-action` → SSH ke VM
  - `docker compose pull && docker compose up -d`
- [ ] **B2-3**: Test: push ke main → image ter-build dan ter-push ke GHCR

**Effort**: 1 hari | **Referensi**: INFRA-3, I-2

---

### B3 — Pisahkan JWT Secret Access & Refresh (setengah hari)

> Dikerjakan di Sub-bab 02 task B. Catat di sini sebagai checkpoint infrastruktur.

- [ ] **B3-1**: Konfirmasi Sub-bab 02 task B sudah selesai
- [ ] **B3-2**: Update `.env.example` dan dokumentasi deployment

**Referensi**: INFRA-15, I-7

---

### B4 — Pisahkan WhatsApp Worker dari Proses API (setengah hari, setelah B1)

- [ ] **B4-1**: Buat entrypoint baru `apps/backend/src/worker.ts`:
  ```typescript
  // Hanya import dan start whatsapp.worker + scheduler.worker
  ```
- [ ] **B4-2**: Tambah script di `backend/package.json`: `"start:worker": "node dist/worker.js"`
- [ ] **B4-3**: Tambah service `worker` di `docker-compose.yml`: entrypoint menjalankan `start:worker`
- [ ] **B4-4**: Tambah env `RUN_WORKER=false` ke service `backend` di compose — update `index.ts` untuk skip import worker jika flag ini aktif
- [ ] **B4-5**: Test: restart service `backend` → worker tetap berjalan di service `worker`

**Effort**: setengah hari | **Referensi**: INFRA-18, I-17

---

## Kelompok C — Keamanan Konfigurasi (Minggu 2)

### C1 — Redis Fallback Fail-Closed (1 jam, masuk lingkup Sub-bab 04)

> Dikerjakan di Sub-bab 04 task A2. Konfirmasi di sini.

- [ ] **C1-1**: Konfirmasi Sub-bab 04 task A2 sudah implement fail-closed

**Referensi**: INFRA-17, I-8, D-08

---

### C2 — Prosedur Rotasi Secret (setengah hari)

- [ ] **C2-1**: Buat `docs/SECURITY.md` dengan runbook rotasi per jenis secret:
  - JWT: generate baru → dual-verify transisi 15 menit → cabut lama
  - DB: ubah di Supabase → update env → rolling restart
  - WA/R2/Firebase: generate di konsol provider → update env → restart
  - Jadwal review: 90 hari
- [ ] **C2-2**: Dokumentasikan dampak setiap rotasi (misal: JWT rotation = semua sesi mati)

**Effort**: setengah hari | **Referensi**: INFRA-20, I-9

---

## Kelompok D — Observability (Minggu 2–3)

### D1 — Alerting + Monitoring Health Check (setengah hari)

- [ ] **D1-1**: Install Uptime Kuma (1 container Docker di VM):
  ```bash
  docker run -d --name uptime-kuma -v uptime-kuma:/app/data -p 3002:3001 louislam/uptime-kuma:1
  ```
- [ ] **D1-2**: Tambah monitor: `GET /health/ready` setiap 60 detik
- [ ] **D1-3**: Konfigurasi notifikasi: Telegram bot atau Discord webhook saat down
- [ ] **D1-4**: Alternatif minimal (jika tanpa Docker): cron 5 menit di VM: `curl -sf /health/ready || kirim webhook Telegram`

**Effort**: setengah hari | **Referensi**: INFRA-12, INFRA-13, I-12

---

### D2 — Sentry Wajib Backend (1 jam)

- [ ] **D2-1**: Buka `apps/backend/package.json` — verifikasi `@sentry/node` ada di `dependencies` (bukan `devDependencies`)
- [ ] **D2-2**: Ubah `apps/backend/src/config/sentry.ts` — hapus pola lazy `require`, import langsung
- [ ] **D2-3**: Pastikan `tracesSampleRate: 0.1` (tetap) tapi **error capture 100%** (default Sentry — jangan diubah)
- [ ] **D2-4**: Verifikasi DSN backend aktif di Sentry dashboard

**Effort**: 1 jam | **Referensi**: INFRA-23, I-13

---

### D3 — Log Rotation Docker (setengah hari)

- [ ] **D3-1**: Update `docker-compose.yml` — tambah logging config:
  ```yaml
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "3"
  ```
- [ ] **D3-2**: (Opsional, bulan depan) Setup Logtail/Better Stack free tier untuk log shipping

**Effort**: setengah hari | **Referensi**: INFRA-25, I-14

---

## Kelompok E — Ketersediaan & Staging (Minggu 3–4)

### E1 — nginx Reverse Proxy + SSL (1 hari)

- [ ] **E1-1**: Install nginx di VM GCP
- [ ] **E1-2**: Install certbot: `certbot --nginx -d api.lazisnu.app -d dashboard.lazisnu.app`
- [ ] **E1-3**: Konfigurasi server block:
  - `api.lazisnu.app:443` → proxy ke backend `:3001`
  - `dashboard.lazisnu.app:443` → proxy ke web `:3000`
- [ ] **E1-4**: Tambah security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`
- [ ] **E1-5**: Verifikasi: `curl https://api.lazisnu.app/health/ready` → 200

**Effort**: 1 hari | **Referensi**: INFRA-8, I-15

---

### E2 — Backup Database (setengah hari)

- [ ] **E2-1**: Cek plan Supabase — aktifkan daily backup di dashboard jika tersedia
- [ ] **E2-2**: Buat script backup mandiri:
  ```bash
  pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d).sql.gz
  aws s3 cp backup-*.sql.gz s3://lazisnu-backup/ --endpoint-url=... # R2 endpoint
  ```
- [ ] **E2-3**: Tambah cron harian di VM: `0 2 * * * /home/user/scripts/backup-db.sh`
- [ ] **E2-4**: Set lifecycle rule di R2 bucket: retensi 30 hari
- [ ] **E2-5**: Test restore ke database dev: `pg_restore` + verifikasi data

**Effort**: setengah hari | **Referensi**: INFRA-5, I-5

---

### E3 — Staging Environment (1 hari, setelah B1 + B2)

- [ ] **E3-1**: Buat project Supabase gratis kedua sebagai DB staging
- [ ] **E3-2**: Buat database Upstash kedua sebagai Redis staging
- [ ] **E3-3**: Buat `docker-compose.staging.yml` di VM dengan port berbeda
- [ ] **E3-4**: Update CI: push ke `main` → auto-deploy ke staging; tag `v*` → deploy production
- [ ] **E3-5**: Tambah smoke test staging di CI: `curl -sf https://staging-api.lazisnu.app/health/ready`

**Effort**: 1 hari | **Referensi**: INFRA-9, I-16

---

## Kelompok F — Migrasi DB (Dikerjakan di Sub-bab 03)

> Dikerjakan di Sub-bab 03. Catat di sini sebagai checkpoint.

- [ ] **F1**: Konfirmasi Sub-bab 03 task B sudah mengubah workflow ke `drizzle-kit migrate`
- [ ] **F2**: Update `docs/DEPLOYMENT.md` dengan langkah migration saat deploy

**Referensi**: INFRA-6, I-4

---

## Kelompok G — Hygiene Infrastruktur (Bulan 2)

### G1 — Runbook Deployment (setengah hari, setelah B1 + E1)

- [ ] **G1-1**: Buat atau lengkapi `docs/DEPLOYMENT.md` dengan:
  - Provisioning VM GCP (OS, firewall rules, port 80/443)
  - Install Docker + nginx + certbot
  - Susunan `.env` dari secret manager
  - `docker compose up -d` + verifikasi health
  - Cara rollback: `docker compose pull <tag-sebelumnya> && docker compose up -d`
  - Cara restore backup (dari E2)
  - Checklist pasca-deploy: health check, metrics, WA test notification

**Effort**: setengah hari | **Referensi**: Gap IaC (Bab 18.5), I-22

---

### G2 — API URL Mobile dari Konfigurasi (setengah hari)

- [ ] **G2-1**: Definisikan `API_URL` per EAS profile di `eas.json`:
  - `development`: `http://10.0.2.2:3001/v1`
  - `preview`: `https://staging-api.lazisnu.app/v1`
  - `production`: `https://api.lazisnu.app/v1`
- [ ] **G2-2**: Update `apps/mobile/src/services/api.ts:42` untuk baca dari `process.env.API_URL` dengan fallback
- [ ] **G2-3**: Test: build dengan profile berbeda → URL berbeda

**Effort**: setengah hari | **Referensi**: INFRA-19, I-19

---

### G3 — Backup Admin Endpoints (setengah hari)

- [ ] **G3-1**: Mount `/opt/lazisnu/backup-active` ke container backend via `docker-compose.yml`
- [ ] **G3-2**: Buat `apps/backend/src/routes/admin/backup.ts`:
  - `POST /v1/admin/backup/start` — `fs.writeFile('/app/backup-active', '')`
  - `POST /v1/admin/backup/stop` — `fs.unlink('/app/backup-active')`
  - `GET /v1/admin/backup/status` — cek apakah file flag ada
- [ ] **G3-3**: Register route di `apps/backend/src/app.ts`
- [ ] **G3-4**: Integrasikan ke dashboard web admin — tombol "Mulai Penugasan" / "Penugasan Selesai" memanggil endpoint
- [ ] **G3-5**: Test: klik tombol start → flag terbuat → backup cron berjalan; klik stop → flag hilang → backup cron skip

**Effort**: setengah hari | **Referensi**: 07-E2, I-23

---

## Verifikasi dan Done Criteria

### Minggu 1
- [ ] Scheduler worker aktif + log terdaftar ✅
- [ ] CI menjalankan unit test ✅
- [ ] `curl /metrics` → output Prometheus (bukan 501) ✅
- [ ] Audit git history kredensial selesai ✅

### Minggu 2–3
- [ ] `docker compose up` di VM berhasil, semua service healthy ✅
- [ ] Image backend + web ter-build dan ter-push ke GHCR via CI ✅
- [ ] Uptime Kuma monitoring `/health/ready` aktif ✅
- [ ] `curl https://api.lazisnu.app/health/ready` → 200 ✅
- [ ] Backup cron berjalan dan test restore berhasil ✅

### Bulan 2–3
- [ ] Staging environment aktif + auto-deploy dari CI ✅
- [ ] Worker WA/scheduler berjalan di service terpisah ✅
- [ ] `docs/DEPLOYMENT.md` lengkap ✅
- [ ] Mobile API URL dari EAS profile ✅

---

## Referensi

- `analisis-master-lazisnu.md`: Bab 17 (yang ada vs gap), Bab 18 (INFRA-1 s/d 26), Bab 21 (I-1 s/d I-23), Bab 22 (CI/CD ideal)
- `docs/implementation/decisions-log.md`: D-05, D-06, D-10
- File baru: `apps/backend/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.yml`, `docker-compose.staging.yml`, `.dockerignore`, `apps/backend/src/worker.ts`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`
- File yang dimodifikasi: `.github/workflows/ci.yml`, `apps/backend/src/index.ts`, `apps/backend/package.json`
