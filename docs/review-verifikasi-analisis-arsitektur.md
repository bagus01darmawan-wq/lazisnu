# Laporan Verifikasi: Tinjauan Ulang Dokumen Analisis Arsitektur & Infrastruktur

> Tanggal verifikasi: 2026-07-21
> Dokumen yang ditinjau: `docs/analisis-arsitektur-infrastruktur-lazisnu-gabungan.md`
> Metode: Setiap klaim faktual di dokumen diverifikasi langsung terhadap kodebase (file path + nomor baris + isi kode aktual).

---

## 1. Kesimpulan Umum

**Dokumen analisis SANGAT AKURAT — namun PERLU PERBAIKAN pada sejumlah poin.**

Dari seluruh klaim yang diverifikasi:

| Kategori | Jumlah |
|----------|--------|
| ✅ Klaim akurat penuh (termasuk nomor baris yang presisi) | Mayoritas (~85%) |
| ⚠️ Klaim sebagian benar / perlu koreksi kecil | 8 poin |
| ❌ Klaim keliru / perlu perbaikan | 4 poin |
| 🆕 Temuan penting yang TIDAK ada di dokumen | 3 poin |

Referensi baris di dokumen (misal `index.ts:6,20-22,33`, `app.ts:35`, `app.ts:58`, `middleware/auth.ts:12`, `tokenService.ts:32`, `database.ts:12`, `metrics.ts:30-37`, `api.ts:42`) **semua terverifikasi tepat** — kualitas sitasi dokumen ini sangat baik.

---

## 2. Klaim yang Terverifikasi Akurat (Ringkasan)

Berikut klaim-klaim kunci yang **100% sesuai** dengan kodebase:

### Backend
- ✅ Scheduler worker dinonaktifkan di `index.ts` baris 6, 20-22, 33 (dikomen persis seperti diklaim)
- ✅ Middleware stack: Correlation ID → CORS → JWT → Rate limit (100/min) → Audit logger → Error handler
- ✅ CORS `origin: true` tepat di `app.ts:35`
- ✅ Swagger gate di `app.ts:58`
- ✅ WhatsApp worker: queue `whatsapp-notifications`, rate 2 msg/s, dedup `jobId: collection-{id}`, attempts 3, backoff exponential 5000ms, `removeOnComplete: true`, `removeOnFail: false` — semua parameter cocok
- ✅ Tepat 20 file service di `apps/backend/src/services/` — daftar di dokumen cocok 20-untuk-20
- ✅ Tepat 4 file middleware (auth, audit-logger, correlationId, ownership)
- ✅ Semua versi dependency: Fastify 4.27, TS 5.4.5, drizzle-orm 0.45.2, drizzle-kit 0.31.10, ioredis 5, BullMQ 5.74, @fastify/jwt 8, firebase-admin 13.8
- ✅ `/metrics` return 501 di `routes/metrics.ts:30-37` karena `prom-client` tidak terinstall
- ✅ Rate limit 100/menit di `app.ts:44-46`

### Database & Auth
- ✅ Struktur tabel `collections` (semua kolom + unique constraint `assignment_id, can_id, submit_sequence`)
- ✅ `immutable-rule.sql` ada (RULE disable DELETE + disable UPDATE nominal)
- ✅ Enum `user_role` DB: 4 nilai (ADMIN_KECAMATAN, ADMIN_RANTING, BENDAHARA, PETUGAS)
- ✅ Inkonsistensi role di `middleware/auth.ts:12` (ADMIN_PUSAT, ADMIN_KABUPATEN tidak ada di enum DB) — tepat barisnya
- ✅ 3 entry journal migrasi (0000–0002) + tepat 5 file SQL legacy di luar journal
- ✅ `database.ts:12` pool `max: 10`
- ✅ `tokenService.ts:32` return `'redis-unavailable'` (fail-open refresh) — tepat barisnya
- ✅ Lockout login 10x gagal via Redis, access token 15m, refresh 7d, JTI UUID
- ✅ Sentry opsional (lazy `require` + try/catch), sampling 0.1 (10%)
- ✅ Idempotency sync via `offline_id` → `ALREADY_SYNCED`
- ✅ `sync_queues` = dead schema (hanya dipakai di schema.ts & migrasi, tidak ada di kode aplikasi)

