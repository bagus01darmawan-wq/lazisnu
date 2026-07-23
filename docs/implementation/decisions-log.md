# Decisions Log — Lazisnu Implementation Plan

> Dokumen ini mencatat semua **keputusan produk/teknis yang masih pending** selama proses implementasi.
> Setiap sub-bab implementation plan mereferensikan dokumen ini untuk keputusan yang belum final.
> Update status kolom **Keputusan** segera setelah ada kesepakatan, lalu sesuaikan task di sub-bab terkait.

Terakhir diperbarui: 2026-07-22

---

## Cara Menggunakan Dokumen Ini

1. Setiap keputusan punya **ID unik** (D-01, D-02, dst.)
2. Sebelum mengerjakan sub-bab yang mereferensikan keputusan tertentu, pastikan status = ✅ **Diputuskan**
3. Jika masih ⏳ **Pending**, diskusikan dulu dengan product owner / stakeholder sebelum lanjut coding
4. Setelah keputusan diambil: catat di kolom "Keputusan", ubah status, dan update task di sub-bab terkait

---

## Daftar Keputusan

### D-01 — OTP Login Petugas: Aktifkan atau Matikan?

| Atribut | Detail |
|---------|--------|
| **ID** | D-01 |
| **Status** | ✅ Diputuskan |
| **Direferensikan di** | Sub-bab 06, Sub-bab 05 |
| **Sumber analisis** | Bab 12 (P0-1) + Bab 19 (R-1) |
| **Konteks** | OTP di-generate dan disimpan ke Redis (TTL 5 menit) tapi tidak pernah dikirim. |
| **Keputusan** | **Opsi A: Aktifkan penuh via WA** — hubungkan `sendOtpMessage(phone, otp)` di `whatsapp.ts`, panggil langsung di `auth.ts`. Tambah OTP delivery & fix lookup phone di mobile. |
| **Diputuskan oleh** | Product Owner — 2026-07-22 |

---

### D-02 — Durasi Refresh Token: 365 Hari untuk Semua Role?

| Atribut | Detail |
|---------|--------|
| **ID** | D-02 |
| **Status** | ✅ Diputuskan |
| **Direferensikan di** | Sub-bab 04, Sub-bab 06 |
| **Keputusan** | 365 hari untuk SEMUA role. Mitigasi: revocation per-device (Bab 20 Fase 1) + biometrik mobile. |
| **Diputuskan oleh** | Product Owner — 2026-07-21 |

---

### D-03 — Model Sesi Perangkat: Multi-device?

| Atribut | Detail |
|---------|--------|
| **ID** | D-03 |
| **Status** | ✅ Diputuskan |
| **Direferensikan di** | Sub-bab 06, Sub-bab 04 |
| **Keputusan** | Multi-device, overwrite per device. Login ulang di perangkat sama menimpa key itu saja. |
| **Diputuskan oleh** | Product Owner — 2026-07-21 |

---

### D-04 — Reuse Detection: Aktifkan atau Tidak?

| Atribut | Detail |
|---------|--------|
| **ID** | D-04 |
| **Status** | ✅ Diputuskan |
| **Direferensikan di** | Sub-bab 06 |
| **Keputusan** | Tidak diaktifkan. Refresh JTI basi → 401 REFRESH_REVOKED biasa, tanpa revoke massal. |
| **Diputuskan oleh** | Product Owner — 2026-07-21 |

---

### D-05 — Scheduler: BullMQ Cron In-process + HTTP Fallback?

