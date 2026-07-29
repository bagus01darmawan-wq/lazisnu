# Analisis Mendalam Kodebase Lazisnu

> Tanggal: 2026-07-21 | Metode: pembacaan langsung baris-per-baris terhadap ±30 file inti (bukan verifikasi dokumen, bukan delegasi)
> Dokumen ini adalah hasil analisis independen terhadap kodebase, sekaligus melengkapi `analisis-arsitektur-infrastruktur-lazisnu-gabungan.md` dan `review-verifikasi-analisis-arsitektur.md`.
>
> **Update 2026-07-21 (rev. 2):** Bab 11 ditambahkan — Rencana Implementasi Final (Sesi 1 Tahun + Login Biometrik) berdasarkan keputusan kebijakan produk. Status beberapa temuan disesuaikan (P0-2, P0-3, P2-11 → ditangani oleh Bab 11).

---

## 1. Ringkasan Eksekutif

Kodebase Lazisnu berada dalam kondisi **arsitektur inti yang solid tetapi dengan celah keamanan sesi yang serius dan satu fitur autentikasi yang tidak fungsional**.

Domain inti (immutable ledger koleksi, offline-first sync, RBAC, audit trail) diimplementasikan dengan kualitas tinggi — berlapis pertahanan (DB RULE + unique index + validasi service). Namun lapisan **manajemen sesi/token** memiliki 3 celah kritis: OTP tidak pernah dikirim, pencabutan sesi tidak mencabut refresh token, dan blacklist access token tidak pernah diperiksa.

| Prioritas | Jumlah | Tema |
|-----------|--------|------|
| 🔴 P0 — Kritis | 3 | Keamanan sesi & otentikasi |
| 🟠 P1 — Tinggi | 5 | Hardening konfigurasi & fitur setengah jadi |
| 🟡 P2 — Menengah | 9 | Konsistensi & kualitas kode |
| 🟢 P3 — Hygiene | 1 grup (4 item) | Dead code & housekeeping |

**Rekomendasi utama:** kerjakan P0 + quick-win P1 pada minggu pertama (semuanya perubahan kecil, ROI tinggi), disertai regression test per perbaikan.

---

## 2. Metodologi

File yang dibaca langsung (full atau sebagian besar) pada 2026-07-21:

**Backend:** `src/index.ts`, `src/app.ts`, `src/config/{env,database,redis,sentry}.ts`, `src/database/schema.ts`, `src/database/migrations/meta/_journal.json`, `src/middleware/{auth,ownership,audit-logger}.ts`, `src/routes/{auth,scheduler,bendahara}.ts`, `src/routes/admin/index.ts`, `src/services/{mobileSyncService,collectionSubmission,whatsapp,queues,tokenService,sessionService,otp}.ts`, `src/workers/{whatsapp.worker,scheduler.worker}.ts`

**Mobile:** `src/services/api.ts` (438 baris), `src/services/offline/{queue,sync}.ts`

**Web:** `src/middleware.ts`, `src/app/api/auth/login/route.ts`

**Root/CI:** `package.json`, `pnpm-workspace.yaml`, `.github/workflows/ci.yml`

Semua nomor baris dalam dokumen ini merujuk ke state kode saat analisis dilakukan.

---

## 3. Arsitektur Aktual (Hasil Baca Langsung)

### 3.1 Alur Autentikasi & Sesi

```
POST /v1/auth/login (rate limit 5/menit)
  → bcryptjs.compare (routes/auth.ts:94)
  → Redis lockout: 10x gagal → kunci 1 jam (auth.ts:98-108)
  → generateTokens: access (JWT_ACCESS_TTL, default 15m) + refresh (7d, jti UUID) (middleware/auth.ts:103-114)
  → storeRefreshJti → Redis key refresh:{jti} TTL 30 hari ⚠️ (auth.ts:168)
  → createSession → INSERT user_sessions (auth.ts:171-176)

POST /v1/auth/refresh (rate limit 30/5 menit)
  → jwt.verify + cek tokenType='refresh' (auth.ts:437-441)
  → validateRefreshJti → HANYA cek Redis (auth.ts:445) ⚠️ user_sessions tidak dibaca
  → revokeRefreshJti jti lama + generate token baru (rotation)
  → createSession row baru ⚠️ row lama tidak ditutup

POST /v1/auth/logout
  → revokeRefreshJti + tulis blacklist:at:{access_token} (auth.ts:527,537) ⚠️ blacklist tidak pernah dibaca

DELETE /v1/auth/sessions/:id
  → revokeSession → set revokedAt di DB saja ⚠️ Redis JTI tidak dihapus
```

### 3.2 Alur Submit Koleksi & WhatsApp

