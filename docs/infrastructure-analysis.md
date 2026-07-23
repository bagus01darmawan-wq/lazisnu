# Analisis Infrastruktur Lazisnu — Temuan & Rekomendasi

> Tanggal: 2026-07-21
>
> Hasil analisis menyeluruh terhadap kodebase dan konfigurasi infrastruktur.

---

## Ringkasan Eksekutif

Infrastruktur Lazisnu saat ini berada di **tahap awal** — aplikasi berjalan dan berfungsi, tetapi sistem pendukung (deployment, monitoring, backup, security) sangat minim. Ini wajar untuk early-stage product tapi **harus segera diperkuat** sebelum scale-up, karena:

1. Tidak ada quick recovery (tidak ada Docker, tidak ada IaC, tidak ada backup terjadwal)
2. No observability (tidak tahu kalau server bermasalah sebelum user lapor)
3. Security risk (kredensial di file lokal, tidak ada secret management)
4. Deploy masih manual (human error risk, rollback tidak mungkin)

Rekomendasi utama: **mulai dengan containerization (Docker) + enable scheduler + monitoring sederhana**. Sisanya bisa bertahap sesuai prioritas di bawah.

---

## 1. Deployment & Containerization

| Isu | Current State | Risiko | Prioritas |
|-----|--------------|--------|-----------|
| **Tanpa Docker** | Proses Node.js langsung dijalankan di GCP VM. `npm start` = `node dist/index.js`. Tidak ada Dockerfile sama sekali di seluruh repo. | Environment drift, sulit reproduce, onboarding developer baru lambat, rollback tidak mungkin | **P0** |
| **Deploy manual** | CI hanya lint+typecheck. Deploy dilakukan manual via SSH ke VM `34-101-78-252`. Tidak ada build artifact. | Human error, downtime tidak terkontrol, tidak ada version history | **P0** |
| **VM tunggal** | Backend + web dijalankan di satu VM tanpa load balancer atau reverse proxy (nginx) | SPOF (single point of failure), tidak ada SSL termination terpusat | **P1** |
| **Tanpa staging** | `NODE_ENV` hanya support `development`/`production`/`test`. Tidak ada environment staging. | Tidak bisa testing deployment sebelum production. Semua feature langsung ke prod. | **P1** |
| **Scheduler mati** | `scheduler.worker.ts` dan `registerMonthlyAssignmentCron()` dikomen di `apps/backend/src/index.ts:6,20-22,33`. Assignments & summary harus di-trigger manual. | Gagal generate tugas bulanan jika lupa trigger, inkonsistensi data | **P0** |

### Rekomendasi

- Buat `Dockerfile` untuk backend + web (multi-stage build Node.js)
- Buat `docker-compose.yml` untuk development environment
- Siapkan `docker-compose.prod.yml` dengan nginx reverse proxy + SSL via Let's Encrypt
- Aktifkan ulang scheduler worker (uncomment kode di `index.ts`)

---

## 2. CI/CD Pipeline

| Isu | Current State | Risiko | Prioritas |
|-----|--------------|--------|-----------|
| **Tidak ada test di CI** | CI (`.github/workflows/ci.yml:38`) hanya jalankan lint + typecheck. Tidak ada `pnpm test` sama sekali. | Bug lolos ke production karena test tidak pernah dijalankan otomatis | **P0** |
| **Tidak ada build artifact** | CI tidak menghasilkan Docker image, tidak push ke registry. | Tidak ada traceability antara commit → artifact yang deployed | **P1** |
| **Tidak ada deploy otomatis** | Tidak ada step deploy ke server staging/production. | Harus SSH manual tiap deploy | **P0** |

### Rekomendasi CI/CD Pipeline Ideal

```
push/PR ke main
  → install deps
  → build shared-types
  → lint + typecheck
  → unit tests + integration tests (backend)
  → build Docker images (backend + web)
  → push ke container registry (Docker Hub / GCP Artifact Registry)
  → deploy ke staging (auto)
  → smoke test staging
  → deploy ke production (manual approval / tag release)
```

---

## 3. Monitoring & Observabilitas

