# Pengaman Integritas Penjemputan terhadap Penugasan — 9 Oktober 2026

Dokumen ini mencatat apa yang dikerjakan, mengapa, dan berkas mana saja yang
disentuh sepanjang penelusuran masalah **penjemputan ganda** (satu kaleng
tercatat dijemput lebih dari sekali dalam satu bulan) untuk petugas
**Ahmad Bagus Hidayatullah** (`PNG-25-0001`, ranting KOTAK TAQWA).

Bagian 1–6 adalah penelusuran dan diagnosis. Bagian 7 adalah perubahan kode yang
benar-benar dibuat. Bagian 8 adalah status dan langkah berikutnya.

---

## 1. Asal masalah

Pengguna melihat angka di halaman **Laporan** untuk September bahwa satu kaleng
dijemput **37 kali** tetapi hanya **36 kaleng berbeda** — lalu bertanya apa
maksud "37 kali penarikan" vs "36 kaleng". Dari sana muncul pertanyaan lebih
dalam: **kenapa satu kaleng bisa tercatat dijemput dua kali?**

## 2. Bagian-bagian halaman Laporan yang membingungkan

| Yang tampil | Arti sebenarnya | Catatan |
|---|---|---|
| `Total Penarikan` / `37 Kali` | Jumlah **kejadian** penjemputan (baris catatan) | Kata "Penarikan" tidak dipakai organisasi — yang benar "penjemputan" |
| `36 kaleng dijemput` | Jumlah **kaleng berbeda** (unik) | Selisih 1 karena 1 kaleng dijemput 2 kali |
| `Kaleng Tidak Terjemput 8` | Penugasan ber-status UNCOLLECTED | Sama dengan teks kecil di bawahnya |
| `8 dari 62 kaleng aktif` | `total_assignments` — **semua** penugasan, bukan yang ber-status aktif | Label "kaleng aktif" menyesatkan |

Perbaikan label (sesuai permintaan pengguna) ada di bagian 7.1.

## 3. Diagnosa: apa yang sebenarnya terjadi

Tiga penjelasan yang sempat dianggap, dan hasil pemeriksaannya:

1. **Aplikasi HP mengirim dua kali** — didukung fakta: kedua penjemputan
   berjarak **3 menit 36 detik** (2 September, 14:11 dan 14:15). Dugaan, bukan
   fakta: tidak ada jejak log untuk peristiwa itu.
2. **Tiga kaleng berbeda dengan nama pemilik sama** — terbukti: yang bernama
   "Helmy Mubarok" ada **3 kaleng berbeda**. Ini penting karena query awal
   mengelompokkan berdasarkan **nama pemilik**, bukan ID kaleng, sehingga
   angkanya tampak lebih besar. Setelah dihitung per ID, indeks unik penugasan
   **tidak dilanggar (0 pelanggaran)**.
3. **Kaleng yang sama (`LAZ-PNG-25-00065-376`) dijemput dua kali pada 2 September** — terbukti, dan ini masalah sebenarnya.

Rincian dua penjemputannya:

| | Penjemputan 1 | Penjemputan 2 |
|---|---|---|
| Waktu dibuat | 2026-09-02 07:11:46 | 2026-09-02 07:15:44 |
| Nominal | Rp 50.050 | Rp 72.500 |
| Menempel ke penugasan | punya **boris**, September, status **REASSIGNED** | punya **Ahmad**, **Agustus**, status COMPLETED |
| Petugas penjemput | Ahmad | Ahmad |

Kedua baris itu dibuat **18 hari sebelum** pengaman penolakan ada (commit
`24b51f7` dan `71a5820`, 20–25 September). Jadi baris ini usang dari segi aturan.

## 4. Akar masalah (terukur, bukan dugaan)

Dari **102 penjemputan** di produksi, **37 baris bermasalah** (identik di database lokal):

| Jenis pelanggaran | Jumlah |
|---|---|
| Menempel ke penugasan milik **petugas lain** | **1** |
| Tanggal penjemputan **di luar periode** penugasan | **36** |
| Menempel ke kaleng berbeda | 0 |

Kenapa ini menghasilkan penjemputan ganda: indeks unik yang ada hanya

```
(assignment_id, can_id, submit_sequence)
```

Pagar ini hanya menahan kalau **kedua penjemputan menempel ke penugasan yang
sama**. Karena sistem mengizinkan penjemputan menempel ke penugasan **periode
manapun milik siapa pun**, dua penjemputan boleh menempel ke dua penugasan
berbeda → pagarnya tak pernah terpicu.

## 5. Tiga usulan perbaikan yang **dibatalkan**

1. **Pemeriksaan waktu** (tolak bila jaraknya < 15 menit) — ditolak pengguna:
   hanya menambal gejala, bukan sumber.
2. **Batasan bulan harus sama** — dibatalkan karena sistem memang **sengaja
   mengizinkan** penjemputan beda bulan (judul commit-nya:
   `feat(c1-t2): scan toleran lintas periode`).