### Mobile
- ✅ 8 screen sesuai daftar; offline queue MMKV: key `collection_queue_{userId}`, `collection_queue_failed_{userId}`, `offline_queue_schema_version_{userId}`
- ✅ Schema version v2 (`queue.ts:16`), max 3 retries (`sync.ts:32`), backoff `2^(retry_attempts-1) * 1000` ms (`queue.ts:122`)
- ✅ URL API hardcoded di `api.ts:42` (`https://api.lazisnu.app`)
- ✅ Versi: RN 0.74.1, MMKV 2, Zustand 4, netinfo, camera-kit, keychain, Firebase Crashlytics — semua cocok
- ✅ Nama package `lazisnu-collector-app`

### Web
- ✅ Struktur folder lengkap (9 sub-route dashboard semua ada)
- ✅ Versi: Next 16.2.4, React 19.2.4, Tailwind v4, Zustand 5, SWR 2, TanStack Table, Recharts, RHF, Sentry — semua cocok
- ✅ `middleware.ts` pakai `jose` JWT verify + role-based guard per route

### Shared & Infra
- ✅ `shared-types/src/index.ts` satu file ~12KB (aktual: 12.233 bytes, 434 baris), semua enum/type yang disebut ada
- ✅ Root: `pnpm@10.33.2`, node >=18, script `build:shared` / `build:all`
- ✅ Tidak ada Dockerfile / docker-compose di seluruh repo
- ✅ CI (`.github/workflows/ci.yml`) hanya lint + typecheck — satu-satunya workflow
- ✅ **Tepat 28 test files** (19 backend + 9 mobile; web 0) — tidak dijalankan di CI
- ✅ Script `test:unit`, `test:integration`, `test:all` ada di backend
- ✅ Tidak ada IaC (Terraform/Ansible), tidak ada `docs/DEPLOYMENT.md`
- ✅ Tidak ada script/konfigurasi backup database di manapun
- ✅ `.env` backend & web ada lokal dan tercakup `.gitignore`
- ✅ Health check `/health/live` + `/health/ready` (cek DB `SELECT 1` + Redis `ping`)
- ✅ R2 pakai AWS SDK v3 (`@aws-sdk/client-s3`)
- ✅ WA provider switch Fonnte / Meta Graph API di `whatsapp.ts`

---

## 3. ❌ Klaim yang KELIRU — Wajib Diperbaiki

### 3.1 [PENTING] Mobile memakai `fetch`, bukan Axios
- **Dokumen (Bab 10):** "`api.ts` # Axios client (⚠️ hardcode https://api.lazisnu.app/v1)"
- **Fakta:** `apps/mobile/src/services/api.ts` memakai **fetch** (baris 118, 163, 178, 419). Tidak ada import axios; axios tidak ada di `apps/mobile/package.json`.
- **Catatan:** Diagram Bab 3 dokumen sudah benar ("fetch + MMKV offline") — jadi dokumen **tidak konsisten dengan dirinya sendiri**. Axios dipakai di **web** (`apps/web`), kemungkinan sumber kekeliruan.
- **Perbaikan:** Bab 10 ganti "Axios client" → "fetch-based client".

### 3.2 [PENTING] "Offline batch hanya mendukung metode CASH" — sudah usang
- **Dokumen (Bab 7.1):** "Offline batch hanya mendukung metode `CASH`."
- **Fakta:** Kolom `payment_method` sudah **dihapus total** dari database (migrasi `0002_great_virginia_dare.sql` L23 `DROP COLUMN "payment_method"` dan `0004_remove_payment_method.sql` menghapus kolom + enum type). `BatchCollectionItem` tidak punya field method sama sekali; schema validasi batch memakai `.strict()` dan **aktif menolak** `payment_method` (test: `routes/mobile/__tests__/schemas.test.ts` L179-188).
- **Perbaikan:** Hapus/ganti kalimat tersebut menjadi: "Field payment_method telah dihapus dari skema; koleksi bersifat tunai secara implisit."

### 3.3 Diagram ER: tidak ada tabel `qrCode`
- **Dokumen (Bab 6.1):** `cans ──(1) qrCode` (tersirat tabel terpisah)
- **Fakta:** Tidak ada tabel `qr_codes` di `schema.ts`. Yang ada hanya **kolom** `qr_code` (varchar, unique) pada tabel `cans` (`schema.ts:73`).
- **Perbaikan:** Ubah diagram ER: `cans.qr_code` sebagai kolom, bukan relasi ke tabel.

