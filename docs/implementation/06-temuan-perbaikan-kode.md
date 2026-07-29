# Sub-bab 06 — Temuan & Perbaikan Kode

> **Target Minggu**: Minggu 1 (PRIORITAS TERTINGGI)
> **Prasyarat**: Tidak ada — ini adalah sub-bab pertama yang dikerjakan
> **Estimasi Total**: 3–4 hari
> **Keputusan diperlukan**: D-01 (⏳ OTP — putuskan sebelum task R-1)

---

## Konteks dan Tujuan

Sub-bab ini menyelesaikan semua temuan kritis dari analisis kode mendalam:
- **3 P0 Kritis**: OTP tidak fungsional, revoke sesi bolong, blacklist dead code
- **5 P1 Tinggi**: scheduler fail-open, CORS terbuka, FCM stub, revoke no-op, WA template rusak
- **9 P2 Menengah**: berbagai inkonsistensi dan kode mati
- **P3 Hygiene**: cleanup dead code dan file tidak perlu

**URUTAN KERJAKAN**: R-5 dan R-4 dulu (quick win 2 jam), lalu Bab 20 Fase 1 secara paralel di Sub-bab 04.

Referensi analisis: `analisis-master-lazisnu.md` Bab 12–15, Bab 19 (R-1 s/d R-17)

---

## Task List P0 — Kritis (Kerjakan Pertama)

### P0-A: R-5 — CORS Whitelist (1 jam — quick win terbesar)

- [ ] **P0-A1**: Buka `apps/backend/src/app.ts:35`
- [ ] **P0-A2**: Ubah `origin: true` menjadi:
  ```typescript
  import { corsOrigins, isProduction } from './config/env';
  // Di plugin CORS:
  origin: isProduction ? corsOrigins : true
  ```
- [ ] **P0-A3**: Buka `apps/backend/src/config/env.ts` — verifikasi `corsOrigins` sudah di-export (sudah ada, hanya belum diimport di `app.ts`)
- [ ] **P0-A4**: Set `CORS_ORIGINS=https://dashboard.lazisnu.app` (atau domain production) di `.env` production
- [ ] **P0-A5**: Test: dari origin yang bukan whitelist → request browser harus ditolak 403 CORS

**Effort**: 1 jam | **Referensi**: P1-5 (Bab 13), R-5 (Bab 19), INFRA-16

---

### P0-B: R-4 — Scheduler Guard Fail-Closed (1 jam)

- [ ] **P0-B1**: Buka `apps/backend/src/routes/scheduler.ts:23`
- [ ] **P0-B2**: Ubah guard dari:
  ```typescript
  if (config.INTERNAL_API_KEY && apiKey !== config.INTERNAL_API_KEY) {
  ```
  Menjadi:
  ```typescript
  if (!config.INTERNAL_API_KEY) {
    return sendError(reply, 503, 'NOT_CONFIGURED', 'Scheduler API tidak dikonfigurasi');
  }
  if (apiKey !== config.INTERNAL_API_KEY) {
    return sendError(reply, 401, 'UNAUTHORIZED', 'API key tidak valid');
  }
  ```
- [ ] **P0-B3**: Tambah warning saat boot jika `INTERNAL_API_KEY` tidak diset
- [ ] **P0-B4**: Test: tanpa `INTERNAL_API_KEY` di env → `POST /v1/scheduler/generate-tasks` harus 503
- [ ] **P0-B5**: Test: dengan API key salah → harus 401

**Effort**: 1 jam | **Referensi**: P1-4 (Bab 13), R-4 (Bab 19)

---

### P0-C: Hapus Blacklist Dead Code (30 menit) — dikerjakan di Sub-bab 04 task C5

> Task ini **diimplementasikan di Sub-bab 04** (bagian refactor routes/auth.ts).
> Catat di sini sebagai reminder: saat mengerjakan Sub-bab 04, **hapus baris 530-542** di `routes/auth.ts`.

- [ ] **P0-C1**: Konfirmasi bahwa Sub-bab 04 task C5 sudah menghapus blok blacklist
- [ ] **P0-C2**: Grep: `grep -r "blacklist:at" apps/backend/src/` → tidak boleh ada hasil

**Referensi**: P0-3 (Bab 12), R-3 (Bab 19), D-07

---

## Task List P1 — Tinggi

### P1-A: R-1 — Keputusan OTP (putuskan D-01 dulu)

