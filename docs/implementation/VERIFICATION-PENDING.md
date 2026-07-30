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

- [ ] **C3**: `pnpm db:migrate` berhasil dijalankan di database
- [x] **C4**: Kolom `user_sessions.device_id` ada di DB — `character varying`
- [x] **E1**: Enum `user_role` hanya 4 nilai — `ADMIN_KECAMATAN, ADMIN_RANTING, PETUGAS, BENDAHARA`
- [ ] **F2**: `pnpm install --frozen-lockfile` berhasil setelah penghapusan `package-lock.json`
- [x] **Verifikasi**: `sync_queues` sudah di-DROP — `EXISTS: false`

---

## Sub-bab 04 — Alur Data & Sesi (5 ⚠️ + 0 ✅)

> Catatan: Redis key format `refresh:{userId}:{deviceId}` + registry `refresh:devices:{userId}` terkonfirmasi di Redis production. Per-device session berfungsi.

- [ ] **F2**: `pnpm --filter lazisnu-backend test:integration` — semua hijau
- [ ] **Verifikasi**: Revoke sesi tunggal → refresh sesi itu 401 `REFRESH_REVOKED`
- [ ] **Verifikasi**: Revoke-all → semua device mati kecuali current
- [ ] **Verifikasi**: Login ulang device sama → hanya 1 key Redis untuk device itu
- [x] **Verifikasi**: `docs/DEPLOYMENT.md` diupdate — langkah Upstash diganti Redis container

---

## Sub-bab 05 — Frontend Web & Mobile (6 item)

- [ ] **MA3**: Test login 2x dari device yang sama → hanya 1 key Redis `refresh:{userId}:{deviceId}`
- [ ] **MF3a**: Test OTP end-to-end: request OTP → WA masuk → verify → dapat token
- [ ] **WB2**: Test: setelah login → key Redis `refresh:{userId}:{deviceId}` ada
- [ ] **Verifikasi**: Login biometrik → sidik jari → masuk app tanpa input password
- [ ] **Verifikasi**: Toggle Off biometrik → entry Keychain terhapus
- [ ] **Verifikasi**: `REFRESH_REVOKED` → biometrik nonaktif otomatis, arah ke login

---

## Sub-bab 06 — Temuan & Perbaikan Kode (4 ⚠️ + 4 ✅)

- [x] **P0-A4**: `CORS_ORIGINS` di `.env` production — `https://dashboard.lazisnu.site` ✅
- [ ] **P0-A5**: Test CORS: request dari origin asing → 403
- [x] **P0-B4**: Test scheduler tanpa `INTERNAL_API_KEY` → `FORBIDDEN` ✅
- [x] **P0-B5**: Test scheduler dengan API key salah → `FORBIDDEN` ✅
- [ ] **P1-B3**: Test `sendTemplateMessage` dengan `WA_PROVIDER=fonnte` → throw `UNSUPPORTED_OPERATION`
- [ ] **P2-C3**: Test: job gagal 3x → hanya 1 baris `FAILED` di tabel `notifications`
- [ ] **P2-E4**: Test: user tanpa record `officers` → `request-otp` 404 (bukan 200 palsu)
- [ ] **P2-F3**: Test: role valid tapi scope salah → audit log `OWNERSHIP_DENIED`

---

## Sub-bab 07 — Infrastruktur & DevOps (7 ⚠️ + 5 ✅)

- [ ] **A2-3**: Push PR → CI menjalankan unit test di GitHub Actions
- [ ] **A2-4**: Tambah integration test dengan GitHub Actions services (postgres + redis)
- [x] **A3-2/A3-3**: `curl /metrics` → output Prometheus (bukan 501) + default metrics ada ✅
- [x] **B1-5**: `docker compose up` di VM → semua service healthy ✅
- [ ] **B2-3**: Push ke main → image ter-build dan ter-push ke GHCR
- [x] **B4-5**: Test restart service backend → worker tetap berjalan ✅
- [x] **D1-1/D1-2/D1-3**: Uptime Kuma aktif + monitor /health/ready + notifikasi Discord ✅ (Sesi 30 Lanjutan 6: 4 monitor + Discord binding)
- [ ] **D2-4**: Verifikasi DSN backend aktif di Sentry dashboard
- [x] **E1-4**: Security headers (X-Frame-Options, HSTS) di nginx.conf ✅
- [ ] **E2-1**: Cek Supabase daily backup di dashboard
- [ ] **E2-4**: Set R2 lifecycle rule: retensi 30 hari
- [ ] **E2-5**: Test restore backup ke database dev → `pg_restore` + verifikasi data

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
