# Rencana Implementasi — Sesi Permanen Sliding (anti logout misterius)

**Tanggal:** 2026-08-26 · **Status:** RENCANA (belum dieksekusi) · **Disusun oleh:** ox-alpha (untuk Bagus Darmawan)

> Tujuan: aplikasi **tidak pernah logout sendiri** — seperti aplikasi media sosial.
> Petugas lapangan dengan sinyal apapun kondisinya tidak boleh terlempar ke halaman
> Login karena mekanisme internal. Logout hanya terjadi dari: aksi user, akun
> dinonaktifkan admin, atau pencabutan perangkat eksplisit.

---

## 1. Ringkasan Eksekutif

| Item | Keputusan |
|---|---|
| Model sesi | **Sliding permanen**: refresh token hidup 365 hari sejak terbit terakhir, diputar tiap refresh, token lama TIDAK dicabut (kedaluwarsa alami) |
| Peran Redis | Berubah dari **gerbang wajib** menjadi **daftar blokir eksplisit** (fail-open) — Redis down/blip/evict tidak lagi berefek apa pun ke login |
| Validasi refresh | Tanda tangan JWT + cek `users.isActive` / `officers.isActive` di database |
| Bug deterministik | **F0 ditemukan saat investigasi**: refresh mengeluarkan `did` acak baru sehingga refresh KE-2 selalu `REFRESH_REVOKED`. Diperbaiki sebagai bagian dari redesign (`did` stabil per perangkat) |
| Rollout | **Backend dulu via deploy CI biasa** (perlindungan turun ke SEMUA versi aplikasi tanpa update APK) → perubahan mobile ikut bundel v1.1.2 |
| Trade-off keamanan | Token curian bertahan sampai dicabut eksplisit — dikompensasi: binding perangkat, audit log refresh, cabut-perangkat/cabut-semua dari web, nonaktifkan akun tetap efektif dalam hitungan menit |

## 2. Bukti & Akar Masalah (investigasi 2026-08-26)

Keluhan: "Sesi telah berakhir. Silakan login kembali." muncul mendadak; petugas
harus mencari sinyal untuk login ulang. Empat jalur kegagalan teridentifikasi,
semuanya bermuara pada satu desain: **rotasi single-use + Redis sebagai gerbang**.

| ID | Akar masalah | Lokasi | Sifat |
|----|--------------|--------|-------|
| **F0** | **Bug deterministik did-mismatch**: `/auth/refresh` memanggil `generateTokens(newPayload, server)` TANPA deviceId → token baru membawa `did` acak baru, sedangkan Redis menyimpan jti di bawah `did` LAMA (auth.ts:478+524). Refresh kedua dengan token baru: `refresh:{u}:{didBaru}` tidak ada → REFRESH_REVOKED → logout. **Setiap sesi pasti mati pada siklus refresh kedua** | auth.ts:521 + middleware/auth.ts:116 | Pasti (semua user) |
| F1 | Respons rotasi hilang (timeout sinyal lemah) setelah server mencabut jti lama → klien terjebak token mati | auth.ts:486 (revoke sebelum respons) | Probabilistik (lapangan) |
| F2 | Redis blip/restart saat validasi dilempar AppError 503 → tertangkap catch generik → dibalas **401 INVALID_TOKEN** → klien menghapus token | auth.ts:547-550 + error-guards.ts:47 | Peristiwa infra |
| F3 | Redis `maxmemory 50mb` + `volatile-lru`: semua sesi ber-TTL = kelas yang boleh diusir saat memori penuh | redis/redis.conf | Bom waktu |

Bukti lapangan: log production `auth_refresh_failed:revoked` (userAgent okhttp),
key Redis device penderita hilang dari scan, pesan cocok persis dengan
useAuthStore.ts:478.

## 3. Arsitektur Target

