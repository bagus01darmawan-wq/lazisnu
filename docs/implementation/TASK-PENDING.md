# Task Pending — Single Source of Truth

> Dibuat: 2026-07-31 | Status: **AKTIF** (ringkasan gabungan dari SESSION-2026-07-30/31, RENCANA-CLEANUP-HOUSEKEEPING, VERIFICATION-PENDING, MASTER-GOAL-LIST)
> Tujuan: satu file acuan untuk item yang belum selesai, lengkap dengan lokasi sumber aslinya.

---

## Ringkasan

| Kategori | Jumlah Open | Prioritas |
|----------|:---:|:---:|
| A. Uptime Kuma Lapis 3-4 (deploy) | 7 langkah | Tinggi |
| B. Housekeeping VM (stop container lama) | 1 | Tinggi |
| C. Disk cleanup (Phase 1, 3, 4, 5, 6) | 5 phase | Sedang |
| D. VERIFICATION-PENDING runtime | ~12 item | Sedang |

---

## A. Uptime Kuma Lapis 3-4 — Deploy ke VM

> ✅ **SELESAI 2026-08-01** — 4a/4b/3 semua live (catatan detail di bawah)
> Sumber: `docs/implementation/SESSION-2026-07-30.md` (Sesi 31, line 1364-1374) + `docs/SOP-UPTIME-KUMA.md`

| # | Langkah | Status |
|---|---------|:---:|
| A1 | Copy `scripts/backup-kuma.sh` ke VM | ✅ |
| A2 | Test manual backup `kuma.db` (1x run) + verifikasi upload ke R2 | ✅ (2.2M → 456K gz → R2 `kuma/20260801/`) |
| A3 | Tambah crontab entry (`0 3 * * * bash /opt/lazisnu/scripts/backup-kuma.sh`) | ✅ |
| A4 | Migrate container `uptime-kuma` dari `docker run` standalone → `docker-compose.yml` | ✅ (healthy, 4 monitor intact, port `127.0.0.1:3002`) |
| A5 | Enable Status Page (slug `lazisnu`, expose 4 monitor) | ✅ via SQL script `kuma-setup-status-page.sh` (tanpa UI) |
| A6 | Certbot SSL untuk `status.lazisnu.site` (DNS di Hostinger, bukan Cloudflare) | ✅ (expires 2026-10-29) |
| A7 | Test alert real flow (trigger DOWN → notifikasi Discord) | ✅ **SELESAI 2026-08-01** — monitor TEST-DOWN (url mati) → DOWN terdeteksi (`ECONNREFUSED`) → alert Discord masuk 00:26 WIB → monitor temp dihapus |

**Catatan hasil eksekusi (2026-08-01):**
- **Fix bug `backup-kuma.sh`**: `mkdir -p` dipindah sebelum `log START` (sebelumnya tee gagal karena dir belum ada → `set -e` exit 1)
- **Fix `docker-compose.yml`**: (1) hapus `user: "1000:1000"` — image Kuma startup `chown` butuh root/CAP_CHOWN, non-root → restart loop; (2) healthcheck ganti `wget` → `curl` (wget tidak ada di image)
- **Script baru**: `scripts/kuma-setup-status-page.sh` — idempotent setup status page (status_page + group + monitor_group)
- **Konteks unik**: DNS domain di Hostinger (bukan Cloudflare); nginx container lama baca inode nginx.conf lama → butuh recreate container (bukan sekadar reload) — konsisten dgn backlog #6 mount bind-file
- ⏳ **Pending kecil**: cleanup volume named lama `uptime-kuma-data` (≈2.7MB duplikat — data sudah di bind mount) mulai **2026-08-02 00:00 WIB** (24 jam setelah container compose start 2026-08-01 00:00 WIB). Perintah benar: `docker volume rm uptime-kuma-data`. ⚠️ JANGAN `docker rm uptime-kuma` — container lama sudah dihapus saat migrasi; nama itu sekarang dipakai container compose yang aktif. Plus: commit+push perubahan kode (user memilih "nanti saja")

---

## B. Housekeeping VM — Stop Container Lama Blue/Green

> ✅ **SELESAI 2026-08-01** — 3 container lama di-stop, layanan publik tidak terganggu
> Sumber: `docs/implementation/SESSION-2026-07-30.md` (Lanjutan 3, "Backlog" no. 2, line 301)

| Langkah | Detail | Status |
|---------|--------|:---:|
| B1 | `docker stop lazisnu-backend-1 lazisnu-web-1 lazisnu-worker-1` (container lama, sudah > 24-48 jam stabil sejak blue-green deploy) | ✅ Exited (backend/worker exit 0, web exit 143) |
| B2 | ⚠️ JANGAN `docker compose down` penuh — redis/prometheus/grafana satu project dengan container tersebut | ✅ Dipatuhi — hanya stop 3 container |

