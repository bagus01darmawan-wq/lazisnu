# Implementation Plan — Tema 5: Authentication, Authorization & RBAC

> **Tujuan**: Menutup celah IDOR/ownership scope, memperbaiki lifecycle refresh token, dan membuat pola RBAC konsisten lintas modul.
>
> **Prinsip**: 
> - Ownership check terpusat (`assertBranchAccess`, `assertDistrictAccess`, `assertCollectionAccess`).
> - Refresh token rotation + device session registry.
> - Rate limit khusus endpoint auth, OTP attempt counter, env-driven TTL.
> - Naming Inggris untuk code/DB/API, Indonesia untuk label UI.

---

## Ringkasan Eksekutif

| Fase | Prioritas | Tema | Estimasi kompleksitas |
|------|-----------|------|----------------------|
| 1 | P0 | Ownership guard terpusat + Fix IDOR | Tinggi |
| 2 | P1 | OTP login PETUGAS return refresh token | Sedang |
| 3 | P2 | Refresh token rotation + blacklist | Sedang |
| 4 | P3 | Konsistensi authorize() & ownership middleware | Sedang |
| 5 | P4 | Device/session management (jti, session table) | Tinggi |
| 6 | P5 | Hardening tambahan (rate limit, attempt counter, TTL env) | Rendah–Sedang |

**Catatan urutan**: Fase 1 (ownership guard) sebaiknya lebih dulu karena Fase 4 akan memakainya sebagai middleware standar. Fase 2, 3 berdiri sendiri. Fase 5 (session registry) baru optimal setelah Fase 3 (rotation) siap.

---

## Fase 1 — P0: Ownership Guard Terpusat + Fix IDOR

**Tujuan**: Tutup celah IDOR dengan helper terpusat lalu refactor endpoint rawan.

### 1.1 Buat `src/middleware/ownership.ts`

Helper untuk dicek di service/route (bukan middleware Express, karena sumber scope dari DB).

```ts
// Signature
export async function assertBranchAccess(ctx: AuthContext, branchId: number): Promise<void>
export async function assertDistrictAccess(ctx: AuthContext, districtId: number): Promise<void>
export async function assertCollectionAccess(ctx: AuthContext, collectionId: number): Promise<void>
export async function assertDukuhAccess(ctx: AuthContext, dukuhId: number): Promise<void>
```

Aturan akses:
- `ADMIN_PUSAT`: boleh akses apa pun.
- `ADMIN_KABUPATEN`: hanya `districtId` miliknya.
- `ADMIN_RANTING`: hanya `branchId` miliknya.
- `BENDAHARA`: hanya `branchId` miliknya.
- `PETUGAS`: hanya collection miliknya (`officerId === user.officerId`).
- Throw `Errors.FORBIDDEN_SCOPE` dari `errorCatalog.ts` (tambah code baru).

Tambah di `errorCatalog.ts`:
```ts
FORBIDDEN_SCOPE: 'Tidak punya akses ke resource ini' (status 403, isRetryable: false)
```

### 1.2 Tambah `getRoleScope` terpusat

`src/utils/scope.ts` (sudah ada parsial, dirapikan):
```ts
export function getRoleScope(user: JWTPayload): { branchIds: number[]; districtIds: number[]; officerId?: number }
```

Dipakai untuk filter list query (bukan hanya ownership per-record).

### 1.3 Fix IDOR di `routes/admin/dukuhs.ts`

| Endpoint | Masalah | Fix |
|----------|---------|-----|
| `GET /dukuhs?branch_id=` | Terima branch_id mentah, bisa lintas branch | Paksa `branch_id = user.branchId` untuk `ADMIN_RANTING`; validasi lewat `assertBranchAccess` untuk `ADMIN_KABUPATEN/PUSAT` |
| `POST /dukuhs` | Body bisa berisi `branchId` apapun | Override `branchId` dari JWT, abaikan input client |
| `DELETE /dukuhs/:id` | Tidak cek branch | Lookup dukuh → `assertBranchAccess(ctx, dukuh.branchId)` sebelum delete |

### 1.4 Fix IDOR di `routes/admin/district.ts`

| Endpoint | Masalah | Fix |
|----------|---------|-----|
| `GET /branches/:branchId/dukuhs` | branchId mentah dari URL | `assertBranchAccess(ctx, +branchId)` |
| `POST /branches/:branchId/dukuhs` | branchId mentah | Sama, override body branchId dari URL setelah assert |
| `DELETE /branches/:id` | Tidak ada scope | `assertBranchAccess(ctx, +id)` |

### 1.5 Fix IDOR di `routes/bendahara.ts`