### 3.4 Komentar pool koneksi menyebut PgBouncer, bukan Supabase pooler
- **Dokumen (Bab 6.5):** "Comment di `database.ts:10` menyebut 'Transaction pool mode' (Supabase pooler `pooler.supabase.com`)"
- **Fakta:** Komentar aktual di `database.ts:10-11`: *"Disable prefetch as it is not supported for "Transaction" pool mode if using **PgBouncer** / But we use direct connection usually here."* — tidak ada penyebutan Supabase pooler; justru menyatakan biasanya koneksi **langsung**.
- **Perbaikan:** Koreksi kutipan komentar; sesuaikan pula narasi risiko PgBouncer/Supabase pooler di temuan #22.

---

## 4. ⚠️ Klaim Sebagian Benar — Perlu Penyesuaian

### 4.1 Jumlah sub-route admin: 8, bukan 10
- **Dokumen (Bab 5.1/5.3):** "/v1/admin/* (10 sub-route)"
- **Fakta:** Folder `routes/admin/` berisi 11 file, tapi `routes/admin/index.ts:18-25` hanya mendaftarkan **8 sub-route** (dukuhs, dashboard, cans, officers, assignments, district, wa, audit). `schemas.ts` bukan route (validasi), dan **`collections.ts` ada tapi tidak pernah didaftarkan** (dead route file — ini temuan tersendiri).

### 4.2 Klaim cookie auth "HttpOnly" hanya berlaku untuk refresh token
- **Dokumen (Bab 7.3):** "cookies: lazisnu_token + lazisnu_refresh_token (HttpOnly)"
- **Fakta:** `app/api/auth/login/route.ts:40-56` — `lazisnu_refresh_token` memang `httpOnly: true`, tetapi `lazisnu_token` **sengaja non-HttpOnly** (komentar kode: "non-HttpOnly for client Axios and middleware"). Ini keputusan desain, tapi dokumen harus menyatakannya eksplisit karena punya implikasi keamanan (XSS dapat membaca access token).

### 4.3 JTI refresh diverifikasi ke Redis, bukan ke `user_sessions`
- **Dokumen (Bab 7.3):** "verify refreshToken (JTI check di user_sessions)"
- **Fakta:** `routes/auth.ts:443-451` memverifikasi JTI via **Redis** (`validateRefreshJti` → key `refresh:{jti}`). Tabel `user_sessions` **ditulis** saat login/refresh (`sessionService.ts`) tetapi **tidak dibaca** saat validasi refresh. Narasi "Session registry: Redis + PostgreSQL" di dokumen sudah benar; hanya frasa alur ini yang perlu diluruskan.

### 4.4 Swagger juga nonaktif di `test`, bukan hanya `production`
- **Dokumen:** "Swagger `/docs` hanya aktif di non-production" / temuan #27
- **Fakta:** `app.ts:58`: `if (config.NODE_ENV !== 'production' && config.NODE_ENV !== 'test')` — juga dinonaktifkan di `test`. Dampak kecil, tapi perlu presisi.

### 4.5 bcrypt sebenarnya bcryptjs
- **Dokumen (Bab 7.3):** "bcrypt verify"
- **Fakta:** `routes/auth.ts:4` mengimpor `bcryptjs` (implementasi JS murni, lebih lambat dari native bcrypt pada cost factor tinggi). Relevan untuk catatan keamanan/performa.

### 4.6 Struktur mobile tidak lengkap (omisi, bukan kesalahan)
- Folder/file berikut ada tapi tidak disebut di Bab 10: `components/ui/` (9 file), `config/crashlytics.ts`, `utils/` (error.ts, device.ts), `services/secureKey.ts`, `services/qrImageScanner.ts`, `services/offline/tasks.ts`. Stores aktual: 6 store (auth, collection, dashboard, officer, sync, tasks).

### 4.7 `packages/design-tokens` hanya kerangka kosong
- **Dokumen (Bab 3):** mencantumkan `design-tokens` sebagai package
- **Fakta:** Direktori ada tetapi hanya berisi subfolder kosong `proposals/` — tanpa `package.json`, tanpa source, tidak direferensikan workspace. Dokumen sebaiknya menandai "(skeleton/belum diimplementasi)".

### 4.8 Web: `zod` berada di devDependencies
- Detail kecil: `zod ^3.23.8` di `apps/web/package.json` ada di **devDependencies** (L46), padahal dipakai untuk validasi form runtime — potensi masalah saat build production yang mem-prune devDependencies.

---

## 5. 🆕 Temuan Penting yang BELUM Ada di Dokumen

