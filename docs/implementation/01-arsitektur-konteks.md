# Sub-bab 01 — Arsitektur & Konteks Proyek

> **Status**: 📖 Referensi Murni — Tidak Ada Task yang Dikerjakan
> **Tujuan**: Pastikan developer memahami arsitektur proyek sebelum mulai mengerjakan sub-bab 02 ke atas.

---

## Konteks

Sub-bab ini adalah **titik masuk** dari seluruh implementation plan. Tidak ada kode yang diubah di sini.
Baca dan pahami dulu sebelum lanjut ke sub-bab berikutnya.

### Sumber Referensi Utama

| Dokumen | Isi | Bab di Analisis |
|---------|-----|-----------------|
| `analisis-master-lazisnu.md` | Single source of truth seluruh analisis | Seluruh dokumen |
| `docs/implementation/decisions-log.md` | Keputusan produk/teknis | — |
| `apps/backend/src/database/schema.ts` | Seluruh model data | Bab 6 |
| `apps/backend/src/app.ts` | Bootstrap server + middleware stack | Bab 5.2 |
| `packages/shared-types/src/index.ts` | Kontrak API bersama | Bab 11 |

---

## Ringkasan Arsitektur

### Stack Teknologi

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| Backend | Fastify + TypeScript | ^4.27.0 / ^5.4.5 |
| ORM | Drizzle ORM | ^0.45.2 |
| Database | PostgreSQL via Supabase | ap-southeast-1 |
| Cache/Queue | Redis via Upstash + BullMQ | ioredis ^5.4.1 |
| Web | Next.js + React | 16.2.4 / 19.2.4 |
| Mobile | React Native (Android) | 0.74.1 |
| Storage | Cloudflare R2 | @aws-sdk v3 |
| WhatsApp | Fonnte (fallback Meta) | env: WA_PROVIDER |

### Monorepo Structure

```
lazisnu/
├── apps/backend/       # Fastify API
├── apps/web/           # Next.js Dashboard
├── apps/mobile/        # React Native Android
├── packages/shared-types/  # Kontrak API bersama
└── docs/implementation/    # Implementation plan ini
```

### Tiga Pilar Bisnis

| Pilar | Implementasi |
|-------|-------------|
| Immutable audit trail | collections INSERT-only + PostgreSQL RULE |
| WhatsApp verifikasi eksternal | BullMQ → whatsapp.worker.ts → Fonnte/Meta |
| Offline-first mobile | MMKV queue → mobileSyncService.ts |

---

## Kondisi Saat Ini (Ringkasan)

### ✅ Yang Sudah Baik
- Immutable ledger berlapis (DB RULE + unique index + service validation)
- RBAC granular dengan 4 role
- Offline-first solid (MMKV + exponential backoff + dedup)
- Audit trail komprehensif
- Rate limit berlapis

### 🔴 Yang Harus Diperbaiki (P0 — Kritis)
1. OTP tidak pernah dikirim (P0-1) → lihat D-01 di decisions-log.md
2. Revoke sesi tidak mencabut refresh token (P0-2)
3. Blacklist access token = dead code (P0-3)

### 🟠 Yang Harus Diperbaiki (P1 — Tinggi)
4. Scheduler guard fail-open (P1-4)
5. CORS `origin: true` (P1-5)
6. FCM notification stub (P1-6)
7. `revokeAllUserRefreshJti` no-op (P1-7)
8. `sendTemplateMessage` rusak untuk Fonnte (P1-8)

### ⚠️ Infrastruktur Kritis
- Tidak ada Docker/containerization
- Deploy masih manual via SSH
- Test tidak dijalankan di CI
- Tidak ada backup database terjadwal
- Tidak ada monitoring/alerting

---

## Urutan Sub-bab (Roadmap)

```
[REFERENSI] Sub-bab 01 — Arsitektur & Konteks Proyek
     ↓
[MINGGU 1]  Sub-bab 06 — Temuan & Perbaikan Kode (P0 + P1)
     ↓
[MINGGU 1]  Sub-bab 07 — Infrastruktur & DevOps (quick wins: scheduler, CI, prom-client)
     ↓
[MINGGU 2]  Sub-bab 02 — Backend Core (scheduler aktif, JWT secret split, role cleanup)
     ↓
[MINGGU 2]  Sub-bab 03 — Data Model & Database (migrasi, schema cleanup)
     ↓
[MINGGU 2]  Sub-bab 04 — Alur Data & Sesi (Bab 20 Fase 1: per-device keys)
     ↓
[MINGGU 3-4] Sub-bab 05 — Frontend: Web & Mobile (Bab 20 Fase 2: biometrik)
     ↓
[MINGGU 3-4] Sub-bab 07 — Infrastruktur lanjutan (Docker, nginx, backup, staging)
     ↓
[BULAN 2-3]  Sub-bab 08 — Rencana Implementasi Final (maturity, ops)
     ↓
[REFERENSI] Sub-bab 09 — Appendix & Referensi
```

---

## Checklist Pemahaman Awal (Wajib Sebelum Lanjut)

Pastikan kamu sudah:

- [ ] Membaca `analisis-master-lazisnu.md` Bab 1–4 (ringkasan eksekutif, identitas, monorepo, tech stack)
- [ ] Membaca `decisions-log.md` dan mengetahui keputusan mana yang masih pending
- [ ] Memahami alur submit koleksi end-to-end (Bab 7.1 analisis)
- [ ] Memahami 3 celah P0 di auth (Bab 12 analisis)
- [ ] Menjalankan `pnpm install` dan memastikan repo bisa di-build: `pnpm build:shared`
- [ ] Menjalankan health check: `curl http://localhost:3001/health/ready`

---

*Sub-bab ini hanya referensi — tidak ada kode yang diubah. Lanjut ke [Sub-bab 06](./06-temuan-perbaikan-kode.md) untuk mulai eksekusi.*