> Selesaikan D-01 di decisions-log.md sebelum mengerjakan ini.

**Jika D-01 = Opsi B (matikan — disarankan):**
- [ ] **P1-A1b**: `routes/auth.ts:253-263` — tambah komentar `// TODO: OTP delivery not implemented. See decisions-log.md D-01`
- [ ] **P1-A2b**: Hapus log palsu `'OTP generated and sent to WhatsApp'` — ganti dengan `'OTP generated but delivery disabled (see D-01)'`
- [ ] **P1-A3b**: Implementasi di mobile ditangani Sub-bab 05 task MF

**Jika D-01 = Opsi A (aktifkan):**
- Dikerjakan di Sub-bab 05 task MF (karena menyentuh mobile dan backend sekaligus)

**Effort**: 1 jam (Opsi B) | **Referensi**: P0-1 (Bab 12), R-1 (Bab 19), D-01

---

### P1-B: R-8 — sendTemplateMessage Rusak untuk Fonnte

- [ ] **P1-B1**: Buka `apps/backend/src/services/whatsapp.ts:236-257`
- [ ] **P1-B2**: Tambah branch berdasarkan `WA_PROVIDER`:
  ```typescript
  if (config.WA_PROVIDER === 'fonnte') {
    throw new AppError('UNSUPPORTED_OPERATION', 'Template message tidak didukung oleh Fonnte provider. Gunakan Meta.');
  }
  // Lanjut dengan payload Meta...
  ```
- [ ] **P1-B3**: Test: `WA_PROVIDER=fonnte` → panggil `sendTemplateMessage` → harus throw error eksplisit (bukan gagal diam-diam)

**Effort**: setengah hari + test | **Referensi**: P1-8 (Bab 13), R-8 (Bab 19)

---

### P1-C: FCM Notifikasi — Bertahap (dikerjakan di Sub-bab 02 dan 03)

> Task ini dipecah di Sub-bab lain karena butuh migrasi DB:
> - Sub-bab 03 task C2: tambah kolom `fcm_token` di tabel `users`
> - Sub-bab 02 task FCM (opsional, bisa dijadwalkan belakangan): endpoint registrasi + kirim notifikasi

- [ ] **P1-C1**: Catat di sini sebagai reminder: `scheduler.worker.ts:83-93` ada dead code (query dibuang, `sendAssignmentNotification` tidak pernah dipanggil)
- [ ] **P1-C2**: Jika kolom `fcm_token` sudah ada (Sub-bab 03 task C2), lanjut ke Sub-bab 02 task FCM untuk endpoint registrasi

**Referensi**: P1-6 (Bab 13), R-6 (Bab 19)

---

## Task List P2 — Menengah

### P2-A: #10 Hapus Role Hantu (dikerjakan di Sub-bab 02 task C)

- [ ] **P2-A1**: Konfirmasi bahwa Sub-bab 02 task C sudah menghapus `ADMIN_PUSAT` dan `ADMIN_KABUPATEN`

---

### P2-B: #11 Session Row Lama (dikerjakan di Sub-bab 04 task C2)

- [ ] **P2-B1**: Konfirmasi bahwa Sub-bab 04 task C2 menutup row session lama saat rotasi refresh

---

### P2-C: #12 WA Log FAILED Hanya Attempt Terakhir

- [ ] **P2-C1**: Buka `apps/backend/src/services/whatsapp.ts:178-193`
- [ ] **P2-C2**: Di dalam catch block worker, cek apakah ini attempt terakhir:
  ```typescript
  if (job.attemptsMade >= job.opts.attempts - 1) {
    // INSERT log FAILED hanya di sini
    await db.insert(notifications).values({ status: 'FAILED', ... });
  }
  ```
- [ ] **P2-C3**: Test: job dengan attempts: 3 yang gagal semua → hanya 1 baris FAILED di tabel notifications (bukan 3)

**Effort**: 3 jam | **Referensi**: P2 #12 (Bab 14)

---

### P2-D: #13 Hapus Loop Batch Mati di sync.ts

- [ ] **P2-D1**: Buka `apps/mobile/src/services/offline/sync.ts:53,146-150,158-161`
- [ ] **P2-D2**: Dokumentasikan keputusan: pertahankan `MAX_BATCH_ITERATIONS = 1` (backoff per-item sudah cukup)
- [ ] **P2-D3**: Hapus kode loop mati yang tidak pernah dijalankan
- [ ] **P2-D4**: Tambah komentar: `// Batch-level retry dinonaktifkan (MAX_BATCH_ITERATIONS=1). Per-item backoff via next_retry_at sudah cukup.`

