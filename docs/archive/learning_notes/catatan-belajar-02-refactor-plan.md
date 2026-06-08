# Catatan Belajar 02 — Safe Refactor Plan Backend

> Panduan eksekusi mandiri untuk membersihkan tech debt backend Lazisnu.
> Urutan berdasarkan prioritas: mulai dari yang paling aman dan berdampak.

---

## Daftar Isi

1. [Password Hash Petugas Baru](#refactor-1-password-hash-petugas-baru)
2. [Ekstrak latestCollectionCondition](#refactor-2-ekstrak-latestcollectioncondition)
3. [Hapus nodemailer](#refactor-3-hapus-nodemailer-dependency-tidak-terpakai)
4. [Standardisasi Response API](#refactor-4-standardisasi-response-api)
5. [Hapus syncQueues dari Schema](#refactor-5-hapus-syncqueues-dari-schema)
6. [Type Safety CollectionSubmission](#refactor-6-type-safety-collectionsubmission)
7. [Sinkronisasi Scheduler Route & Worker](#refactor-7-sinkronisasi-scheduler-route--worker)
8. [Pisah bendahara.ts](#refactor-8-pisah-bendaharats)
9. [Prioritas Eksekusi](#prioritas-eksekusi)
10. [Cara Test Setiap Refactor](#cara-test-setiap-refactor)

---

## REFACTOR #1: Password Hash Petugas Baru

**Aman?** ✅ Ya, tanpa perubahan API contract.
**Kenapa:** Akun petugas dibuat dengan `passwordHash: ''` — celah keamanan.
**Risiko:** Rendah. Hanya mengubah flow create officer.

### Step-by-step:

1. Buka file `apps/backend/src/routes/admin/officers.ts`
2. Cari bagian handler `POST /officers` (sekitar baris 90-130)
3. Cari baris `passwordHash: ''` di dalam `db.transaction`
4. Tambahkan import di bagian atas file:

```typescript
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
```

5. Di dalam transaction, sebelum `insert user`, tambahkan:

```typescript
const randomPassword = crypto.randomBytes(16).toString('hex');
const hashedPassword = await bcrypt.hash(randomPassword, 10);
```

6. Ganti baris `passwordHash: ''` menjadi:

```typescript
passwordHash: hashedPassword,
```

7. **Testing:** `pnpm --filter lazisnu-backend build` — pastikan tidak error
8. **Verifikasi:** Coba buat petugas baru via API `POST /v1/admin/officers` — response harus sukses

### Konsep belajar:

- `bcrypt.hash(password, saltRounds)` — fungsi hashing satu arah (tidak bisa dibalik)
- `crypto.randomBytes()` — generate random string acak
- Password kosong `''` = siapa pun bisa login tanpa verifikasi (celah keamanan)

---

## REFACTOR #2: Ekstrak latestCollectionCondition

**Aman?** ✅ 100% aman. Cuma mindah kode.
**Kenapa:** Pattern subquery yang sama di-copy-paste ke 6 file berbeda.
**Risiko:** Hampir tidak ada. Build akan gagal kalau ada yang salah.

### Step-by-step:

1. Buka `apps/backend/src/services/collectionSubmission.ts`
2. Cek fungsi `getLatestCollectionCondition()` — apakah sudah di-export?

```typescript
// Di baris paling bawah file, pastikan ada:
export function getLatestCollectionCondition() {
  // ...
}
```

3. Buka 6 file berikut yang punya duplikasi:
   - `apps/backend/src/routes/mobile/tasks.ts`
   - `apps/backend/src/routes/mobile/profile.ts`
   - `apps/backend/src/routes/mobile/collections.ts`
   - `apps/backend/src/routes/admin/dashboard.ts`
   - `apps/backend/src/routes/bendahara.ts`
   - `apps/backend/src/routes/scheduler.ts`

4. Cara fix per file — **HAPUS blok kode ini** (kurang lebih 8-10 baris):

```typescript
import { alias } from 'drizzle-orm/pg-core';
// ...
const c2 = alias(schema.collections, 'c2');
const latestCollectionCondition = eq(
  schema.collections.submitSequence,
  db.select({ maxSeq: sql<number>`max(${c2.submitSequence})` })
    .from(c2)
    .where(and(
      eq(c2.assignmentId, schema.collections.assignmentId),
      eq(c2.canId, schema.collections.canId)
    ))
);
```

5. **GANTI** dengan import dan panggil fungsi:

```typescript
import { getLatestCollectionCondition } from '../../services/collectionSubmission';

// Lalu di tempat yang sama:
const latestCollectionCondition = getLatestCollectionCondition();
```

> **Catatan:** Sesuaikan path `../../services/` dengan lokasi file.
> - File di `routes/mobile/*` → `../../services/collectionSubmission`
> - File di `routes/admin/*` → `../../services/collectionSubmission`
> - File di `routes/bendahara.ts` → `../services/collectionSubmission`
> - File di `routes/scheduler.ts` → `../services/collectionSubmission`

6. **Testing:** `pnpm --filter lazisnu-backend build` — pastikan tidak ada error
7. **Verifikasi:** Hitung file yang masih punya `alias(schema.collections, 'c2')` — harus tinggal 1 (file asli di `collectionSubmission.ts`)

### Konsep belajar:

- **DRY (Don't Repeat Yourself)** — kalau ada bug di subquery, cukup fix 1 tempat, bukan 6
- **Import/export** — fungsi shared dipanggil dari file lain, cukup import

---

## REFACTOR #3: Hapus nodemailer (Dependency Tidak Terpakai)

**Aman?** ✅ 100% aman.
**Kenapa:** Library ada di package.json tapi tidak dipakai di kode manapun.
**Risiko:** Tidak ada. Kalau masih dipakai, build akan error dan bisa rollback.

### Step-by-step:

1. Cari dulu apakah `nodemailer` benar-benar tidak dipakai:

```bash
cd /home/bagus01darmawan/lazisnu/apps/backend
grep -r "nodemailer" src/ --include="*.ts"
```

2. Kalau hasilnya **kosong** (tidak ada import), hapus:

```bash
pnpm --filter lazisnu-backend remove nodemailer @types/nodemailer
```

3. **Testing:** `pnpm --filter lazisnu-backend build` — pastikan sukses
4. **Verifikasi:** Buka `apps/backend/package.json` — `nodemailer` sudah tidak ada di daftar dependencies

### Konsep belajar:

- **Dependency hygiene** — library tidak dipakai = bundle lebih besar + potensi security hole
- **`pnpm remove`** — cara aman hapus dependency, notifikasi kalau masih dipakai

---

## REFACTOR #4: Standardisasi Response API

**Aman?** ✅ Ya, asal test tiap endpoint 1 per 1.
**Kenapa:** Response format tidak seragam — ada yang pakai `sendSuccess()`, ada yang `reply.send()` manual.
**Risiko:** Rendah. Perubahan hanya di response shape, bukan logic.

### Step-by-step:

1. Cari endpoint yang masih manual:

```bash
grep -n "reply.send" apps/backend/src/routes/mobile/collections.ts
grep -n "reply.send" apps/backend/src/routes/bendahara.ts
```

2. **Pola yang benar:**

```typescript
// ❌ SALAH — manual (cari dan ganti)
return reply.send({
  success: true,
  data: { ... }
});

// ✅ BENAR — pakai utility
return sendSuccess(reply, { ... });
```

3. Contoh konkret — file `apps/backend/src/routes/mobile/collections.ts` bagian GET `/history`:

```typescript
// Ganti:
return reply.send({
  success: true,
  data: {
    collections: collections.map((c) => ({...})),
    pagination: { page, limit, total, total_pages: ... }
  },
});

// Jadi:
return sendSuccess(reply, {
  collections: collections.map((c) => ({...})),
  pagination: { page, limit, total, total_pages: ... }
});
```

4. **Testing:** Jalankan build dulu, lalu test endpoint dengan curl:

```bash
pnpm --filter lazisnu-backend build

# Test endpoint yang diubah:
curl -H "Authorization: Bearer <token>" http://localhost:3001/v1/mobile/history
```

5. **Verifikasi:** Response harus tetap `{ success: true, data: { ... } }`

### Konsep belajar:

- **API contract** — frontend (web) dan mobile bergantung pada format response yang konsisten
- **Utility function `sendSuccess()`** — otomatis handle konversi BigInt → Number via `serializeOutput()`
- Kalau response tidak seragam, frontend bisa error parse data

---

## REFACTOR #5: Hapus syncQueues dari Schema

**⚠️ Perlu diskusi dulu — jangan hapus sekarang.**

**Kenapa:** Tabel `syncQueues` didefinisikan di `schema.ts` tapi tidak dipanggil di kode manapun.

### Yang perlu dicek:

1. Apakah mobile app mengirim data ke tabel ini?
2. Apakah ada rencana implementasi sync queue di masa depan?
3. Apakah tabel ini sudah ada di database?

Cek di database:

```bash
psql -d lazisnu -c "\d sync_queues"
```

### Tindakan sementara:

- Catat saja sebagai tech debt
- Jangan dihapus dulu sampai tahu pasti tidak dipakai

### Konsep belajar:

- **Schema vs real usage** — tidak semua tabel di schema berarti sudah dipakai
- **Database migration** — hapus tabel berarti perlu migration baru yang bisa kompleks

---

## REFACTOR #6: Type Safety CollectionSubmission

**Aman?** ✅ Ya, hanya tambah type.
**Kenapa:** Parameter `tx: any` membuat TypeScript tidak bisa deteksi error.
**Risiko:** Rendah. Build akan error kalau salah type.

### Step-by-step:

1. Buka `apps/backend/src/services/collectionSubmission.ts`
2. Cari fungsi `validateAssignmentForSubmit(tx: any, ...)`
3. Cari fungsi `submitCollection(tx: any, ...)`
4. Tambahkan import type di bagian atas:

```typescript
import { ExtractTablesWithRelations } from 'drizzle-orm';
import { PgTransaction } from 'drizzle-orm/pg-core';
import * as schema from '../database/schema';

// Type untuk Drizzle transaction
type Transaction = PgTransaction<
  any,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
```

5. Ganti `tx: any` jadi `tx: Transaction` di kedua fungsi

6. **Testing:** `pnpm --filter lazisnu-backend build` — pastikan type check lulus

### Konsep belajar:

- **Type-safe transaction** — Drizzle punya tipe khusus `PgTransaction` untuk object transaction
- Kenapa `any` itu berbahaya: TypeScript tidak bisa peringatkan kalau kamu panggil method yang tidak ada di object transaction

---

## REFACTOR #7: Sinkronisasi Scheduler Route & Worker

**Aman?** ⚠️ Sedang — perlu testing manual setelahnya.
**Kenapa:** Logika generate assignment di-copy di 2 tempat. Kalau ada perubahan, harus edit 2 file.

### Step-by-step:

1. Buat file baru `apps/backend/src/services/assignmentGenerator.ts`

2. Isi dengan fungsi yang di-extract dari `scheduler.worker.ts`:

```typescript
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, asc, notInArray } from 'drizzle-orm';

export async function generateMonthlyAssignments(year: number, month: number) {
  // Ambil logic dari scheduler.worker.ts → generateMonthlyAssignments()
  // 1. Cari kaleng yang belum di-assign
  // 2. Round-robin ke petugas aktif per ranting
  // 3. Batch insert
  // 4. Return hasil
}
```

3. Di `scheduler.worker.ts`, ganti kode duplikat jadi panggil fungsi:

```typescript
import { generateMonthlyAssignments } from '../services/assignmentGenerator';
// HAPUS function generateMonthlyAssignments() lokal
// Panggil dari service saat job dijalankan
```

4. Di `routes/scheduler.ts`, lakukan hal yang sama — hapus duplikasi, panggil dari service

5. **Testing:** POST ke `/v1/scheduler/generate-tasks` — pastikan response nya sama seperti sebelum refactor

### Konsep belajar:

- **Single Source of Truth** — logika bisnis di 1 tempat, dipanggil dari mana saja
- **Separation of Concerns** — route handler urus HTTP, worker urus cron, service urus logika bisnis

---

## REFACTOR #8: Pisah bendahara.ts

**Aman?** ⚠️ Butuh effort lebih besar.
**Kenapa:** File ~250+ baris campur aduk: route definition, query database, filtering, aggregation, formatting response.

### Step-by-step (garis besar):

1. Buat `apps/backend/src/services/reportService.ts`
2. Pindahkan logika aggregation (byDistrict, byOfficer, filtering) ke service

```typescript
export async function getMonthlyDashboardData(params: {
  role: string;
  branchId?: string;
  districtId?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  // Pindahkan query + aggregation dari bendahara.ts
}
```

3. Di `routes/bendahara.ts`, handler jadi tipis:

```typescript
fastify.get('/dashboard', async (request, reply) => {
  const data = await getMonthlyDashboardData(userScope);
  return sendSuccess(reply, data);
});
```

4. **Testing:** GET `/v1/bendahara/dashboard` — pastikan response sama persis dengan sebelum refactor

### Konsep belajar:

- **Route thin, Service fat** — route hanya jembatan HTTP, service yang urus logika
- **Testability** — fungsi di service bisa di-test tanpa perlu server HTTP berjalan

---

## Prioritas Eksekusi

| Urutan | Refactor | Waktu | Level | Mau Coba? |
|--------|----------|-------|-------|-----------|
| 1 | #3 — Hapus nodemailer | 5 menit | 🟢 Mudah | |
| 2 | #1 — Password hash | 10 menit | 🟢 Mudah | |
| 3 | #2 — Ekstrak latestCollectionCondition | 20 menit | 🟢 Mudah | |
| 4 | #4 — Standardisasi response | 30 menit | 🟡 Sedang | |
| 5 | #6 — Type safety transaction | 15 menit | 🟡 Sedang | |
| 6 | #7 — Sinkronisasi scheduler | 45 menit | 🔴 Butuh bantuan | |
| 7 | #8 — Pisah bendahara | 1 jam | 🔴 Butuh bantuan | |
| 8 | #5 — syncQueues | Diskusi dulu | ⚪ Tunda | |

Centang kolom "Mau Coba?" kalau sudah siap eksekusi.

---

## Cara Test Setiap Refactor

1. **Build dulu** sebelum ubah kode — pastikan kondisi awal bersih:

```bash
pnpm --filter lazisnu-backend build
```

2. **Build lagi** setelah ubah kode — pastikan tidak ada error:

```bash
pnpm --filter lazisnu-backend build
```

3. **Kalau build error**, baca pesan errornya. Biasanya TypeScript kasih tahu file dan baris yang salah.

4. **Test manual** endpoint yang terdampak via curl atau browser.

5. **Kalau refactor kecil** (nomor 1-3), cukup build sukses sudah cukup aman.

---

> **Pegangan:** Refactor itu seperti bersihin rumah — awalnya ribet, tapi setelah rapi, kerja jadi lebih nyaman dan jarang ada bug aneh.
