# Sub-bab 04 — Alur Data & Sesi

> **Target Minggu**: Minggu 2
> **Prasyarat**: Sub-bab 06 selesai, Sub-bab 03 task C (kolom device_id) selesai
> **Estimasi Total**: 2–3 hari (backend) + 30 menit (ops)
> **Keputusan diperlukan**: D-02 ✅, D-03 ✅, D-04 ✅, D-07 ✅, D-08 ✅

---

## Konteks dan Tujuan

Sub-bab ini mengimplementasikan **Bab 20 Fase 1**: sesi 1 tahun + per-device keys.
Memperbaiki P0-2 dan P0-3 secara by design:
- Revocation sesi kini benar-benar bekerja via per-device Redis key
- Blacklist access token dead code dihapus (D-07)
- Redis fallback fail-closed di production (D-08)
- Semua sesi tercatat dengan device_id

Referensi analisis: `analisis-master-lazisnu.md` Bab 7.3 (auth flow detail), Bab 20 Fase 1

---

## Struktur Key Redis Baru

```
refresh:{userId}:{deviceId}   → jti aktif, TTL = 365 hari (1 key per user per perangkat)
refresh:devices:{userId}      → Redis SET berisi deviceId aktif (registry untuk revoke-all)
```

---

## Task List

### A — Refactor services/tokenService.ts

- [ ] **A1**: Tulis `storeDeviceSession(userId, deviceId, jti, ttl)` — SET key + SADD registry; overwrite alami saat login ulang
- [ ] **A2**: Tulis `validateDeviceSession(userId, deviceId, jti)` — GET dan bandingkan jti; jika Redis null & production → throw AppError 503 (D-08)
- [ ] **A3**: Tulis `revokeDeviceSession(userId, deviceId)` — DEL key + SREM dari registry
- [ ] **A4**: Tulis `revokeAllUserSessions(userId, exceptDeviceId?)` via SMEMBERS registry — menggantikan `revokeAllUserRefreshJti` yang no-op (P1-7)
- [ ] **A5**: Fallback jika deviceId kosong: gunakan jti sebagai deviceId (kompatibel web client lama)
- [ ] **A6**: Hapus atau deprecate fungsi lama: `storeRefreshJti`, `validateRefreshJti`, `revokeRefreshJti`
- [ ] **A7**: Unit test 5 skenario wajib:
  - Login dengan device_id → key ada, TTL ~365 hari
  - Login ulang device sama → key tertimpa, jti lama 401, jumlah key tetap 1
  - Rotasi refresh → value key = jti baru
  - Revoke 1 sesi → refresh sesi itu 401, device lain tetap hidup
  - Revoke-all → semua device mati kecuali current

**Effort**: setengah hari | **Referensi**: Bab 20.2

---

### B — Update middleware/auth.ts

- [ ] **B1**: Update `generateTokens(..., deviceId?)` — tambah claim `did` (device_id) di payload refresh token
- [ ] **B2**: Pastikan `authenticate()` validasi access token dengan `JWT_ACCESS_SECRET`

**Effort**: 1 jam | **Referensi**: Bab 20.2

---

### C — Refactor routes/auth.ts

- [ ] **C1**: `POST /v1/auth/login` — terima `device_id` dan `device_label` opsional; panggil `storeDeviceSession`
- [ ] **C2**: `POST /v1/auth/refresh` — extract `did` dari payload; `validateDeviceSession`; rotasi jti baru; tutup row session lama (`revokedAt`)
- [ ] **C3**: `DELETE /v1/auth/sessions/:id` — **FIX P0-2**: SELECT jti + device_id; `revokeDeviceSession`; set `revokedAt`
- [ ] **C4**: `DELETE /v1/auth/sessions` — `revokeAllUserSessions` kecuali current device; set `revokedAt` massal
- [ ] **C5**: `POST /v1/auth/logout` — **HAPUS blok blacklist** baris 530-542 (**FIX P0-3**, D-07); panggil `revokeDeviceSession`
- [ ] **C6**: `POST /v1/auth/verify-otp` — terima `device_id` dan `device_label`; `storeDeviceSession`

**Effort**: 1 hari | **Referensi**: Bab 20.2

---

### D — Update Config TTL

- [ ] **D1**: `config/env.ts` — set default `JWT_REFRESH_TTL` = `365d` dan `JWT_REFRESH_TTL_PETUGAS` = `365d` (D-02)
- [ ] **D2**: Update `.env` dan `.env.example`

**Effort**: 15 menit

---

### E — Konfigurasi Ops Upstash Redis

- [ ] **E1**: Login ke dashboard Upstash
- [ ] **E2**: Set eviction policy: **`volatile-lru`** — key sesi/OTP/lockout dengan TTL dikorbankan saat memori penuh; key BullMQ tanpa TTL terlindungi
- [ ] **E3**: Dokumentasikan langkah ini di `docs/DEPLOYMENT.md`

**Effort**: 30 menit | **Referensi**: Bab 20.2

---

### F — Integration Test Auth

- [ ] **F1**: Buat atau update `apps/backend/src/__tests__/auth.integration.test.ts`:
  - Login → refresh → logout — semua state benar
  - Revoke sesi tunggal → refresh sesi itu 401 `REFRESH_REVOKED`
  - Revoke-all → semua device mati kecuali current
  - Redis null di production → 503 bukan izin refresh
- [ ] **F2**: Jalankan: `pnpm --filter lazisnu-backend test:integration`

**Effort**: setengah hari | **Referensi**: Bab 20.2

---

### G — Verifikasi Alur Offline-First (review saja, tidak ada perubahan kode)

- [ ] **G1**: Trace alur submit koleksi di `mobileSyncService.ts` — pastikan tidak ada perubahan tak disengaja
- [ ] **G2**: Verifikasi idempotency check `offline_id` masih berfungsi
- [ ] **G3**: Catat bahwa `MAX_BATCH_ITERATIONS = 1` dan loop mati di `sync.ts` — akan cleanup di P2 #13 (Sub-bab 06 cleanup)

**Effort**: 30 menit | **Referensi**: Bab 7.2

---

## Verifikasi dan Done Criteria

- [ ] `pnpm --filter lazisnu-backend test:unit` — semua hijau ✅
- [ ] `pnpm --filter lazisnu-backend test:integration` — semua hijau ✅
- [ ] Revoke sesi tunggal → refresh sesi itu 401 `REFRESH_REVOKED` ✅
- [ ] Revoke-all → semua device mati kecuali current ✅
- [ ] Login ulang device sama → hanya 1 key Redis untuk device itu ✅
- [ ] Blacklist dead code sudah dihapus dari `auth.ts` ✅
- [ ] Redis `volatile-lru` aktif di Upstash ✅
- [ ] `docs/DEPLOYMENT.md` diupdate dengan langkah Upstash ✅

---

## Catatan Risiko

> ⚠️ **One-time sesi mati**: Semua sesi aktif akan mati saat pertama deploy karena struktur key Redis berubah. Informasikan ke semua user sebelum deploy.

> ⚠️ **Web client kompatibilitas**: Web client belum mengirim `device_id` sampai Sub-bab 05 selesai. Fallback jti-sebagai-deviceId memastikan kompatibilitas mundur.

---

## Referensi

- `analisis-master-lazisnu.md`: Bab 7.3, Bab 12 (P0-2, P0-3), Bab 20 Fase 1 lengkap
- `docs/implementation/decisions-log.md`: D-02, D-03, D-04, D-07, D-08
- File yang dimodifikasi: `services/tokenService.ts`, `middleware/auth.ts`, `routes/auth.ts`, `config/env.ts`, `.env`, `.env.example`