```
Mobile → POST /v1/mobile/collections/batch
  → mobileSyncService.processSyncItem (per item):
      1. Cek offline_id di collections → ALREADY_SYNCED jika ada (mobileSyncService.ts:77-87)
      2. db.transaction: validateAssignmentForSubmit (ACTIVE + milik officer + canId cocok)
         → submitCollection:
             - assertNoExistingFirstSubmit (sequence=1) (collectionSubmission.ts:69-86)
             - INSERT collections (submitSequence=1, syncStatus=COMPLETED)
             - UPDATE assignments → COMPLETED
             - UPDATE cans → totalCollected += nominal, collectionCount += 1
      3. sendWhatsAppNotification → addWhatsAppJob (BullMQ, jobId: collection-{id})
         → kegagalan enqueue TIDAK membatalkan transaksi (mobileSyncService.ts:120-122)
  → whatsapp.worker (in-process, limiter 2 msg/s, concurrency 1)
      → sendWhatsAppNotificationSync → Fonnte/Meta → INSERT notifications

Koreksi (resubmit): resubmitCollection (collectionSubmission.ts:145-208)
  → validasi NOT_LATEST (harus sequence tertinggi)
  → INSERT row baru sequence+1, offline_id menjadi "{offline_id}-rev-{seq}"
  → UPDATE cans.totalCollected += (nominalBaru - nominalLama) — TIDAK mengubah collectionCount ✓ benar
```

### 3.3 Offline Sync Mobile

```
MMKV per-officer keys (queue.ts:13-15):
  collection_queue_{userId} / collection_queue_failed_{userId} / offline_queue_schema_version_{userId}

autoSync (sync.ts:35-178):
  → module lock syncInProgress (anti-race) ✓
  → NetInfo check (isConnected + isInternetReachable)
  → item dengan retry_attempts >= 3 → moveToFailedPermanent
  → batchSubmit → klasifikasi per item: COMPLETED/ALREADY_SYNCED → dequeue;
    can_retry=false → failedPermanent; sisanya → incrementRetryAttempts
    (next_retry_at = now + 2^(n-1)*1000ms)
  → MAX_BATCH_ITERATIONS = 1 ⚠️ loop retry batch-level efektif mati
```

### 3.4 Proxy Auth Web (Next.js)

```
/login → app/api/auth/login/route.ts → fetch backend /v1/auth/login
  → cookie lazisnu_token (NON-HttpOnly, sameSite=strict, maxAge 1 hari ⚠️)
  → cookie lazisnu_refresh_token (HttpOnly, maxAge 7 hari)
middleware.ts → jose jwtVerify per request + role guard per path
  (audit-log: ADMIN_KECAMATAN; users: +ADMIN_RANTING; wa-monitor/resubmit: +BENDAHARA; reports: bukan PETUGAS)
```

---

## 4. Temuan P0 — Kritis 🔴

### P0-1. OTP login petugas tidak fungsional end-to-end

**Bukti:** `routes/auth.ts:253-263`

```typescript
// Generate and store OTP
const result = await otpService.generateAndStore(body.phone);
...
// In production, send via WhatsApp Business API
// For now, mask the phone number in log
const maskedPhone = body.phone.slice(0, 4) + '****' + body.phone.slice(-3);
fastify.log.info({ phone: maskedPhone }, 'OTP generated and sent to WhatsApp');
```

OTP di-generate (`otp.ts:24`) dan disimpan ke Redis dengan TTL 5 menit — tetapi **tidak pernah dikirim ke kanal mana pun**: tidak ada pemanggilan `services/whatsapp.ts`, dan nilai OTP juga tidak ditulis ke log (yang di-log hanya nomor HP termask). `generateAndStore` mengembalikan `{ success, otp }` namun nilai `otp` dibuang oleh caller.

**Dampak:** Tidak ada cara bagi petugas mengetahui kode OTP-nya → `POST /v1/auth/verify-otp` praktis tidak akan pernah berhasil di environment mana pun. Fitur "Login dengan OTP" di mobile adalah jalan buntu, sedangkan respons API berbohong ("OTP dikirim ke WhatsApp"). Ini juga berarti klaim "OTP via WA" pada dokumen arsitektur tidak terbukti di kode.

**Solusi:** lihat Bab 9 (R-1) — dua opsi: aktifkan pengiriman via whatsapp.ts, atau matikan fitur secara eksplisit. ⏳ **Keputusan diperlukan dari pemilik produk.**

---

### P0-2. Pencabutan sesi tidak mencabut refresh token

**Bukti:**

- `sessionService.ts:76-87` — `revokeSession` hanya `SET revokedAt` di PostgreSQL.
- `routes/auth.ts:444-448` — validasi refresh **murni** `validateRefreshJti(decoded.jti)` → cek Redis saja; `user_sessions.revokedAt` tidak pernah dibaca di seluruh alur refresh.
- `tokenService.ts:53-61` — `revokeAllUserRefreshJti` adalah **fungsi kosong** (komentar: "untuk saat ini kita hanya revoke via jti individual").
- `sessionService.ts:99-101` — `revokeAllUserSessions` dengan `exceptJti` → `throw new Error('not yet implemented')`.

Akibatnya:

1. `DELETE /v1/auth/sessions/:id` → respons "Sesi berhasil dicabut", tetapi refresh token sesi tersebut **tetap berlaku** hingga expired (sampai 7 hari), karena key Redis `refresh:{jti}` tidak dihapus.
2. `DELETE /v1/auth/sessions` (klaim "cabut semua sesi lain") justru **mencabut sesi current juga** — dan secara fungsional tetap tidak mencabut apa pun di sisi token.

**Dampak:** Fitur "logout dari perangkat lain" memberi rasa aman palsu. Jika perangkat petugas hilang/dicuri, admin tidak dapat memutus aksesnya lewat mekanisme ini.

**Solusi:** Bab 9 (R-2). **Status (rev. 2): dijadwalkan teratasi oleh Bab 11 Fase 1** — desain per-device key baru membuat revocation berfungsi by construction (revoke = DEL key Redis + `revokedAt`).

---

### P0-3. Blacklist access token saat logout = dead code

**Bukti:** `routes/auth.ts:530-542`

```typescript
// Blacklist access token juga (optional)
if (access_token) {
  ...
  await redisConnection.set(`blacklist:at:${access_token}`, '1', 'EX', ttl);
```

Key `blacklist:at:{token}` ditulis saat logout, tetapi `authenticate()` (`middleware/auth.ts:31-77`) **tidak pernah membacanya** — grep seluruh `src/` tidak menemukan pembaca key tersebut.

**Dampak:** Access token tetap valid setelah logout hingga expired (maks 15 menit). Dampak praktis terbatas karena TTL pendek, tetapi kode mati ini menyesatkan pembaca dan audit keamanan.

**Solusi:** Bab 9 (R-3) — rekomendasi: hapus kode blacklist dan terima window 15 menit (standar industri untuk token berumur pendek), daripada menambah 1 Redis call per request. **Status (rev. 2): dijadwalkan teratasi oleh Bab 11 Fase 1** (kode blacklist dihapus saat refactor `routes/auth.ts`).

---

## 5. Temuan P1 — Tinggi 🟠

### P1-4. Guard `/v1/scheduler` fail-open jika `INTERNAL_API_KEY` tidak diset

**Bukti:** `routes/scheduler.ts:23`

```typescript
if (config.INTERNAL_API_KEY && apiKey !== config.INTERNAL_API_KEY) {
```

Jika env `INTERNAL_API_KEY` kosong (`env.ts:57` — `optional()`), kondisi short-circuit → **semua request lolos tanpa autentikasi**. Endpoint yang terbuka: `POST /v1/scheduler/generate-tasks` (membuat assignment massal), `POST /calculate-summaries`, `GET /stats`.

**Solusi:** Bab 9 (R-4) — fail-closed: tolak 503 jika env tidak terkonfigurasi.

### P1-5. CORS `origin: true` — env `CORS_ORIGINS` dihitung tapi tidak dipakai

**Bukti:** `app.ts:35` memakai `origin: true`; padahal `env.ts:31` mendefinisikan `CORS_ORIGINS` dan `env.ts:77` mengekspor `corsOrigins` hasil parsing — yang **tidak diimpor di mana pun**.

**Dampak:** API production menerima request browser dari origin mana pun (dengan credentials). Mobile tidak terdampak (bukan browser), tetapi dashboard web dan siapa pun dapat memanggil API dari situs jahat jika cookie terlampir.

**Solusi:** Bab 9 (R-5).

### P1-6. Notifikasi FCM assignment = stub (kode mati)

**Bukti:** `scheduler.worker.ts:83-93`

```typescript
await db.query.officers.findFirst({ ... });
console.log(`[FCM] Notifikasi untuk ${info.officerName}: ${info.canCount} tugas baru (FCM token belum diimplementasi di DB).`);
```

Hasil query dibuang (tidak di-assign ke variabel), `sendAssignmentNotification` dari `services/fcm.ts` diimpor (baris 9) tetapi **tidak pernah dipanggil** dalam loop notifikasi. Tidak ada kolom/token FCM di schema.

**Dampak:** Petugas tidak menerima push notification saat assignment bulanan ter-generate (saat scheduler diaktifkan nanti).

**Solusi:** Bab 9 (R-6) — bertahap: kolom token → endpoint registrasi → kirim.

### P1-7. `revokeAllUserRefreshJti` no-op & `exceptJti` tidak diimplementasi

**Bukti:** `tokenService.ts:53-61` (fungsi kosong), `sessionService.ts:100` (throw).

**Dampak:** Bagian dari akar masalah P0-2; "ganti password → cabut semua sesi" tidak mungkin dilakukan dengan benar saat ini.

**Solusi:** terimplementasi gratis lewat R-2. **Status (rev. 2): dijadwalkan teratasi oleh Bab 11 Fase 1** — `revokeAllUserRefreshJti` digantikan revoke via Redis SET registry (`refresh:devices:{userId}`), dan `exceptJti` diimplementasikan.

### P1-8. `sendTemplateMessage` rusak untuk provider Fonnte

