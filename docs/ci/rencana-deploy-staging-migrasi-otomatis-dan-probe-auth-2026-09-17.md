# Rencana — Otomasi Migrasi DB & Probe Auth di Deploy Staging

**Tanggal disusun:** 17 September 2026
**Status:** ⏳ MENUNGGU PERSSETUJUAN — belum ada satu baris kode pun yang diubah
**Cakupan:** 2 pekerjaan — (A) migrasi database otomatis saat deploy staging,
(B) probe autentikasi fungsional sebagai smoke test deploy staging
**Yang TIDAK disentuh:** jalur deploy produksi (`ci.yml` job `deploy` +
`scripts/deploy-blue-green.sh`) — sudah berjalan baik, dilarang diubah di rencana ini.

---

## 0. Koreksi penilaian sebelumnya (harus terbaca dulu)

Penilaian CI/CD 2026-09-17 menyebut "migrasi database tidak ada di jalur
deploy otomatis" sebagai celah utama. Setelah bedah ulang file aktual,
penilaian itu **hanya benar sebagian**:

| Environment | Faktanya sekarang | Sumber |
|---|---|---|
| **Produksi** | ✅ Migrasi OTOMATIS — `run_migrations()` di `scripts/deploy-blue-green.sh:251` menjalankan `migrate-cli.js` dari image backend baru memakai `apps/backend/.env`; gagal → `exit 1` → deploy berhenti | `deploy-blue-green.sh:244-265`, `apps/backend/src/database/migrate-cli.ts` |
| **Staging** | ❌ TIDAK ada langkah migrasi sama sekali di job `deploy-staging` (`ci.yml:721-780`) — hanya `git reset`, `docker pull`, `compose up`, curl health | `ci.yml` §deploy-staging |

