# Sub-bab 05 — Frontend: Web & Mobile

> **Target Minggu**: Minggu 3–4
> **Prasyarat**: Sub-bab 04 selesai (backend per-device keys sudah live)
> **Estimasi Total**: 3–4 hari
> **Keputusan diperlukan**: D-01 (⏳ OTP), D-09 ✅ (biometrik opsional)

---

## Konteks dan Tujuan

Sub-bab ini mengimplementasikan **Bab 20 Fase 2**: deviceId di mobile + login biometrik.
Juga menangani cleanup web dashboard dan keputusan D-01 (OTP).

Prinsip keamanan biometrik:
- Sidik jari **bukan bypass autentikasi server** — hanya membuka akses ke refresh token di Android Keystore
- Server tetap otoritas penuh (revoke di server = jalur biometrik ikut mati)
- Password tidak pernah disimpan

Referensi analisis: `analisis-master-lazisnu.md` Bab 9 (web), Bab 10 (mobile), Bab 20 Fase 2

---

## Task List Mobile

### MA — deviceId di Mobile

- [ ] **MA1**: Buka `apps/mobile/src/services/api.ts`:
  - Generate `deviceId` UUID sekali saat pertama install → persist di MMKV auth storage
  - Sertakan `device_id` dan `device_label` (model HP, bisa dari `react-native-device-info` atau `Platform.OS + Platform.Version`) di body setiap request: login, verify-otp, refresh
- [ ] **MA2**: Pastikan `deviceId` dibaca dari MMKV saat app restart (tidak di-generate ulang)
- [ ] **MA3**: Test: setelah login dua kali dari device yang sama → hanya 1 key Redis `refresh:{userId}:{deviceId}`

**Effort**: setengah hari | **Referensi**: Bab 20.3

---

### MB — Buat services/biometric.ts (BARU)

- [ ] **MB1**: Buat file `apps/mobile/src/services/biometric.ts` dengan fungsi:
  - `isBiometricAvailable()` → `getSupportedBiometryType()` dari `react-native-keychain`
  - `enableBiometric(refreshToken)` → `setGenericPassword('biometric', refreshToken, { accessControl: ACCESS_CONTROL.BIOMETRY_ANY, accessible: ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY })` di keychain service `com.lazisnu.biometric.refresh-token`
  - `getTokenWithBiometric()` → prompt sidik jari → kembalikan refresh token
  - `disableBiometric()` → hapus entry keychain `com.lazisnu.biometric.refresh-token`
- [ ] **MB2**: Export semua fungsi dari `biometric.ts`

**Effort**: 1 hari | **Referensi**: Bab 20.3

---

### MC — Update stores/useAuthStore.ts

- [ ] **MC1**: Tambah state: `biometricEnabled: boolean`
- [ ] **MC2**: Tambah aksi: `enableBiometric(refreshToken)`:
  - Cek `isBiometricAvailable()`
  - Panggil `enableBiometric(refreshToken)` dari biometric.ts
  - Update state + persist ke MMKV
- [ ] **MC3**: Tambah aksi: `loginWithBiometric()`:
  - `getTokenWithBiometric()` → dapat refresh token
  - `POST /v1/auth/refresh` → dapat access token baru
  - **Simpan refresh token baru kembali ke Keystore** (wajib — rotasi membatalkan jti lama)
  - Jika gagal `REFRESH_REVOKED`:
    - `disableBiometric()` — nonaktifkan
    - Arahkan ke login password
    - Tawarkan aktifkan biometrik lagi setelah login berhasil
- [ ] **MC4**: Tambah aksi: `disableBiometric()`:
  - `disableBiometric()` dari biometric.ts
  - Update state + persist

**Effort**: 1 hari | **Referensi**: Bab 20.3

---

### MD — Update screens/LoginScreen.tsx

- [ ] **MD1**: Tambah tombol "Masuk dengan Sidik Jari" — tampil hanya jika `biometricEnabled === true`
- [ ] **MD2**: Saat tap → panggil `loginWithBiometric()` dari store
- [ ] **MD3**: Saat `REFRESH_REVOKED` → tampilkan pesan dan kembali ke form login

**Effort**: 2 jam | **Referensi**: Bab 20.3

---

### ME — Update screens/ProfileScreen.tsx

- [ ] **ME1**: Tambah toggle On/Off biometrik
  - On → `enableBiometric(refreshToken)` (butuh refresh token saat ini dari store)
  - Off → `disableBiometric()`
- [ ] **ME2**: Tampilkan status: "Sidik jari aktif" / "Sidik jari tidak aktif"
- [ ] **ME3**: Tampilkan jenis biometrik yang tersedia (fingerprint / face)

**Effort**: 2 jam | **Referensi**: Bab 20.3

---

### MF — Keputusan D-01: OTP

> Selesaikan D-01 terlebih dahulu sebelum mengerjakan MF.

