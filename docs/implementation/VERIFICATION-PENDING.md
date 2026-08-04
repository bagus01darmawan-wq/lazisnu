# Pending Verification — Butuh Akses VM/DB

> Dibuat: 2026-07-29 | Terakhir diperbarui: 2026-07-29 (verifikasi VM: 14 item ✅ via SSH, 25 ⚠️ pending)
> Daftar ⚠️ yang sudah terverifikasi di kode tapi perlu **akses server/DB berjalan** untuk verifikasi final.
> Setiap item sudah dicek di kode dan **implementasinya benar** — hanya perlu konfirmasi runtime.
> Centang `[x]` setelah diverifikasi langsung di VM.
>
> **Total: 25 ⚠️ + 14 ✅ verified** | Sub-bab 02: 1+2 | 03: 2+3 | 04: 5+0 | 05: 6+0 | 06: 4+4 | 07: 7+5

---

## Sub-bab 02 — Backend Core (1 ⚠️ + 2 ✅)

- [ ] **C6**: Semua route masih berfungsi dengan 4 role valid
- [x] **D5**: Output log di production adalah JSON (bukan pretty-print)
- [x] **D6**: Field `authorization`, `password`, `otp` tidak muncul di log

---

## Sub-bab 03 — Data Model & Database (2 ⚠️ + 3 ✅)

- [x] **C3**: `pnpm db:migrate` berhasil dijalankan di database ✅ (2026-08-01: step "Run DB migrations di test database" hijau di semua run CI hari ini, e.g. 30662371949; juga sukses lokal di Sesi 30)
- [x] **C4**: Kolom `user_sessions.device_id` ada di DB — `character varying`
- [x] **E1**: Enum `user_role` hanya 3 nilai — `ADMIN_KECAMATAN, ADMIN_RANTING, PETUGAS` (BENDAHARA dihapus per D-11, 2026-08-03)
- [x] **F2**: `pnpm install --frozen-lockfile` berhasil setelah penghapusan `package-lock.json` ✅ (2026-08-01: sukses lokal — "Lockfile is up to date", Done 12.4s; root `package-lock.json` sudah tidak ada)
- [x] **Verifikasi**: `sync_queues` sudah di-DROP — `EXISTS: false`

---

## Sub-bab 04 — Alur Data & Sesi (5 ⚠️ + 0 ✅)

> Catatan: Redis key format `refresh:{userId}:{deviceId}` + registry `refresh:devices:{userId}` terkonfirmasi di Redis production. Per-device session berfungsi.

- [x] **F2**: `pnpm --filter lazisnu-backend test:integration` — semua hijau (Sesi 31) ✅
  - 17/17 test PASSED (`auth.integration.test.ts`)
  - TD-01 mock isolation + TD-04 mock target + TD-05 rate limit reset
    (commit `bc009a7`)
- [x] **Verifikasi**: Revoke sesi tunggal → refresh sesi itu 401 `REFRESH_REVOKED` ✅
  - Test: `Session Management (04-F1) > Revoke sesi tunggal` PASS
- [x] **Verifikasi**: Revoke-all → semua device mati kecuali current ✅
  - Test: `Session Management (04-F1) > Revoke semua sesi` PASS
- [x] **Verifikasi**: Login ulang device sama → hanya 1 key Redis untuk device itu ✅ (2026-08-04, E2E di staging)
  - Bukti: 2x login (request-otp → baca OTP dari Redis staging → verify-otp dengan `device_id=test-device-d10a-0001`) → key `refresh:39c4fc45-...:test-device-d10a-0001` tetap 1, value = jti baru (overwrite terbukti), TTL 31.535.991s ≈ 365 hari, registry `refresh:devices:{userId}` = set. Artefak test dibersihkan (key, registry member, 2 row `user_sessions`; baseline 11 key pulih)
- [x] **Verifikasi**: `docs/DEPLOYMENT.md` diupdate — langkah Upstash diganti Redis container

---

## Sub-bab 05 — Frontend Web & Mobile (6 item)

