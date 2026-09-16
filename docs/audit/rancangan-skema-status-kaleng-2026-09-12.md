# Rancangan Skema Status Kaleng — Lazisnu

**Tanggal:** 12 September 2026
**Status:** Rancangan, belum diimplementasikan
**Rujukan:** `alur-status-kaleng.html` (revisi 7 final) · `audit-dashboard-kaleng-2026-09-11.md`
**Latar:** 26 keputusan Pion tanggal 12 September 2026

---

## 1. Kabar utama

**Skema tabel `cans` yang ada sekarang tidak bisa menampung lima kondisi yang baru ditetapkan.**

Bukan soal kurang rapi — soal salah hitung. Hari ini satu kolom benar/salah
(`is_active`) menentukan tiga hal sekaligus: siapa yang masuk hitungan cakupan, siapa
yang dapat tugas bulanan, dan siapa yang dianggap masih di dalam sistem. Lima kondisi
baru menuntut perilaku yang berbeda-beda, dan satu kolom benar/salah hanya punya dua
nilai.

Kalau ini tidak diubah lebih dulu, tiga hal berikut akan salah:

1. **Kaleng non-aktif tidak masuk daftar kunjungan verifikasi** — padahal keputusan 9
   menyatakan kaleng non-aktif tetap harus dikunjungi. Hari ini mereka tidak dapat
   apa-apa, dan karena `is_active` juga dipakai untuk hal lain, tidak ada cara
   membedakannya dari kaleng yang benar-benar sudah ditarik.
2. **Kaleng non-aktif ikut masuk daftar penjemputan** — karena kode hanya menyaring
   `is_active = true`, kaleng non-aktif tidak bisa dibedakan dari yang aktif. Padahal
   kunjungan verifikasi **bukan** penjemputan, dan kalau dicatat sebagai penjemputan
   hitungan kosongnya bertambah palsu.
3. **Cakupan penempatan ikut menghitung kaleng hilang** — angka di dashboard akan
   terlihat lebih besar dari kenyataan. Hilang harus keluar dari cakupan penempatan dan
   masuk ke cakupan hilang tersendiri.

Ketiganya berasal dari satu akar yang sama. Sisanya di dokumen ini adalah perbaikannya.

> **Catatan revisi.** Dua hal yang sempat saya nilai salah ternyata memang perilaku
> yang diinginkan, dan rancangan ini sudah menyesuaikan diri.
>
> - **Rusak tetap dijemput** (keputusan 23). Pemilik rumah masih bisa menyerahkan
>   donasi langsung ke PPK tanpa lewat kaleng. Jadi kaleng rusak yang dapat tugas
>   adalah perilaku yang benar, bukan bug.
> - **Hilang tetap dijemput** (keputusan 26). Alasannya sama persis: yang hilang
>   wadahnya, bukan niat bersedekahnya. Donatur masih bisa menyetor langsung ke PPK,
>   jadi rumah itu tetap harus didatangi. Bedanya dengan Rusak hanya pada
>   **tindakannya**: Rusak → ganti unit, Hilang → beri kaleng baru.
>
> Jadi dari lima kondisi, hanya **Non-Aktif** dan **Dikembalikan** yang keluar dari
> daftar tugas bulanan. Tiga sisanya — Aktif, Rusak, Hilang — semuanya dijemput.

---

## 2. Kenapa satu kolom tidak cukup

Bukti dari kode, bukan dugaan.

### 2.1 Pembuat daftar tugas hanya membaca satu kolom

`apps/backend/src/services/assignmentGenerator.ts` baris 18–22:

```ts
const cansToAssign = await db.query.cans.findMany({
  where: and(
    eq(schema.cans.isActive, true),
    assignedCanIds.length > 0 ? notInArray(schema.cans.id, assignedCanIds) : undefined
  ),
```

**Artinya:** setiap kaleng dengan `is_active = true` mendapat tugas bulanan. Tidak ada
saringan lain. Kaleng rusak dapat tugas, dan kaleng hilang juga — dan dua-duanya
**memang benar** (keputusan 23 dan 26). Yang salah justru sebaliknya: kaleng
**non-aktif** ikut dapat tugas, padahal seharusnya cukup dikunjungi untuk verifikasi.
Karena semua kondisi berbagi satu kolom, tidak ada cara memisahkan keduanya.

### 2.2 Tab daftar kaleng memakai kolom yang sama

`apps/backend/src/services/canService.ts` baris 71–117:

```ts
if (params.status === 'NON_ACTIVE' || params.status === 'INACTIVE') {
  conditions.push(eq(schema.cans.isActive, false));      // baris 72
} else if (params.status === 'ASSIGNED') {
  conditions.push(eq(schema.cans.isActive, true));       // baris 74
```