Audit `audit-cicd-2026-08-31.md` (temuan #4) sudah usang untuk produksi,
masih akurat untuk staging. Jadi rencana ini **hanya menutup gap staging** —
bukan membangun mekanisme baru, melainkan **menirukan pola yang sudah
terbukti di produksi** ke jalur staging.

Koreksi kedua (lebih kecil): penilaian sebelumnya menyebut tag image
`:latest` yang dibangun dari push staging sebagai "jebakan". Setelah dicek,
itu **by design** — `docker-compose.staging.yml:36` memang mengonsumsi
`backend:latest`, dan produksi aman karena selalu pakai tag nomor commit.
Poin itu ditarik; tidak ada perubahan tag.

---

## A. Migrasi database otomatis di deploy staging

### A.1 Desain

Menambahkan satu blok di job `deploy-staging` (`ci.yml`), posisinya **tepat
setelah `docker pull`, sebelum `docker compose up`**:

```yaml
# ─── Migrasi database staging (skema dulu, kode baru kemudian) ────────────
# Menirukan run_migrations() di scripts/deploy-blue-green.sh (produksi).
# migrate-cli.js idempotent — drizzle mencatat di __drizzle_migrations,
# migrasi yang sudah jalan tidak diulang. Gagal → exit 1 → deploy berhenti
# SEBELUM container lama dimatikan (staging masih jalan versi lama).
if [ "${SKIP_DB_MIGRATE:-0}" != "1" ]; then
  echo "▶ Menjalankan migrasi DB staging dari image backend:latest ..."
  docker run --rm \
    --env-file apps/backend/.env.staging \
    -e NODE_ENV=production \
    ghcr.io/$GHCR_REPO/backend:latest \
    node apps/backend/dist/database/migrate-cli.js
  echo "✅ Migrasi DB staging selesai"
else
  echo "⏭️ SKIP_DB_MIGRATE=1 — migrasi dilewati (escape hatch)"
fi
```

Kenapa posisi ini yang benar:

1. **Setelah `docker pull`** — image yang dijalankan migrate-cli sudah
   memuat folder `migrations/` paling baru (dari commit yang di-deploy).
2. **Sebelum `compose up`** — urutan "skema dulu, kode baru kemudian".
   Container staging baru yang menyala dijamin menemukan skema yang ia harap.
3. **Fail-closed konsisten dengan produksi** — `migrate-cli.ts` keluar kode 1
   bila gagal, dan karena `compose up` belum jalan, **staging tetap hidup
   di versi lama** saat migrasi gagal. Tidak ada jendela downtime.

Catatan teknis yang meniru produksi: `drizzle-kit` adalah devDependency dan
TIDAK ada di image — karena itu memakai migrator bawaan `drizzle-orm`
melalui `dist/database/migrate-cli.js` (sudah ada, tidak perlu file baru).
`migrate-cli.ts:35` memakai `DIRECT_URL || DATABASE_URL` (konek langsung,
bukan pooler Supavisor — syarat migrator Drizzle).

### A.2 Escape hatch

`SKIP_DB_MIGRATE=1` di-set dari input `workflow_dispatch` baru
(`skip_db_migrate`, default `false`) di ci.yml. Dipakai saat migrasi
destruktif harus lewat jendela maintenance manual (pola 0007) — deploy
reguler tetap bisa berjalan tanpa menyentuh DB.

### A.3 Batasan & konvensi yang dicantumkan

- Migrasi otomatis ini aman untuk migrasi **additive** (tambah kolom/tabel,
  ubah index). Untuk migrasi **destruktif** (drop kolom, ubah tipe enum) —
  konvensi tetap: dry-run dulu + jendela maintenance + `SKIP_DB_MIGRATE=1`
  (di produksi sudah ada SOP-nya: `docs/ci/PROSEDUR-MAINTENANCE-HAPUS-POSTPONED-2026-09-16.md`).
- Prasyarat verifikasi sekali di awal: pastikan `apps/backend/.env.staging`
  di VM memuat `DIRECT_URL` atau `DATABASE_URL` (cek: `docker exec
  lazisnu-backend-staging-1 env | grep -E 'DIRECT_URL|DATABASE_URL'`).

---

## B. Probe autentikasi fungsional di deploy staging

### B.1 Masalah yang diselesaikan

Smoke test staging saat ini hanya `curl /health` + halaman depan — mengetes
"apakah hidup", bukan "apakah bekerja". Bukti dampaknya: bug "sesi keluar
sendiri" (perbaikan 2026-09-17, commit `cb86351`) **tidak akan pernah
tertangkap** oleh smoke test itu. Senjata untuk mengetesnya sudah ada:
`scripts/auth-probe.sh` (canary login → me → prefetch RSC → refresh → me)
yang kini hanya dipakai manual/cron di produksi.

### B.2 Desain

Menambahkan satu blok di `deploy-staging` setelah smoke test
"✅ Staging healthy" yang sekarang:

```bash
# ─── Probe autentikasi fungsional (versi cepat) ───────────────────────────
# Menjalankan siklus nyata: login → /auth/me → prefetch RSC middleware
# → refresh → /auth/me. Exit 1 di tahap mana pun = deploy GAGAL.
# Env file terpisah dari probe produksi (kredensial & URL staging sendiri).
if [ "${SKIP_AUTH_PROBE:-0}" != "1" ]; then
  echo "▶ Menjalankan probe autentikasi staging ..."
  AUTH_PROBE_ENV_FILE=/opt/lazisnu/secrets/env.auth-probe.staging \
    bash scripts/auth-probe.sh \
    && echo "✅ Probe auth lolos — alur login/refresh tertahap nyata sehat" \
    || { echo "❌ Probe auth GAGAL — fitur autentikasi tidak sehat"; exit 1; }
else
  echo "⏭️ SKIP_AUTH_PROBE=1 — probe dilewati (escape hatch)"
fi
```

Konfigurasi env file staging (`/opt/lazisnu/secrets/env.auth-probe.staging`,
root, chmod 600 — pola sama dengan env file probe produksi):

| Variabel | Nilai | Kenapa |
|---|---|---|
| `BACKEND_URL` | `https://staging-api.lazisnu.site` | target staging |
| `DASHBOARD_URL` | `https://staging.lazisnu.site` | target web staging |
| `TEST_EMAIL` / `TEST_PASSWORD` | akun uji khusus **DB staging** | dilarang memakai akun produksi |
| `REFRESH_WAIT_SECONDS` | `0` | **versi cepat** — default 960s (menunggu 16 menit) tidak layak di jalur deploy; script sudah toleran terhadap token yang belum expire (`ME2_STILL_VALID`) dan tetap menguji refresh |
| `PROBE_DEVICE_ID` | `auth-probe-staging` | beda dari device probe produksi agar tidak saling tabrak di UI daftar perangkat |
| `AUTH_PROBE_LOG_FILE` | `/opt/lazisnu/auth-probe/auth-probe-staging.log` | log terpisah — **nama variabel harus `AUTH_PROBE_LOG_FILE`**; script mengabaikan `LOG_FILE` (temuan saat eksekusi 2026-09-18: tanpa koreksi ini probe staging menulis ke log probe produksi) |
| `AUTH_PROBE_STATE_FILE` | `/opt/lazisnu/auth-probe/.auth-probe-staging-alert` | state dedup terpisah — **nama variabel harus `AUTH_PROBE_STATE_FILE`**; memakai state produksi akan mengacaukan dedup alert produksi |
| `ALERT_WEBHOOK_URL` | *(kosong)* | deploy gagal sudah cukup terlihat di job CI merah; alert Discord tetap dari monitor uptime. Bisa diisi belakangan kalau mau |

Profil kegagalan yang kini otomatis tertangkap di staging (semuanya lewat
exit 1 → job merah):

`login_http_*` · `login_response_missing_tokens` · `me_http_*` ·
`prefetch_redirect_*` (middleware web salah arah) · `refresh_http_*`
(inkl. REFRESH_REVOKED yang dulu menjadi bug F0) ·
`refresh_response_missing_access_token` · `me_after_refresh_http_*`

**Penyesuaian eksekusi — mode bootstrap:** implementasi menambahkan satu
kondisi lebih dari desain awal §B.2 — bila
`/opt/lazisnu/secrets/env.auth-probe.staging` **belum ada** di VM, probe
dilewati dengan peringatan `⚠️` (bukan gagal). Alasannya: wiring tidak boleh
menahbakkan deploy berikutnya selama prasyarat §B.3 (akun uji + secret)
belum selesai. Begitu secret terpasang, kondisi bootstrap tidak pernah
terpicu lagi dan probe berjalan fail-closed penuh — tanpa perubahan kode
tambahan. Kedua perilaku tercatat jelas di log deploy.


### B.3 Prasyarat manual di VM (sekali saja)

1. **Buat akun uji di DB staging** (Supabase project staging):
   role **ADMIN_KECAMATAN** — penting: harus role admin, bukan PETUGAS,
   karena tahap prefetch probe menyentuh `/dashboard/reports` yang oleh
   middleware ditolak untuk PETUGAS (`middleware.ts` §reports).
2. **Buat file secret** `env.auth-probe.staging` sesuai tabel §B.2, chmod 600.
3. **Uji manual sekali** sebelum di-wiring: `sudo -H bash
   scripts/auth-probe.sh` dengan env file itu → harus `SUCCESS` di log.

### B.4 Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Akun uji terkunci (login 10x gagal → lockout 1 jam) | Kredensial disimpan di secret file, bukan diketik; uji manual §B.3 sebelum wiring |
| Rate limit login 5/menit | Probe hanya 1x login per deploy — aman |
| Probe gagal mem-blokir deploy mendesak | `SKIP_AUTH_PROBE=1` via input dispatch |
| Setiap push staging menambah 1 sesi device | TTL refresh 365d, daftar perangkat tumbuh — device probe mudah dikenali & bisa dicabut; dapat dibersihkan berkala |

---

## C. Ringkasan perubahan file

| File | Perubahan |
|---|---|
| `.github/workflows/ci.yml` (§deploy-staging) | + blok migrasi (§A.1), + blok probe (§B.2), + input dispatch `skip_db_migrate` & `skip_auth_probe`, env `SKIP_DB_MIGRATE`/`SKIP_AUTH_PROBE` |
| (tidak ada) | Migrasi produksi: **tidak disentuh** — sudah otomatis |
| (tidak ada) | `scripts/auth-probe.sh`: **tidak diubah** — dipakai apa adanya, hanya env file berbeda |

Perubahan kode CI bisa dikerjakan dalam 1 commit kecil. Setelah itu prasyarat
§B.3 dikerjakan di VM, lalu verifikasi.

## D. Kriteria selesai (gate)

1. **Migrasi:** commit dummy yang mengubah schema → push staging → log job
   memuat "✅ Migrasi DB staging selesai" → `__drizzle_migrations` DB staging
   bertambah → health OK.
2. **Probe:** deploy berikutnya memuat `LOGIN_OK … REFRESH_OK … SUCCESS`.
3. **Uji negatif (sekali):** dengan `SKIP_AUTH_PROBE` tidak diset, sengaja
   salah env password → job deploy merah di tahap probe, staging tetap jalan
   (fail tidak merusak environment).
4. **Escape hatch:** deploy dengan kedua input skip → kedua blok ter-skip,
   perilaku identik dengan hari ini.

## E. Estimasi

| Item | Waktu |
|---|---|
| Edit ci.yml + commit + push | ~15 menit |
| Prasyarat VM (akun uji + secret file) | ~30 menit |
| Verifikasi (positif + negatif + escape hatch) | ~30 menit |
| **Total** | **~1,5 jam** |


## F. Temuan saat eksekusi (2026-09-18) & tindak lanjut

| # | Temuan | Status |
|---|---|---|
| 1 | **Nama variabel env probe:** script membaca `AUTH_PROBE_LOG_FILE` / `AUTH_PROBE_STATE_FILE`, bukan `LOG_FILE` / `STATE_FILE`. Versi awal secret staging memakai nama yang salah → probe staging menulis ke log & state **milik probe produksi** | ✅ Diperbaiki di VM 2026-09-18 (secret ditulis ulang, probe diuji ulang `SUCCESS`, log staging kini terpisah: `auth-probe-staging.log`) |
| 2 | **Header komentar `scripts/auth-probe.sh` menyesatkan** — baris 11-13 menyebut `LOG_FILE, STATE_FILE`, padahal kode memakai `AUTH_PROBE_LOG_FILE`, `AUTH_PROBE_STATE_FILE` | ⏳ Tindak lanjut: perbaiki komentar header (docs-only, tanpa perubahan perilaku) |
| 3 | **`bcryptjs` tidak bisa dipanggil via `docker run … node -e`** dari image backend (`require.resolve` gagal) | ✅ Diketahui jalur yang bekerja: `docker exec -e P=… -w /app/apps/backend <container-backend-staging> node -e "…"` — dipakai untuk membuat hash akun uji |
| 4 | **Akun uji staging dibuat**: `probe-staging@lazisnu.test`, role `ADMIN_KECAMATAN`, is_active true, tanpa branch/district (keduanya nullable) | ✅ Kata sandi acak dibuat di VM, hanya tersimpan di `/opt/lazisnu/secrets/env.auth-probe.staging` (root, 600) — tidak pernah dicetak/di-log |
| 5 | **Log probe produksi sempat memuat baris probe staging** (efek temuan #1, sebelum perbaikan) | ℹ️ Kosmetik — tidak mempengaruhi alert; tidak ada state alert produksi aktif saat diperiksa |
| 6 | **Deploy staging pertama** (merge PR #108) membuktikan blok migrasi bekerja: `▶ Migrasi DB staging … ✅ Migrasi selesai — skema sudah mutakhir` (~2 detik), lalu `✅ Staging healthy`, probe ter-skip dengan pesan bootstrap | ✅ Terverifikasi di run 35338486445 |

## G. Status akhir prasyarat §B.3

| Prasyarat | Status |
|---|---|
| Akun uji di DB staging (ADMIN_KECAMATAN) | ✅ dibuat 2026-09-18 |
| Secret file `/opt/lazisnu/secrets/env.auth-probe.staging` (root, 600) | ✅ dibuat 2026-09-18, nama variabel sudah dikoreksi |
| Uji manual probe sebelum wiring | ✅ `SUCCESS` (LOGIN_OK → ME_OK → PREFETCH_OK 200 → REFRESH_OK → ME_AFTER_REFRESH_OK) |