> Progres 2026-08-04: toggle biometrik ON sudah bekerja di Android fisik ✅ (PR #33 — keychain 8.2.0→10.0.0; sebelumnya gagal tanpa prompt). Fix logout-biometrik merged (PR #34). ⏳ Verifikasi 3 skenario (S1-S3) menunggu build APK EAS `internal-prod` (lihat SESSION-2026-08-04).

- [x] **MA3**: Test login 2x dari device yang sama → hanya 1 key Redis `refresh:{userId}:{deviceId}` ✅ (2026-08-04, E2E staging: 2x verify-otp device_id sama → key user tetap 1, jti baru menimpa yang lama)
- [x] **MF3a**: Test OTP end-to-end: request OTP → WA masuk → verify → dapat token ✅ (2026-08-04, staging) — bukti: OTP 640875 terkirim via Fonnte dan terbaca di WA user == nilai di Redis staging `otp:6282134536151`; verify-otp sukses → access+refresh token, refresh exp 2027-08-04 (365d), key `refresh:{uid}:{did}` dibuat. Artefak test dibersihkan (baseline 11 key pulih). Catatan: request pertama gagal `WA_SEND_FAILED` karena device Fonnte disconnected (error Fonnte: "request invalid on disconnected device") — teratasi setelah device di-reconnect di dashboard Fonnte; token sama antara production & staging
- [x] **WB2**: Test: setelah login → key Redis `refresh:{userId}:{deviceId}` ada ✅ (2026-08-04 — diuji level API (staging): verify-otp dengan `device_id` → key muncul + claim `did` di refresh JWT; web login + refresh memakai endpoint yang sama dengan `device_id` dari cookie `lazisnu_device_id`, sudah diverifikasi di kode `apps/web/src/app/api/auth/refresh/route.ts`)
- [ ] **Verifikasi**: Login biometrik → sidik jari → masuk app tanpa input password
- [ ] **Verifikasi**: Toggle Off biometrik → entry Keychain terhapus
- [ ] **Verifikasi**: `REFRESH_REVOKED` → biometrik nonaktif otomatis, arah ke login

---

## Sub-bab 06 — Temuan & Perbaikan Kode (4 ⚠️ + 4 ✅)

- [x] **P0-A4**: `CORS_ORIGINS` di `.env` production — `https://dashboard.lazisnu.site` ✅
- [x] **P0-A5**: Test CORS: request dari origin asing → ditolak (Sesi 31 Lanjutan) ✅
  - File: `apps/backend/src/routes/__tests__/cors.integration.test.ts` (6 test, all PASSED)
  - Verifikasi: preflight dari 2 whitelisted origins (200/204 + Allow-Origin header) +
    3 non-whitelisted origins (evil.example.com, null, subdomain spoof) +
    1 actual request (no Allow-Origin)
  - Catatan: @fastify/cors tidak return 403 server-side, melainkan omit
    Access-Control-Allow-Origin header (browser block client-side).
    Absence of header = server-side rejection yang valid sesuai CORS spec.
- [x] **P0-B4**: Test scheduler tanpa `INTERNAL_API_KEY` → `FORBIDDEN` ✅
- [x] **P0-B5**: Test scheduler dengan API key salah → `FORBIDDEN` ✅
- [x] **P1-B3**: Test `sendTemplateMessage` dengan `WA_PROVIDER=fonnte` → throw `UNSUPPORTED_OPERATION` ✅ (2026-08-01, PR #25: `src/services/__tests__/whatsapp.test.ts`)
- [x] **P2-C3**: Test: job gagal 3x → hanya 1 baris `FAILED` di tabel `notifications` ✅ (2026-08-01, PR #25: `whatsapp-worker.test.ts` + refactor `handleJobFailure` di whatsapp.worker.ts)
- [x] **P2-E4**: Test: user tanpa record `officers` → `request-otp` 404 (bukan 200 palsu) ✅ (2026-08-01: sudah dicover `auth.integration.test.ts` L204, berjalan di CI integration)
- [x] **P2-F3**: Test: role valid tapi scope salah → audit log `OWNERSHIP_DENIED` ✅ (2026-08-01, PR #25: `audit-logger.test.ts`; `test:unit` diperluas ke `(services|middleware)`)

---

## Sub-bab 07 — Infrastruktur & DevOps (7 ⚠️ + 5 ✅)

- [x] **A2-3**: Push PR → CI menjalankan unit test di GitHub Actions ✅ (2026-08-01: PR #18 — `test:unit` 54/54 + mobile test, service postgres aktif)
- [x] **A2-4**: Tambah integration test dengan GitHub Actions services (postgres + redis) ✅ (2026-08-01, PR #24 / commit `f202e0e`): step "Run integration tests" jalan — 5 suites/47 test PASS (auth, p1-regression, cors, p0-regression, health), service redis ditambah di CI
- [x] **A3-2/A3-3**: `curl /metrics` → output Prometheus (bukan 501) + default metrics ada ✅
- [x] **B1-5**: `docker compose up` di VM → semua service healthy ✅
- [x] **B2-3**: Push ke main → image ter-build dan ter-push ke GHCR ✅ (2026-08-01: run main 30662371949 build-image pass 3m31s; run dispatch 30661900400 — `backend`/`web:latest` + `:c4f1237` ter-push, attestation/provenance OK)
- [x] **B4-5**: Test restart service backend → worker tetap berjalan ✅
- [x] **D1-1/D1-2/D1-3**: Uptime Kuma aktif + monitor /health/ready + notifikasi Discord ✅ (Sesi 30 Lanjutan 6: 4 monitor + Discord binding)
- [x] **D2-4**: Verifikasi token error tracking backend aktif di dashboard ✅ (2026-08-02: **migrated Sentry → Rollbar**. Alasan: Sentry free tidak punya Discord native (berbayar Team plan); Rollbar free punya webhook notification ke Discord via Hookdeck. Setup: (1) `rollbar ^3.1.0` installed di backend; (2) config baru `src/config/rollbar.ts` (init, captureError, scrubFields `password/secret/creditCard/authorization/otp`); (3) `initRollbar()` + `captureError()` hook di `app.ts` error handler branch 500; (4) `ROLLBAR_ACCESS_TOKEN` ditambahkan ke schema `env.ts`; (5) `SENTRY_DSN` dihapus dari `.env` VM, `ROLLBAR_ACCESS_TOKEN=aa5b0cfd...` ditanam; (6) token terverifikasi via test node lokal → `ROLLBAR_OK` UUID `631a8867-926e-41a7-db63-e229c01f8e8f` masuk Rollbar dashboard; (7) Hookdeck pipeline `rollbar-to-discord` ter-setup (source `src_4wdr88dwy46kj8` URL `https://hkdk.events/4wdr88dwy46kj8`, transform `rollbar-to-discord`, connection `web_10Rw9dMZEPSx` ke destination Discord existing) — test mock payload `new_item` → 200 SUCCESS + attempt SUCCESSFUL → embed `🔴 🆕 NEW ITEM` masuk Discord channel. ⏳ Tersisa: (a) setup Rollbar Webhook Notification di UI Rollbar (Settings → Notifications → Webhook, URL `https://hkdk.events/4wdr88dwy46kj8`, rule `new_item`) — butuh user buka dashboard; (b) deploy code Rollbar ke image production via PR merge ke main + CI blue-green deploy — code typecheck PASS, tinggal build & deploy. Catatan lama Sentry: project `lazisnu-backend` di org `lazisnupng` (via API) masih ada tetapi tidak terpakai; `@sentry/node` package sementara dipertahankan di `package.json` (dual fail-safe), bisa dihapus setelah Rollbar verified di production.)
- [x] **E1-4**: Security headers (X-Frame-Options, HSTS) di nginx.conf ✅
- [ ] **E2-1**: Cek Supabase daily backup di dashboard
- [x] **E2-4**: Set R2 lifecycle rule: retensi 30 hari ✅ (2026-08-01, dashboard Cloudflare oleh user: `backups/` 30d, `kuma/` 30d, `lazisnu_` root 30d; `archive/` & `secrets/` tanpa rule — aman. API tidak bisa verifikasi ulang: token tanpa izin lifecycle)
- [x] **E2-5**: Test restore backup ke database dev → `pg_restore` + verifikasi data ✅ (2026-08-01: restore `lazisnu_20260801_021319.sql.gz` ke postgres:17-alpine throwaway — **0 ERROR**, 12 tabel, data terbaca: users 10 / collections 48 / sessions 263 / officers 8; container dihapus. Catatan: dump plain SQL → restore via `psql`, setara verifikasi restorabilitas)

---

## Catatan (sudah resolved)

- [x] **02-A3**: `buildFirstOfficerAssignments` tidak perlu dihapus — masih dipakai `scheduler.ts:57`
- [x] **04-E1**: Login Upstash — **OBSOLET** (Redis container sejak Sesi 24)
- [x] **05-MF1b/2b/3b**: Opsi B (disable OTP) — **SKIP**, D-01 = Opsi A
- [x] **06-P1-A1b/A2b**: Opsi B (matikan OTP) — **SKIP**, D-01 = Opsi A
- [x] **06-P0-B3**: Warning boot `INTERNAL_API_KEY` — **PARTIAL** (guardian runtime 503 cukup)
- [x] **06-P0-C2 + P2-D**: Blacklist grep + sync.ts loop — terverifikasi di kode
- [x] **07-A1-(1-5)**: Scheduler worker — **OBSOLET** (D-06 = Hapus Total)
- [x] **07-B4-2/B4-4**: start:worker script + RUN_WORKER flag — **DIFFERENT APPROACH** (docker-compose entrypoint, desain container terpisah)
- [x] **07-E3-2**: Upstash staging — **OBSOLET** (Redis container)
- [x] **07-G1/G2/G3**: Hygiene infra — **SELESAI SESI INI** (DEPLOYMENT.md, eas.json, backup admin)
- [x] **08-E1**: Semua 10 keputusan di decisions-log.md ✅ Diputuskan
- [x] **08-E2**: Bab 24 trade-offs direview — OTP row diupdate, semua terimplementasi
- [x] **08-F1**: `.agents/rules/00-project-overview.md` +2 section (Auth & Container architecture)
- [x] **08-F2**: `analisis-master-lazisnu.md` — P0-1/2/3 ditandai RESOLVED
- [x] **08-B1**: `docs/SOP-BACKUP-RESTORE.md` — SOP backup & restore terdokumentasi
- [x] **07-E2-3**: Test restore backup — SOP sudah ada di `docs/SOP-BACKUP-RESTORE.md`, eksekusi test restore perlu staging DB
- [x] **07-C2-1**: `docs/SECURITY.md` — runbook rotasi secret sudah ada
