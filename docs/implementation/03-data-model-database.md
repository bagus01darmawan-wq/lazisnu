# Sub-bab 03 — Data Model & Database

> **Target Minggu**: Minggu 2
> **Prasyarat**: Sub-bab 06 selesai, Sub-bab 02 task B (JWT secret) selesai
> **Estimasi Total**: 2–3 hari
> **Keputusan**: D-10 (✅ DROP `sync_queues` Opsi A)

---

## Konteks & Tujuan

Sub-bab ini memastikan **schema database bersih, migrasi terkontrol, dan tidak ada drift** antara dev dan production:
1. Transisi dari `drizzle-kit push` ke `drizzle-kit migrate` untuk staging/production
2. Rekonsiliasi 5 SQL legacy yang belum masuk journal
3. Hapus `sync_queues` dead schema dari database & ORM (D-10)
4. Tambah kolom `device_id` di `user_sessions` (diperlukan oleh Sub-bab 04 — Bab 20 Fase 1)
5. Tambah kolom `fcm_token` di `users` (diperlukan oleh Sub-bab 02 task FCM)

Referensi analisis: `analisis-master-lazisnu.md` **Bab 6, 14 (P2 #10), 18 (INFRA-6), 19 (R-6/#10), 21 (I-4, I-20)**

---

## Task List

### A — Rekonsiliasi Migration Journal

> Tujuan: `drizzle-kit migrate` tidak mencoba mengulang SQL yang sudah pernah diapply manual.

- [ ] **A1** Baca `apps/backend/src/database/meta/_journal.json` — catat 3 entry yang sudah ada:
  - `0000_tired_toxin`
  - `0001_long_blur`
  - `0002_great_virginia_dare`
- [ ] **A2** Review 5 SQL legacy di `apps/backend/src/database/migrations/`:
  - `0001_rename_nominal.sql`
  - `0002_collection_version_integrity.sql`
  - `0003_collection_query_indexes.sql`
  - `0004_remove_payment_method.sql`
  - `immutable-rule.sql`
- [ ] **A3** Untuk setiap SQL legacy: tentukan apakah sudah di-apply di production atau belum
  - Sudah applied: tandai sebagai applied di journal (entry manual atau snapshots)
  - Belum applied: jadikan migration baru via `drizzle-kit generate`
- [ ] **A4** Buat `docs/DEPLOYMENT.md` — dokumentasikan langkah baseline:
  - "SQL legacy berikut sudah di-apply manual sebelum tanggal X, tidak perlu dijalankan lagi"
  - Sertakan daftar A2

**Effort**: ½ hari
**Referensi**: Bab 6.4 + I-4 (Bab 21)

---

### B — Migrasi: Push → Migrate untuk Staging/Production

- [ ] **B1** Update `apps/backend/package.json`:
  - `"db:push"` — pertahankan untuk local dev saja
  - Tambah `"db:migrate": "drizzle-kit migrate"` untuk staging/production
  - Tambah `"db:generate": "drizzle-kit generate"` untuk generate migration dari schema change
- [ ] **B2** Update `apps/backend/drizzle.config.ts` (jika ada) atau buat konfigurasi drizzle-kit yang benar
- [ ] **B3** Masukkan `immutable-rule.sql` ke dalam migration kustom:
  - Buat file `migrations/0003_immutable_rule.sql` (atau nomor berikutnya) berisi isi `immutable-rule.sql`
  - Tambah entry di `meta/_journal.json`
- [ ] **B4** Workflow baru untuk perubahan schema ke depan:
  1. Ubah `schema.ts`
  2. `pnpm db:generate` → review SQL yang dihasilkan
  3. Commit migration file
  4. Saat deploy: `pnpm db:migrate` (atau entrypoint container menjalankan ini otomatis)
- [ ] **B5** Update `docs/DEPLOYMENT.md` dengan langkah migration

**Effort**: 1 hari (termasuk rekonsiliasi A)
**Referensi**: INFRA-6 (Bab 18.1) + I-4 (Bab 21)

---

### C — Tambah Kolom untuk Fitur Baru

> Kolom-kolom ini diperlukan oleh sub-bab lain. Kerjakan setelah B selesai (agar pakai workflow baru).

- [ ] **C1** Tambah kolom `device_id` di tabel `user_sessions` (diperlukan oleh Sub-bab 04):
  - Tipe: `varchar(100)`, nullable (kompatibel data lama)
  - Generate migration: `pnpm db:generate`
  - Review dan commit migration file
- [ ] **C2** Tambah kolom `fcm_token` di tabel `users` (diperlukan oleh Sub-bab 02 task FCM):
  - Tipe: `varchar(255)`, nullable
  - Generate migration: `pnpm db:generate`
  - Review dan commit migration file
- [ ] **C3** Apply ke database dev: `pnpm db:migrate`
- [ ] **C4** Verifikasi: `SELECT column_name FROM information_schema.columns WHERE table_name = 'user_sessions';` — kolom `device_id` ada

**Effort**: ½ hari
**Referensi**: Bab 20.2 (Fase 1, kolom device_id) + Bab 19 (R-6, FCM)

---

### D — Hapus Tabel `sync_queues` sampai Bersih (D-10 Opsi A)

> **Keputusan D-10**: Opsi A — DROP tabel `sync_queues` dari database & ORM schema.

- [ ] **D1** Buat migration untuk DROP tabel: `pnpm db:generate` atau buat manual SQL `DROP TABLE sync_queues;`
- [ ] **D2** Hapus referensi `syncQueues` dari `apps/backend/src/database/schema.ts`
- [ ] **D3** Cari referensi lain: `grep -r "sync_queues\|syncQueues" apps/backend/src/`
- [ ] **D4** Hapus semua referensi yang ditemukan
- [ ] **D5** Apply migration: `pnpm db:migrate`

**Effort**: 1 jam
**Referensi**: INFRA-24 (Bab 18.3) + I-20 (Bab 21) + D-10 (`decisions-log.md`)

---

### E — Verifikasi Enum Roles di Database

- [ ] **E1** Verifikasi enum `user_role` di database production hanya berisi 4 nilai:
  ```sql
  SELECT unnest(enum_range(NULL::user_role));
  -- Expected: ADMIN_KECAMATAN, ADMIN_RANTING, BENDAHARA, PETUGAS
  ```
- [ ] **E2** Pastikan tidak ada token JWT aktif yang membawa role `ADMIN_PUSAT` atau `ADMIN_KABUPATEN` (setelah JWT secret dirotasi di Sub-bab 02 task B, ini otomatis teratasi)

**Effort**: 30 menit
**Referensi**: P2 #10 (Bab 14) + R-9 (Bab 19)

---

### F — Cleanup Hygiene Database

- [ ] **F1** Buka `packages/shared-types/package-lock.json` — hapus file ini (inkonsisten dengan monorepo pnpm)
  ```bash
  rm packages/shared-types/package-lock.json
  ```
- [ ] **F2** Verifikasi `pnpm install --frozen-lockfile` masih berhasil setelah penghapusan
- [ ] **F3** Review `packages/design-tokens/` — jika hanya berisi subfolder `proposals/` kosong tanpa `package.json`:
  - Opsi A: hapus seluruh folder (`rm -rf packages/design-tokens/`)
  - Opsi B: tambah `package.json` jika ada rencana penggunaan

**Effort**: 30 menit
**Referensi**: Temuan P3 (Bab 15)

---

## Verifikasi & Done Criteria

Checklist wajib sebelum sub-bab ini dinyatakan selesai:

- [ ] `pnpm db:migrate` berhasil dijalankan di database dev ✅
- [ ] Migration journal konsisten — tidak ada SQL legacy yang "menggantung" ✅
- [ ] Kolom `user_sessions.device_id` ada di database ✅
- [ ] Kolom `users.fcm_token` ada di database ✅
- [ ] Tabel `sync_queues` di-DROP sampai bersih ✅
- [ ] `packages/shared-types/package-lock.json` sudah dihapus ✅
- [ ] `pnpm --filter lazisnu-backend exec tsc --noEmit` — tidak ada error ✅
- [ ] `pnpm --filter lazisnu-backend run lint` — tidak ada error ✅

---

## Catatan Risiko

> ⚠️ **Jangan jalankan `db:push` di production** — gunakan `db:migrate`. `db:push` boleh hanya untuk local dev.

> ⚠️ **immutable-rule.sql** harus di-apply sekali jika belum. Verifikasi dulu: `SELECT * FROM pg_rules WHERE tablename = 'collections';`

---

## Referensi

- `analisis-master-lazisnu.md`: Bab 6.4 (migrasi hybrid), Bab 6.1 (entity relationship), Bab 18.1 (INFRA-5, INFRA-6), Bab 21 (I-4, I-20)
- `docs/implementation/decisions-log.md`: D-10
- File yang dimodifikasi: `database/schema.ts`, `database/migrations/*`, `meta/_journal.json`, `package.json`, `drizzle.config.ts`, `packages/shared-types/` (hapus lock file), `packages/design-tokens/` (cleanup)