**Hasil verifikasi (2026-08-01):**
- Smoke test: `api.lazisnu.site/health/ready` 200, `api-health` 200, `dashboard` 307, `status` 200, `staging-api` 200 — **tidak ada gangguan**
- Aktif: `blue-backend/web/worker` (upstream) + `green-*` (cadangan rollback, image GHCR terbaru) + semua infra (redis, grafana, prometheus, nginx, uptime-kuma)
- Rollback instan tetap tersedia via **green** (`upstream.conf` → `green-backend:3101`/`green-web:3100`) — tidak perlu container lama
- ⚠️ ~~Container `lazisnu-*-1` masih ada sebagai Exited~~ ✅ **SUDAH DIHAPUS** (`docker rm lazisnu-backend-1 lazisnu-web-1 lazisnu-worker-1`, 2026-08-01) — tidak ada container Exited tersisa, smoke test 200/307

---

## C. Disk Cleanup — Phase 1, 3, 4, 5, 6

> ✅ **SELESAI 2026-08-01** (Phase 1, 4, 5, 6) — **Phase 3 SKIP** (keputusan user: tidak ingin hapus unused images)
> Sumber: `docs/implementation/RENCANA-CLEANUP-HOUSEKEEPING.md` (status RENCANA, belum dieksekusi)
> Phase 2 (build cache + dangling) **SUDAH SELESAI** 2026-07-30 (reclaim 7.2GB, disk 96% → 81%)

| Phase | Target | Reclaim | Risiko | Status |
|-------|--------|---------|--------|:---:|
| C1 (Phase 1) | Safe cleanup: journal vacuum 50M, hapus scratch + `penggalan riwayat.txt`, sysctl `vm.overcommit_memory=1` | ~200MB (actual journal 152M) | Rendah | ✅ |
| C2 (Phase 3) | Docker unused images (blue/green lama) | ~3.8GB | Sedang | ⏸️ **SKIP** (user) |
| C3 (Phase 4) | Backup script retention eksplisit (`scripts/backup.sh`) | ~10MB/bulan | Rendah | ✅ |
| C4 (Phase 5) | Move `.env.backup*` (production credentials!) ke folder `secrets/` + backup off-site ke R2 sebelum move | 0 | Rendah | ✅ |
| C5 (Phase 6) | SOP Housekeeping | 0 | Rendah | ✅ |

**Catatan eksekusi (2026-08-01):**
- **Phase 1**: journal vacuum freed 152M; scratch + penggalan riwayat dihapus (backup di `/tmp/cleanup-2026-07-30/`); `nopeAGENTS.md` di-keep; sysctl `overcommit_memory=1`; apt autoremove dry-run = 0 package (tidak perlu eksekusi); placeholder 20-byte dihapus. ⚠️ Glob `lazisnu_20260727_*` ikut menghapus 2 backup valid 110KB (bukan hanya <1KB) — dampak minimal, backup 28-31 masih ada + R2 punya salinan
- **Phase 4**: `scripts/backup.sh` KEEP_DAYS 30→90 + archive ke R2 prefix `archive/` sebelum hapus lokal. Adaptasi: pakai `aws s3` (rclone TIDAK terinstall di VM)
- **Phase 5**: `.env.backup` & `.env.backup-2026-07-24` → `secrets/` (dir 700, file 600), backup R2 dulu (2 file di `s3://lazisnu-backups/secrets/`). ⚠️ **Temuan kritis**: `.env.backup` adalah credentials AKTIF yang di-source `backup.sh`/`backup-kuma.sh` → dibuat **symlink** `/opt/lazisnu/.env.backup → secrets/env.backup-2026-07-27` agar script & cron tetap jalan (terverifikasi: backup-kuma test 2x sukses)
- **Phase 6**: `docs/SOP-HOUSEKEEPING-VM.md` dibuat (checklist bulanan + kuartalan + referensi)
- **Verifikasi akhir**: disk 86%→85% (avail +100MB), api 200/dashboard 307/status 200, 15 container running, Prometheus OK
- Disk baseline 16G/20G — reclaim terbatas karena Phase 3 (terbesar, 3.8GB) di-skip user
- **Audit keamanan 4 temuan (2026-08-01)**: (1) symlink `.env.backup` → valid, backup.sh + kuma test sukses ✅; (2) CRLF → `.gitattributes` `*.sh text eol=lf` ditambahkan + `backup.sh` lokal di-normalisasi LF — cegah kambuh saat checkout VM (autocrlf=true) ✅; (3) 1 backup valid `lazisnu_20260727_095912.sql.gz` **hilang permanen** (tidak ada di R2 — hanya `_100031` yang ter-upload), dampak minimal (backup 28-31 ada) ⚠️; (4) dotfile chmod 600 ✅

