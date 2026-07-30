# MASTER GOAL LIST — Lazisnu Implementation Plan

> File ini adalah **satu-satunya to-do list** yang kamu track setiap hari.
> Setiap task terhubung ke dokumen sub-bab yang berisi detail implementasi.
> Update [ ] menjadi [x] saat task selesai.

> Terakhir diperbarui: 2026-07-30 (07-A2-2 + db:migrate production + 08-D1 selesai; sisa 1 task: 08-C3 blue-green deploy)

---

## Cara Menggunakan

- Centang [x] saat task selesai
- Setiap task punya referensi ke file sub-bab untuk detail teknis
- Jangan lewati task yang bertanda PRASYARAT
- Cek decisions-log.md untuk keputusan yang masih pending sebelum mengerjakan task terkait

---

## FASE 0 — Persiapan (Sebelum Mulai Coding)

- [x] **PREP-1**: Baca docs/implementation/01-arsitektur-konteks.md (referensi arsitektur)
- [x] **PREP-2**: Baca docs/implementation/09-appendix-referensi.md (panduan belajar)
- [x] **PREP-3**: Selesaikan keputusan D-01 di decisions-log.md (OTP: Aktifkan via WA Opsi A ✅)
- [x] **PREP-4**: Selesaikan keputusan D-06 di decisions-log.md (background scheduler & generator: Hapus Total ✅)
- [x] **PREP-5**: Selesaikan keputusan D-10 di decisions-log.md (sync_queues: DROP Opsi A ✅)
- [x] **PREP-6**: Pastikan repo bisa di-build: pnpm install && pnpm build:shared
- [x] **PREP-7**: Pastikan server bisa dijalankan: curl http://localhost:3001/health/ready

---

## MINGGU 1 — Keamanan Kode & Quick Wins

### Sub-bab 06 — Temuan & Perbaikan Kode (PRIORITAS TERTINGGI)
> Detail: docs/implementation/06-temuan-perbaikan-kode.md

#### P0 Kritis
- [x] **06-P0-A3**: Set CORS_ORIGINS di .env production (⚠️ diverifikasi di dev: origin=true by design)
- [x] **06-P0-A4**: Test CORS dari origin asing -> ditolak (⚠️ dev mode izinkan semua, production akan whitelist)
- [x] **06-P0-B1**: routes/scheduler.ts:23 — ubah guard menjadi fail-closed
- [x] **06-P0-B2**: Test scheduler tanpa INTERNAL_API_KEY -> 403 FORBIDDEN ✅
- [x] **06-P0-B3**: Test scheduler dengan API key salah -> 403 FORBIDDEN ✅

#### P1 Tinggi
- [x] **06-P1-A1**: routes/auth.ts — tangani OTP sesuai keputusan D-01 (deferred ke Sub-bab 05 — Opsi A)
- [x] **06-P1-B1**: services/whatsapp.ts:236 — tambah branch WA_PROVIDER untuk sendTemplateMessage
- [x] **06-P1-B2**: Test sendTemplateMessage dengan WA_PROVIDER=fonnte -> error eksplisit ✅

#### P2 Menengah
- [x] **06-P2-C1**: services/whatsapp.ts:178 — INSERT log FAILED hanya di attempt terakhir
- [x] **06-P2-D1**: offline/sync.ts — hapus kode loop mati (MAX_BATCH_ITERATIONS)
- [x] **06-P2-E1**: routes/auth.ts — satukan lookup phone di request-otp dan verify-otp
- [x] **06-P2-F1**: middleware/audit-logger.ts — implementasi OWNERSHIP_DENIED vs AUTH_FAILED

#### P3 Hygiene
- [x] **06-P3-1**: routes/admin/collections.ts — hapus (dead code, tidak terdaftar di index.ts)
- [x] **06-P3-2**: routes/bendahara.ts:5 — hapus unused import getRoleScope

#### Verifikasi Sub-bab 06
- [x] pnpm --filter lazisnu-backend test:unit -> semua hijau
- [x] pnpm --filter lazisnu-backend run lint -> tidak ada error
- [x] pnpm --filter lazisnu-backend exec tsc --noEmit -> tidak ada error

---

### Sub-bab 07A — Infrastruktur Quick Wins
> Detail: docs/implementation/07-infrastruktur-devops.md (Kelompok A)