```
SEKARANG                                TARGET
─────────────────────────────────       ─────────────────────────────────
Refresh token single-use                Refresh token 365d sliding —
(jti lama DICABUT tiap refresh)         diputar tiap refresh, lama kedaluwarsa alami
        ↓                                       ↓
Redis = gerbang wajib                   Redis = daftar blokir eksplisit
(fail-closed; down/blip = logout massal)   (fail-open; down = tak berefek)
        ↓                                       ↓
did acak baru tiap rotasi (F0!)         did stabil per perangkat sepanjang usia sesi
        ↓                                       ↓
Respons hilang = sesi mati              Respons hilang = token lama masih sah;
                                        retry berikutnya sukses
```

Skenario wajib lolos:

| Situasi | Hasil target |
|---|---|
| Sinyal hilang berhari-hari | Tetap login; kerja offline seperti biasa |
| Timeout tepat saat refresh | Sembuh sendiri — retry dengan token lama tetap sah |
| HP dimatikan / restart / reinstall* | Tetap login (*reinstall membuat device_id baru = sesi baru; yang lama kedaluwarsa alami) |
| Redis restart / down / evict | Nol efek ke login |
| Admin nonaktifkan akun/petugas | Terblokir ≤ 1 siklus refresh (cek DB) |
| Cabut 1 perangkat / semua perangkat dari web | Tetap bekerja via denylist (saat Redis hidup) |
| User logout manual | Tetap berfungsi |

## 4. Perubahan Detail

### 4.A `apps/backend/src/services/tokenService.ts` — gergaji besar

Hapus semantik "jti tunggal yang sah". Model baru:

```
refresh:{userId}:{deviceId}      → jti TERAKHIR (informatif, untuk UI perangkat aktif)
revoked:{userId}:{deviceId}      → penanda blokir eksplisit (TTL = sisa umur token saat dicabut)
refresh:devices:{userId}         → registry device (tetap, untuk fitur kelola perangkat)
```

Fungsi baru/berubah:

```ts
/** Dicek saat refresh: hanya true jika admin/user EXPLISIT mencabut device. */
export async function isDeviceRevoked(userId, deviceId): Promise<boolean>
  // Redis get revoked:{u}:{d}; Redis down → return false (fail-open) + log warn

export async function revokeDeviceSession(userId, deviceId, ttlSeconds?)
  // SETEX revoked:{u}:{d} '1' ttl  ← TTL = sisa umur token yang dicabut (hitung dari exp JWT)
  // DEL refresh:{u}:{d}; SREM registry

export async function revokeAllUserSessions(userId, exceptDeviceId?, ttlFn?)
  // sama seperti sekarang + tulis denylist per device
```

- `storeDeviceSession` tetap ada (menyimpan jti terakhir, informatif).
- `validateDeviceSession` DIHAPUS (penggantinya `isDeviceRevoked`) — beserta tes lamanya.
- Semua fungsi Redis dibungkus try→log→degrade (tidak pernah throw ke caller auth).

### 4.B `apps/backend/src/routes/auth.ts` — tulis ulang handler `/auth/refresh`

Urutan baru:

```
1. verify JWT refresh (signature + exp)          → gagal = 401 INVALID_TOKEN (legitimat)
2. isDeviceRevoked(decoded.userId, decoded.did)   → true = 401 REFRESH_REVOKED (legitimat)
3. cek users.isActive                             → false = 403 ACCOUNT_DISABLED
4. cek officers.isActive (jika petugas)           → false = 403 OFFICER_DISABLED
5. rotate: generateTokens(payload, server, undefined, decoded.did)
   ⚠️ deviceId DITERUSKAN — menutup F0; did stabil sepanjang usia sesi
6. storeDeviceSession(user.id, decoded.did, tokens.refreshJti)  // informatif
7. userSessions DB: UPDATE baris terbuka device itu (jti + lastUsedAt);
   INSERT hanya jika belum ada baris terbuka  ← mencegah tabel membengkak
8. JANGAN sentuh jti lama — tidak ada revoke
9. audit log REFRESH_SUCCESS (sampling ok)
```

Penanganan error:

```ts
catch (error) {
  if (error?.statusCode >= 500 || redisError) → sendError(503, 'SERVICE_UNAVAILABLE')
     + log 'auth_refresh_failed:redis_unavailable'        ← menutup F2
  else (JWT invalid/expired/malformed)       → sendError(401, 'INVALID_TOKEN')
}
```

