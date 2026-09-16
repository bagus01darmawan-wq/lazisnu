# Prosedur jendela maintenance — hapus POSTPONED dari enum (0007)

**Tanggal disusun:** 16 September 2026
**Migrasi:** `apps/backend/src/database/migrations/0007_remove_postponed_enum.sql`
**Status kode:** di-commit di `fix/postponed-dead-enum-2026-09-16` (`85d2eec`), **belum di-deploy**

> Dokumen ini menggantikan bagian "Yang BELUM dikerjakan (DB)" di
> `RENCANA-HAPUS-POSTPONED-2026-09-16.md` versi awal. Isinya sekarang
> berdasarkan **dry-run empiris** (lihat §Bukti), bukan teori.

## Ringkasan temuan kunci (mengubah asumsi awal)

1. **`drizzle-kit generate` bisa menghasilkan SQL ini** — rencana manual
   6-langkah (drop/pulihkan index) yang lama **salah dan tidak perlu**.
   SQL asli lebih bersih: mengubah kolom ke `text` sudah melepaskan
   dependensi tipe, sehingga `DROP TYPE` langsung berhasil tanpa menyentuh
   index. Index dimodifikasi in-place, bukan di-drop.
2. **Dry-run sudah dijalankan di postgres:16** dengan 213 baris data
   realistis. Hasil: sukses, data utuh, index utuh (§Bukti).
3. **Migrasi jalan otomatis saat deploy** lewat `migrate-cli.ts`, dan
   `exit 1` bila gagal menghentikan pipeline — jadi ini **bukan** operasi
   yang bisa di-deploy begitu saja saat traffic hidup.
4. **Migrasi ini butuh `ACCESS EXCLUSIVE` lock** pada tabel `assignments`.
   Saat traffic hidup, lock bisa ditolak/menunggu lama.

## A. Prasyarat (wajib, jangan dilewati)

| # | Syarat | Cara cek |
|---|--------|----------|
| 1 | Backup DB penuh produksi (R2 + Supabase) | Download .dump, verifikasi ukuran |
| 2 | `POSTPONED` = 0 baris | `SELECT count(*) FROM assignments WHERE status = 'POSTPONED';` |
| 3 | Traffic petugas berhenti | Jendela maintenance terjadwal (lihat §C) |
| 4 | Migrasi 0001–0006 sudah terpakai di produksi | `SELECT count(*) FROM __drizzle_migrations;` ≥ 7 |
| 5 | Drizzle snapshot + journal di branch sudah di-commit | `git log` branch |

> **Catatan tentang prasyarat #2:** jika hasilnya > 0, **jangan lanjut**.
> Pilih salah satu: (a) ubah baris itu ke status lain dulu, atau (b) hapus
> barisnya jika memang sampah. Dari audit sebelumnya, produksi punya 0
> baris POSTPONED, tetapi **wajib cek ulang** sebelum menjalankan.

## B. Bukti dry-run (postgres:16, data realistis)

Data uji meniru produksi: 212 baris + 1 tambahan POSTPONED (uji kasus
terburuk) = 213 baris, 3 index pada `assignments`.

### Uji A — kasus terburuk: ada 1 baris POSTPONED

```
>>> 0007 dengan 213 baris (1 POSTPONED): rc=3 durasi=0.25s
   ERROR: invalid input value for enum assignment_status: "POSTPONED"
TOTAL (cek rollback): 213      ← data TIDAK hilang, transaksi di-rollback
```

**Pelajaran:** migrasi **gagal dengan aman**. Karena seluruh 6 statement
berjalan dalam satu transaksi, tidak ada perubahan parsial yang tersisa —
kolom tetap enum lama, data utuh. Ini adalah perilaku yang kita inginkan.

### Uji B — kondisi produksi sebenarnya: 0 POSTPONED

