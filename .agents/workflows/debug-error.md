---
description: 
---

# Workflow: /debug-error
# Trigger: Ketik /debug-error di chat Antigravity
# Tujuan: Panduan sistematis debugging error di semua layer (mobile, backend, web)
# Gunakan ini kapanpun ada error yang tidak jelas penyebabnya

---

## Instruksi untuk Agent

Bantu user mengidentifikasi dan menyelesaikan error secara sistematis.
Jangan langsung menyimpulkan penyebab — ikuti langkah diagnosis dulu.

---

### LANGKAH 1 — Kumpulkan Informasi Error

Tanya user:
1. "Error apa yang muncul? Tempelkan pesan error lengkap + stack trace."
2. "Error ini di layer mana? (Mobile / Backend / Web / Database)"
3. "Kapan error ini mulai terjadi? Ada perubahan kode sebelumnya?"
4. "Error konsisten atau hanya kadang-kadang?"

Tunggu jawaban sebelum lanjut.

---

### LANGKAH 2 — Diagnosis Berdasarkan Layer

#### Jika error di BACKEND (Node.js / Fastify):

Cek berurutan:
```bash
# 1. Cek log backend:
npm run dev  # perhatikan error di terminal

# 2. Cek koneksi database:
psql -U lazisnu_dev -d lazisnu_db -h localhost -c "SELECT 1;"

# 3. Cek koneksi Redis:
redis-cli ping  # harus PONG

# 4. Cek environment variables:
node -e "console.log(process.env.DATABASE_URL)"  # harus ada nilai

# 5. Jika error 500 → cek apakah ada stack trace di Sentry
```

#### Jika error di MOBILE (React Native):

Cek berurutan:
```bash
# 1. Cek Metro bundler log di terminal
# 2. Cek Android logcat:
adb logcat | grep -i "lazisnu\|react\|error"

# 3. Jika crash → cek Firebase Crashlytics
# 4. Cek apakah API_BASE_URL sudah benar di .env:
#    10.0.2.2:3001 untuk emulator
#    IP komputer di network yang sama untuk device fisik
```

#### Jika error di WEB (Next.js):

Cek berurutan:
```bash
# 1. Cek terminal Next.js dev server
# 2. Cek browser console (F12 → Console)
# 3. Cek Network tab → apakah API request gagal?
# 4. Cek apakah NEXT_PUBLIC_API_URL sudah benar di .env.local
```

#### Jika error di DATABASE:

```sql
-- Cek apakah tabel ada:
\dt

-- Cek struktur tabel:
\d nama_tabel

-- Cek apakah RULE immutable terpasang di koleksi:
SELECT rulename FROM pg_rules WHERE tablename = 'koleksi';
-- Harus ada: no_delete_koleksi, no_update_nominal_koleksi

-- Cek constraint:
\d+ koleksi
```

---

### LANGKAH 3 — Cek Rules yang Relevan

Berdasarkan layer error, baca rules yang relevan untuk memastikan implementasi sudah benar:
- Error di koleksi/submit → baca `04-business-rules.md` BR-01 sampai BR-04
- Error di auth/JWT → baca `08-pedoman-backend.md`
- Error di QR scan → baca `04-business-rules.md` BR-02
- Error di offline sync → baca `04-business-rules.md` BR-04

---

### LANGKAH 4 — Perbaiki & Verifikasi

Setelah menemukan penyebab:
1. Jelaskan ke user apa penyebab errornya dan kenapa
2. Tunjukkan perubahan kode yang diperlukan
3. Minta user jalankan ulang dan konfirmasi error sudah hilang
4. Jika fix menyentuh business logic kritis → jalankan test terkait dari `/run-testing`

---

### Error Umum & Solusi Cepat

| Error | Kemungkinan Penyebab | Solusi Cepat |
|---|---|---|
| `ECONNREFUSED localhost:5432` | PostgreSQL tidak berjalan | `sudo service postgresql start` |
| `ECONNREFUSED localhost:6379` | Redis tidak berjalan | `sudo service redis-server start` |
| `401 UNAUTHORIZED` di mobile | Token expired, tidak di-refresh | Cek interceptor Axios |
| `QR_INVALID` padahal QR asli | APP_SECRET berbeda antara generate dan validasi | Cek `.env` APP_SECRET konsisten |
| `0 rows affected` saat UPDATE koleksi | Immutable RULE aktif — ini NORMAL untuk nominal | Gunakan INSERT baru untuk re-submit |
| Build Android gagal: `compileSdk` | Versi SDK tidak cocok | Update `compileSdk = 35` dan AGP ke `8.6.0` |
| WA tidak terkirim | BullMQ worker tidak berjalan | Jalankan worker secara terpisah |
| CSV garbled di Excel | Tidak ada BOM UTF-8 | Tambahkan `'\uFEFF'` di awal content |