- [x] **07-A1-1**: index.ts — hapus scheduler.worker.ts + bersihkan komentar (D-06: Hapus Total)
- [x] **07-A1-2**: Seragamkan strategi generator sesuai D-06 (Hapus Total, selesai)
- [x] **07-A1-3**: HTTP /v1/scheduler/* tetap dipertahankan sebagai fallback manual
- [x] **07-A2-1**: ci.yml — tambah step unit test backend + mobile
- [x] **07-A2-2**: Push PR -> CI menjalankan unit test (✅ PR #17 merged; CI hijau + deploy-staging live)
- [x] **07-A3-1**: pnpm --filter lazisnu-backend add prom-client
- [x] **07-A3-2**: curl /metrics -> output Prometheus (bukan 501)
- [x] **07-A4-1**: git log --all -- apps/backend/.env -> cek kredensial pernah ter-commit
- [x] **07-A4-2**: Tidak ada .env di git history — audit bersih

---

## MINGGU 2 — Backend, Database, Sesi

### Sub-bab 02 — Backend Core
> Detail: docs/implementation/02-backend-core.md
> PRASYARAT: Sub-bab 06 selesai, D-06 sudah diputuskan

- [x] **02-A1**: index.ts — hapus scheduler.worker.ts, bersihkan komentar (D-06 Hapus Total)
- [x] **02-B1**: env.ts — JWT_ACCESS_SECRET dan JWT_REFRESH_SECRET dari optional() menjadi z.string().min(32)
- [x] **02-B2**: app.ts — update registrasi jwt dengan JWT_ACCESS_SECRET
- [x] **02-B3**: routes/auth.ts — sign refresh token dengan JWT_REFRESH_SECRET
- [x] **02-B4**: middleware/auth.ts — access token dengan JWT_ACCESS_SECRET
- [x] **02-B5**: services/qr.ts — gunakan APP_SECRET, bukan JWT_SECRET
- [x] **02-B6**: Update .env dan .env.example dengan dua secret baru
- [x] **02-C1**: middleware/auth.ts:12 — hapus ADMIN_PUSAT dan ADMIN_KABUPATEN dari JWTPayload
- [x] **02-C2**: middleware/ownership.ts:29 — hapus case ADMIN_PUSAT bypass total
- [x] **02-C3**: middleware/ownership.ts:62 — hapus ADMIN_KABUPATEN di assertDistrictAccess
- [x] **02-D1**: app.ts — konfigurasi logger Fastify dengan level dan redact
- [x] **02-D2**: workers/whatsapp.worker.ts — ganti console.log dengan logger
- [x] **02-D3**: workers/scheduler.worker.ts — ganti 10+ console.log (file sudah dihapus)
- [x] **02-D4**: services/whatsapp.ts — ganti console.log/error dengan logger
- [x] **02-E1**: admin/collections.ts — hapus (dead code)
- [x] **02-E2**: bendahara.ts:5 — hapus unused import

#### Verifikasi Sub-bab 02
- [x] pnpm --filter lazisnu-backend test:unit -> semua hijau (unit test)
- [x] pnpm --filter lazisnu-backend run lint -> tidak ada error
- [x] Log output: JSON, field sensitif di-redact

---

### Sub-bab 03 — Data Model & Database
> Detail: docs/implementation/03-data-model-database.md
> PRASYARAT: Sub-bab 06 selesai, D-10 sudah diputuskan

- [x] **03-A1**: Baca meta/_journal.json — 3 entry: 0000_tired_toxin, 0001_long_blur, 0002_great_virginia_dare
- [x] **03-A2**: Review 5 SQL legacy — sudah applied via push, server berjalan normal
- [x] **03-A3**: Buat docs/DEPLOYMENT.md — dokumentasikan langkah baseline
- [x] **03-B1**: Update backend/package.json — tambah script db:migrate dan db:generate
- [x] **03-B2**: Buat migration kustom untuk immutable-rule.sql
- [x] **03-C1**: Tambah kolom user_sessions.device_id (varchar 100, nullable) via drizzle generate + push
- [x] **03-C2**: Tambah kolom users.fcm_token (varchar 255, nullable) via drizzle generate + push
- [x] **03-C3**: Apply migration: drizzle-kit push --force
- [x] **03-D1**: DROP sync_queues dari schema.ts + hapus semua referensi
- [x] **03-E1**: Verifikasi enum user_role di DB hanya 4 nilai valid
- [x] **03-F1**: Hapus packages/shared-types/package-lock.json
- [x] **03-F2**: Hapus packages/design-tokens/ (folder kosong)

#### Verifikasi Sub-bab 03
- [ ] pnpm db:migrate berhasil
- [x] Kolom user_sessions.device_id ada di DB
- [x] Kolom users.fcm_token ada di DB
- [ ] pnpm exec tsc --noEmit -> tidak ada error

---

### Sub-bab 04 — Alur Data & Sesi (Bab 20 Fase 1)
> Detail: docs/implementation/04-alur-data-sesi.md
> PRASYARAT: Sub-bab 03 task C selesai (kolom device_id ada)

- [x] **04-A1**: tokenService.ts — storeDeviceSession (SET key + SADD registry)
- [x] **04-A2**: tokenService.ts — validateDeviceSession (fail-closed di production jika Redis null)
- [x] **04-A3**: tokenService.ts — revokeDeviceSession (DEL key + SREM registry)
- [x] **04-A4**: tokenService.ts — revokeAllUserSessions (SMEMBERS registry, exceptDeviceId?)
- [x] **04-A5**: tokenService.ts — fallback jika deviceId kosong: gunakan jti sebagai deviceId
- [x] **04-A6**: tokenService.ts — deprecate fungsi lama (storeRefreshJti, dll.)
- [x] **04-A7**: Unit test 5 skenario wajib (lihat 04-alur-data-sesi.md task A7)
- [x] **04-B1**: middleware/auth.ts — update generateTokens(..., deviceId?) tambah claim did
- [x] **04-C1**: routes/auth.ts — POST /v1/auth/login terima device_id dan device_label
- [x] **04-C2**: routes/auth.ts — POST /v1/auth/refresh: validateDeviceSession + rotasi + tutup row lama
- [x] **04-C3**: routes/auth.ts — DELETE /sessions/:id: FIX P0-2: revokeDeviceSession + set revokedAt
- [x] **04-C4**: routes/auth.ts — DELETE /sessions: revokeAllUserSessions kecuali current
- [x] **04-C5**: routes/auth.ts — POST /logout: HAPUS blok blacklist (FIX P0-3, D-07)
- [x] **04-C6**: routes/auth.ts — POST /verify-otp: terima device_id dan label
- [x] **04-D1**: config/env.ts — JWT_REFRESH_TTL default 365d
- [x] **04-D2**: Update .env dan .env.example
- [x] **04-E1**: Dashboard Upstash — set eviction policy volatile-lru
- [x] **04-F1**: auth.integration.test.ts — integration test 4 skenario
- [x] **04-F2**: pnpm --filter lazisnu-backend test:integration

#### Verifikasi Sub-bab 04
- [ ] test:unit semua hijau
- [ ] test:integration semua hijau
- [ ] Revoke sesi tunggal -> refresh 401 REFRESH_REVOKED
- [ ] Revoke-all -> semua device mati kecuali current
- [ ] Login ulang device sama -> hanya 1 key Redis
- [x] Blacklist dead code sudah dihapus dari auth.ts
- [x] Redis volatile-lru aktif di Upstash

---

### Sub-bab 07B — Containerization & Deploy
> Detail: docs/implementation/07-infrastruktur-devops.md (Kelompok B)
> PRASYARAT: Sub-bab 06 selesai

- [x] **07-B1-1**: Buat apps/backend/Dockerfile multi-stage
- [x] **07-B1-2**: Buat apps/web/Dockerfile (Next.js standalone)
- [x] **07-B1-3**: Buat .dockerignore di root
- [x] **07-B1-4**: Buat docker-compose.yml (backend + web + worker + nginx)
- [x] **07-B1-5**: Test: docker compose up → semua service healthy ✅ (VM Tencent Cloud, 2026-07-23)
- [x] **07-B2-1**: ci.yml — tambah job build-image (docker build + push ke GHCR)
- [x] **07-B2-2**: ci.yml — tambah job deploy (SSH ke VM, manual trigger)
- [x] **07-B4-1**: Buat apps/backend/src/worker.ts (entrypoint khusus worker)
- [x] **07-B4-2**: docker-compose.yml — tambah service worker terpisah
- [x] **07-C2-1**: Buat docs/SECURITY.md dengan runbook rotasi secret

---

## MINGGU 3-4 — Frontend & Observability

### Sub-bab 05 — Frontend: Web & Mobile (Bab 20 Fase 2)
> Detail: docs/implementation/05-frontend-web-mobile.md
> PRASYARAT: Sub-bab 04 selesai, D-01 sudah diputuskan, D-09 = opsional

#### Mobile — deviceId
- [x] **05-MA1**: api.ts — generate deviceId UUID sekali, persist di MMKV, kirim di login/refresh
- [x] **05-MA2**: api.ts — deviceId dibaca dari MMKV saat restart (tidak re-generate)

#### Mobile — Biometrik (D-09: opsional)
- [x] **05-MB1**: Buat services/biometric.ts (BARU) dengan isBiometricAvailable, enableBiometric, getTokenWithBiometric, disableBiometric
- [x] **05-MC1**: useAuthStore.ts — tambah state biometricEnabled dan aksi enableBiometric, loginWithBiometric, disableBiometric
- [x] **05-MD1**: LoginScreen.tsx — tombol Masuk dengan Sidik Jari (tampil jika biometricEnabled)
- [x] **05-ME1**: ProfileScreen.tsx — toggle On/Off biometrik
- [x] **05-MG1**: Buat __tests__/biometric.test.ts dengan mock Keychain (4 skenario)

#### Mobile — OTP (sesuai keputusan D-01)
- [x] **05-MF1**: Implementasikan keputusan D-01 di mobile dan/atau backend

#### Web Dashboard
- [x] **05-WA1**: middleware.ts — verifikasi role guard untuk 4 role valid
- [x] **05-WA2**: login/route.ts:40 — ubah maxAge lazisnu_token dari 1 hari menjadi 15 menit
- [x] **05-WA3**: web/package.json — pindahkan zod dari devDependencies ke dependencies
- [x] **05-WB1**: web lib/api.ts — generate deviceId dan kirim di body login/refresh

#### Verifikasi Sub-bab 05
- [x] pnpm --filter lazisnu-backend test:unit -> semua hijau (54/54)
- [x] pnpm --filter web run lint -> tidak ada error (0 error, 1 warning existing)
- [x] pnpm --filter web run typecheck -> pass
- [x] Login biometrik: sidik jari -> masuk app
- [x] Toggle Off biometrik -> entry Keychain terhapus
- [x] Cookie lazisnu_token maxAge = 15 menit

---

### Sub-bab 07C — Observability & Infrastruktur Lanjutan
> Detail: docs/implementation/07-infrastruktur-devops.md (Kelompok D + E)

- [x] **07-D1-1**: Install Uptime Kuma di VM -> monitor /health/ready tiap 60 detik ✅
- [x] **07-D1-2**: Konfigurasi notifikasi Discord saat down ✅
- [x] **07-D2-1**: backend/package.json — verifikasi @sentry/node di dependencies (bukan devDependencies) ✅
- [x] **07-D2-2**: config/sentry.ts — hapus lazy require, import langsung ✅
- [x] **07-D3-1**: docker-compose.yml — logging config max-size + max-file (sudah ada) ✅
- [x] **07-E1-1**: Install nginx di VM (via Docker, nginx:alpine) ✅
- [x] **07-E1-2**: SSL cert via certbot — api.lazisnu.site + dashboard.lazisnu.site (SAN) ✅
- [x] **07-E1-3**: Konfigurasi nginx server block + security headers (X-Frame-Options, HSTS) ✅
- [x] **07-E1-4**: curl https://api.lazisnu.site/health/ready → 200 ✅ (domain diganti ke .site)
- [x] **07-E2-1**: Buat script backup pg_dump -> upload ke R2 (file flag) ✅
- [x] **07-E2-2**: Tambah cron harian di VM (jam 02:00) ✅
- [x] **07-E2-3**: Test restore backup ke DB dev/staging ✅
- [x] **07-E3-1**: Buat project Supabase kedua untuk staging (ngskcwwjwxsvjrswomkf) ✅
- [x] **07-E3-2**: docker-compose.staging.yml di VM (redis-staging, backend-staging:4001, worker-staging, web-staging:4000) ✅
- [x] **07-E3-3**: Update CI: main -> auto-deploy staging; tag v* -> production ✅

---

## BULAN 2-3 — Maturity

### Sub-bab 07G — Hygiene Infrastruktur
> Detail: docs/implementation/07-infrastruktur-devops.md (Kelompok G)

- [x] **07-G1**: docs/DEPLOYMENT.md — pembaruan menyeluruh (runbook deployment, rollback, troubleshooting, checklist, staging)
- [x] **07-G2**: eas.json + apps/mobile/src/services/api.ts — API_URL dari EAS profile (development/preview/production)
- [x] **07-G3-1**: Mount `/opt/lazisnu/backup-active` ke container backend di docker-compose.yml
- [x] **07-G3-2**: Buat routes/admin/backup.ts — POST /backup/start, POST /backup/stop, GET /backup/status
- [x] **07-G3-3**: Register route backup di admin/index.ts
- [x] **07-G3-4**: Integrasi tombol "Aktifkan/Nonaktifkan Backup" di dashboard web (overview page)
- [x] **07-G3-5**: Test end-to-end: tombol admin → flag → backup cron ✅ (API: stop/start/status semua benar)

### Sub-bab 08 — Rencana Implementasi Final
> Detail: docs/implementation/08-rencana-implementasi-final.md
> PRASYARAT: Sub-bab 02-07 sudah mayoritas selesai

- [x] **08-A1**: Setup Prometheus di VM — scrape /metrics
- [x] **08-A2**: Install Grafana + import dashboard Node.js standar
- [x] **08-A3**: Buat alert rules (CPU, memory, error rate, event loop lag)
- [x] **08-B1**: Buat docs/SOP-BACKUP-RESTORE.md
- [x] **08-B2**: Lakukan test restore pertama ✅
- [x] **08-C1**: Setup nginx blue-green (2 upstream)
- [x] **08-C2**: Buat script deploy-blue-green.sh
- [x] **08-C3**: Test: deploy tanpa downtime ✅ (2026-07-30 — blue-green switch, 381 request 0 gagal)
- [x] **08-D1**: Cek metrik koneksi DB — tuning jika >200 petugas aktif
- [x] **08-E1**: Review decisions-log.md — tidak boleh ada yang masih pending
- [x] **08-F1**: Update .agents/rules/00-project-overview.md dengan arsitektur terkini
- [x] **08-F2**: Tandai temuan yang sudah diselesaikan di analisis-master-lazisnu.md

#### Verifikasi Sub-bab 08
- [ ] Grafana dashboard aktif dan menampilkan data real
- [x] SOP restore terdokumentasi dan diuji
- [ ] Blue-green deployment berhasil tanpa downtime
- [x] Semua keputusan di decisions-log.md berstatus Diputuskan

---

## REFERENSI — Sub-bab 09 (tidak ada task)
> Baca: docs/implementation/09-appendix-referensi.md

---

## Ringkasan Progress

> Update tabel ini setiap akhir sprint/minggu

| Sub-bab | Total Task | Selesai | % |
|---------|-----------|---------|---|
| PREP — Persiapan | 7 | 7 | 100% |
| 06 — Temuan & Perbaikan Kode | 17 | 17 | 100% |
| 07A — Infra Quick Wins | 9 | 9 | 100% |
| 02 — Backend Core | 16 | 16 | 100% |
| 03 — Data Model & Database | 12 | 12 | 100% |
| 04 — Alur Data & Sesi | 17 | 17 | 100% |
| 07B — Containerization | 10 | 10 | 100% |
| 07C — Observability & Infra | 14 | 14 | 100% |
| 05 — Frontend Web & Mobile | 13 | 13 | 100% |
| 07G — Hygiene Infrastruktur | 7 | 7 | 100% |
| 08 — Rencana Final | 12 | 10 | 83% |
| **TOTAL** | **134** | **132** | **99%** |

---

*Master goal list ini merangkum seluruh implementation plan Lazisnu.*
*Detail teknis setiap task ada di file sub-bab yang direferensikan.*
*Selalu perbarui decisions-log.md saat keputusan berubah.*

---

## Technical Debt

| ID | Item | Detail | Dampak | Prioritas |
|----|------|--------|--------|:---:|
| TD-01 | `auth.integration.test.ts` — mock db global bocor antar describe block | `jest.mock('../../config/database')` di baris atas menciptakan singleton mock. Implementasi yang diubah oleh outer describe tests bocor ke inner `Session Management` describe block. Test lulus saat dijalankan terisolasi (`jest -t "Session Management"`), tapi 2 dari 3 gagal saat dicampur dengan outer tests. | Tidak bisa menjalankan seluruh file test sekaligus tanpa failure | Rendah |
| TD-02 | `collectionSubmission.integration.test.ts` — test tidak idempotent | `beforeAll` insert district dengan `code: 'DTI'` tanpa cleanup idempotent. Sudah difix dengan cleanup di awal `beforeAll` (sesi ini). Namun 4 file SQL legacy di `migrations/` masih orphan dari journal. | Test integration gagal setelah run pertama | Rendah |
| TD-03 | Database test `lazisnu_test` tidak auto-sync dengan Drizzle schema | `drizzle-kit push` tidak mendeteksi kolom `users.fcm_token` dan `user_sessions.device_id` saat dijalankan ke test DB. Harus di-ALTER manual. Akar masalah: `drizzle-kit push` tidak reliable untuk deteksi drift di test DB. | Test integration bisa gagal setelah schema berubah | Rendah |