**Bukti:** `whatsapp.ts:236-257` — selalu mengirim payload Meta Graph API (`messaging_product: 'whatsapp'`, `/{PHONE_NUMBER_ID}/messages`) **tanpa memeriksa `WA_PROVIDER`**, berbeda dengan `sendWhatsAppNotificationSync` (baris 135-165) yang bercabang benar. Pada konfigurasi Fonnte, request akan dikirim ke `https://api.fonnte.com/{undefined}/messages` dengan payload yang tidak dikenali.

**Solusi:** Bab 9 (R-8).

---

## 6. Temuan P2 — Menengah 🟡

| # | Temuan | Bukti | Dampak |
|---|--------|-------|--------|
| 9 | Dokumen lama salah nama endpoint scheduler (`/generate-assignments`); aktual: `/generate-tasks`, `/calculate-summaries`, `/stats` | `routes/scheduler.ts:47,74,166` | Dokumentasi menyesatkan operator |
| 10 | Role hantu `ADMIN_PUSAT`/`ADMIN_KABUPATEN` tidak hanya di type JWTPayload tetapi juga di **logika** `ownership.ts` (case `ADMIN_PUSAT` bypass semua; `ADMIN_KABUPATEN` di `assertDistrictAccess`) | `middleware/auth.ts:12`, `ownership.ts:29,62` | Jika token dengan role ini pernah diterbitkan → bypass scope total |
| 11 | Rotasi refresh tidak menutup session row lama → `user_sessions` menumpuk baris "aktif"; TTL Redis JTI hardcoded 30 hari (`30*24*60*60`) vs JWT refresh 7 hari. **Status (rev. 2): diselesaikan by design via Bab 11** — kebijakan produk menetapkan refresh token 1 tahun (365d) untuk semua role; kekhawatiran "kunci sampah" dijawab dengan overwrite key per perangkat + `volatile-lru` | `auth.ts:168,380,488,491-496` | Registry sesi tidak akurat; key Redis yatim |
| 12 | Notifikasi WA gagal: `INSERT notifications FAILED` di dalam catch **per attempt** → hingga 3 baris FAILED untuk 1 notifikasi (attempts: 3) | `whatsapp.ts:178-193` | Monitor WA di dashboard menampilkan duplikat; statistik gagal terdistorsi |
| 13 | `MAX_BATCH_ITERATIONS = 1` membuat loop retry batch-level (dengan backoff) tidak pernah berjalan — kode mati; untungnya backoff per-item (`next_retry_at`) tetap berfungsi | `sync.ts:53,146-150,158-161` | Kode menyesatkan; retry batch hanya 1x per trigger |
| 14 | Inkonsistensi sumber phone: `request-otp` cek `users.phone` (auth.ts:236), `verify-otp` lookup `officers.phone` (auth.ts:340) | `routes/auth.ts:236,340` | User tanpa record officer mendapat "OTP dikirim" lalu `USER_NOT_FOUND` saat verifikasi |
| 15 | Cookie `lazisnu_token` `maxAge` 1 hari vs TTL access token 15 menit; non-HttpOnly (terekspos XSS, by design untuk middleware+axios) | `login/route.ts:40-46` | Setelah 15 menit, cookie berisi token mati → middleware redirect ke /login alih-alih refresh otomatis |
| 16 | Route `/v1/bendahara/*` mengizinkan BENDAHARA + ADMIN_KECAMATAN + ADMIN_RANTING (dokumen lama klaim "BENDAHARA only") — **desain aktual masuk akal**, dokumentasi yang perlu dikoreksi | `bendahara.ts:15` | Dokumentasi tidak akurat |
| 17 | `audit-logger` melog SEMUA 403 sebagai `AUTH_FAILED`, padahal docstring menjanjikan `OWNERSHIP_DENIED` untuk `FORBIDDEN_SCOPE` | `audit-logger.ts:9-12,33-45` | Analisis audit log tidak bisa membedakan gagal login vs pelanggaran scope |

---

## 7. Temuan P3 — Hygiene 🟢

Satu commit cleanup (~1 jam):

1. `routes/admin/collections.ts` — file route ada tetapi tidak pernah didaftarkan di `admin/index.ts:18-25` (dead route; fungsionalitas koleksi admin sudah dilayani `bendahara.ts` + report services) → hapus atau daftarkan.
2. `bendahara.ts:5` — unused import `getRoleScope` dari `utils/scope` → hapus.
3. `packages/shared-types/package-lock.json` — file lock npm di dalam monorepo pnpm → hapus.
4. `packages/design-tokens/` — hanya berisi subfolder kosong `proposals/`, tanpa `package.json`, tidak direferensikan workspace → isi atau hapus.

---

## 8. Kekuatan Arsitektur yang Terkonfirmasi Langsung ✅

Hal-hal ini saya verifikasi sendiri di kode dan memang berkualitas baik:

1. **Immutable ledger berlapis** — PostgreSQL RULE (`immutable-rule.sql`) + unique index `(assignment_id, can_id, submit_sequence)` (`schema.ts:134`) + validasi `NOT_LATEST` di service (`collectionSubmission.ts:178`) + penyesuaian agregat via diff nominal.
2. **Versioning resubmit yang cerdas** — `offline_id` turunan `-rev-{seq}` (`collectionSubmission.ts:199`) mencegah bentrok unique constraint sekaligus menjaga traceability.
3. **Mobile refresh-subscriber anti-hang** — subscriber mendaftarkan `onSuccess` **dan** `onFailure` (`api.ts:78-81`), sehingga antrean request tidak hang saat refresh gagal; token tidak di-clear pada network error (hanya pada 401/403) — desain tahan-jaringan-buruk.
4. **Offline queue dewasa** — sanitize field legacy (`payment_method`, `transfer_receipt_url`) saat baca (queue.ts:50-52), migrasi schema v1→v2 dengan recovery item gagal ke active queue (queue.ts:169-248), dedup by `offline_id` saat enqueue.
5. **Klasifikasi error terstruktur** — `classifySyncError` memakai `AppError.code` + flag `isRetryable`, bukan string matching (`mobileSyncService.ts:55-67`).
6. **Audit trail komprehensif** — mutasi sukses + 401/403 dilog dengan request-id, IP (x-forwarded-for aware), user-agent; insert audit dibungkus try/catch agar tidak mengganggu request utama.
7. **Sanitasi Sentry** — `beforeSend` menghapus header `authorization` dan field `password`/`otp` (`sentry.ts:23-32`).
8. **Guard Redis production** — server menolak start jika `REDIS_URL` kosong di production (`redis.ts:10-14`), mencegah silent fallback ke mock.
9. **Error handler terpusat berlapis** — AppError → ZodError → Fastify validation → JWT → fallback 500 tersanitasi (`app.ts:86-149`).
10. **Rate limit berlapis** — global 100/menit + per-endpoint lebih ketat (login 5/mnt, request-otp 3/mnt, verify-otp 5/mnt, refresh 30/5mnt).

---

## 9. Bab Rekomendasi — Pendekatan & Solusi per Temuan

Prinsip panduan: **perbaiki perilaku keamanan dulu, kosmetik kemudian; setiap fix disertai regression test** (infrastruktur Jest sudah ada — `pnpm --filter lazisnu-backend test:unit` / `test:integration`).

### R-1 (P0-1) OTP tidak terkirim — ⏳ keputusan diperlukan

| | Opsi A — Aktifkan penuh (disarankan) | Opsi B — Matikan sementara |
|---|---|---|
| **Pendekatan** | Kirim OTP sungguhan lewat infra WA yang sudah ada | Sembunyikan fitur sampai ada keputusan produk |
| **Implementasi** | Tambah `sendOtpMessage(phone, otp)` di `whatsapp.ts` (pola `sendWhatsAppNotificationSync`, pesan teks biasa — Fonnte tidak butuh template). Panggil **langsung (bukan via queue)** di `auth.ts` setelah `generateAndStore` — OTP time-sensitive 5 menit. Jika kirim gagal → return error, jangan klaim terkirim | Hapus/sembunyikan tombol "Login dengan OTP" di mobile + tandai endpoint `@deprecated` |
| **Effort** | 1–2 hari + test | ~1 jam |
| **Risiko** | Butuh token WA aktif & biaya per pesan | Petugas hanya bisa login password |
| **Catatan** | OTP **jangan pernah di-log**, termasuk di dev | Bisa dikembalikan kapan saja |

### R-2 (P0-2, P1-7) Perbaikan revocation sesi

**Pendekatan:** satu sumber kebenaran revocation = Redis JTI; `user_sessions` sebagai registry — keduanya diupdate bersama.

1. `revokeSession(sessionId, userId)`: SELECT `jti` dari row → `revokeRefreshJti(jti)` → baru set `revokedAt`.
2. Implementasikan `revokeAllUserSessions(userId, exceptJti)`: ambil semua jti aktif user → hapus semua key Redis kecuali `exceptJti` → set `revokedAt` massal. Hapus `throw not yet implemented`.
3. `DELETE /auth/sessions`: oper jti dari access token current sebagai `exceptJti` agar sesi sendiri tidak ikut tercabut.
4. Pertahanan tambahan di `/refresh`: setelah validasi Redis, cek `user_sessions.revokedAt IS NULL` (1 query murah) — menutup celah jika key Redis terlewat.
5. **Test:** revoke sesi → refresh dengan token sesi itu harus 401 `REFRESH_REVOKED`.

**Effort:** 1 hari + test integrasi.

### R-3 (P0-3) Blacklist access token

**Rekomendasi (KISS):** hapus blok blacklist di `auth.ts:530-542` dan dokumentasikan "window revoke access token = maks 15 menit (TTL)". Alternatif jika compliance menuntut revoke instan: cek `blacklist:at:{token}` di `authenticate()` — biayanya +1 Redis call/request (dengan Upstash antar-region, +20–50ms per request — tidak sepadan untuk TTL 15 menit).