Rate limit 30/5mnt dipertahankan (cukup; klien sudah anti-storm).

### 4.C Endpoint pencabutan (logout, `DELETE /sessions`, revoke 1 sesi) — sesuaikan

- Semua jalur pencabutan kini MENULIS denylist `revoked:{u}:{d}` dengan
  `TTL = exp − now` dari token yang terlihat di request (atau default 365d
  bila token tak terbaca) — agar token outstanding benar-benar mati.
- `POST /auth/logout`: tambahan perilaku — tetap tulis denylist (bukan sekadar DEL).
- Response code & bentuk tidak berubah (kompatibel app lama).

### 4.D Mobile — `apps/mobile` (ikut bundel v1.1.2)

1. **api.ts**: pada hasil refresh, HANYA kode bisnis berikut yang boleh memicu
   forceLogout: `ACCOUNT_DISABLED`, `OFFICER_DISABLED`, `REFRESH_REVOKED`.
   `INVALID_TOKEN` 401 dari refresh TIDAK lagi menghapus token sekarang —
   ditandai dan dibiarkan (token bisa sah di server lain waktu; hindari
   logout karena clock-skew/jitter). Network/5xx sudah aman.
2. **Mutex bersama**: `authService.refresh()` (biometrik) dan interceptor
   `refreshAccessToken()` memakai lock modul yang sama + sumber token tunggal
   (MMKV) — mencegah dua rotasi paralel.
3. **UX forceLogout**: pesan diganti spesifik per kode
   ("Akun dinonaktifkan admin" / "Sesi dicabut dari perangkat lain") —
   bukan lagi "Sesi telah berakhir" generik; tombol login biometrik 1-ketuk
   tetap tersedia (`sessionRecoveryAvailable` sudah ada).
4. Tes unit: matriks kode-error → aksi (logout vs bertahan).

### 4.E Konfigurasi ops (terpisah dari kode)

- ✅ **2026-08-26 SELESAI**: `maxmemory` 50mb → **100mb** (keputusan PO; VM RAM
  3,7 GB total / 2,1 GB available — aman). Diterapkan runtime via
  `CONFIG SET` di prod + staging, DAN di file repo `redis/redis.conf`
  (persisten lintas recreate container).
- Catatan: `volatile-lru` dipertahankan; denylist yang terevikt = pencabutan
  yang dilupakan — dengan headroom ×2 dan pertumbuhan data yang lambat
  (terpakai ±2,5 MB), risiko ini rendah. Evaluasi ulang bila used_memory
  mendekati 60% maxmemory.

### 4.F Tes

- `tokenService.test.ts`: tulis ulang skenario — denylist flow, fail-open saat
  Redis down, revoke TTL = sisa umur, registry tetap terpelihara.
- `auth.integration.test.ts` tambah kasus:
  1. Refresh ke-2 dengan token hasil rotasi → **200** (membuktikan F0 tumbang)
  2. Respons "hilang": refresh 2× dengan token lama yang sama → keduanya 200
     (grace alami sliding) 
  3. Redis mock lempar error → endpoint balas 503, bukan 401
  4. Denylist aktif → 401 REFRESH_REVOKED
  5. `isActive=false` → 403 ACCOUNT_DISABLED
  6. did stabil: token hasil rotasi membawa `did` identik

## 5. Anti-Saga (pelajaran retro diterapkan)

| # | Pelajaran | Penerapan di rencana ini |
|---|-----------|--------------------------|
| 1 | Satu perubahan infrastruktur per rilis | Backend sliding = perubahan TUNGGAL; deploy via CI main biasa, TIDAK menunggu APK. Perubahan mobile menumpang bundel editan v1.1.2 yang memang sudah ada |
| 2 | Bukti sebelum lanjut | Setiap gate punya bukti konkret (tes kasus F0/F1/F2 direproduksi lalu dilirik hijau); log `auth_refresh_failed:*` dimonitor 7 hari pasca-deploy |
| 3 | Stop-flag | Bila 7 hari pasca-deploy masih ada `auth_refresh_failed:revoked` yang tidak berasal dari pencabutan manual → rollback image backend (jalur blue-green sudah ada) |
| 4 | Jangan campur eksperimen | Selama window ini: expo-updates tetap ditunda; Opsi A split ABI tetap menunggu v1.1.3 |
| 5 | Fail-safe > fail-closed utk ketersediaan sesi | Semua fungsi Redis degrade-with-log, tidak pernah throw ke handler auth |