| Isu | Current State | Risiko | Prioritas |
|-----|--------------|--------|-----------|
| **Prometheus not installed** | Endpoint `/metrics` sudah ada di route tapi `prom-client` tidak terinstall → return 501. | Tidak ada metrik server (CPU, memory, request rate, latency), tidak bisa alerting otomatis | **P1** |
| **No structured logging** | Logging masih `console.log` / `server.log.error()` (Fastify built-in). WhatsApp worker di `whatsapp.worker.ts:37,42` juga pakai `console.log`. | Tidak bisa query/search log, sulit debug saat insiden. Tidak ada severity levels (info/warn/error/debug). | **P1** |
| **No centralized log** | Tidak ada log shipping ke external service (Grafana Loki, ELK, Datadog). Log hilang saat server restart. | Log hanya ada di stdout VM, hilang saat proses crash/restart. Tidak bisa tracing request antar-service. | **P2** |
| **No alerting** | Tidak ada notifikasi (Telegram/Slack/email) untuk error critical atau health check failure. | Tidak tahu server mati sampai user complain | **P1** |
| **Sentry sampling rendah** | Backend sampling rate 0.1 (10%). Potensi miss error. | Error jarang tapi kritis bisa tidak ter-capture | **P2** |
| **API hidden in prod** | Swagger UI hanya muncul di `NODE_ENV !== 'production'` (`app.ts:58`). | Tim lain / stakeholder tidak bisa akses API docs (dampak kecil) | **P3** |
| **Health check tidak digunakan maksimal** | Sudah ada `/health/live` dan `/health/ready` tapi tidak dipantau oleh siapapun. | Deployment tidak tahu apakah service benar-benar siap layani traffic | **P1** |

### Rekomendasi

- Install `pino` (sudah built-in Fastify logger upgrade) → structured JSON log
- Install `prom-client` + expose metrik Fastify default (request count, duration, error rate)
- Setup Grafana + Prometheus (bisa via Grafana Cloud free tier)
- Setup Sentry alert rules (notifikasi ke Telegram/Discord saat ada error baru)
- Gunakan health check di docker-compose/Docker Swarm/GCP Cloud Run untuk auto-restart

---

## 4. Security & Secrets Management

| Isu | Current State | Risiko | Prioritas |
|-----|--------------|--------|-----------|
| **Kredensial di `.env` file** | File `.env` backend & web berisi real creds meski ada di `.gitignore`. | Jika terlanjur commit, credentials bocor permanen. Developer baru bisa tidak sengaja commit. | **P0** |
| **Konfigurasi hardcoded** | Mobile app hardcode `https://api.lazisnu.app` di `mobile/src/services/api.ts:42`. Context switch dev/prod via `__DEV__`. | Tidak bisa ganti API URL tanpa rebuild app | **P2** |
| **Tidak ada secret rotation** | Tidak ada mekanisme rotate JWT secret, DB password, atau third-party keys. | Jika kredensial bocor, tidak ada cara cepat memperbaikinya | **P2** |
| **JWT secret tunggal** | `JWT_SECRET` digunakan untuk sign semua token. `JWT_ACCESS_SECRET` dan `JWT_REFRESH_SECRET` ada di env schema tapi optional (`z.string().optional()`). Saat ini hanya pakai 1 secret. | Risiko security jika secret bocor — attacker bisa sign token apapun | **P1** |

### Rekomendasi

- Gunakan `.env.example` sebagai template tanpa nilai real
- Setup **Google Secret Manager** atau **Vault** untuk production secrets
- Atau minimal: inject env vars via docker-compose / systemd environment, jangan simpan di file plaintext
- Pisahkan JWT access secret vs refresh secret (ubah optional → required di production)
- Rotate semua credential yang sudah ada di `.env` lokal

---

## 5. Database & Backup