**Effort**: 1 jam | **Referensi**: P2 #13 (Bab 14)

---

### P2-E: #14 Satukan Lookup Phone OTP

- [ ] **P2-E1**: Buka `routes/auth.ts:236` (`request-otp`) — cek `users.phone`
- [ ] **P2-E2**: Buka `routes/auth.ts:340` (`verify-otp`) — cek `officers.phone`
- [ ] **P2-E3**: Satukan keduanya: lookup via `officers` join `users` (OTP memang khusus petugas)
- [ ] **P2-E4**: Test: user yang punya record `users` tapi tidak punya `officers` → `request-otp` harus langsung 404 (bukan 200 palsu)

**Effort**: 1 jam | **Referensi**: P2 #14 (Bab 14)

---

### P2-F: #17 Audit Logger OWNERSHIP_DENIED

- [ ] **P2-F1**: Buka `apps/backend/src/middleware/audit-logger.ts:9-12,33-45`
- [ ] **P2-F2**: Baca error code dari response:
  - Jika error code = `FORBIDDEN_SCOPE` → log sebagai `OWNERSHIP_DENIED`
  - Jika error code = `UNAUTHORIZED` → log sebagai `AUTH_FAILED`
- [ ] **P2-F3**: Test: request dengan role valid tapi scope salah → audit log harus `OWNERSHIP_DENIED`, bukan `AUTH_FAILED`

**Effort**: 2 jam | **Referensi**: P2 #17 (Bab 14)

---

## Task List P3 — Hygiene (Commit Cleanup ~1 jam)

- [ ] **P3-1**: `routes/admin/collections.ts` — putuskan: hapus atau daftarkan di `admin/index.ts:18-25`
  - Jika hapus: `Remove-Item apps/backend/src/routes/admin/collections.ts`
  - Jika daftarkan: pastikan tidak duplikat dengan `bendahara.ts` + report services
- [ ] **P3-2**: `routes/bendahara.ts:5` — hapus unused import `getRoleScope`
- [ ] **P3-3**: `packages/shared-types/package-lock.json` — hapus (dikerjakan di Sub-bab 03 task F1)
- [ ] **P3-4**: `packages/design-tokens/` — isi dengan `package.json` minimal atau hapus seluruh folder

---

## Verifikasi dan Done Criteria

- [ ] `pnpm --filter lazisnu-backend test:unit` — semua hijau ✅
- [ ] `pnpm --filter lazisnu-backend run lint` — tidak ada error ✅
- [ ] `pnpm --filter lazisnu-backend exec tsc --noEmit` — tidak ada error ✅
- [ ] CORS: request dari origin asing → ditolak 403 ✅
- [ ] Scheduler tanpa `INTERNAL_API_KEY` → 503 ✅
- [ ] `grep -r "blacklist:at" apps/backend/src/` → tidak ada hasil ✅
- [ ] `sendTemplateMessage` dengan Fonnte → error eksplisit ✅
- [ ] WA log FAILED: 1 row per notifikasi gagal, bukan 3 ✅
- [ ] D-01 sudah diputus dan tindakan diambil ✅

---

## Catatan Risiko

> ⚠️ **CORS whitelist**: Pastikan `CORS_ORIGINS` diset di production `.env` sebelum deploy — jika tidak diset dan production tidak mengenali env ini, CORS bisa salah konfigurasi.

> ⚠️ **P0-C (blacklist dead code)**: Dikerjakan di Sub-bab 04. Pastikan koordinasi — jangan hapus di satu tempat tapi lupa di Sub-bab 04.

---

## Referensi

- `analisis-master-lazisnu.md`: Bab 12 (P0), Bab 13 (P1), Bab 14 (P2), Bab 15 (P3), Bab 19 (R-1 s/d R-17)
- `docs/implementation/decisions-log.md`: D-01, D-07
- File yang dimodifikasi: `app.ts`, `routes/scheduler.ts`, `routes/auth.ts`, `services/whatsapp.ts`, `middleware/audit-logger.ts`, `services/offline/sync.ts`, `routes/admin/collections.ts`, `routes/bendahara.ts`