| Endpoint | Masalah | Fix |
|----------|---------|-----|
| `GET /collections/:id` | Ambil detail by ID tanpa scope | `assertCollectionAccess(ctx, +id)` |
| `GET /collections` (list) | Filter by branchId manual | Pakai `getRoleScope(ctx)` sebagai default, override query hanya jika `ADMIN_PUSAT` |

### 1.6 Test

- Unit test untuk `assertBranchAccess` matriks 5 role × 4 skenario (sendiri, sebranch, beda branch, beda district).
- Integration test: PETUGAS A tidak bisa GET `collections/:id` milik PETUGAS B → expect 403 dengan `code: 'FORBIDDEN_SCOPE'`.

### Acceptance
- [ ] 4 endpoint prioritas IDOR tidak lagi percaya param client untuk scope.
- [ ] `assertBranchAccess` dipanggil di semua titik mutasi data wilayah.
- [ ] Test IDOR suite PASS.

---

## Fase 2 — P1: OTP Login PETUGAS Return Refresh Token

**Tujuan**: PETUGAS yang login via OTP mendapat refresh_token sehingga tidak perlu OTP ulang tiap 15 menit.

### 2.1 Modifikasi `routes/auth/otp.ts` (atau service OTP)

Saat `verify-otp` sukses untuk role `PETUGAS`:
- Resolve officer aktif, `officerId`, `branchId`, `districtId` (sudah ada sebagian).
- Panggil `generateTokens(user)` yang sama dengan login password → kembalikan `{ access_token, refresh_token, user }`.
- Tetapkan TTL `7d` (bukan 30d) untuk PETUGAS via env baru `JWT_REFRESH_TTL_PETUGAS`.

### 2.2 Pastikan `/auth/refresh` re-resolve scope

- Setiap kali `/refresh` dipanggil, query ulang `users` + `officers` (kalau PETUGAS) untuk memvalidasi: status aktif, branch/district/officer id.
- Jika officer sudah non-aktif, throw `Errors.OFFICER_INACTIVE` dan **jangan** keluarkan token baru.
- Refresh response harus memuat scope final yang terbaru (sehingga update branch PETUGAS oleh admin langsung生效 di device).

### 2.3 Tambah `ErrorCode` baru

```ts
OFFICER_INACTIVE: 'Petugas sudah non-aktif' (status 403, isRetryable: false)
```

### 2.4 Update mobile client

- `mobile/lib/api/auth.ts`: simpan `refresh_token` di secure storage setelah OTP login.
- Tambah interceptor `axios` agar call yang dapat 401 → panggil `/refresh` → retry request.

### Acceptance
- [ ] `POST /verify-otp` mengembalikan `refresh_token` untuk PETUGAS.
- [ ] `/refresh` melempar error `OFFICER_INACTIVE` jika officer sudah non-aktif.
- [ ] Refresh response memuat scope terbaru.

---

## Fase 3 — P2: Refresh Token Rotation + Blacklist

**Tujuan**: Token lama tidak valid setelah `/refresh` berhasil, mempersempit window pencurian.

### 3.1 Tambah `jti` (JWT ID)

- Setiap kali `generateTokens()`, embed `jti` (uuid v4) di body refresh token.
- Simpan `jti` + `userId` di Redis dengan key `refresh:{jti}` saat token dikeluarkan.

### 3.2 Modifikasi `POST /auth/refresh`

Flow:
1. Validasi signature refresh token.
2. Cek `jti` di Redis. Jika tidak ada → throw `Errors.REFRESH_REVOKED`.
3. Generate access + refresh token baru (dengan `jti` baru).
4. Hapus `jti` lama dari Redis (atomic dengan `DEL` setelah token baru siap).
5. Return token baru.

### 3.3 Blacklist saat logout

- `POST /auth/logout`: hapus `refresh:{jti}` dari Redis.
- `POST /auth/logout-all` (baru): hapus semua key `refresh:{jti}` milik user.

### 3.4 Tambah `ErrorCode` baru

```ts
REFRESH_REVOKED: 'Refresh token sudah tidak berlaku' (status 401, isRetryable: false)
```

### Acceptance
- [ ] Refresh token lama tidak bisa dipakai setelah `/refresh` sukses.
- [ ] Logout menghapus sesi aktif dari Redis.
- [ ] Logout-all membersihkan semua sesi user.

---

## Fase 4 — P3: Konsistensi authorize() & Ownership Middleware

**Tujuan**: Semua endpoint mutasi/listing yang menyentuh resource tenant-scoped memakai pola yang sama.

### 4.1 Standarkan pola 3 lapis