| Isu | Current State | Risiko | Prioritas |
|-----|--------------|--------|-----------|
| **Connection pool rendah** | `max: 10` di `database.ts:12`. Cukup untuk saat ini tapi bisa jadi bottleneck. | Request timeout saat peak usage jika pool habis | **P2** |
| **Migration manual** | `drizzle-kit push` jalan manual. Tidak ada migration otomatis di CI/CD atau startup. | Dev mengubah schema tanpa migration file, drift antara dev-prod | **P1** |
| **Tanpa backup** | Tidak ada evidence backup database (pg_dump cron, Supabase backup policy). Supabase seharusnya ada automated backup di Pro plan, tapi tidak dikonfigurasi di kode. | Data hilang jika terjadi disaster | **P0** |
| **No PgBouncer config** | `database.ts:10` comment menyebut "Transaction pool mode" tapi tidak ada config PgBouncer. Pakai Supabase pooler (`pooler.supabase.com`) tapi tidak ada tuning. | Koneksi tidak optimal di production | **P2** |

### Rekomendasi

- Pastikan Supabase Pro plan dengan automated backup aktif (cek Supabase dashboard)
- Setup `drizzle-kit migrate` (bukan push) dan jalankan saat startup
- Pertimbangkan naikkan pool ke 20-25 dengan PgBouncer transaction mode
- Tambahkan cron job `pg_dump` di VM sebagai backup tambahan

---

## 6. Infrastructure as Code & Reproducibility

| Isu | Current State | Rekomendasi |
|-----|--------------|-------------|
| **Tidak ada IaC** | Server GCP VM di-setup manual. Tidak ada Terraform, Ansible, atau dokumentasi provisioning. | Jika server harus di-rebuild, tidak ada panduan. Time to recover tinggi. |
| **Tidak ada dev environment containerized** | Developer harus setup PostgreSQL + Redis lokal secara manual. `pnpm dev` tidak langsung bisa. | Buat `docker-compose.yml` untuk dev: PostgreSQL + Redis + backend + web. Cukup `docker compose up` untuk mulai develop. |
| **Tidak ada dokumentasi deployment** | Tidak ada runbook "cara deploy ulang server". | Buat `docs/DEPLOYMENT.md` berisi langkah provisioning VM, setup nginx, HTTPS, deploy. |

---

## 7. Roadmap Prioritas

### Sekarang (Minggu ini) — Quick Wins, Biaya Rp0

1. **Aktifkan scheduler worker** — uncomment `index.ts:20-22` dan `index.ts:33`
2. **Install `prom-client`** — `pnpm add prom-client` di backend, route `/metrics` sudah siap
3. **Rotate kredensial** — ganti semua secret yang ada di `.env` lokal, pastikan tidak commit
4. **Tambah test di CI** — tambahkan `pnpm test` ke `ci.yml`
5. **Buat `.dockerignore` + `Dockerfile`** — langkah pertama menuju containerization
6. **Buat `docker-compose.yml`** — development environment langsung jalan

### Bulan ini — Fondasi

7. **Setup logging terstruktur** — upgrade ke Pino logger (sudah kompatibel dengan Fastify)
8. **Setup nginx reverse proxy** di VM — SSL termination, gzip, static asset cache untuk Next.js
9. **CI/CD build Docker image** — build + push ke registry, belum auto-deploy
10. **Health check monitoring** — pantau `/health/ready` dengan simple cron (curl + Telegram webhook)

### 1–3 Bulan ke depan — Maturity

11. **Deploy otomatis ke staging** via Docker Compose atau Cloud Run
12. **Setup Grafana + Prometheus** untuk dashboard monitoring
13. **Database backup terjadwal** + test restore
14. **Infrastructure as Code** — Terraform untuk GCP resources
15. **Blue-green deployment** — zero-downtime deploy

---

## Appendix: Tech Stack Saat Ini

| Layer | Teknologi |
|-------|-----------|
| Backend | Node.js + Fastify 4 (TypeScript), Drizzle ORM, BullMQ |
| Web Dashboard | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| Mobile App | React Native 0.74 (Android), Expo EAS |
| Database | PostgreSQL via Supabase (aws-1-ap-southeast-1) |
| Cache/Queue | Redis via Upstash + BullMQ |
| Storage | Cloudflare R2 (S3-compatible) |
| WhatsApp | Fonnte API |
| Push Notification | Firebase Cloud Messaging |
| Monitoring | Sentry, Firebase Crashlytics |
| Auth | JWT (access 15min + refresh 7 hari), OTP via WA |
| Hosting | GCP VM (34-101-78-252), nip.io DNS |