**Effort:** 30 menit.

### R-4 (P1-4) Guard scheduler fail-closed

```typescript
if (!config.INTERNAL_API_KEY) {
  return sendError(reply, 503, 'NOT_CONFIGURED', 'Scheduler API tidak dikonfigurasi');
}
if (apiKey !== config.INTERNAL_API_KEY) { ... }
```

+ warning saat boot jika env kosong + test. **Effort:** 1 jam.

### R-5 (P1-5) CORS whitelist

`app.ts:35` → `origin: isProduction ? corsOrigins : true` (impor `corsOrigins`, `isProduction` dari `config/env`). Set `CORS_ORIGINS=https://<domain-dashboard>` di production. **Effort:** 1 jam. Quick win keamanan terbesar.

### R-6 (P1-6) FCM bertahap

- **Fase 1:** kolom `fcm_token` di `users` (migrasi drizzle) + endpoint `POST /v1/mobile/devices` untuk registrasi token saat login app.
- **Fase 2:** di `scheduler.worker.ts`, query token → panggil `sendAssignmentNotification` yang sudah ada di `fcm.ts`; hapus query yang dibuang (baris 85-88).

**Effort:** 2–3 hari termasuk sisi mobile.

### R-8 (P1-8) Template message per provider

Cabang payload seperti `sendWhatsAppNotificationSync`: Fonnte → `POST /send` form-encoded; Meta → template JSON. Jika template memang hanya untuk Meta, lempar error eksplisit saat `WA_PROVIDER=fonnte` daripada gagal diam-diam. **Effort:** ½ hari + test.

### R-9 s/d R-17 (P2) — ringkas

| # | Solusi | Effort |
|---|--------|--------|
| 9 | Koreksi dokumen: `/generate-tasks`, `/calculate-summaries`, `/stats` | 15 mnt |
| 10 | Hapus `ADMIN_PUSAT`/`ADMIN_KABUPATEN` dari type JWTPayload + switch `ownership.ts`; enum DB = source of truth. Jika roadmap butuh → tambah ke enum DB via migrasi, bukan di type saja | 2 jam |
| 11 | **Digantikan oleh Bab 11** — TTL 365d (keputusan produk) + overwrite key per perangkat + tutup row session lama saat rotasi (bagian dari Fase 1) | — |
| 12 | Insert log FAILED hanya pada attempt terakhir (oper `job.attemptsMade` vs `opts.attempts` dari worker), atau `ON CONFLICT (collection_id, template) DO UPDATE` | 3 jam |
| 13 | Pertahankan `MAX_BATCH_ITERATIONS = 1` (backoff per-item sudah cukup) lalu **hapus kode loop mati**; atau set 3. Jangan biarkan kode mati | 1 jam |
| 14 | Satukan lookup phone: `request-otp` dan `verify-otp` sama-sama via `officers` join `users` (OTP memang khusus petugas) | 1 jam |
| 15 | `maxAge` cookie = 15 menit; middleware saat token expired → arahkan ke `/api/auth/refresh` (bukan langsung /login) agar refresh HttpOnly dipakai otomatis | 3 jam |
| 16 | Tidak perlu ubah kode — koreksi dokumentasi (multi-role by design) | 15 mnt |
| 17 | Implementasikan janji docstring: baca error code dari response; `FORBIDDEN_SCOPE` → `OWNERSHIP_DENIED` | 2 jam |

### Urutan Eksekusi yang Disarankan

```
Minggu 1 (keamanan):  R-5 CORS → R-4 scheduler → R-2 revoke sesi → R-3 blacklist → R-1 OTP (putuskan A/B)
Minggu 2:             R-8 template → #10 role hantu → #11 sesi rotation → #12 WA log
Minggu 3–4:           R-6 FCM bertahap → sisa P2 (#13–#17) → P3 cleanup (1 commit)
```

Alasan urutan: R-4, R-5, R-2, R-3 adalah celah keamanan nyata dengan perubahan kecil (ROI tertinggi); R-1 adalah fitur yang berbohong ke user sehingga arahnya harus segera diputuskan; sisanya kualitas.

---

## 10. Delta terhadap Dokumen Analisis Sebelumnya

Dibandingkan `analisis-arsitektur-infrastruktur-lazisnu-gabungan.md`:

**Terkonfirmasi penuh oleh pembacaan langsung ini:** scheduler dinonaktifkan (`index.ts:6,20-22,33`), CORS `origin:true` (`app.ts:35`), inkonsistensi role (`middleware/auth.ts:12`), `'redis-unavailable'` fail-open (`tokenService.ts:32`), pool `max:10` (`database.ts:12`), parameter WA worker (2 msg/s, attempts 3, backoff 5000, jobId dedup), 20 services, 3 journal migrasi + 5 SQL legacy, `sync_queues` dead schema, mobile queue v2 + retry 3 + backoff eksponensial, hardcoded API URL (`api.ts:42`), CI lint+typecheck saja, `/metrics` 501.