3. **Indeks unik per kaleng per bulan** — **tidak bisa dibuat**: 27 baris lama
   (9 kelompok) melanggarnya, dan **indeks unik PostgreSQL tidak punya opsi
   `NOT VALID`**. Ditunda, statusnya masih terbuka.

## 6. Aturan final yang disepakati

> Satu kaleng dalam satu bulan → maksimal **satu penjemputan**, dan maksimal
> **satu penugasan aktif**.

Perubahan penting dari versi awal usulan: pengguna sempat menyatakan satu kaleng
boleh dijemput beberapa kali dalam sebulan asalkan lewat penugasan baru, lalu
**menarik pernyataan itu** dan menyatakan aturannya seperti di atas.

Konsekuensinya: penugasan tetap satu per kaleng per bulan, sementara
`can_officer_period_unq` (indeks lama) ternyata **terlalu longgar** — ia mengunci
per **(kaleng, petugas, periode)**, sehingga kaleng yang sama bisa punya dua
penugasan aktif di bulan yang sama bila petugasnya berbeda. Itulah celah asli.

## 7. Yang dikerjakan

### 7.1. Perbaikan label halaman Laporan

Diminta pengguna, di `apps/web/src/app/dashboard/reports/page.tsx`:

| Baris | Sebelum | Sesudah |
|---|---|---|
| 230 | `Total Penarikan` | `jumlah penjemputan (n) kaleng` |
| 233 | `{totalCount} Kali` | `{totalCount} kali · {totalCollectedCans} kaleng` |
| 318 | `Status Terlewat` | `Tidak dijemput` |
| 320 | `{n} dari {total} kaleng aktif` | `{n} dari {total} penugasan` |

Sekarang 37 dan 36 tampil bersama di kartu yang sama, jadi kejadiannya langsung
terbaca tanpa perlu mencocokkan.

### 7.2. Pengaman 1 & 2 (migrasi baru)

Dengan arahan eksplisit pengguna: **"pasang 1 dan 2"**, dan pilihan **opsi 3**
untuk 37 baris lama (dibiarkan, pengaman hanya untuk data baru).

Berkas baru: `apps/backend/src/database/migrations/0015_collections_assignment_integrity.sql`

**Pengaman 1** — indeks unik sebagian, satu penugasan aktif per kaleng per bulan:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS assignments_active_one_per_can_period_unq
  ON "assignments" ("can_id", "period_year", "period_month")
  WHERE "status" = 'ACTIVE';
```

Aman dibuat langsung karena **0 pelanggaran** pada data yang ada.

**Pengaman 2** — penjemputan tidak boleh menempel ke penugasan milik petugas lain:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS assignments_id_can_officer_unq
  ON "assignments" ("id", "can_id", "officer_id");

ALTER TABLE "collections"
  ADD CONSTRAINT "collections_assignment_can_officer_fk"
  FOREIGN KEY ("assignment_id", "can_id", "officer_id")
  REFERENCES "assignments" ("id", "can_id", "officer_id")
  NOT VALID;
```

`NOT VALID` = baris lama tidak diperiksa, sesuai pilihan opsi 3.

Juga ditambahkan entri ke-15 di
`apps/backend/src/database/migrations/meta/_journal.json`
(tag `0015_collections_assignment_integrity`) supaya migrasi ini terbaca oleh
migrator dan tidak dianggap yatim.

### 7.3. Hasil pengujian

Dijalankan di **database lokal** pada **salinan** data (`lazisnu_uji_migrasi`),
bukan produksi dan bukan database lokal asli:

| Uji | Hasil |
|---|---|
| Migrasi berjalan | lulus |
| Dua indeks terbentuk | lulus |
| FK terbentuk `convalidated=false` | lulus (NOT VALID sesuai rencana) |
| Data lama utuh (102 penjemputan, 278 penugasan) | lulus |
| Menjemput memakai penugasan **petugas lain** | **ditolak** |
| Menjemput memakai penugasan **milik sendiri** | **diizinkan** |
| Dua penugasan aktif kaleng+bulan sama (petugas beda) | **ditolak** |
| Alur transfer (lama REASSIGNED + baru ACTIVE) | **tetap boleh** |

Pemeriksaan milik repo:
`node scripts/check-migration-orphans.js` → **✅ Semua 16 file .sql terdaftar**
`pnpm --filter lazisnu-backend typecheck` → bersih.

Uji kelima yang paling berarti: sebelum migrasi, dua penugasan aktif untuk
kaleng dan bulan yang sama oleh **petugas berbeda bisa berdampingan** — persis
celang kasus Helmy/boris.

### 7.4. Kecelakaan yang sudah diperbaiki

Saat menambah entri journal, `Set-Content -Encoding UTF8` di PowerShell 5.1
menyelipkan **BOM**, sehingga `JSON.parse` gagal dan pemeriksa migrasi sempat
error. BOM sudah dibuang; pemeriksa kini lolos. Ini dicatat agar tidak terulang
— untuk menulis JSON di repo ini, jangan pakai `Set-Content -Encoding UTF8`.

