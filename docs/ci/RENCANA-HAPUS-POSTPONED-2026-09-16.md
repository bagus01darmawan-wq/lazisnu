# Rencana penghapusan dead enum POSTPONED dari basis data

**Tanggal:** 16 September 2026
**Status kode:** SELESAI (branch `fix/postponed-dead-enum-2026-09-16`)
**Status DB:** TERTUNDA — menunggu backup + jendela maintenance

## Latar belakang — POSTPONED adalah dead enum

Diverifikasi dengan query read-only ke DB produksi (16 Sep 2026):

```
ACTIVE = 15   COMPLETED = 84   REASSIGNED = 53   UNCOLLECTED = 60   TOTAL: 212
POSTPONED = 0
```

Tidak ada penulisnya:

| Alur | Status yang ditulis |
|---|---|
| `assignmentGenerator` (assignment bulanan) | `ACTIVE` |
| Transfer petugas (`POST /assignments/:id/transfer`) | `REASSIGNED` (baris lama) + `ACTIVE` (baris baru) |
| Skip petugas (`POST /mobile/assignments/:id/skip`) | `UNCOLLECTED` |
| Selesai penjemputan | `COMPLETED` |

Satu-satunya pintu yang *bisa* menulisnya adalah `PUT /admin/assignments/:id`
(karena validasi zod menerima enum itu), tetapi UI web admin tidak memilikinya
(begitu diperiksa: form transfer hanya mengirim `status: 'REASSIGNED'`).
Web hanya menampilkan label "TERTUNDA" di tabel assignments.

## Yang sudah dikerjakan (kode)

1. `packages/shared-types/src/index.ts` — hapus `POSTPONED` dari `AssignmentStatus`
2. `apps/backend/src/database/schema.ts` — hapus dari `assignmentStatusEnum` (+ jejak audit)
3. `apps/backend/src/routes/admin/assignments.ts` — hapus dari validasi zod
4. `apps/backend/src/services/officerService.ts` — hapus field `postponed_assignments`
5. `apps/backend/src/services/overviewService.ts` — hapus dari `task_total`
6. `apps/web/src/app/dashboard/assignments/page.tsx` — hapus label "TERTUNDA"
7. `apps/web/src/app/dashboard/cans/page.tsx` — hapus dari tipe lokal
8. `apps/backend/src/services/__tests__/noPostponedEnum.test.ts` — guard regresi
   (dibuktikan: hijau saat bersih, GAGAL saat enum POSTPONED disuntik balik)

### Kenapa `task_total` ikut berubah

`overviewService.getTaskSummary()` dan `month_stats`/`stats-range` di
`routes/mobile/tasks.ts` menghitung `task_total` dari seluruh baris status.
Sebelumnya POSTPONED (nol baris) tidak memengaruhi angka; setelah penghapusan
pun definisi tidak berubah karena memang tidak ada barisnya.

**Konsekuensi mobile yang positif:** dengan POSTPONED hilang dari enum,
`task_total` tidak lagi bisa memasukkan nilai yang tidak terhitung sebagai
selesai maupun belum — ring progres tidak bisa "macet di bawah 100%" karena
denominator menelan status yang tidak dikenal.

## Yang BELUM dikerjakan (DB) — kenapa ditunda

> **PostgreSQL tidak punya `ALTER TYPE ... DROP VALUE`.** Sekali nilai enum
> dibuat, ia tidak dapat dihapus kecuali dengan drop & recreate seluruh tipe.
> `drizzle-kit generate` **tidak akan menghasilkan SQL ini** — harus ditulis
> manual.

Tipe `assignment_status` dipakai oleh kolom `assignments.status` (default
`'ACTIVE'`, `notNull`) + 3 index. Maka `DROP TYPE` langsung menabrak
`cannot drop type assignment_status because other objects depend on it`.

### Prosedur SQL manual (jalankan saat maintenance)

> **WAJIB:** backup DB penuh sebelum langkah 1. `ALTER TABLE ... TYPE`
> menulis ulang seluruh tabel dan membutuhkan `ACCESS EXCLUSIVE` lock;
> jalankan saat tidak ada traffic petugas (mis. dini hari WIB).

```sql
BEGIN;

-- 1. Hapus index yang bergantung pada kolom (dibuat ulang di langkah 5).
DROP INDEX IF EXISTS "assignments_status_period_idx";
DROP INDEX IF EXISTS "can_officer_period_unq";

-- 2. Lepaskan ketergantungan kolom dari tipe enum (cast ke text aman).
ALTER TABLE "assignments"
  ALTER COLUMN "status" SET DATA TYPE text
  USING "status"::text;

-- 3. Hapus tipe enum lama (tidak ada lagi yang bergantung padanya).
DROP TYPE "assignment_status";

-- 4. Buat ulang tanpa POSTPONED.
CREATE TYPE "assignment_status"
  AS ENUM ('ACTIVE', 'COMPLETED', 'REASSIGNED', 'UNCOLLECTED');

-- 5. Kembalikan kolom ke enum baru. Nilai POSTPONED (nol baris) tidak
--    perlu dipetakan — diverifikasi kosong sebelum langkah 1.
ALTER TABLE "assignments"
  ALTER COLUMN "status" SET DATA TYPE "assignment_status"
  USING ("status"::text)::"assignment_status";

-- 6. Pulihkan index.
CREATE INDEX "assignments_status_period_idx"
  ON "assignments" ("status", "period_year", "period_month");
CREATE UNIQUE INDEX "can_officer_period_unq"
  ON "assignments" ("can_id", "officer_id", "period_year", "period_month");

COMMIT;
```

### Prasyarat sebelum menjalankan

- [ ] Backup penuh DB produksi (R2 + Supabase)
- [ ] Verifikasi ulang: `SELECT count(*) FROM assignments WHERE status = 'POSTPONED'` = 0
- [ ] Drizzle snapshot (`meta/`) dan migrasi `0007_*` di-generate setelah ini,
      agar state DB dan `drizzle-kit` kembali sinkron
- [ ] Jendela maintenance terjadwal (backend di-restart setelahnya)

## Risiko terbuka

- **APK lama tidak terdampak** — tidak ada alur mobile yang memakai POSTPONED.
- **Field API `postponed_assignments` dihapus** — field ini tidak dibaca
  oleh web manapun (diperiksa: nol konsumen), tetapi jika ada integrasi
  pihak ketiga yang membacanya, responsnya akan kehilangan field ini.
- **Snapshot Drizzle (`meta/0006_snapshot.json`) masih menyebut POSTPONED**
  sampai migrasi 0007 di-generate; antara kode-bersih dan migrasi-jalan,
  `drizzle-kit` akan melihat DB "berbeda" dari schema. Ini alasan tugas
  dipecah menjadi dua tahap.