**Dikoreksi oleh analisis ini:**
- Endpoint scheduler aktual `/generate-tasks` (bukan `/generate-assignments`).
- "Offline batch hanya mendukung CASH" — kolom `payment_method` sudah di-DROP total (migrasi 0002/0004); schema batch menolak field itu.
- Mobile memakai **fetch**, bukan Axios.
- JTI refresh dicek ke **Redis**, bukan tabel `user_sessions` seperti tertulis di alur auth dokumen lama.
- Komentar `database.ts:10-11` menyebut PgBouncer + direct connection, bukan Supabase pooler.
- Sub-route admin terdaftar: 8 (bukan 10).
- Hanya `lazisnu_refresh_token` yang HttpOnly.

**Temuan baru (tidak ada di dokumen lama):** P0-1 OTP tidak terkirim, P0-2 revoke sesi tak efektif, P0-3 blacklist dead code, P1-4 scheduler fail-open, P1-5 `corsOrigins` tak terpakai, P1-6 FCM stub, P1-8 template Fonnte, serta seluruh P2 #11–#17.

---

## 11. Rencana Implementasi Final: Sesi 1 Tahun + Login Biometrik (rev. 2)

> Bab ini merekam **keputusan kebijakan produk** dan rencana implementasi yang disepakati pada 2026-07-21. Bab ini menggantikan/menjadwalkan penanganan beberapa temuan di atas (P0-2, P0-3, P1-7, P2-11).

### 11.1 Keputusan Kebijakan Produk

| Keputusan | Pilihan | Konsekuensi |
|-----------|---------|-------------|
| Durasi refresh token | **1 tahun (365d) untuk SEMUA role** — konteks: alat pencatatan realtime cepat di lapangan & resi donatur instan; menghindari re-login di lapangan | Token berumur panjang → revocation yang berfungsi menjadi **wajib** (terjawab oleh desain Fase 1) |
| Model sesi perangkat | **Multi-device, overwrite per device** (ala sosial media) | Login ulang di perangkat sama menimpa key perangkat itu saja; perangkat lain tidak terganggu |
| Deteksi pencurian token (reuse detection) | **Tidak diaktifkan** | Refresh dengan jti basi → 401 `REFRESH_REVOKED` biasa, tanpa revoke massal |
| Fitur baru: login sidik jari | **Ditambahkan, opsional (toggle On/Off)** di aplikasi mobile | Lihat 11.3 |

> **Catatan risiko yang diterima secara sadar:** token 1 tahun untuk admin web lebih berisiko daripada untuk petugas lapangan. Mitigasi yang dipilih: (1) revocation kini benar-benar berfungsi per perangkat, (2) semua sesi tercatat di `user_sessions` dan dapat dicabut via `/v1/auth/sessions`, (3) di mobile, akses ke refresh token dijaga biometrik (11.3).

### 11.2 Fase 1 — Backend: Sesi 1 Tahun + Per-Device Keys (≈ 2 hari)

Menjawab kekhawatiran P2-11 ("kunci sampah" di Redis) dengan mekanisme **overwrite key saat login ulang + eviction `volatile-lru`**, sekaligus memperbaiki P0-2, P0-3, P1-7 by construction.

**Struktur key Redis baru:**

```
refresh:{userId}:{deviceId}   → value: jti aktif, TTL = TTL refresh token (365 hari)  ← 1 key per user per perangkat
refresh:devices:{userId}      → Redis SET berisi deviceId aktif (registry untuk revoke-all tanpa SCAN)
```

Jumlah key dibatasi oleh users × devices — bukan oleh jumlah login.

**Perubahan kode:**

| File | Perubahan |
|------|-----------|
| `database/schema.ts` + migrasi drizzle baru | Kolom `user_sessions.device_id` (varchar 100, nullable — kompatibel data lama) |
| `services/tokenService.ts` | Tulis ulang inti: `storeDeviceSession(userId, deviceId, jti, ttl)` (SET key + SADD registry — overwrite alami saat login ulang); `validateDeviceSession(userId, deviceId, jti)` → `get(key) === jti`; `revokeDeviceSession`; `revokeAllUserSessions(userId, exceptDeviceId?)` via SMEMBERS registry (menggantikan `revokeAllUserRefreshJti` yang no-op). TTL dihitung dari config (bukan hardcode 30 hari). Fallback `deviceId` kosong → pakai `jti` (kompatibel client lama/web). Fallback `'redis-unavailable'` dipertahankan + log warning |
| `middleware/auth.ts` | `generateTokens(..., deviceId?)` → claim `did` di payload refresh token |
| `routes/auth.ts` | login / verify-otp / refresh menerima `device_id` + `device_label` opsional; rotasi = SET key sama dengan jti baru; **fix P0-2:** `DELETE /sessions/:id` → resolve jti+deviceId → DEL key Redis + set `revokedAt`; `DELETE /sessions` → revoke semua kecuali sesi current (implement `exceptJti`); **fix P0-3:** hapus blok blacklist `blacklist:at:` (baris 530-542); tutup row session lama (`revokedAt`) saat rotasi (P2-11) |
| `config/env.ts` + `.env` | `JWT_REFRESH_TTL` default `'365d'`, `JWT_REFRESH_TTL_PETUGAS` default `'365d'` |

