---
description: 
---

# Workflow: /run-testing
# Trigger: Ketik /run-testing di chat Antigravity
# Tujuan: Panduan testing internal dan persiapan UAT (FASE 9)
# Prasyarat: Semua fitur dari FASE 2-8 sudah selesai

---

## Instruksi untuk Agent

Bantu user menjalankan skenario testing lengkap sebelum UAT dengan tim Lazisnu.
Baca dulu `.agents/rules/04-business-rules.md` untuk memahami apa yang paling kritis.

Untuk setiap test, laporkan: ✅ LULUS atau ❌ GAGAL + deskripsi masalah.

---

### MODUL 1 — Backend Unit & Integration Test

#### 1.1 Test Immutable Constraint (KRITIS)
```bash
# Akses langsung ke PostgreSQL:
psql -U lazisnu_dev -d lazisnu_db -h localhost

# Test 1: Coba DELETE
DELETE FROM koleksi WHERE id = '[id apapun]';
# Harus: 0 rows affected (bukan error, tapi NOTHING terjadi)

# Test 2: Coba UPDATE nominal
UPDATE koleksi SET nominal = 99999 WHERE id = '[id apapun]';
# Harus: 0 rows affected

# Test 3: INSERT normal tetap bisa
INSERT INTO koleksi (id, kaleng_id, ...) VALUES (...);
# Harus: berhasil
```

#### 1.2 Test Auth API
```
POST /auth/login - credentials valid → 200 + token
POST /auth/login - credentials salah → 401 UNAUTHORIZED
POST /auth/refresh - token valid → 200 + access token baru
POST /auth/refresh - token expired/blacklisted → 401
POST /auth/logout → 200, token di-blacklist di Redis
GET /auth/me - tanpa token → 401
GET /auth/me - dengan token valid → 200 + profil user
```

#### 1.3 Test Role-Based Access
```
GET /users sebagai admin_kecamatan → 200
GET /users sebagai admin_ranting   → 403 FORBIDDEN
GET /users sebagai petugas         → 403 FORBIDDEN
GET /users sebagai bendahara       → 403 FORBIDDEN

POST /koleksi sebagai petugas → 201
POST /koleksi sebagai bendahara → 403

GET /laporan/summary sebagai bendahara → 200
GET /laporan/summary sebagai petugas   → 403
```

#### 1.4 Test QR Validation
```
GET /kaleng/scan/[valid_token] sebagai petugas yang punya assignment → 200 + detail kaleng
GET /kaleng/scan/[valid_token] sebagai petugas yang TIDAK punya assignment → 403 QR_NOT_ASSIGNED
GET /kaleng/scan/[token_palsu] → 400 QR_INVALID
GET /kaleng/scan/[token_kaleng_yang_sudah_disubmit] → 400 QR_ALREADY_SUBMITTED
```

#### 1.5 Test Re-Submit
```
POST /koleksi/:id/resubmit - tanpa alasan → 400 RESUBMIT_REASON_REQUIRED
POST /koleksi/:id/resubmit - dengan alasan → 201
Verifikasi di DB: is_latest record lama = false, record baru = true
Verifikasi: WA ke-2 terkirim dengan template revisi
```

#### 1.6 Test Batch Sync Idempotent
```
POST /koleksi/batch-sync - 5 records baru → 5 berhasil
POST /koleksi/batch-sync - 5 records sama (duplikat) → 0 berhasil, 5 skipped, tidak error
POST /koleksi/batch-sync - 3 baru + 2 duplikat → 3 berhasil, 2 skipped
```

---

### MODUL 2 — Mobile App Test

#### 2.1 Test Alur Normal (Online)
```
1. Buka app → SplashScreen → redirect ke Login
2. Login dengan credentials valid → Dashboard tampil
3. Tap task kaleng → QRScannerScreen
4. Scan QR kaleng yang valid → InputNominalScreen
5. Input nominal → pilih Cash → KonfirmasiScreen
6. Konfirmasi → SuksesScreen → status WA terkirim
7. Task ditandai selesai di Dashboard
```