**Artinya:** `is_active = false` dipakai sebagai satu-satunya penanda "non-aktif".
Semua yang dikeluarkan dari sistem — ditarik, dihapus lunak — menumpuk di ember yang
sama, dan tidak bisa dibedakan lagi. Sementara itu rusak dan hilang justru **tidak
terlihat sama sekali** di sini, karena keduanya masih `is_active = true` dan karenanya
tampil seolah-olah kaleng yang normal.

### 2.3 Alasan tidak terjemput disimpan sebagai teks bebas

`apps/backend/src/routes/mobile/schemas.ts` baris 45–47:

```ts
export const skipAssignmentSchema = z.object({
  notes: z.string().max(255).optional(),
}).strict();
```

Dan pemakaiannya di `apps/backend/src/routes/mobile/tasks.ts` baris 407–414:

```ts
await db.update(schema.assignments)
  .set({
    status: 'UNCOLLECTED',
    notes: body.notes || null,     // ← alasan masuk ke sini, sebagai teks bebas
```

**Artinya:** keputusan 11 ("daftar alasan baku dan wajib diisi") belum bisa dijalankan.
Sekarang PPK mengetik bebas, dan teks bebas tidak bisa dihitung.

### 2.4 Kesimpulan

Tiga masalah, satu akar: **tidak ada tempat untuk menyimpan kondisi kaleng.**
`is_active` adalah penghapusan-lunak yang dipinjam untuk pekerjaan yang bukan
tugasnya.

---

## 3. Rancangan kolom baru

### 3.1 Enum kondisi

Di `apps/backend/src/database/schema.ts`, di dekat enum yang sudah ada (baris 5–7):

```ts
export const canConditionEnum = pgEnum('can_condition', [
  'AKTIF',
  'NON_AKTIF',
  'RUSAK',
  'HILANG',
  'DIKEMBALIKAN',
]);
```

Catatan: `DITEMPATKAN` **sengaja tidak dimasukkan**. Keputusan 20 menetapkan Ditempatkan
menjadi Aktif secara otomatis, jadi ia tidak pernah tersimpan. Memasukkannya sebagai
nilai enum akan menciptakan status yang tidak pernah bisa dicapai — dan itu jenis
bug yang paling sulit ditemukan karena tidak pernah melempar error.

### 3.2 Kolom di tabel `cans`

```ts
export const cans = pgTable('cans', {
  // ... kolom yang sudah ada ...

  condition: canConditionEnum('condition').default('AKTIF').notNull(),

  // Kondisi ini menandai "masih dilacak sistem".
  // true  → AKTIF, NON_AKTIF, RUSAK, HILANG
  // false → DIKEMBALIKAN
  isActive: boolean('is_active').default(true).notNull(),
  // ... kolom yang sudah ada ...
});
```

`is_active` **tidak dihapus**, tetapi maknanya dipersempit menjadi satu pertanyaan saja:
*melacak atau tidak*. Alasannya ada di bagian 9 — menghapusnya sekaligus akan memutus
terlalu banyak kode dalam satu langkah.

### 3.3 Nilai awal untuk kaleng baru

`createCan` di `canService.ts` baris 178 sudah memakai `default(true)` untuk `is_active`.
Dengan `condition` yang juga berdefault `AKTIF`, keputusan 20 langsung terpenuhi tanpa
perubahan kode: **kaleng baru otomatis Aktif.** Tidak perlu ada baris tambahan.

---

## 4. Tabel perilaku

Inilah acuan tunggal saat menulis query. Setiap query yang menyentuh kaleng harus
menjawab pertanyaan "saya sedang menyaring apa", dan mengambil kolom yang tepat.

| Kondisi | `condition` | `is_active` | Cakupan penempatan | Cakupan hilang | Dapat tugas | Dikunjungi | Tindakan |
|---|---|---|---|---|---|---|---|
| Aktif | `AKTIF` | `true` | ✅ | — | ✅ | — | — |
| Rusak | `RUSAK` | `true` | ✅ | — | ✅ | — | Ganti unit |
| Hilang | `HILANG` | `true` | ❌ | ✅ | ✅ | — | Beri kaleng baru |
| Non-Aktif | `NON_AKTIF` | `true` | ✅ | — | ❌ | Verifikasi | Dikembalikan |
| Dikembalikan | `DIKEMBALIKAN` | `false` | ❌ | ❌ | ❌ | — | — |

Perhatikan baris **Rusak** dan **Hilang**: keduanya **dapat tugas ✅**, sama seperti Aktif.
Itu sesuai keputusan 23 dan 26. Yang membedakan mereka dari Aktif bukan jadwal
penjemputannya, melainkan **tindakan yang perlu dilakukan** — Rusak unitnya diganti,
Hilang diberi kaleng baru.