### 5.1 [P1 — Keamanan] Guard `/v1/scheduler` fail-open jika `INTERNAL_API_KEY` tidak diset
- `routes/scheduler.ts:23`: `if (config.INTERNAL_API_KEY && apiKey !== config.INTERNAL_API_KEY)` — jika env `INTERNAL_API_KEY` kosong, kondisi short-circuit dan **semua request lolos tanpa autentikasi**. Endpoint trigger generate-assignments menjadi terbuka. Dokumen hanya menyebut "Auth: `x-internal-api-key`" tanpa menyoroti risiko ini.
- **Rekomendasi:** tambahkan sebagai temuan P1 baru; perbaiki dengan menolak request bila `INTERNAL_API_KEY` tidak terkonfigurasi.

### 5.2 [P1 — Fungsional] OTP "via WhatsApp" tidak benar-benar dikirim
- Dokumen (Bab 2 pilar, Bab 4 tech stack "OTP via WA", Bab 7.3 alur auth) menyiratkan OTP dikirim lewat WhatsApp.
- **Fakta:** `routes/auth.ts:260-263` — setelah generate OTP, kode hanya **menulis log** (`'OTP generated and sent to WhatsApp'`) dan merespons "OTP dikirim ke WhatsApp". Tidak ada pemanggilan `services/whatsapp.ts` untuk pengiriman OTP. Login mobile via OTP pada praktiknya tidak akan menerima OTP.
- **Rekomendasi:** tambahkan sebagai temuan P0/P1 (tergantung apakah fitur OTP sudah dipakai petugas di lapangan); koreksi narasi dokumen.

### 5.3 [P2 — Hygiene] Dead route file `routes/admin/collections.ts`
- File route admin untuk collections ada tetapi tidak pernah didaftarkan di `routes/admin/index.ts`. Dokumen mencatat dead schema (`sync_queues`) tapi melewatkan dead route ini.

### 5.4 [P3 — Hygiene] `packages/shared-types/package-lock.json`
- Ada `package-lock.json` (npm) di dalam package shared-types pada monorepo pnpm — inkonsistensi tooling minor.

---

## 6. Penilaian per Bab Dokumen

| Bab | Topik | Status |
|-----|-------|--------|
| 1–2 | Ringkasan & pilar bisnis | ✅ Sesuai (catatan: pilar "OTP via WA" lihat §5.2) |
| 3 | Struktur monorepo | ⚠️ Perlu catatan: design-tokens kosong (§4.7) |
| 4 | Tech stack | ✅ Semua versi terverifikasi tepat |
| 5 | Arsitektur backend | ⚠️ "10 sub-route" → 8 (§4.1) |
| 6 | Model data | ⚠️ Diagram qrCode (§3.3), komentar pooler (§3.4) |
| 7 | Alur data | ⚠️ CASH-only usang (§3.2), cookie HttpOnly (§4.2), JTI check (§4.3), bcryptjs (§4.5) |
| 8 | Scheduler dinonaktifkan | ✅ Persis, termasuk nomor baris |
| 9 | Web dashboard | ✅ Sesuai |
| 10 | Mobile | ❌ "Axios" → fetch (§3.1); struktur kurang lengkap (§4.6) |
| 11 | Shared-types | ✅ Sesuai (ukuran ~12KB tepat) |
| 12 | Kekuatan arsitektur | ✅ Sesuai |
| 13 | Temuan infrastruktur P0–P3 | ✅ Semua bukti kode terverifikasi; perlu tambah §5.1 & §5.2 |
| 14–16 | Rekomendasi & roadmap | ✅ Masih valid |
| 17–18 | Learning checkpoint & appendix | ✅ Perintah test terverifikasi ada |

---

## 7. Rekomendasi Tindakan

1. **Perbaiki 4 klaim keliru** (§3.1–§3.4) — terutama Axios→fetch dan penghapusan `payment_method`, karena keduanya menyesatkan pembaca tentang keadaan aktual.
2. **Tambahkan 2 temuan keamanan/fungsional baru** (§5.1 scheduler fail-open, §5.2 OTP tidak terkirim) ke daftar P0/P1 dokumen — keduanya lebih mendesak daripada beberapa item yang sudah tercatat.
3. **Luruskan 8 klaim parsial** (§4) untuk presisi.
4. Setelah diperbaiki, dokumen ini layak dijadikan baseline arsitektur resmi — kualitas sitasi baris-kodenya sudah sangat baik.

---

*Laporan ini dihasilkan dengan verifikasi langsung terhadap kodebase pada 2026-07-21. Semua nomor baris merujuk ke state kode saat verifikasi.*