## 8. Daftar berkas yang disentuh

### Diubah

| Berkas | Perubahan |
|---|---|
| `apps/web/src/app/dashboard/reports/page.tsx` | 4 label + tampilan "37 kali · 36 kaleng" |
| `apps/backend/src/database/migrations/meta/_journal.json` | entri migrasi ke-15 (BOM sudah dibersihkan) |
| `apps/backend/src/routes/admin/assignments.ts` | isi jejak `oldData` pada hapus & ubah penugasan (celah §7.1 laporan sebelumnya) |
| `apps/web/src/lib/api.ts` | normalisasi `NEXT_PUBLIC_API_URL` agar tak memicu `Invalid URL` |
| `apps/web/src/app/dashboard/reports/page.tsx` (fungsi `apiUrl`) | URL backend selalu absolut, tidak lagi `new URL()` pada string mentah |
| `apps/web/src/app/dashboard/users/[id]/StatsCards.tsx` | kartu "Total Tugas" menampilkan status "dipindah"; angka besar dan rincian kini selalu cocok |
| `apps/web/src/app/dashboard/users/[id]/page.tsx` | tombol Edit/Nonaktifkan dipindah ke bawah-kanan; filter periode digeser ke kiri |
| `apps/web/src/app/dashboard/master/page.tsx` | kartu Backup memakai `variant="glass"` |
| `apps/web/src/app/dashboard/setoran/page.tsx` | tombol Muat Ulang masuk kartu filter; filter bulan/tahun digabung via `PeriodPicker`; wadah filter jadi transparan |
| `apps/web/src/app/dashboard/rekap-mwc/page.tsx` | sama seperti setoran; tabel & kartu ringkasan jadi kaca |
| `apps/web/src/app/dashboard/wa-monitor/page.tsx` | strip "Statistik Historis" dihapus; filter Periode pindah ke kanan tombol Refresh; pola reset satu-sumber |
| `apps/web/src/app/dashboard/assignments/page.tsx` | filter bulan/tahun dihapus (samakan dengan cans) |
| `apps/web/src/app/dashboard/assignments/[id]/page.tsx`, `cans/[id]/page.tsx`, `users/page.tsx`, `audit-log/page.tsx`, `resubmit/page.tsx`, `reports/FilterDropdown.tsx` | pola reset satu-sumber + tambal reset status `'ACTIVE'` → `'ALL'` |
| `apps/web/src/components/ui/Card.tsx` | judul kartu kaca memakai token `--glass-ink`; strip judul/footer transparan untuk varian kaca |

### Baru

| Berkas | Isi |
|---|---|
| `apps/backend/src/database/migrations/0015_collections_assignment_integrity.sql` | pengaman 1 & 2 |
| `docs/penjagaan-integritas-penjemputan-2026-10-09.md` | dokumen ini |
| `docs/detail-petugas-ahmad-bagus-2026.md` | rincian 102 penjemputan & 148 penugasan petugas |
| `docs/penelusuran-angka-210-2026-10-09.md` | laporan penelusuran selisih 210 vs 148 (termasuk bagian yang sudah dikoreksi) |

### Di luar repo (sementara, sudah dibersihkan)

`C:\Users\user\AppData\Local\Temp\opencode\*` — skrip diagnosa semuanya sudah
dihapus. Database uji `lazisnu_uji_migrasi` / `lazisnu_uji2` sudah dibuang.

## 9. Status dan langkah berikutnya

**Sudah dikerjakan:** pengaman 1 & 2 terpasang dan teruji di database lokal.
**Belum dijalankan di produksi.** Perintahnya bila Anda siap:

```bash
ssh lazisnu "cd /opt/lazisnu && bash scripts/deploy-blue-green.sh migrate"
```

**Masih terbuka:**
1. **Pengaman 3** (trigger: penugasan harus aktif & milik sendiri) — belum
   dipasang karena Anda hanya meminta 1 dan 2.
2. **Pengaman 4** (satu penjemputan per kaleng per bulan) — blocked karena
   27 baris lama (9 kelompok) melanggarnya dan indeks unik PostgreSQL tak punya
   `NOT VALID`. Perlu keputusan nasib 27 baris itu.
3. **Commit** — semua perubahan di atas masih di working tree, belum di-commit.
4. **37 baris lama** masih ada di produksi begitu saja (pilihan opsi 3).

**Dua catatan jujur:**
- Efek samping FK: **1 baris** penjemputan historis (Helmy Rp 50.050) tidak bisa
  lagi diperbaiki lewat tombol perbaiki, karena `resubmitCollection` menyalin
  `(assignment_id, can_id, officer_id)` ke baris baru dan baris baru wajib
  memenuhi FK.
- Panduan `cara jalankan localhost.txt` sudah diperbarui dengan temuan
  lingkungan (variabel `$env:` menimpa `.env`, pagar `ERR_PNPM_IGNORED_BUILDS`,
  cara mematikan server dev).