## 6. Gate Verifikasi

| Gate | Bukti | Kapan |
|------|-------|-------|
| G1 | Tes integrasi kasus 1–6 (§4.F) hijau lokal | Sebelum push |
| G2 | Deploy staging → login dari app → biarkan >30 menit / paksa 2× refresh → TIDAK ada logout; cek log staging bersih dari `redis_unavailable`/`revoked` liar | Pra-produksi |
| G3 | Simulasi Redis down di staging (stop container 1 menit) → refresh tetap 200 | Pra-produksi |
| G4 | Nonaktifkan akun uji → refresh → 403 ACCOUNT_DISABLED ≤ 1 siklus | Pra-produksi |
| G5 | Deploy prod (blue-green) → monitor 7 hari: nol `auth_refresh_failed` kecuali pencabutan manual; Crashlytics `force_logout` ≈ 0 | Pasca-rilis |
| G6 | Uji lapangan 2 petugas: 1 hari kerja penuh + HP dimati-buka + area sinyal lemah → tidak pernah diminta login ulang | Pasca-rilis |

## 7. Risiko & Trade-off

| Risiko | Mitigasi |
|--------|----------|
| Token curian berlaku sampai dicabut eksplisit | Binding `did`; audit log refresh; admin cabut perangkat/all dari web; nonaktif akun tetap efektif cepat (DB check) |
| Denylist di Redis terevikt → pencabutan "lupa" | Naikkan maxmemory + evaluasi noeviction; TTL denylist diset = sisa umur token (self-cleaning) |
| Tabel user_sessions tumbuh | Satu baris terbuka per device (UPDATE, bukan INSERT per refresh) — §4.B langkah 7 |
| Clock skew perangkat ekstrem | Access token tetap 15m; kegagalan access tidak memicu logout, hanya refresh |
| Regresi alur biometrik | Mutex bersama + tes matriks kode-error; biometrik tetap disinkron saat rotasi (kode existing dipertahankan) |
| Rollback | Image backend biru-hijau tinggal switch; skema DB TIDAK berubah (tanpa migrasi) — rollback aman |

## 8. Checklist Eksekusi (urut)

- [ ] 1. `tokenService.ts` → model denylist + fail-open + hapus `validateDeviceSession` (§4.A)
- [ ] 2. Tulis ulang `/auth/refresh` + teruskan `decoded.did` (F0) + klasifikasi 503 (F2) (§4.B)
- [ ] 3. Sesuaikan `/auth/logout`, `DELETE /sessions`, revoke-sesi → tulis denylist TTL sisa-umur (§4.C)
- [ ] 4. Tes: tokenService + integrasi kasus 1–6 (G1) → commit + push main (deploy otomatis)
- [ ] 5. Verifikasi staging G2 + G3 + G4
- [x] 6. Ops: maxmemory Redis prod+staging → 100mb (runtime + repo file) — ✅ 2026-08-26 (§4.E)
- [ ] 7. Monitor prod 7 hari (G5) — dashboard log `auth_refresh_failed:*` + Crashlytics
- [ ] 8. Mobile §4.D masuk bundel v1.1.2 (bersama fitur statistik rentang)
- [ ] 9. G6 uji lapangan → tandai rencana SELESAI + catat di decisions-log

## 9. Yang TIDAK berubah

- Skema database (tanpa migrasi — aman rollback).
- Bentuk response API login/refresh/me (kompatibel app v1.1.1 ke bawah).
- Alur OTP, rate limit endpoint auth, middleware authenticate/authorize.
- Fitur kelola perangkat di web (daftar sesi aktif, cabut 1/semua).
- Offline queue penjemputan (tak tersentuh logout mana pun).