**Konfigurasi ops (tanpa kode):** set eviction policy **`volatile-lru`** di dashboard Upstash. Semua key sesi/OTP/lockout punya TTL → eligible eviction; key BullMQ (tanpa TTL) terlindungi — saat memori penuh, yang dikorbankan adalah sesi (user cukup login ulang, di mobile 1 tap via biometrik), bukan antrian notifikasi WA.

**Test (backend):** `auth.integration.test.ts` + unit test tokenService —
1. login dengan `device_id` → key `refresh:{uid}:{did}` ada, TTL ≈ 365 hari
2. login ulang device sama → key sama tertimpa, jti lama 401, jumlah key tetap 1
3. rotasi refresh → value key = jti baru, row session lama `revokedAt` terisi
4. revoke 1 sesi → refresh sesi itu 401 `REFRESH_REVOKED`, device lain tetap hidup
5. revoke-all → semua device mati kecuali current

### 11.3 Fase 2 — Mobile: deviceId + Login Biometrik (≈ 2,5–3 hari)

**Prinsip keamanan:** biometrik **bukan bypass autentikasi server** — sidik jari hanya membuka akses ke *refresh token* di Android Keystore. Server tetap otoritas penuh (revoke di server = jalur biometrik ikut mati). Password **tidak pernah disimpan**. Fondasi sudah siap: `react-native-keychain` sudah dipakai `secureKey.ts`, pola mock Keychain sudah ada di tests.

**Perubahan kode:**

| File | Perubahan |
|------|-----------|
| `services/api.ts` | Generate `deviceId` UUID sekali → persist di MMKV auth storage; sertakan `device_id` + `device_label` (model HP) di body login/verify-otp/refresh |
| `services/biometric.ts` (BARU) | Keychain service terpisah `com.lazisnu.biometric.refresh-token`: `isBiometricAvailable()` → `getSupportedBiometryType()`; `enableBiometric(token)` → `setGenericPassword` dengan `ACCESS_CONTROL.BIOMETRY_ANY` + `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; `getTokenWithBiometric()` → prompt sidik jari; `disableBiometric()` → hapus entry |
| `stores/useAuthStore.ts` | State `biometricEnabled`; aksi `enableBiometric`, `loginWithBiometric`, `disableBiometric` |
| `screens/LoginScreen.tsx` | Tombol "Masuk dengan Sidik Jari" (tampil jika flag aktif) |
| `screens/ProfileScreen.tsx` | Toggle On/Off biometrik |

**Alur login biometrik:** prompt sidik jari → ambil refresh token dari Keystore → `POST /v1/auth/refresh` → **simpan refresh token baru kembali ke Keystore** (wajib — rotasi membatalkan jti lama) → masuk app.

**Alur fallback (wajib ada):** refresh gagal `REFRESH_REVOKED` (key Redis ter-evict `volatile-lru`, sesi dicabut admin, atau key Keystore terinvalidasi karena pendaftaran sidik jari baru di Android) → biometrik dinonaktifkan + entry Keystore dihapus → user login password sekali → ditawarkan aktifkan kembali.

**Test (mobile):** `__tests__/biometric.test.ts` dengan mock Keychain (mengikuti pola `secureKey.test.ts`): enable → token tersimpan; login biometric sukses → rotasi tersimpan kembali; `REFRESH_REVOKED` → fallback disable; toggle off → entry terhapus.

### 11.4 Fase 3 — Ops & Dokumentasi (≈ ½ hari)

1. Set `volatile-lru` di Upstash (langkah manual, didokumentasikan).
2. Update dokumen ini (status temuan) — **sudah dilakukan di rev. 2 ini**.
3. Update `.agents/rules/00-project-overview.md` / dokumentasi terkait bila ada yang menyebut TTL refresh 7 hari.

### 11.5 Urutan Eksekusi & Verifikasi

```
Fase 1 (backend + tests)          → verifikasi: pnpm --filter lazisnu-backend test:all
Fase 2 (mobile deviceId+biometrik) → verifikasi: pnpm --filter lazisnu-collector-app test
Fase 3 (ops + docs)
```

Fase 2 bergantung pada Fase 1 (mobile mengirim `device_id` yang harus dipahami backend). Temuan lain di Bab 9 (R-1 OTP, R-4, R-5, dst.) tetap berlaku dan dapat dikerjakan paralel/terpisah dari rencana ini.

---

*Laporan ini dihasilkan dari pembacaan langsung kodebase pada 2026-07-21. Tidak ada perubahan kode yang dilakukan dalam analisis ini. Rev. 2 (2026-07-21): penambahan Bab 11 — rencana implementasi final sesuai keputusan kebijakan produk.*