Hanya **dua** kondisi yang keluar dari daftar tugas bulanan: `NON_AKTIF` (cukup
dikunjungi untuk verifikasi) dan `DIKEMBALIKAN` (sudah selesai, tidak dilacak lagi).

> **Kenapa Hilang tetap dijemput.** Karena yang hilang wadahnya, bukan niat
> bersedekahnya. Pemilik rumah atau donatur masih bisa menyerahkan infaq **langsung ke
> PPK** tanpa lewat kaleng — persis alasan yang sama dengan kaleng Rusak. Kalau rumah ini
> dikeluarkan dari daftar tugas, donasi yang sebenarnya masih mengalir justru tidak akan
> pernah tercatat.

### 4.1 Query yang berubah

**Pembuat daftar tugas** — `assignmentGenerator.ts` baris 18–22:

```ts
import { inArray } from 'drizzle-orm';

where: and(
  eq(schema.cans.isActive, true),
  inArray(schema.cans.condition, ['AKTIF', 'RUSAK', 'HILANG']),   // ← tambahan
  assignedCanIds.length > 0 ? notInArray(schema.cans.id, assignedCanIds) : undefined
),
```

Tiga kondisi yang boleh, bukan satu: **Rusak dan Hilang sama-sama tetap dijemput**
(keputusan 23 dan 26), karena donasi masih bisa diserahkan langsung ke PPK. Hanya
`NON_AKTIF` dan `DIKEMBALIKAN` yang tersaring keluar.

**Cakupan penempatan** — di `routes/admin/dashboard.ts` baris 60–61 dan di mana pun
angka ini dihitung:

```ts
// sebelum
where: eq(schema.cans.isActive, true)

// sesudah
where: and(
  eq(schema.cans.isActive, true),
  ne(schema.cans.condition, 'HILANG')        // ← hilang punya cakupan sendiri
)
```

**Cakupan hilang** — penghitung baru:

```ts
where: eq(schema.cans.condition, 'HILANG')
```

**Angka dikembalikan** — penghitung baru, ditampilkan meski tiap kalengnya tidak lagi
dilacak (keputusan 15 + keputusan terbaru):

```ts
where: eq(schema.cans.condition, 'DIKEMBALIKAN')
```

**Daftar kerja "perlu tindakan"** — penghitung baru, ini yang memunculkan
pemberitahuan ke admin:

```ts
where: and(
  eq(schema.cans.isActive, true),
  inArray(schema.cans.condition, ['NON_AKTIF', 'RUSAK', 'HILANG'])
)
```

Bedanya dengan daftar tugas: daftar tugas berisi kaleng yang **harus dijemput bulan
ini**, daftar kerja berisi kaleng yang **menunggu keputusan admin**. Dua daftar ini
tidak boleh digabung — kalau digabung, PPK akan menerima tugas menjemput kaleng
non-aktif, padahal keputusan 9 hanya menghendaki kunjungan verifikasi.

Perhatikan bahwa `RUSAK` dan `HILANG` muncul di **kedua** daftar. Itu memang benar:
keduanya tetap dijemput bulan ini, **dan** keduanya menunggu keputusan admin. Yang
membedakan hanya isi tindakannya — ganti unit, atau beri kaleng baru.

**Tab daftar kaleng** — `canService.ts` baris 71–117. Tab `NON_ACTIVE` berubah dari
`is_active = false` menjadi `condition = 'NON_AKTIF'`, dan tambah tab baru untuk
`RUSAK`, `HILANG`, serta `DIKEMBALIKAN`.

> **Penting soal tab `NON_ACTIVE`.** Setelah perubahan ini, tab non-aktif akan
> **terlihat kosong** walaupun sebelumnya berisi. Itu wajar — lihat bagian 9.

### 4.2 Menghitung penjemputan kosong berturut-turut

Ini inti dari keputusan 3 dan 24, dan yang paling mudah salah. Aturannya:

1. Hitung **penjemputan**, bukan bulan kalender.
2. Hanya penjemputan yang benar-benar terjadi. `Tidak Terjemput` **tidak dihitung** —
   kaleng yang tidak dijemput bukan berarti kosong.
3. Hitungan **direset ke nol** setiap kali ada penjemputan yang berisi nominal.
4. Kalau hitungan mencapai 6, usulkan naik ke `NON_AKTIF`.
5. Kalau kaleng sedang `NON_AKTIF` dan ada penjemputan berisi, kembalikan ke `AKTIF`
   **dan** reset ke nol (keputusan 24).