#### 2.2 Test Offline Flow (KRITIS)
```
1. Aktifkan Airplane Mode
2. Tap task → Scan → Input → Konfirmasi
3. SuksesScreen tampil dengan status "Menunggu Sinkronisasi"
4. Dashboard tampil badge offline queue dengan angka
5. Ulangi untuk 5 kaleng (semua masuk queue)
6. Matikan Airplane Mode
7. Verifikasi: auto-sync berjalan dalam 5-10 detik
8. Verifikasi: semua 5 koleksi masuk DB
9. Verifikasi: WA terkirim ke setiap pemilik kaleng
10. Verifikasi: badge queue hilang dari Dashboard
```

#### 2.3 Test Re-Submit Mobile
```
1. Buka list task selesai
2. Tap task yang sudah selesai → tampil detail + tombol "Laporkan Koreksi"
3. Tap Laporkan Koreksi → ResubmitFormScreen
4. Input nominal kosong → tombol submit tidak aktif
5. Input nominal tapi alasan kosong → tombol submit tidak aktif
6. Input keduanya → submit → WA ke-2 terkirim
```

#### 2.4 Test Keamanan Mobile
```
Play Integrity:
- Jalankan app di emulator → login → harus diblokir
- Jalankan app di device asli → login → berhasil

CodePush:
- Deploy bundle update → app update otomatis saat resume
- Deploy bundle crash → rollback otomatis, app kembali ke versi sebelumnya
```

---

### MODUL 3 — Web Dashboard Test

#### 3.1 Test per Role
```
Admin Kecamatan:
  - Lihat semua menu: ✅/❌
  - Generate QR massal + download PDF: ✅/❌
  - Export CSV laporan: ✅/❌
  - Lihat audit log: ✅/❌

Admin Ranting:
  - Hanya 4 menu yang tampil: ✅/❌
  - Edit kepemilikan kaleng rantingnya: ✅/❌
  - Coba akses /users → redirect 403: ✅/❌

Bendahara:
  - Lihat laporan keuangan: ✅/❌
  - Lihat re-submit tracker dengan perbandingan nominal: ✅/❌
  - Export CSV → buka di Excel dengan karakter benar: ✅/❌
  - Coba POST request apapun → 403: ✅/❌
```

#### 3.2 Test Tabel Riwayat Re-Submit
```
1. Ada koleksi yang sudah di-re-submit
2. Di tabel, default tampil is_latest = true → hanya 1 row per kaleng
3. Toggle "Tampilkan Riwayat" → tampil 2 row: lama (background kuning) + baru (normal)
4. Di /resubmit → tampil perbandingan nominal lama vs baru + alasan
```

---

### MODUL 4 — Skenario UAT dengan Tim Lazisnu

Instruksikan user untuk menyiapkan sesi UAT dengan 4 skenario:

```
Sesi 1 — Petugas lapangan:
  Berikan 2-3 petugas HP dengan APK terpasang
  Minta mereka scan kaleng nyata + input nominal
  Catat semua kesulitan UX yang mereka alami

Sesi 2 — Admin:
  Demonstrasikan: generate QR massal → cetak PDF → tempel ke kaleng baru
  Test: override assignment saat petugas berhalangan

Sesi 3 — Bendahara:
  Export CSV → buka di Excel → verifikasi semua angka benar
  Lihat re-submit tracker → verifikasi alasan koreksi tercatat

Sesi 4 — Full scenario:
  Simulasi satu siklus penuh dari nol:
  Generate QR → cetak → tempel → petugas scan → WA terkirim → bendahara lihat laporan
```

---

### LAPORAN TESTING

Setelah semua modul selesai, buat laporan dalam format:

```
## Hasil Testing — [Tanggal]

### Modul 1 — Backend: X/Y test lulus
### Modul 2 — Mobile: X/Y test lulus
### Modul 3 — Web: X/Y test lulus

### Bug Kritis (harus fix sebelum launch):
- [deskripsi bug]

### Bug Minor (bisa fix post-launch):
- [deskripsi bug]

### Siap Production: YA / BELUM
```

Simpan laporan ke `docs/testing-report-[tanggal].md`.
Update `.agents/rules/10-sprint-aktif.md` setelah semua modul selesai.