```
>>> UJI B 0007 (212 baris, 0 POSTPONED): rc=0 durasi=0.17s
enum SESUDAH:    ACTIVE, COMPLETED, REASSIGNED, UNCOLLECTED    ← POSTPONED hilang
index SESUDAH:   assignments_pkey, can_officer_period_unq,
                 assignments_status_period_idx                   ← 3 index utuh
rows SESUDAH:    ACTIVE=15 COMPLETED=84 REASSIGNED=53 UNCOLLECTED=60
TOTAL SESUDAH:   212                                          ← nol data hilang
```

### Pengecekan pasca-migrasi (di DB yang sama)

| Cek | Hasil |
|---|---|
| Tipe kolom `status` | `assignment_status` (enum baru) |
| Baris di luar enum baru | `0` |
| Index `assignments_status_period_idx` | Berfungsi (Bitmap Heap Scan terverifikasi) |
| Query bisnis `status='ACTIVE'` | `15` — benar |

### Yang TIDAK diuji di sini

- **Tabel produksi sebenarnya** (berisi ratusan ribu baris, tidak hanya
  212). Durasi `0.17s` di atas hanya untuk 212 baris. Pada tabel besar,
  `ALTER TABLE ... SET DATA TYPE` akan **menulis ulang seluruh tabel**
  — perkiraan kasar untuk ~10rb baris: 1–3 detik; ~100rb: 10–30 detik.
  Angka ini **harus** diukur ulang di DB staging yang seukuran produksi.
- `__drizzle_migrations` tidak ikut diuji (DB uji dibuat via `psql` manual,
  bukan via `drizzle-kit migrate`). Saat menjalankan lewat migrate-cli,
  Drizzle akan menambah baris 0007 ke tabel ini — perilaku standar.

## C. Prosedur (jalankan saat maintenance)

### C.1 — Hitung dulu, jadi tebak (opsional tapi disarankan)

Perkirakan berapa lama migrasi akan berjalan di DB seukuran produksi,
**sebelum** jendela maintenance, di DB staging:

```sql
-- Di DB staging (bukan produksi!)
SELECT pg_size_pretty(pg_total_relation_size('assignments')) AS size,
       count(*) AS rows
FROM assignments;
```

Lalu jalankan 0007 di staging dan catat durasinya. Itu jadi acuan
"berapa lama traffic harus berhenti".

### C.2 — Backup (tidak bisa diabaikan)

```bash
# Di VM, sebelum menyentuh apapun
supabase db dump --data-only -f /tmp/pre-0007-backup.sql
# atau via pg_dump langsung ke DIRECT_URL (bukan pooler!)
pg_dump "$DIRECT_URL" -Fc -f /tmp/pre-0007-backup.dump
```

Verifikasi file backup **ada dan isinya bukan nol bytes**.

### C.3 — Verifikasi prasyarat di produksi

```sql
SELECT count(*) FROM assignments WHERE status = 'POSTPONED';
-- HARUS = 0. Jika > 0: STOP, lihat §A catatan.
SELECT count(*) FROM __drizzle_migrations;   -- lihat apakah >= 7
```

### C.4 — Hentikan traffic petugas

Cara yang bisa dipakai (pilih satu sesuai setup):

- Stop container backend: `docker compose -f docker-compose.prod.yml stop backend`
- Atau arahkan traffic: balikkan nginx ke mode "maintenance" sementara
- Atau lakukan saat dini hari WIB (jam 01:00–04:00) jika traffic sudah tipis

Tujuannya: `ALTER TABLE ... SET DATA TYPE` butuh `ACCESS EXCLUSIVE` lock.
Jika ada koneksi aktif yang memegang lock, perintah akan **menunggu**.
Cek koneksi yang memegang lock:

```sql
SELECT pid, state, wait_event_type, query
FROM pg_stat_activity
WHERE query ILIKE '%assignments%'
  AND state <> 'idle';
```

### C.5 — Jalankan migrasi

**Pilihan 1 (disarankan): via migrate-cli di VM**

```bash
docker run --rm --env-file /opt/lazisnu/apps/backend/.env \
  ghcr.io/<repo>/backend:<tag> \
  node apps/backend/dist/database/migrate-cli.js
```

Ini akan menjalankan 0007 dan mencatatnya di `__drizzle_migrations`.

