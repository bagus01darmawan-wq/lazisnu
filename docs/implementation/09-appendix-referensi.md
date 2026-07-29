# Sub-bab 09 — Appendix & Referensi

> **Status**: 📖 Referensi Murni — Tidak Ada Task yang Dikerjakan
> **Tujuan**: Panduan belajar, verifikasi klaim, dan traceability implementasi

---

## Konteks

Sub-bab ini adalah **referensi permanen** selama dan setelah implementasi.
Tidak ada task yang dikerjakan di sini — ini adalah navigasi ke sumber informasi yang tepat.

---

## A — Navigasi Cepat ke Analisis

| Pertanyaan | Jawab di | Bab/Section |
|------------|---------|------------|
| Arsitektur monorepo apa? | `analisis-master-lazisnu.md` | Bab 3 (struktur) |
| Tech stack versi berapa? | `analisis-master-lazisnu.md` | Bab 4 (tabel terverifikasi) |
| Bagaimana flow submit koleksi? | `analisis-master-lazisnu.md` | Bab 7.1 (happy path + kode) |
| Bagaimana offline-first bekerja? | `analisis-master-lazisnu.md` | Bab 7.2 (MMKV queue) |
| Bagaimana auth flow bekerja? | `analisis-master-lazisnu.md` | Bab 7.3 (detail kode) |
| Mengapa OTP tidak fungsional? | `analisis-master-lazisnu.md` | Bab 12 (P0-1) |
| Mengapa revoke sesi tidak bekerja? | `analisis-master-lazisnu.md` | Bab 12 (P0-2) |
| Apa itu per-device keys? | `analisis-master-lazisnu.md` | Bab 20 Fase 1 |
| Bagaimana biometrik diimplementasikan? | `analisis-master-lazisnu.md` | Bab 20 Fase 2 |
| Apa gap infrastruktur saat ini? | `analisis-master-lazisnu.md` | Bab 17–18 |
| Apa roadmap lengkap? | `analisis-master-lazisnu.md` | Bab 23 |
| Apa trade-off yang sudah diputuskan? | `docs/implementation/decisions-log.md` | Semua D |

---

## B — File Kritis yang Harus Dipahami

Urutan baca yang disarankan sebelum mulai coding:

```
1. apps/backend/src/database/schema.ts         — seluruh model data
2. apps/backend/src/app.ts                     — bootstrap server + middleware stack
3. apps/backend/src/middleware/auth.ts         — RBAC + JWTPayload
4. apps/backend/src/routes/auth.ts             — auth, sesi, OTP (708 baris, pusat temuan P0)
5. apps/backend/src/services/tokenService.ts  — revocation logic (akan direfactor Sub-bab 04)
6. apps/backend/src/services/mobileSyncService.ts  — sync pipeline
7. apps/backend/src/services/collectionSubmission.ts  — business rules koleksi
8. apps/mobile/src/services/offline/queue.ts  — offline queue MMKV
9. apps/mobile/src/services/offline/sync.ts   — sync logic
10. apps/mobile/src/services/api.ts            — fetch client + refresh subscriber
11. apps/web/src/middleware.ts                 — RBAC web
12. packages/shared-types/src/index.ts        — API contract (12KB, 434 baris)
```

---

## C — Cara Menjalankan Test

```bash
# Build shared types (wajib sebelum test backend/web)
pnpm build:shared

# Backend unit test (tidak butuh DB live)
pnpm --filter lazisnu-backend test:unit

# Backend integration test (butuh .env.test + DB)
pnpm --filter lazisnu-backend test:integration

# Semua backend test
pnpm --filter lazisnu-backend test:all

# Mobile test
pnpm --filter lazisnu-collector-app test

# Health check (saat server berjalan)
curl http://localhost:3001/health/ready

# Metrics (setelah Sub-bab 07 A3: prom-client diinstall)
curl http://localhost:3001/metrics

# Lint + typecheck semua
pnpm -r --no-bail run lint
pnpm -r exec tsc --noEmit
```

---

## D — Latihan Pemahaman (dari Appendix C Analisis)

Latihan ini membantu memastikan pemahaman sebelum coding:

1. **Trace submit koleksi**: Ikuti alur dari `useCollectionStore` di mobile → hingga row di tabel `collections` + job di BullMQ. Tandai setiap file yang dilalui.

2. **Identifikasi route admin berbeda**: Dari 8 sub-route admin yang terdaftar, mana yang scope data-nya berbeda per role? Bandingkan ADMIN_KECAMATAN vs ADMIN_RANTING.

3. **Bandingkan journal migrasi**: Isi `meta/_journal.json` (3 entry) vs 5 SQL legacy — mana yang sudah di-apply? Bagaimana cara tahu?

4. **Simulasikan revoke sesi** (sebelum Sub-bab 04):
   - Login → catat refresh token
   - `DELETE /v1/auth/sessions/:id`
   - Coba refresh dengan token tadi
   - Apakah benar-benar 401? (jawab: TIDAK sebelum Sub-bab 04 — ini adalah P0-2)