| Atribut | Detail |
|---------|--------|
| **ID** | D-05 |
| **Status** | ✅ Diputuskan |
| **Direferensikan di** | Sub-bab 02, Sub-bab 07 |
| **Keputusan** | Aktifkan BullMQ cron DAN pertahankan HTTP /v1/scheduler/* sebagai fallback manual. |
| **Catatan** | Strategi round-robin (cron) vs first-officer (HTTP) harus diseragamkan — lihat D-06. |
| **Diputuskan oleh** | Tim teknis — 2026-07-21 |

---

### D-06 — Strategi Assignment Generator & Background Scheduler: Hapus Total atau Pertahankan?

| Atribut | Detail |
|---------|--------|
| **ID** | D-06 |
| **Status** | ✅ Diputuskan |
| **Direferensikan di** | Sub-bab 02, Sub-bab 07 |
| **Konteks** | Scheduler background tanggal 1 tidak dibutuhkan karena penugasan kaleng dilakukan murni secara manual/bulk oleh Admin Web. |
| **Keputusan** | **Hapus Total** — Hapus background cron scheduler tanggal 1 (`scheduler.worker.ts`) dan helper code mati dari backend. Penugasan 100% via Admin Web (manual/bulk per dukuh). |
| **Diputuskan oleh** | Product Owner — 2026-07-22 |

---

### D-07 — Blacklist Access Token: Hapus Kode Mati?

| Atribut | Detail |
|---------|--------|
| **ID** | D-07 |
| **Status** | ✅ Diputuskan |
| **Direferensikan di** | Sub-bab 06 (R-3, P0-3) |
| **Keputusan** | Hapus kode blacklist (auth.ts:530-542). Terima window revoke 15 menit (TTL access token). |
| **Diputuskan oleh** | Tim teknis — 2026-07-21 |

---

### D-08 — Redis Fallback: Fail-Open atau Fail-Closed?

| Atribut | Detail |
|---------|--------|
| **ID** | D-08 |
| **Status** | ✅ Diputuskan |
| **Direferensikan di** | Sub-bab 04, Sub-bab 07 |
| **Keputusan** | Fail-closed di production: Redis null + NODE_ENV=production → throw 503. Di dev: fallback + log warning. |
| **Diputuskan oleh** | Tim teknis — 2026-07-21 |

---

### D-09 — Biometrik Mobile: Wajib atau Opsional?

| Atribut | Detail |
|---------|--------|
| **ID** | D-09 |
| **Status** | ✅ Diputuskan |
| **Direferensikan di** | Sub-bab 05, Sub-bab 08 |
| **Keputusan** | Opsional (toggle On/Off). Sidik jari = gate ke refresh token di Keystore, bukan bypass server. |
| **Diputuskan oleh** | Product Owner — 2026-07-21 |

---

### D-10 — sync_queues Dead Schema: DROP atau Pertahankan?

| Atribut | Detail |
|---------|--------|
| **ID** | D-10 |
| **Status** | ✅ Diputuskan |
| **Direferensikan di** | Sub-bab 03, Sub-bab 07 |
| **Konteks** | Tabel sync_queues ada di schema tapi tidak pernah dipakai. Mekanisme MMKV + batch endpoint sudah terbukti. |
| **Keputusan** | **Opsi A: DROP via migrasi drizzle sampai bersih** — hapus tabel dari schema DB, migrasi, dan shared-types. |
| **Diputuskan oleh** | Product Owner — 2026-07-22 |

---

## Ringkasan Status

| ID | Topik | Status | Sub-bab |
|----|-------|--------|---------|
| D-01 | OTP Login Petugas | ✅ Diputuskan (Opsi A) | 05, 06 |
| D-02 | Refresh Token 365 Hari | ✅ Diputuskan | 04, 06 |
| D-03 | Multi-device Session | ✅ Diputuskan | 04, 06 |
| D-04 | Reuse Detection | ✅ Diputuskan | 06 |
| D-05 | Scheduler BullMQ + HTTP | ✅ Diputuskan | 02, 07 |
| D-06 | Background Auto-Scheduler | ✅ Diputuskan (Hapus Total) | 02, 07 |
| D-07 | Blacklist Access Token | ✅ Diputuskan | 06 |
| D-08 | Redis Fallback | ✅ Diputuskan | 04, 07 |
| D-09 | Biometrik Mobile | ✅ Diputuskan | 05, 08 |
| D-10 | sync_queues Schema | ✅ Diputuskan (DROP Opsi A) | 03, 07 |

> 🎉 **SEMUA 10 KEPUTUSAN SUDAH DIPUTUSKAN!** Bebas hambatan untuk memulai pengerjaan sub-bab.
