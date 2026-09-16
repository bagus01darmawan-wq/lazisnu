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

## Migrasi DB — `0007_remove_postponed_enum.sql` (sudah di-generate)

> **Koreksi dari versi awal dokumen ini:** `drizzle-kit generate` **ternyata
> bisa** menghasilkan SQL ini — tidak perlu ditulis manual. Dan lebih bersih
> dari rencana manual sebelumnya: **tidak perlu drop/pulihkan index**, karena
> mengubah kolom ke `text` sudah melepaskan dependensi tipe sehingga
> `DROP TYPE` langsung berhasil (index dimodifikasi in-place, bukan di-drop).

Isi `src/database/migrations/0007_remove_postponed_enum.sql` (di-generate,
belum pernah dijalankan):

```sql
ALTER TABLE "assignments" ALTER COLUMN "status" SET DATA TYPE text;
ALTER TABLE "assignments" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::text;
DROP TYPE "public"."assignment_status";
CREATE TYPE "public"."assignment_status" AS ENUM('ACTIVE', 'COMPLETED', 'REASSIGNED', 'UNCOLLECTED');
ALTER TABLE "assignments" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"public"."assignment_status";
ALTER TABLE "assignments" ALTER COLUMN "status" SET DATA TYPE "public"."assignment_status" USING "status"::"public"."assignment_status";
```

Semua 6 statement berjalan dalam **satu transaksi**. Karena `POSTPONED` = 0
baris (diverifikasi di produksi), `USING "status"::"public"."assignment_status"`
tidak akan menemui nilai yang tak bisa dicast.

## ⚠️ Jebakan deploy — mengapa 0007 TIDAK boleh ter-deploy sembarangan

`migrate-cli.ts` menjalankan migrasi **otomatis saat container start**, dan
keluar dengan **kode 1 bila gagal — yang menghentikan pipeline deploy**
(lihat baris 12–18 dan 55–58 berkas itu).

Konsekuensinya: begitu `0007` ter-commit dan image backend ter-deploy,
migrasi ini **jalan sendiri di produksi**, bukan di jendela maintenance yang
dipilih. Karena `ALTER TABLE ... SET DATA TYPE` membutuhkan
`ACCESS EXCLUSIVE` lock pada tabel `assignments`, deploy saat traffic hidup
dapat **mengunci tabel** (petugas menunggu, bisa timeout).

**Keputusan:** `0007` di-commit ke branch `fix/postponed-dead-enum-2026-09-16`
**tetapi tidak di-deploy**. Jalankan hanya saat:

1. Backup DB penuh sudah dibuat (R2 + Supabase)
2. Verifikasi ulang: `SELECT count(*) FROM assignments WHERE status = 'POSTPONED'` = 0
3. Traffic petugas sudah berhenti (jendela maintenance terjadwal, mis. dini
   hari WIB)
4. Seseorang siap memantau + bisa rollback bila tabel terkunci terlalu lama

## Status verifikasi (dry-run berhasil)

- ✅ `drizzle-kit generate` berhasil menghasilkan 0007 (gen exit 0)
- ✅ Drizzle menulis snapshot `meta/0007_snapshot.json`
- ✅ **Dry-run dijalankan di postgres:16** dengan 213 baris data realistis
  (mirip produksi + 1 POSTPONED untuk uji kasus terburuk):
  - Kondisi 0 POSTPONED: **sukses**, data utuh (212→212), 3 index utuh,
    tipe kolom = enum baru, index berfungsi (Bitmap Heap Scan terverifikasi)
  - Kondisi ada 1 POSTPONED: **gagal dengan aman** — seluruh 6 statement
    di-rollback, tidak ada perubahan parsial, data utuh
- ❌ **Tidak diuji:** tabel produksi sebenarnya (ratusan ribu baris).
  Durasi 0.17s di atas hanya untuk 212 baris. Untuk tabel besar,
  `ALTER TABLE ... SET DATA TYPE` menulis ulang seluruh tabel — durasi
  **wajib diukur di staging seukuran produksi** sebelum menjadwalkan.

**Prosedur lengkap jendela maintenance** (backup, verifikasi, lock check,
rollback, checklist): `docs/ci/PROSEDUR-MAINTENANCE-HAPUS-POSTPONED-2026-09-16.md`

## Risiko terbuka

- **APK lama tidak terdampak** — tidak ada alur mobile yang memakai POSTPONED.
- **Field API `postponed_assignments` dihapus** — field ini tidak dibaca
  oleh web manapun (diperiksa: nol konsumen), tetapi jika ada integrasi
  pihak ketiga yang membacanya, responsnya akan kehilangan field ini.
- **Snapshot Drizzle (`meta/0006_snapshot.json`) masih menyebut POSTPONED**
  sampai migrasi 0007 di-generate; antara kode-bersih dan migrasi-jalan,
  `drizzle-kit` akan melihat DB "berbeda" dari schema. Ini alasan tugas
  dipecah menjadi dua tahap.