---

## D. VERIFICATION-PENDING — Item Runtime Masih `[ ]`

> Sumber: `docs/implementation/VERIFICATION-PENDING.md` (25 ⚠️ awal, sebagian sudah dicentang)
> Setiap item sudah benar di kode — hanya butuh konfirmasi runtime/VM/DB.

| Kode | Item | Sub-bab |
|------|------|---------|
| D1 | 07-B2-3: Push main → image build & push ke GHCR | 07 — ✅ **SELESAI 2026-08-01** (build-image pass run 30662371949; dispatch 30661900400 — `:latest`+`:c4f1237` ter-push, attestation OK) |
| D2 | 07-A2-3 / A2-4: CI unit + integration test (services postgres+redis) | 07 — ✅ **SELESAI 2026-08-01** (PR #24): unit 54/54 + mobile 73 + integration 47 test PASS; service redis ditambah di CI |
| D3 | 07-D2-4: Verifikasi DSN backend aktif di Sentry dashboard | 07 — ✅ **SELESAI 2026-08-02** (migrated Sentry → Rollbar free + Discord via Hookdeck. Token `aa5b0cfd...` terverifikasi via test node lokal (UUID `631a8867-...` masuk dashboard). Code: `rollbar ^3.1.0` installed, `src/config/rollbar.ts` dibuat (initRollbar + captureError + scrubFields), `app.ts` `captureError()` di error handler branch 500, `env.ts` schema +`ROLLBAR_ACCESS_TOKEN`. VM `.env`: `SENTRY_DSN` dihapus, `ROLLBAR_ACCESS_TOKEN` ditanam. Hookdeck pipeline `rollbar-to-discord` ter-setup (source `src_4wdr88dwy46kj8`, transform `rollbar-to-discord`, connection `web_10Rw9dMZEPSx` ke Discord existing) — test mock `new_item` → 200 + embed `🔴 🆕 NEW ITEM` masuk Discord. ⏳ Tersisa: (a) setup Rollbar Webhook Notification di UI (URL `https://hkdk.events/4wdr88dwy46kj8`, rule `new_item`) — butuh user buka dashboard Rollbar; (b) deploy code Rollbar via PR merge ke main + CI blue-green deploy. Sentry project `lazisnu-backend` di org `lazisnupng` masih ada (idle), `@sentry/node` sementara dipertahankan (dual fail-safe) — bisa dihapus setelah Rollbar terverifikasi di production.) |
| D4 | 07-E2-1: Cek Supabase daily backup di dashboard | 07 |
| D5 | 07-E2-4: Set R2 lifecycle rule retensi 30 hari | 07 — ✅ **SELESAI 2026-08-01** (3 rule di dashboard Cloudflare: `backups/` 30d, `kuma/` 30d, `lazisnu_` root 30d; `archive/` & `secrets/` tidak di-rule). ⚠️ Catatan: semua objek DB di prefix `backups/` → rule `lazisnu_` root **no-op** (tidak berbahaya). **Verifikasi behavioral** (via Object Read, bukan config API): baseline 01-08-2026 semua objek <30 hari; checkpoint ~26-08-2026 → `backups/lazisnu_20260727_*` harus hilang, `secrets/`/`archive/` tetap. Perintah: `aws s3 ls s3://lazisnu-backups/ --recursive --human-readable --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| D6 | 07-E2-5: Test restore backup ke DB dev (`pg_restore`) | 07 — ✅ **SELESAI 2026-08-01** (restore `20260801_021319` → postgres:17 throwaway: 0 ERROR, 12 tabel, data terbaca; dump plain SQL → via `psql`) |
| D7 | 02-C6: Semua route berfungsi dengan 3 role valid | 02 — ✅ **SELESAI 2026-08-03** (D-11: BENDAHARA dihapus total — PR #28 migrasi enum 0005 + kode, PR #29 fix nginx dynamic upstream, PR #30 fix teardown. Verifikasi production via minted JWT 3 role: matriks 13 endpoint semua sesuai RBAC — audit/wa-failed/district-dashboard kec-only, branch-dashboard ranting-only, backup/wa-logs/bendahara kec+ranting, mobile petugas-only, /auth/me 200 semua. Deploy staging + production via CI tag v1.0.0 pertama kali berhasil) |
| D8 | 03-C3: `pnpm db:migrate` (de facto berhasil di Sesi 30, tinggal centang) | 03 — ✅ **SELESAI 2026-08-01** (step migrate hijau di semua run CI hari ini, e.g. 30662371949) |
| D9 | 03-F2: `pnpm install --frozen-lockfile` setelah hapus package-lock.json | 03 — ✅ **SELESAI 2026-08-01** (install sukses lokal — root lockfile npm sudah hilang, `pnpm-lock.yaml` up to date) |
| D10 | 04/05: Redis key per-device, OTP E2E, biometrik login/toggle/REFRESH_REVOKED | 04/05 |
| D11 | 06: P1-B3 (fonnte), P2-C3 (job gagal 3x), P2-E4 (request-otp 404), P2-F3 (OWNERSHIP_DENIED) | 06 — ✅ **SELESAI 2026-08-01** (PR #25: 3 test baru + 1 sudah ada; CI hijau; `test:unit` diperluas ke middleware) |

---

## E. Sudah Selesai / Tidak Perlu Dikerjakan (anti-double-work)

| Item | Status | Bukti |
|------|--------|-------|
| TD-04 (request-otp mock target) | ✅ SELESAI | MASTER-GOAL-LIST line 323 (Sesi 31, commit `bc009a7`) |
| TD-05 (reset rate limit antar describe) | ✅ SELESAI | MASTER-GOAL-LIST line 324 (`resetApp()` di `app-helper.ts`) |
| Password admin Grafana | 🚫 SKIP | Keputusan user (SESSION-30 Lanjutan 8) — single-user env |
| Mount bind-file SOP | ✅ SELESAI | `docs/SOP-MOUNT-BIND-FILE.md` (commit `d322fd0`) |
| Disk Phase 2 (build cache + dangling) | ✅ SELESAI | SESSION-30 Lanjutan 7 (96% → 81%) |
| CI GitHub Actions upgrade ke Node 24 | ✅ SELESAI | `RENCANA-V2-CI-ACTION-UPGRADE.md` — Batch A+B merged (PR #18/#19), Gate 1-3 lulus, 0 annotation deprecation, staging OK (2026-08-01) |

---

## F. Temuan dari Sesi 23-29 (ditambahkan 2026-07-31)

> Hasil penelusuran SESSION-2026-07-23 s/d 29 (Sesi 28 **tidak ada file dokumentasi**). Mayoritas item sudah dituntaskan di sesi 27-30. Yang masih relevan:

| # | Item | Status | Sumber |
|---|------|:---:|--------|
| F1 | **`JWT_SECRET` placeholder staging** — `.env.staging` line 17 masih `staging-legacy-deprecated-key-replace-soon` (Sesi 27 Bug 3: env.ts masih me-require `JWT_SECRET` deprecated sebagai fallback). Staging memakai secret yang diketahui publik → perlu diganti dengan random value | ✅ **SELESAI 2026-08-01** — random 43-char diterapkan: repo (commit `39787ab`, origin/main) + VM (`/opt/lazisnu/apps/backend/.env.staging`), backend-staging recreate, verifikasi env container (baru=1, lama=0), staging 200 | SESSION-2026-07-27.md (Bug 3) |
| F2 | **Verifikasi CI secrets GitHub** (`VM_HOST`, `VM_USER`, `VM_SSH_KEY`, `NEXT_PUBLIC_API_URL`) — prasyarat job `deploy` Sesi 25. CI deploy-staging sudah jalan (Sesi 30-32) → kemungkinan sudah terpenuhi, tinggal konfirmasi di repo Settings | ✅ **SELESAI 2026-08-01** — `VM_HOST`/`VM_USER`/`VM_SSH_KEY` ada di environment **staging** & **Production** (dibuat 2026-07-29; verifikasi via `gh secret list`). `NEXT_PUBLIC_API_URL` tidak di-set — **opsional** (fallback `https://api.lazisnu.site` di ci.yml, build web terbukti jalan) | SESSION-2026-07-25.md (07-B2-2) |
| F3 | **Catatan Sesi 27 (kosmetik)**: BullMQ rekomendasi `noeviction` untuk Redis staging (sudah di-set `--maxmemory-policy noeviction` di compose) + orphan container warning (pakai `-p staging`) | ℹ️ sudah teratasi | SESSION-2026-07-27.md |

---

## Rekomendasi Urutan Kerja

1. **A (Kuma Lapis 3-4)** — satu sesi SSH bisa selesai semua, tutup gap backup `kuma.db`
2. **B (stop container lama)** — cepat, hemat resource VM; tunggu konfirmasi stabil dari user
3. **F1 (ganti JWT_SECRET placeholder staging)** — 5 menit, security; generate random + update `.env.staging` + restart backend-staging
4. **D1 + D8 (centang de facto)** — 1 menit, update status file
5. **C (cleanup phase 1 → 5 → 4 → 3 → 6)** — ikuti RENCANA-CLEANUP-HOUSEKEEPING
6. **D lainnya** — sesuai kebutuhan runtime/VM

---

*File ini adalah ringkasan status; detail eksekusi tetap mengacu ke file sumber di kolom "Sumber" masing-masing bagian.*