5. **Verifikasi P0-3**: Login → logout → coba gunakan access token dalam 15 menit → masih bisa? (jawab: YA — karena blacklist tidak dibaca)

---

## E — Dokumen Sumber (Dipertahankan sebagai Rekam Jejak)

| Dokumen | Peran | Status |
|---------|-------|--------|
| `docs/analisis-arsitektur-infrastruktur-lazisnu-gabungan.md` | Analisis arsitektur + infrastruktur awal | Terkonsolidasi ke `analisis-master-lazisnu.md` |
| `docs/review-verifikasi-analisis-arsitektur.md` | Audit akurasi dokumen gabungan | Terkonsolidasi ke Appendix A analisis master |
| `docs/analisis-mendalam-kodebase-lazisnu.md` | Analisis kode independen + rencana final | Terkonsolidasi ke Bagian II & IV analisis master |

> Untuk menghindari duplikasi pemeliharaan, perubahan arsitektur selanjutnya cukup dicatat di `analisis-master-lazisnu.md`. Ketiga dokumen sumber dipertahankan apa adanya sebagai rekam jejak.

---

## F — Klaim Terverifikasi AKURAT (dari Appendix A.1 Analisis)

Ringkasan klaim yang sudah diverifikasi langsung ke kode — berguna sebagai ground truth saat debugging:

| Area | Klaim Terverifikasi | Bukti |
|------|---------------------|-------|
| Scheduler off | `index.ts` baris 6, 20-22, 33 dikomen | Persis ✓ |
| CORS | `origin: true` | `app.ts:35` ✓ |
| OTP tidak terkirim | `auth.ts:260-263` — log palsu | Persis ✓ |
| Services count | Tepat 20 file service | `src/services/` ✓ |
| WA worker params | 2 msg/s, attempts 3, backoff 5000ms, jobId dedup | `whatsapp.worker.ts:28-32` ✓ |
| Collections schema | Semua kolom + unique(assignment,can,sequence) | `schema.ts:113-136` ✓ |
| Test files | 28 file (19 backend + 9 mobile, web 0) | glob `__tests__` ✓ |
| Mobile HTTP client | `fetch`, bukan Axios | `api.ts:118,163,178,419` ✓ |

---

## G — Klaim KELIRU yang Sudah Dikoreksi

Ini adalah klaim dari dokumen sumber yang **salah** — jangan ikuti versi lamanya:

1. ❌ "Mobile menggunakan Axios" → ✅ **Mobile menggunakan `fetch`** (Axios hanya di web)
2. ❌ "Offline batch hanya mendukung CASH" → ✅ **Kolom `payment_method` sudah di-DROP**; tidak ada field method
3. ❌ "Ada tabel `qr_codes`" → ✅ **Hanya kolom** `cans.qr_code` (varchar, unique, nullable)
4. ❌ "Sub-route admin 10" → ✅ **8 terdaftar** (`collections.ts` ada tapi tidak pernah didaftarkan = dead route)
5. ❌ "Cookie keduanya HttpOnly" → ✅ Hanya `lazisnu_refresh_token` HttpOnly; access token sengaja non-HttpOnly
6. ❌ "JTI dicek di user_sessions" → ✅ Dicek ke **Redis**; tabel hanya ditulis

---

## H — Indeks Implementation Plan

| Sub-bab | File | Target | Status |
|---------|------|--------|--------|
| 01 — Arsitektur & Konteks | [01-arsitektur-konteks.md](./01-arsitektur-konteks.md) | Referensi | 📖 |
| 02 — Backend Core | [02-backend-core.md](./02-backend-core.md) | Minggu 2 | ⬜ |
| 03 — Data Model & Database | [03-data-model-database.md](./03-data-model-database.md) | Minggu 2 | ⬜ |
| 04 — Alur Data & Sesi | [04-alur-data-sesi.md](./04-alur-data-sesi.md) | Minggu 2 | ⬜ |
| 05 — Frontend: Web & Mobile | [05-frontend-web-mobile.md](./05-frontend-web-mobile.md) | Minggu 3–4 | ⬜ |
| 06 — Temuan & Perbaikan Kode | [06-temuan-perbaikan-kode.md](./06-temuan-perbaikan-kode.md) | Minggu 1 🔴 | ⬜ |
| 07 — Infrastruktur & DevOps | [07-infrastruktur-devops.md](./07-infrastruktur-devops.md) | Minggu 1–Bulan 3 | ⬜ |
| 08 — Rencana Implementasi Final | [08-rencana-implementasi-final.md](./08-rencana-implementasi-final.md) | Bulan 2–3 | ⬜ |
| 09 — Appendix & Referensi | [09-appendix-referensi.md](./09-appendix-referensi.md) | Referensi | 📖 |
| Decisions Log | [decisions-log.md](./decisions-log.md) | Selalu update | 🔄 |

> Update kolom **Status** saat memulai dan menyelesaikan setiap sub-bab:
> ⬜ Belum dimulai | 🔄 Sedang dikerjakan | ✅ Selesai | 📖 Referensi

---

*Sub-bab ini hanya referensi — tidak ada kode yang diubah.*