```
router.post('/x',
  authenticate,                  // 1. AuthN: ada user?
  authorize('ADMIN_RANTING'),    // 2. AuthZ: role gate
  validateBody(schema),          // 3. Validasi
  async (req, res) => {
    await assertBranchAccess(req.user, req.body.branchId);  // 4. Ownership
    return service.x(req.body, req.user);
  }
)
```

### 4.2 Refactor `routes/mobile/collections.ts` dll.

- Ganti semua `if (user.role === 'PETUGAS') { cek officerId }` menjadi `assertCollectionAccess`.
- Cek manual di service layer juga, bukan cuma di route.

### 4.3 Refactor `routes/admin/collections.ts` (yang sudah dipecah di Tema 4)

- Tambahkan `assertBranchAccess`/`assertDistrictAccess` di setiap mutasi.
- List endpoint: pakai `getRoleScope(user)` untuk inject default `where` clause.

### 4.4 Larang raw `user.role === '...'` di route

- Tambahkan ESLint rule custom `no-manual-role-check` yang melarang pola `user.role === 'X'` di file `routes/**` (boleh di service, middleware, atau schema-level helper).

### Acceptance
- [ ] Tidak ada lagi `user.role === '...'` di folder `routes/`.
- [ ] Semua mutasi resource tenant-scoped melewati `assertXxxAccess`.
- [ ] List endpoint secara default ter-scope sesuai role.

---

## Fase 5 — P4: Device/Session Management

**Tujuan**: Admin/PETUGAS bisa lihat dan cabut sesi per device.

### 5.1 Schema baru: `user_sessions`

```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jti TEXT NOT NULL UNIQUE,
  device_label TEXT,
  user_agent TEXT,
  ip_address TEXT,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
```

### 5.2 Saat login & refresh

- Insert baris ke `user_sessions` dengan `jti`, parsed `user-agent`, `ip_address` (dari `req.ip`).
- `device_label` bisa di-derive dari user-agent (e.g. "iPhone Safari", "Android Chrome").

### 5.3 Endpoint baru

| Method | Path | Deskripsi |
|--------|------|-----------|
| `GET` | `/auth/sessions` | List sesi aktif milik user saat ini |
| `DELETE` | `/auth/sessions/:id` | Cabut 1 sesi (self only) |
| `DELETE` | `/auth/sessions` | Cabut semua kecuali yang sedang dipakai (logout other devices) |
| `POST` | `/admin/users/:id/revoke-sessions` | Admin cabut semua sesi user (untuk kasus reset paksa) |

### 5.4 Tambah `ErrorCode` baru

```ts
SESSION_NOT_FOUND: 'Sesi tidak ditemukan' (status 404, isRetryable: false)
SESSION_ALREADY_REVOKED: 'Sesi sudah dicabut' (status 410, isRetryable: false)
```

### 5.5 Saat password berubah

- Di endpoint `change-password` (atau `reset-password`): setelah sukses, panggil `revokeAllUserSessions(userId, exceptJti?)`.

### Acceptance
- [ ] Tabel `user_sessions` terisi tiap login/refresh.
- [ ] User bisa lihat & cabut sesi via endpoint baru.
- [ ] Ganti password otomatis mencabut semua sesi lain.

---

## Fase 6 — P5: Hardening Tambahan

**Tujuan**: Memperketat auth tanpa menambah friction signifikan.

### 6.1 Rate limit khusus endpoint auth

| Endpoint | Limit |
|----------|-------|
| `/auth/refresh` | `30 request / 5 menit / IP+userId` |
| `/auth/logout` | `10 request / 5 menit / IP+userId` |

Implement: reuse factory `createRateLimiter` yang sudah ada (Tema sebelumnya), tambahkan key generator `keyByIpAndUser`.

### 6.2 OTP attempt counter

- Tambah Redis key `otp:attempts:{phone}` dengan TTL = window OTP.
- Increment tiap `verify-otp` gagal; jika ≥ 5 → invalidate OTP (`DEL otp:{phone}`) dan throw `Errors.OTP_TOO_MANY_ATTEMPTS`.
- Tambah `ErrorCode` baru:
  ```ts
  OTP_TOO_MANY_ATTEMPTS: 'Terlalu banyak percobaan, minta OTP baru' (status 429, isRetryable: false)
  ```

### 6.3 Env-driven token TTL

- Pisahkan: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (saat ini mungkin satu).
- Env: `JWT_ACCESS_TTL` (default 15m), `JWT_REFRESH_TTL` (default 7d), `JWT_REFRESH_TTL_PETUGAS` (default 7d).
- Hapus hardcoded `'30d'` di `generateTokens()`.