**Pilihan 2: manual via psql** (jika ingin kontrol penuh)

```bash
psql "$DIRECT_URL" -1 -v ON_ERROR_STOP=1 \
  -f apps/backend/src/database/migrations/0007_remove_postponed_enum.sql
```

Flag `-1` membungkus semua dalam **satu transaksi** (sama seperti dry-run).
Flag `ON_ERROR_STOP=1` memastikan kesalahan menghentikan eksekusi.

> **PENTING:** pakai `DIRECT_URL` (port 5432), **bukan** `DATABASE_URL`
> (pooler port 6543). Pooler Supabase tidak mendukung prepared statement
> yang dipakai migrator Drizzle — ini sudah ada catatannya di
> `migrate-cli.ts` dan `drizzle.config.ts`.

### C.6 — Verifikasi pasca-migrasi

```sql
-- enum baru (POSTPONED harus hilang)
SELECT e.enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'assignment_status'
ORDER BY e.enumsortorder;

-- index masih ada dan berfungsi
SELECT indexname FROM pg_indexes WHERE tablename = 'assignments';

-- data utuh
SELECT status, count(*) FROM assignments GROUP BY status ORDER BY status;
SELECT count(*) FROM assignments;   -- bandingkan dengan angka pra-migrasi
```

Lalu jalankan smoke test bisnis:

```bash
curl -fsS "$API/mobile/stats-range?from=2026-08&to=2026-08" | jq .
```

Angka overview harusnya **tidak berubah** (POSTPONED = 0 baris sejak awal,
jadi tidak ada data yang hilang dari perhitungan).

### C.7 — Hidupkan kembali traffic

Jika semua hijau: start container backend / balikkan nginx ke mode normal.

### C.8 — Rollback (jika ada masalah)

```bash
# Kembalikan DB dari backup (ini mengembalikan seluruh DB, bukan hanya enum)
pg_restore -d "$DIRECT_URL" -c /tmp/pre-0007-backup.dump
```

Setelah rollback, ** kode backend lama** (yang masih mengenal POSTPONED)
harus tetap bisa jalan — karena backup mengembalikan enum lama.

> **Peringatan:** rollback mengembalikan DB ke kondisi pra-migrasi penuh.
> Data yang dibuat **selama** jendela maintenance (mis. petugas input data
> saat traffic seharusnya berhenti) akan hilang. Ini alasan §C.4 wajib
> benar-benar menghentikan traffic.

## D. Estimasi durasi & ukuran jendela

| Ukuran tabel `assignments` | Estimasi durasi | Jendela minimum |
|---|---|---|
| ~200 baris (uji ini) | 0.17s | 5 menit |
| ~10 ribu baris | 1–3s | 10 menit |
| ~100 ribu baris | 10–30s | 30 menit |

> Estimasi di atas **perkiraan, bukan hasil pengukuran** di DB seukuran
> produksi. Wajib diukur di staging (§C.1) sebelum menjadwalkan.

## E. Checklist akhir (centang satu per satu)

Pra-maintenance:
- [ ] Backup DB penuh dibuat + diverifikasi (bukan 0 bytes)
- [ ] `count(*) WHERE status='POSTPONED'` = 0
- [ ] Durasi diukur di DB staging seukuran produksi
- [ ] Jendela maintenance terjadwal + seseorang memantau
- [ ] Traffic petugas benar-benar dihentikan (§C.4)

Saat maintenance:
- [ ] Tidak ada koneksi yang memegang lock `assignments` (§C.4 cek)
- [ ] Migrasi dijalankan (C.5)
- [ ] Enum baru: POSTPONED hilang, 4 nilai tersisa
- [ ] 3 index masih ada + berfungsi
- [ ] `count(*) assignments` sama dengan pra-migrasi
- [ ] Smoke test API overview mengembalikan angka yang sama

Pasca:
- [ ] Traffic dipulihkan
- [ ] `__drizzle_migrations` mencatat 0007
- [ ] APK lama + web dicek masih jalan normal