6. Ambang ini berlaku untuk **semua** kondisi yang tetap dijemput — jadi `AKTIF`,
   `RUSAK`, dan `HILANG` sama-sama bisa naik ke `NON_AKTIF`. Yang tidak pernah dihitung
   hanyalah `NON_AKTIF` dan `DIKEMBALIKAN`, karena keduanya tidak lagi dijemput.
   Konsekuensinya dibahas di bagian 11.3.

**Saran: hitung dari riwayat, jangan simpan angkanya.** Riwayat penjemputan bersifat
abadi — koreksi menambah baris baru, tidak menimpa (lihat `getLatestCollectionCondition`
di `services/collectionSubmission.ts`). Angka yang dihitung ulang tidak mungkin
melenceng; angka yang disimpan bisa, misalnya kalau ada koreksi data yang tidak ikut
memperbaruinya.

```sql
-- Penjemputan kosong berturut-turut untuk satu kaleng.
-- Batasnya adalah penjemputan terakhir yang berisi nominal.
WITH penjemputan AS (
  SELECT
    c.nominal,
    ROW_NUMBER() OVER (ORDER BY c.collected_at DESC) AS urut
  FROM collections c
  WHERE c.can_id = $1
    AND c.sync_status = 'COMPLETED'
    -- hanya baris terbaru per (assignment, can) — lihat getLatestCollectionCondition
    AND c.submit_sequence = (
      SELECT MAX(c2.submit_sequence) FROM collections c2
      WHERE c2.assignment_id = c.assignment_id
        AND c2.can_id = c.can_id
    )
),
batas AS (
  SELECT COALESCE(MIN(urut), 2147483647) AS sampai
  FROM penjemputan
  WHERE nominal > 0
)
SELECT COUNT(*) AS kosong_berturut
FROM penjemputan, batas
WHERE penjemputan.urut < batas.sampai;
```

Cara membacanya: `batas.sampai` adalah posisi penjemputan terakhir yang berisi. Semua
penjemputan yang lebih baru dari itu dihitung kosong. Kalau belum pernah ada yang
berisi, seluruh riwayat dihitung — dan itu benar, karena kaleng yang sejak awal tidak
pernah diisi memang tidak pernah melewati `AKTIF` secara nyata.

**Kenapa `Tidak Terjemput` tidak dihitung.** Kalau ikut dihitung, kaleng yang tiga
bulan tidak sempat dijemput karena kendala logistik akan terlihat seperti kosong tiga
kali. Itu salah — tidak dijemput bukan berarti pemiliknya berhenti mengisi. Inilah
sebabnya penjemputan dan penugasan harus dibaca dari tabel berbeda.

**Kenapa kunjungan verifikasi tidak dihitung.** Sama alasannya, dan inilah fungsi
tabel `can_visits` di bagian 7. Kalau kunjungan verifikasi ke kaleng non-aktif dicatat
di `collections`, ia akan menambah hitungan kosong palsu — dan kaleng yang sebenarnya
sudah mau ditarik malah terlihat makin "kosong" karena dikunjungi.

---

## 5. Tabel usulan dan riwayat perubahan

Keputusan 3 dan 19 sama-sama berbunyi "sistem mengusulkan, admin yang menekan
tombolnya". Pola itu butuh tempat menyimpan usulan yang belum diputuskan.