### 6.4 Account lockout

- Setelah 10× gagal login beruntun dari identifier yang sama (per 1 jam), tolak request dengan `Errors.ACCOUNT_LOCKED`.
- Reset counter saat login sukses atau setelah window 1 jam.
- Tambah `ErrorCode` baru:
  ```ts
  ACCOUNT_LOCKED: 'Akun terkunci sementara, coba lagi nanti' (status 423, isRetryable: false)
  ```

### 6.5 Access token revocation (optional)

- Untuk melengkapi: saat logout, masukkan `jti` access token ke Redis blocklist dengan TTL = sisa umur token. Middleware `authenticate` cek blocklist ini.

### Acceptance
- [ ] `/auth/refresh` dan `/auth/logout` punya rate limit sendiri.
- [ ] 5× OTP salah → OTP invalid + error 429.
- [ ] TTL token sepenuhnya dari env.
- [ ] 10× login gagal → akun terkunci 1 jam.

---

## File yang Akan Disentuh / Dibuat

### Baru
- `apps/backend/src/middleware/ownership.ts`
- `apps/backend/src/utils/scope.ts` (rapi, bisa lanjut dari helper yang sudah ada)
- `apps/backend/src/db/schema/userSessions.ts`
- `apps/backend/src/services/sessionService.ts`
- `apps/backend/src/routes/auth/sessions.ts`
- `apps/backend/src/routes/admin/userSessions.ts`
- `apps/backend/migrations/0002_user_sessions.sql`

### Diubah
- `apps/backend/src/utils/errorCatalog.ts` (tambah `FORBIDDEN_SCOPE`, `REFRESH_REVOKED`, `OFFICER_INACTIVE`, `OTP_TOO_MANY_ATTEMPTS`, `ACCOUNT_LOCKED`, `SESSION_NOT_FOUND`, `SESSION_ALREADY_REVOKED`)
- `apps/backend/src/services/tokenService.ts` (atau `auth.ts`): `jti`, env TTL, simpan session
- `apps/backend/src/routes/auth/login.ts`
- `apps/backend/src/routes/auth/refresh.ts`
- `apps/backend/src/routes/auth/logout.ts`
- `apps/backend/src/routes/auth/otp.ts` (verify-otp return refresh)
- `apps/backend/src/routes/auth/changePassword.ts` (revoke sessions)
- `apps/backend/src/routes/admin/dukuhs.ts`
- `apps/backend/src/routes/admin/district.ts`
- `apps/backend/src/routes/admin/users.ts` (ganti password)
- `apps/backend/src/routes/bendahara.ts` (collection detail)
- `apps/backend/src/routes/mobile/collections.ts`
- `apps/backend/src/services/otpService.ts` (attempt counter)
- `apps/backend/src/services/loginAttemptService.ts` (lockout)
- `apps/mobile/lib/api/auth.ts` (simpan refresh_token + interceptor)
- `.env.example` (TTL & secret baru)

---

## Strategi Rollout

1. **Database migration** untuk `user_sessions` di Fase 5 — bisa disiapkan lebih awal, feature-flag off.
2. **Fase 1 (ownership)** dulu karena tidak breaking — tambah helper, refactor route secara bertahap.
3. **Fase 2 (OTP refresh)** butuh sinkronisasi dengan mobile, deploy backend → release mobile dalam 1 sprint.
4. **Fase 3 (rotation)** aman dilakukan setelah mobile sudah support refresh.
5. **Fase 5 (sessions)** bisa partial: schema + endpoint read-only dulu, write setelah Fase 3.
6. **Fase 6 (hardening)** kapan saja, low risk.

---

## Validasi Akhir

- [ ] `pnpm --filter backend lint` hijau
- [ ] `pnpm --filter backend test` hijau (test IDOR + ownership + session PASS)
- [ ] `pnpm --filter backend typecheck` hijau
- [ ] Mobile build sukses setelah refactor auth client
- [ ] Manual test: PETUGAS bisa pakai aplikasi 24 jam tanpa OTP ulang (dengan mode background)
- [ ] Manual test: 10× login gagal → akun locked; reset counter setelah 1 jam
- [ ] Manual test: ganti password → device lain logout otomatis
- [ ] `GET /auth/sessions` menampilkan daftar device yang sedang login
- [ ] `grep -r "user.role ===" apps/backend/src/routes` kosong
- [ ] `grep -r "throw new Error" apps/backend/src` kosong

---

## Out of Scope (untuk Tema lain)

- Enkripsi payload tambahan
- 2FA untuk ADMIN
- Audit log untuk aksi admin
- Login via SSO/Google