**Jika D-01 = Opsi B (Matikan sementara — DISARANKAN):**
- [ ] **MF1b**: Sembunyikan tombol "Login dengan OTP" di `LoginScreen.tsx` (komentar atau hapus UI)
- [ ] **MF2b**: Tandai endpoint `POST /v1/auth/request-otp` dengan `@deprecated` di kode dan dokumentasi
- [ ] **MF3b**: Update `decisions-log.md` D-01 dengan keputusan dan tanggal

**Jika D-01 = Opsi A (Aktifkan via WA):**
- [ ] **MF1a**: Backend: tambah `sendOtpMessage(phone, otp)` di `apps/backend/src/services/whatsapp.ts`
  - Panggil langsung (bukan via queue) di `routes/auth.ts:253` setelah `generateAndStore`
  - OTP time-sensitive (TTL 5 menit) — tidak boleh via queue async
  - Jika kirim gagal → return error, jangan klaim terkirim
  - OTP tidak boleh pernah di-log (hapus return value `otp` dari caller)
- [ ] **MF2a**: Fix inkonsistensi lookup phone (P2 #14): satukan `request-otp` dan `verify-otp` keduanya via `officers` join `users`
- [ ] **MF3a**: Test: request OTP → periksa WA → verify OTP → dapat token

**Effort Opsi B**: 1 jam | **Effort Opsi A**: 1–2 hari + test

---

### MG — Mobile Test Biometrik

- [ ] **MG1**: Buat `apps/mobile/src/__tests__/biometric.test.ts` dengan mock Keychain:
  - Enable → token tersimpan di Keychain
  - Login biometric sukses → rotasi refresh token tersimpan kembali
  - `REFRESH_REVOKED` → fallback disable; entry Keychain terhapus
  - Toggle off → entry Keychain terhapus

**Effort**: setengah hari | **Referensi**: Bab 20.3 (pola mock dari `secureKey.test.ts`)

---

## Task List Web

### WA — Cleanup Web Dashboard

- [ ] **WA1**: Buka `apps/web/src/middleware.ts` — verifikasi role guard berfungsi untuk 4 role valid (setelah Sub-bab 02 hapus role hantu)
- [ ] **WA2**: Buka `apps/web/src/app/api/auth/login/route.ts:40-46`:
  - Ubah `maxAge` cookie `lazisnu_token` dari 1 hari menjadi 15 menit (sesuai TTL access token) — P2 #15
  - Pastikan middleware saat token expired mengarahkan ke `/api/auth/refresh` (bukan langsung `/login`) agar refresh HttpOnly dipakai otomatis
- [ ] **WA3**: Verifikasi Zod (`zod`) ada di `dependencies` (bukan `devDependencies`) di `apps/web/package.json` — pindahkan jika perlu
- [ ] **WA4**: `pnpm --filter web run lint` — tidak ada error

**Effort**: 2–3 jam | **Referensi**: Bab 9, P2 #15

---

### WB — device_id di Web Client

- [ ] **WB1**: Buka `apps/web/src/lib/api.ts` atau route handler login/refresh:
  - Generate `deviceId` UUID sekali → simpan di sessionStorage atau cookie non-persistent
  - Sertakan `device_id` di body request login dan refresh
- [ ] **WB2**: Test: setelah login → key Redis `refresh:{userId}:{deviceId}` ada

**Effort**: 1 jam | **Referensi**: Sub-bab 04 (fallback deviceId)

---

## Verifikasi dan Done Criteria

- [ ] `pnpm --filter lazisnu-collector-app test` — semua hijau ✅
- [ ] `pnpm --filter web run lint` — tidak ada error ✅
- [ ] Login biometrik: sidik jari → masuk app tanpa input password ✅
- [ ] Toggle Off biometrik → entry Keychain terhapus ✅
- [ ] `REFRESH_REVOKED` → biometrik nonaktif otomatis, arah ke login ✅
- [ ] D-01 sudah diputus dan diimplementasikan ✅
- [ ] Cookie `lazisnu_token` `maxAge` = 15 menit ✅

---

## Catatan Risiko

> ⚠️ **Android Keystore invalidasi**: Jika user menambahkan sidik jari baru di perangkat Android, entry Keychain bisa terinvalidasi. Pastikan fallback (login password → tawarkan aktifkan ulang) berfungsi dengan baik.

> ⚠️ **react-native-keychain**: Sudah ada di dependencies (`^8.2.0`) — pastikan versi mendukung `ACCESS_CONTROL.BIOMETRY_ANY`.

---

## Referensi

- `analisis-master-lazisnu.md`: Bab 9 (web), Bab 10 (mobile), Bab 20 Fase 2
- `docs/implementation/decisions-log.md`: D-01, D-09
- File baru: `apps/mobile/src/services/biometric.ts`, `apps/mobile/src/__tests__/biometric.test.ts`
- File yang dimodifikasi: `api.ts`, `useAuthStore.ts`, `LoginScreen.tsx`, `ProfileScreen.tsx`, `apps/web/src/app/api/auth/login/route.ts`