```ts
export const canConditionProposals = pgTable('can_condition_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  canId: uuid('can_id').references(() => cans.id, { onDelete: 'cascade' }).notNull(),

  fromCondition: canConditionEnum('from_condition').notNull(),
  toCondition: canConditionEnum('to_condition').notNull(),

  // Apa yang memicu usulan ini
  triggerSource: varchar('trigger_source', { length: 30 }).notNull(),
  // 'EMPTY_THRESHOLD' | 'SKIP_REASON' | 'MANUAL'

  reasonCode: varchar('reason_code', { length: 40 }).notNull(),
  reasonNote: text('reason_note'),

  // Bukti pendukung — untuk EMPTY_THRESHOLD, jumlah penjemputan kosong berturut-turut
  evidenceCount: integer('evidence_count'),

  status: varchar('status', { length: 20 }).default('PENDING').notNull(),
  // 'PENDING' | 'APPROVED' | 'REJECTED'

  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Tabel ini sekaligus berfungsi sebagai **riwayat perubahan status** — usulan yang
`APPROVED` adalah catatan siapa mengubah apa, kapan, dan atas dasar apa. Tidak perlu
tabel riwayat terpisah.

`evidenceCount` penting untuk menjawab pertanyaan yang pasti akan muncul nanti:
*"kenapa kaleng ini dinyatakan non-aktif?"* Tanpa kolom itu, jawabannya hilang begitu
status berubah.

---

## 6. Kode alasan baku

Keputusan 11, 19, dan 22 menetapkan tiga daftar alasan. Ketiganya harus disimpan
sebagai **kode**, bukan teks, supaya bisa dihitung dan dibandingkan antar bulan.

### 6.1 Tidak Terjemput

`skipAssignmentSchema` berubah dari teks bebas menjadi kode wajib:

```ts
export const skipAssignmentSchema = z.object({
  reason_code: z.enum([
    'OWNER_ABSENT',        // pemilik tidak di tempat
    'OWNER_REFUSED',       // pemilik menolak dijemput
    'CAN_LOST',            // kaleng hilang        → usul ubah status
    'CAN_DAMAGED',         // kaleng rusak         → usul ubah status
    'ACCESS_DIFFICULT',    // akses ke lokasi sulit
    'OTHER',               // lainnya
  ]),
  notes: z.string().max(255).optional(),   // tetap ada, hanya pelengkap
}).strict();
```

Kolom baru di `assignments`:

```ts
skipReasonCode: varchar('skip_reason_code', { length: 40 }),
```

### 6.2 Non-Aktif

| Kode | Label |
|---|---|
| `MOVED_HOUSE` | Pindah rumah |
| `OWNER_UNABLE` | Pemilik tidak lagi mampu |
| `OWNER_REFUSED_CONTINUE` | Pemilik menolak melanjutkan |
| `OTHER` | Lainnya |

### 6.3 Dikembalikan

| Kode | Label |
|---|---|
| `OWNER_REQUEST` | Permintaan pemilik |
| `CAN_INACTIVE` | Kaleng non-aktif |
| `CAN_DAMAGED` | Kaleng rusak |

### 6.4 Catatan tentang `CAN_DAMAGED` yang muncul dua kali

`CAN_DAMAGED` ada di daftar Tidak Terjemput **dan** di daftar Dikembalikan. Itu benar
dan bukan duplikasi — keduanya peristiwa berbeda pada waktu berbeda:

- Di **Tidak Terjemput**, artinya: *saat PPK datang menjemput, kalengnya sudah rusak.*
  Akibatnya: sistem mengusulkan status → `RUSAK`. Kaleng **tetap dihitung dan tetap
  dijemput** bulan-bulan berikutnya, karena pemilik masih bisa menyerahkan donasi
  langsung ke PPK.
- Di **Dikembalikan**, artinya: *kaleng rusak itu akhirnya ditarik dari rumah warga.*
  Akibatnya: status → `DIKEMBALIKAN`. Kaleng **keluar dari hitungan**.

Jadi rantainya: `AKTIF → RUSAK (tetap dijemput, tetap dihitung) → DIKEMBALIKAN (keluar)`.
Ini persis yang diminta keputusan 21, 22, dan 23, dan skema di atas mendukungnya tanpa
pengecualian.

**Kenapa `CAN_DAMAGED` tidak diusulkan otomatis seperti `CAN_LOST`.** Keduanya memicu
usulan perubahan status, tetapi hanya `CAN_LOST` yang mengubah perilaku penjemputan.
Rusak tidak mengubah apa pun — jadwalnya tetap, hitungannya tetap. Yang bertambah hanya
tindakan yang perlu dilakukan: ganti unitnya. Sistem tetap mengusulkan agar admin tahu,
tetapi kalau admin tidak menyetujuinya pun, tidak ada yang rusak.

---

## 7. Tabel kunjungan

Keputusan 9 menetapkan kaleng non-aktif tetap dikunjungi, dan kunjungan itu **bukan
penjemputan**. Kalau kunjungan dicatat di tabel `collections`, dua hal rusak sekaligus:
ambang enam kali kosong ikut menghitung kunjungan verifikasi, dan dashboard menerima
nominal nol palsu.

```ts
export const canVisits = pgTable('can_visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  canId: uuid('can_id').references(() => cans.id, { onDelete: 'cascade' }).notNull(),
  officerId: uuid('officer_id').references(() => officers.id).notNull(),
  purpose: varchar('purpose', { length: 20 }).notNull(),
  // 'VERIFIKASI' | 'PENGGANTIAN'
  visitedAt: timestamp('visited_at').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Dengan tabel ini, `collections` tetap murni: hanya penjemputan yang menghasilkan atau
tidak menghasilkan nominal. Ambang enam kali kosong jadi bisa dihitung dengan benar.

### 7.1 Kapan tiap jenis kunjungan dipakai

| `purpose` | Untuk kondisi | Kapan |
|---|---|---|
| `VERIFIKASI` | Non-Aktif | Berkala, memastikan pemilik benar-benar sudah berhenti mengisi |
| `PENGGANTIAN` | Rusak | Saat unit rusak ditukar dengan yang tidak rusak |
| `PENGGANTIAN` | Hilang | Saat rumah yang kalengnya hilang diberi kaleng baru |

Kunjungan `PENGGANTIAN` **bisa terjadi berbarengan dengan penjemputan biasa** — karena
kaleng rusak maupun kaleng hilang tetap dijemput (keputusan 23 dan 26), PPK bisa
menukar atau menyerahkan kaleng baru sekaligus menjemput donasinya dalam satu
kunjungan. Dalam kasus itu, tercatat **dua hal sekaligus**: satu baris di `collections`
(donasinya) dan satu baris di `canVisits` (penggantian unitnya). Keduanya tidak saling
mengganggu karena ada di tabel berbeda — dan inilah alasan tabelnya dipisah.

Untuk kaleng hilang, `PENGGANTIAN` ini yang menutup kejadiannya: begitu tercatat,
`condition` kembali menjadi `AKTIF` dan angka cakupan hilang berkurang.

---

## 8. Ringkasan perubahan per file

| File | Perubahan |
|---|---|
| `database/schema.ts` | Tambah `canConditionEnum`, kolom `cans.condition`, kolom `assignments.skipReasonCode`, tabel `canConditionProposals`, tabel `canVisits` |
| `services/assignmentGenerator.ts` | Saring `condition IN ('AKTIF','RUSAK','HILANG')` |
| `services/canService.ts` | Tab status pakai `condition`; tambah tab RUSAK/HILANG/DIKEMBALIKAN |
| `routes/admin/dashboard.ts` | Cakupan penempatan kecualikan `HILANG`; tambah penghitung cakupan hilang, angka dikembalikan, dan daftar kerja "perlu tindakan" |
| `routes/admin/district.ts` | Sama seperti di atas (perhatikan juga temuan T1 di audit) |
| `routes/mobile/schemas.ts` | `skipAssignmentSchema` pakai `reason_code` wajib |
| `routes/mobile/tasks.ts` | Simpan `skipReasonCode`; panggil pembuat usulan bila kode `CAN_LOST`/`CAN_DAMAGED` |
| `services/collectionSubmission.ts` | Tambah penghitung penjemputan kosong berturut-turut + reset saat terisi |
| `services/conditionProposalService.ts` | **Baru** — membuat usulan, menyetujui, menolak |
| `services/actionWorklistService.ts` | **Baru** — daftar kerja "perlu tindakan" (Non-Aktif + Rusak + Hilang) |
| `apps/web/.../dashboard/cans/page.tsx` | Kolom status ikut `condition`; tab baru; tombol setujui usulan |
| `apps/mobile/.../CollectionScreen.tsx` | Alasan pakai pemilih daftar, bukan teks bebas |

---

## 9. Migrasi data

### 9.1 Langkah SQL

```sql
CREATE TYPE can_condition AS ENUM
  ('AKTIF', 'NON_AKTIF', 'RUSAK', 'HILANG', 'DIKEMBALIKAN');

ALTER TABLE cans
  ADD COLUMN condition can_condition NOT NULL DEFAULT 'AKTIF';

-- Backfill: yang is_active = false dianggap sudah keluar dari sistem
UPDATE cans SET condition = 'DIKEMBALIKAN' WHERE is_active = false;
```

### 9.2 Mengapa backfill-nya `DIKEMBALIKAN`, bukan `NON_AKTIF`

Ini bagian yang paling mudah salah, jadi saya jelaskan alasannya.

Hari ini, kaleng dengan `is_active = false` **sudah tidak dihitung** di cakupan
ditempatkan. Dashboard menghitung `active_cans` dengan `is_active = true`. Kalau kita
memetakannya ke `NON_AKTIF`, dan `NON_AKTIF` masuk cakupan penempatan — maka angka
dashboard akan **melonjak naik pada hari migrasi**, tanpa ada satu pun kaleng yang
berubah di lapangan. Pion akan melihat angka yang tidak bisa dijelaskan.

Dengan memetakan ke `DIKEMBALIKAN`, **semua angka tetap persis sama** seperti sebelum
migrasi. Tidak ada kejutan.

Konsekuensinya yang harus disadari: **tab non-aktif akan tampak kosong** setelah
migrasi, walaupun sebelumnya berisi. Itu wajar — data lamanya tidak pernah menyimpan
alasan, jadi tidak ada cara membedakan mana yang benar-benar non-aktif dan mana yang
memang sudah ditarik. Memisahkannya adalah **pekerjaan bersih-bersih data oleh admin**,
bukan sesuatu yang boleh ditebak oleh skrip.

Saran: sediakan satu layar "tinjau kaleng dikembalikan" agar admin bisa memindahkan
yang ternyata masih di rumah warga ke `NON_AKTIF`. Lakukan setelah migrasi stabil,
jangan bersamaan.

### 9.3 Urutan yang aman

1. Jalankan migrasi kolom dan enum. **Tanpa mengubah kode apa pun.** Aplikasi tetap
   jalan seperti biasa karena `is_active` belum disentuh.
2. Deploy perubahan query (bagian 4.1). Angka dashboard harus tetap sama seperti
   sebelum migrasi — kalau berubah, ada query yang terlewat.
3. Deploy tabel usulan dan kunjungan. Fitur baru menyala.
4. Ganti input alasan di aplikasi mobile. **Ini yang butuh rilis APK baru**, jadi
   paling akhir dan paling lambat.

Langkah 1 dan 2 bisa dibalik, tapi jangan digabung jadi satu deploy — kalau angka
dashboard berubah, Anda tidak akan tahu langkah mana penyebabnya.

---

## 10. Risiko

| Risiko | Dampak | Pencegahan |
|---|---|---|
| Query lama masih memakai `is_active` saja | Kaleng non-aktif tetap dapat tugas penjemputan, dan tidak bisa dibedakan dari yang aktif | Cari seluruh `cans.isActive` di `apps/backend/src`, periksa satu per satu. Ingat: **Rusak dan Hilang memang harus tetap dapat tugas** (keputusan 23 dan 26), jadi jangan ikut disaring keluar — yang salah hanya Non-Aktif |
| APK lama masih mengirim `notes` teks bebas | Alasan tidak terjemput gagal disimpan (ditolak validasi) | Terima sementara `notes` tanpa `reason_code`, tandai sebagai `OTHER`; wajibkan setelah APK baru tersebar |
| Angka cakupan berubah setelah migrasi | Laporan bulanan tidak cocok | Bandingkan angka sebelum dan sesudah di hari yang sama, sebelum data bulan baru masuk |
| Zona waktu UTC | Penjemputan dekat tengah malam masuk bulan yang salah, ambang enam kali jadi meleset | Sudah tercatat sebagai T14 di dokumen audit; selesaikan sebelum fitur ambang dipakai |
| Ambang dihitung per bulan kalender | Kaleng dinyatakan non-aktif padahal baru dijemput dua kali | Hitung dari **jumlah penjemputan kosong berturut-turut**, bukan bulan |
| Hitungan kosong tidak direset saat kaleng terisi | Kaleng yang sudah aktif lagi tetap ikut terhitung dan bisa naik ke Non-Aktif tanpa dasar | Reset ke nol pada setiap penjemputan berisi, dan kembalikan `NON_AKTIF` → `AKTIF` (keputusan 24). Lihat bagian 4.2 |
| `Tidak Terjemput` ikut terhitung sebagai kosong | Kaleng yang tidak sempat dijemput terlihat seperti berhenti mengisi | Hitung hanya dari tabel `collections`, jangan dari `assignments` |
| Kunjungan verifikasi tercatat di `collections` | Hitungan kosong bertambah palsu setiap kali kaleng non-aktif diverifikasi | Pakai tabel `can_visits` (bagian 7), bukan `collections` |
| `RUSAK` atau `HILANG` ikut naik ke `NON_AKTIF` padahal tindakannya belum selesai | Kaleng yang belum pernah diganti berhenti dijemput tanpa ada yang memutuskan | Daftar kerja "perlu tindakan" tetap memunculkannya sampai admin benar-benar memutuskan. Lihat bagian 11.3 |

---

## 11. Dua pertanyaan terakhir — sudah dijawab

### 11.1 Kaleng Non-Aktif yang ternyata diisi lagi

**Keputusan 24: kembali menjadi `AKTIF`, dan hitungan kosongnya direset ke nol.**

Perlu enam kali penjemputan kosong berturut-turut yang **baru** untuk naik ke Non-Aktif
lagi. Tangganya turun penuh, bukan mundur satu langkah.

Konsekuensi untuk kode: fungsi penghitung di bagian 4.2 harus dipanggil **setiap kali
ada penjemputan berisi**, bukan hanya saat status sudah Non-Aktif. Dua hal terjadi
sekaligus pada satu penjemputan berisi:

1. Hitungan kosong → nol.
2. Kalau `condition = 'NON_AKTIF'` → kembali `AKTIF`.

**Catatan saya (bukan keputusan Anda):** saya sarankan langkah 2 berjalan **otomatis**,
tanpa persetujuan admin. Alasannya arahnya berbeda dari kenaikan — menaikkan status
berarti menyimpulkan sesuatu tentang donatur, sedangkan menurunkannya hanya mencatat
fakta bahwa kalengnya dipakai lagi. Tidak ada hubungan dengan donatur yang bisa rusak
karena kesalahan di sini. Kalau Anda ingin tetap lewat persetujuan admin, tinggal
bilang — perubahannya hanya satu baris di service.

### 11.2 Angka dikembalikan ditampilkan sebagai apa

**Keputusan 25: keduanya** — jumlah yang ditarik pada bulan berjalan, dan jumlah total
seluruhnya.

Konsekuensi untuk kode: satu query dengan dua klausa periode, bukan dua query terpisah.
Kalau dihitung dua kali, keduanya bisa membaca data pada saat yang sedikit berbeda dan
angkanya tidak akan pernah cocok saat ditampilkan bersebelahan.

### 11.3 Satu kondisi untuk Rusak atau Hilang yang juga kosong enam kali

Karena kaleng rusak **dan** kaleng hilang sama-sama tetap dijemput (keputusan 23 dan 26),
hitungan kosong keduanya juga berjalan. Kalau pemiliknya tidak menyerahkan apa pun
selama enam kali berturut-turut, kondisi `RUSAK` maupun `HILANG` akan naik menjadi
`NON_AKTIF`.

**Ini bukan pertanyaan, melainkan akibat yang tidak bisa dihindari** dari keputusan yang
sudah Anda tetapkan. Satu kaleng hanya bisa memegang satu kondisi, jadi Non-Aktif yang
menang. Menurut saya itu memang hasil yang benar — kaleng yang rusak atau hilang **dan**
tidak dipakai lagi sebaiknya ditarik, bukan sekadar diganti.

Yang perlu dijaga di kode: saat kondisi berubah dari `RUSAK` ke `NON_AKTIF`, tindakan di
daftar kerja ikut berubah dari "ganti unit" menjadi "dikembalikan". Jangan sampai
keduanya muncul bersamaan untuk satu kaleng.

**Satu hal yang perlu Anda sadari, karena ini bisa mengunci masalah tanpa terlihat.**
Kalau `HILANG` naik ke `NON_AKTIF`, rumah itu **keluar dari daftar tugas bulanan** —
padahal kalengnya belum pernah diganti. Jadi urutannya jadi begini: PPK berhenti
didatangi, padahal rumah itu belum pernah menerima kaleng baru. Kalau tidak dijaga,
rumah seperti ini bisa mengendap tanpa ada yang menyelesaikannya.

Karena itu daftar kerja "perlu tindakan" **tidak boleh** hanya membaca `NON_AKTIF`.
Ia harus tetap memunculkan kaleng itu sebagai "beri kaleng baru" sampai admin benar-benar
memutuskan — entah menggantinya, entah menariknya sekalian.

**Catatan saya (bukan keputusan Anda):** kalau Anda ingin `HILANG` tidak pernah bisa naik
ke `NON_AKTIF`, itu satu baris di kode — cukup kecualikan `HILANG` dari pemicu ambang.
Saya tidak melakukannya secara default karena Anda sudah menetapkan aturan ambangnya
berlaku umum, dan saya tidak mau menyimpang dari itu tanpa izin Anda.

---

## 12. Urutan pengerjaan yang disarankan

| Tahap | Isi | Kenapa di sini |
|---|---|---|
| 1 | Perbaiki T14 (zona waktu UTC) | Semua perhitungan bulanan bergantung padanya |
| 2 | Migrasi kolom `condition` | Fondasi; belum mengubah perilaku |
| 3 | Perbaiki query cakupan dan daftar tugas | Angka jadi benar |
| 4 | Penghitung kosong berturut-turut + usulan perubahan status | Inti keputusan 3 dan 24 |
| 5 | Tabel usulan + layar persetujuan admin + daftar kerja | Menyalakan pola "sistem mengusulkan, admin memutuskan" |
| 6 | Tabel kunjungan + input alasan di mobile | Butuh rilis APK; paling lambat |
| 7 | Bersih-bersih data kaleng dikembalikan | Setelah semua stabil |

Tahap 1 bukan bagian dari rancangan ini, tetapi mengerjakan tahap 2–3 tanpa
menyelesaikan tahap 1 akan menghasilkan angka yang benar hari ini dan salah pada
awal bulan. Urutannya tidak boleh ditukar.

Tahap 4 sengaja dipisah dari tahap 5. Penghitungnya bisa diuji sendiri dengan data
lama sebelum ada layar persetujuan — dan itu cara termurah untuk memastikan
hitungannya benar sebelum ada yang bergantung padanya.

---

## 13. Status keputusan

**26 keputusan, 0 pertanyaan terbuka.**

Semua yang dibutuhkan untuk mulai menulis kode sudah ada. Yang tersisa hanyalah
pekerjaan teknis di bagian 12, bukan keputusan produk.

Catatan di bagian 11 dan lampiran alur **bukan keputusan** — itu saran teknis
dari saya, dan tidak perlu disetujui untuk mulai bekerja. Kalau salah satu
bertentangan dengan maksud Pion, yang berubah hanya satu atau dua baris kode.
