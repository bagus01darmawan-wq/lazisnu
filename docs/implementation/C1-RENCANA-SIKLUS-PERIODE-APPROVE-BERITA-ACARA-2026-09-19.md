# C1 — Siklus Periode Tetap + Approve 2 Tingkat + Berita Acara Digital

**Status:** 🟢 DISEPAKATI KONSEP — siap jadi acuan implementasi. Bukan kode.
**Disusun:** 19 Sep 2026 · **Repo:** `bagus01darmawan-wq/lazisnu`
**Dasar diskusi:** 18–19 Sep 2026 (B1 filter periode, toleransi 27→9, laporan WA, Staf Bid. Pengumpulan)
**Dokumen terkait:**
- `.hermes/plans/2026-09-18_b1-filter-periode-scan.md` (B1 — direvisi oleh dokumen ini §5)
- `docs/audit/dasar-perbaikan-metrik-tugas-mobile-2026-09-13.md` (kontrak metrik)
- `apps/backend/src/routes/mobile/tasks.ts` (scan, dashboard, periods/complete)
- `apps/backend/src/database/schema.ts` (roles, assignments, collections)

---

## 1. Ringkasan kesepakatan

1. **Tanggal tetap tiap bulan:** assign ~20, wajib jemput s/d 27, toleransi s/d 9 bulan berikut 23:59, kunci 10 jam 00:00.
2. **Jadwal = tugas digital,** pengganti pengumuman WA "ayo penjemputan". Generate oleh Staf Bid. Pengumpulan per ranting → PPK terima daftar kaleng wilayahnya di HP + notifikasi.
3. **Staf Bid. Pengumpulan = peran operasional per ranting** (scope `branchId`, sama dengan Admin Ranting). Tugas: generate, atur jadwal, monitoring PPK. Bukan pengunci laporan.
4. **Approve 2 tingkat + kunci:**
   - PPK FINAL → dikunci → Admin Ranting rekap → Ranting FINAL (kunci) → MWC hanya tarik yang FINAL.
5. **Berita Acara digital & dapat diunduh** (PDF) di tiap tingkat, bersumber dari data FINAL di DB — bukan dari WA.
6. **Kasus 10–17 Okt** = jemput awal periode berikutnya. Solusi: generate assignment periode N+1 lebih awal (10 Okt 00:00 setelah periode N dikunci), bukan dimasukkan ke periode lama.

Contoh laporan yang didigitalkan (WA Agustus 2026, Ranting Madendo):

> Total 867.500 | Bisyaroh 86.000 | Share MWC 30% 173.500 | Bersih 608.000 | Kaleng 155 (Aktif 85, Non-aktif 70)

---

## 2. Siklus periode tetap (sumber kebenaran baru)

### 2.1 Definisi

Untuk periode bulan M tahun Y:

| Fase | Rentang | Aksi sistem |
|---|---|---|
| DIBUKA | 10, M, 00:00 | Setelah M−1 dikunci, robot siapkan draft `(Y, M)` + Staf approve (§14.12). Inilah pembukaan periode. Satu periode = satu baris `period_calendar`. |
| WAJIB_JEMPUT | 20 → 27, M | Scan normal. Dashboard countdown "sisa N hari". |
| PELAPORAN | 28 M → 31 M | PPK FINAL + Admin Ranting kunci (batas normal 30/31, §14.7). |
| TOLERANSI | 1 → 9, M+1, 23:59 | Scan **tetap lolos** untuk assignment `(Y, M)`. Badge "Toleransi". Monitoring kejar sisa ACTIVE. |
| KUNCI_KERAS | 10, M+1, 00:00 | Assignment `(Y, M)` yang masih ACTIVE di-freeze. Tidak bisa scan/submit lagi untuk periode itu. Tanpa laporan ranting → `FINAL_NOL` via Kunci Periode MWC (§14.7). Bersamaan: draft `(Y, M+1)` disiapkan (lihat §6). Jemputan 10–17 tercatat sebagai periode M+1. Lewat 10 tidak ada toleransi. |

Zona waktu: `Asia/Jakarta`. Semua batas pakai server time WIB, bukan UTC mentah.

### 2.2 Aturan tempel (penting — revisi metrik)

- **Periode milik assignment, bukan `collected_at`.** `collections.assignment_id → assignments.(periodYear, periodMonth)` adalah kebenaran.
- `collected_at` 20 Sept–9 Okt dengan `assignment_id` Sept = **pemasukan Sept**.
- Semua agregat laporan/approve/summary **group by `assignment.period`**, bukan `collectedAt` bulan kalender.
- Kode yang sekarang salah dan harus diubah: `scheduler/calculate-summaries` (`scheduler.ts:87-88, 91-96` group by `collectedAt`), `dashboard monthStats` (`tasks.ts:39-41, 66-75`), `stats-range`.

---

## 3. Peran & permission

Role DB sekarang (`schema.ts:5`): `ADMIN_KECAMATAN | ADMIN_RANTING | PETUGAS`. Belum ada Staf Pengumpulan.

### 3.1 Pemetaan organisasi → sistem

| Lapangan | Sistem | Scope | Boleh | Tidak boleh |
|---|---|---|---|---|
| PPK (Petugas Penjemput Koin) | `PETUGAS` + `officers` | miliknya | scan, submit, betulkan per kaleng miliknya selama DRAFT, FINAL-kan setoran sendiri | lihat/edit PPK lain, kunci ranting, ubah apa pun setelah FINAL |
| Staf Bid. Pengumpulan | BARU: `STAF_PENGUMPULAN` | `branchId` (1 per ranting) + `districtId` (1 di MWC urus program, §14.13/B-5) | siapkan/edit/setujui draft robot (§14.12), lihat realtime PPK scope-nya, kirim pengingat | FINAL/kunci laporan, ubah nominal (tidak bisa sama sekali) |
| Staf Bid. Admin-Keuangan (Sekretaris+Bendahara, saling gantikan) | BARU: `STAF_KEUANGAN` — 2 per ranting/MWC | `branchId` / `districtId` | pegang uang fisik, approve eskalasi 24 jam, buka draft BA, tanda tangan kedua, unduh PDF | ubah nominal (tidak bisa; angka murni dari sistem) |
| Admin Ranting | `ADMIN_RANTING` | `branchId` | kunci FINAL ranting, terbitkan BA ranting, REOPEN rantingnya + alasan | ketik nominal langsung, ubah diam-diam (reopen tercatat + TTD hangus) |
| MWC | `ADMIN_KECAMATAN` | `districtId` | tarik data FINAL semua ranting + program, kunci periode, REOPEN apa saja + alasan | ubah data ranting langsung |

Keputusan implementasi role: tambah enum `STAF_PENGUMPULAN` + `STAF_KEUANGAN` (bersih untuk audit). Pemisahan "yang generate" vs "yang pegang uang" vs "yang mengunci" harus terbaca di `activity_logs`.

### 3.2 Matriks aksi kunci

| Aksi | PPK | Staf Pengumpulan | Bendahara | Admin Ranting | MWC |
|---|---|---|---|---|---|
| Siapkan + setujui draft tugas (robot → approve §14.12) | ✗ | ✅ (Ranting: rantingnya, MWC: program MWC) | ✅ (eskalasi 24 jam) | ✗ | ✗ (via Staf MWC) |
| Scan / submit jemputan | ✅ | ✗ | ✗ | ✗ | ✗ |
| Betulkan per kaleng (DRAFT) | ✅ (miliknya) | ✗ | ✗ | ✗ | ✗ |
| FINAL PPK (co-sign) | ✅ (miliknya) | ✗ | ✅ (gantian) | ✗ | ✗ |
| REOPEN (buka kunci) | ✗ | ✗ | ✗ | ✅ (rantingnya) | ✅ |
| Kunci FINAL ranting | ✗ | ✗ | ✗ | ✅ | ✗ |
| Tarik laporan / kunci periode | ✗ | ✗ | ✗ | ✗ | ✅ |
| Unduh BA | miliknya | pantau | ✅ | ✅ | ✅ |

---

## 4. Jadwal digital (pengganti pengumuman WA)

Alur yang disepakati ("benar"):

1. Tgl 20: Staf Pengumpulan tekan **Generate Penugasan** → `POST /scheduler/generate-tasks {year, month}` (masih manual sekarang — `scheduler.ts:50-73`, perlu guard role baru + jadwal otomatis).
2. Tiap PPK dapat **Daftar Tugas** di aplikasi: kaleng mana, pemilik, alamat, wilayahnya (pengganti "ayo penjemputan di grup WA").
3. Push notification + fallback WA otomatis sebagai cadangan, bukan perintah utama.
4. 20–27–9: Staf Pengumpulan pantau dashboard `x/y selesai, sisa ACTIVE` per PPK; PPK lihat countdown.
5. Pembagian hari internal (mis. PPK A Senin, PPK B Selasa) tetap kesepakatan lisan — sistem tidak melarang, selama dalam jendela yang sama.

---

## 5. Revisi B1 (scan lintas bulan)

B1 awal mengusulkan Opsi A (perbaiki pesan saja). **Dengan siklus tetap ini, Opsi A tidak cukup.** Yang benar:

- `GET /mobile/scan/:qrCode` (`tasks.ts:333-406`, filter `:357-362`) harus toleran:
  - Hitung `periodeAktif(tanggalSekarang)`: jika `now` dalam [20 M … 9 M+1] → assignment `(Y, M)` masih boleh di-scan.
  - Lookup: ACTIVE periode berjalan (kalender) → ACTIVE periode toleransi (satu bulan ke belakang, jika masih dalam toleransi) → pesan.
- Setelah KUNCI (≥10): scan assignment periode lama → `409 QR_PERIOD_CLOSED` ("periode Sept sudah dikunci, hubungi admin"), bukan `QR_NOT_ASSIGNED`.
- Pesan menyesatkan B1 tetap diperbaiki (Opsi A): bedakan `QR_NOT_ASSIGNED` (bukan tugas) vs `QR_WRONG_PERIOD` (tugas periode lain) vs `sudah dijemput` vs `sudah dikunci`.
- Privasi tetap: bukan-tugas → tanpa `owner_*` (uji `scan-qr.test.ts` harus lulus).

---

## 6. Kasus 10–17 Okt (jemput awal)

Masalah: Sept dikunci 9 Okt. Assignment Okt (model lama) baru keluar ~20 Okt. Jemputan lapangan 10–17 Okt tidak punya assignment.

**Keputusan:** itu adalah **jemput awal periode Okt**, dilaporkan ikut periode Okt (20–27 Okt).

Implementasi:

1. Setelah kunci Sept (10 Okt 00:00), sistem otomatis generate assignment Okt (bukan menunggu 20 Okt).
2. Maka scan 10–17 Okt menempel ke assignment Okt → valid, masuk rekap Okt.
3. Masa 20–27 Okt menjadi puncak, bukan awal. Tidak perlu logika "tempel ke masa depan" yang rumit.
4. Alternatif yang DITOLAK: memasukkan jemputan 10–17 ke Sept (Sept sudah kunci/0) atau membiarkan tanpa assignment.

Catatan: cron + approve §14.12 — tgl 10 M+1 00:00 kunci periode M dan siapkan draft periode M+1 (bulan berjalan saat itu); tgl 20 M+1 sapuan susulan kaleng/PPK baru + kickoff pengingat. Tidak ada tombol manual terpisah (robot siapkan → manusia setujui).

---

## 7. Approve 2 tingkat — alur

### Tingkat 1 — PPK ↔ Bendahara Ranting (co-sign di HP bendahara)

Disepakati 19 Sep: penghitungan dilakukan bersama (keduanya dewasa, tidak ada yang mau rugi bila angka tidak pas). Sistem tidak mengatur cara mereka berhitung — hanya mengunci tombol TTD sampai keduanya menyatakan pas.

1. PPK selesai jemput → sistem hitung otomatis dari `collections` miliknya periode itu (PPK dan bendahara **tidak ketik nominal**).
2. Di HP bendahara (`STAF_KEUANGAN`): buka **draft BA sebagai teks yang bisa dibaca** (ringan, bisa scroll, bukan PDF).
3. Hitung uang fisik bersama, cocokkan dengan total sistem. **Tidak pas → berhenti, jangan tanda tangan.** Selesaikan di tempat (hitung ulang / submit susulan selama DRAFT).
4. Pas → PPK tanda tangan duluan di HP bendahara (stylus murah/jari) → gantian bendahara tanda tangan → tercatat `signer_id + timestamp` masing-masing.
5. Tampil **BA sudah ditandatangani** (teks + gambar TTD). Status `DRAFT → FINAL`. Semua `collections`/`assignments` PPK periode itu terkunci.
6. Tombol Unduh → PDF di-generate saat itu saja (lazy, §10). PDF lama berversi bila pernah reopen.
7. Reopen (opsi B): hanya Admin Ranting / MWC, wajib alasan + audit. Reopen mengembalikan ke DRAFT dan **menghanguskan kedua TTD** — harus hitung + co-sign ulang.

Cara ubah data (tidak ada ketik total langsung — total = SUM per kaleng):
REOPEN oleh admin → PPK betulkan per kaleng di HP-nya (tambah yang ketinggalan / resubmit salah ketik beralasan) → total berubah otomatis → ketemu lagi, hitung ulang, co-sign ulang, FINAL + PDF versi baru.

### Tingkat 2 — Ranting ↔ MWC (pola yang sama)

1. Admin Ranting lihat semua PPK realtime (DRAFT/FINAL).
2. Tombol **Kunci Ranting** aktif hanya jika **semua PPK ranting itu sudah FINAL** (atau ditandai UNCOLLECTED/0 dengan alasan — untuk kasus "dinyatakan tidak ada pemasukan").
3. Sistem agregat otomatis (lihat §8) → draft BA-Ranting (teks readable) → co-sign Admin Ranting ↔ Bendahara MWC di HP bendahara MWC → status `DRAFT → FINAL` → PDF lazy.
4. MWC hanya bisa menarik yang `FINAL`. Data DRAFT tidak muncul di laporan MWC.
5. Setelah Ranting FINAL → data ranting periode itu terkunci penuh. Reopen oleh MWC menghanguskan TTD tingkat 2 (TTD tingkat 1 PPK tetap sah kecuali ppk_submission-nya ikut di-reopen).

### Status yang dinyatakan 0

Jika lewat 9 Okt pengurus ranting tidak lapor → Admin Ranting wajib kunci dengan status `FINAL_NOL` (atau `FINAL` dengan total 0 + alasan "tidak ada laporan") → MWC membaca sebagai **0 pemasukan Sept**. Bukan dibiarkan menggantung ACTIVE.

---

## 8. Rumus rekap (auto-hitung, bukan ketikan) — TERVERIFIKASI data WA Agustus 2026

Verifikasi 19 Sep 2026 dari data grup WA (dihitung pakai kode):
19 ranting lapor = 2.368 kaleng, Rp 45.264.000 (rata-rata ~Rp 19.115/kaleng).
Rumus `share = 30% × (total − bisyaroh 10%)` cocok untuk 4 dari 7 pembayaran
(Winduaji Timur +105, Tamansari −150, Sikembang +790, Pan. Barat −5.210) → **rumus dikunci.**

Per PPK (dari DB, terkunci saat FINAL):

```
total         = SUM(collections.nominal) milik officer + periode
bisyaroh      = 10% × total, dibulatkan ke atas ke ribuan (contoh: 867.500 → 87.000, dari 86.750) — REVISI 20 Sep (B-3)
bersih_ppk    = total − bisyaroh
ekspektasi_share_ppk = 30% × bersih_ppk  (informatif, bukan tagihan kaku)
```

Per Ranting (agregat PPK + statistik kaleng):

```
total_ranting     = SUM(total semua PPK ranting)
bisyaroh_total    = SUM(bisyaroh PPK)
sisa              = total_ranting − bisyaroh_total
ekspektasi_share  = 30% × sisa   (contoh Pan. Barat: 5.600.700 × 30% = 1.680.210 vs aktual 1.675.000)
share_mwc         = nominal aktual yang disetor (boleh ≠ ekspektasi, wajib ada alasan bila selisih)
selisih_share     = share_mwc − ekspektasi_share  (disimpan, ditampilkan merah bila di luar toleransi)
bersih            = total − bisyaroh − share_mwc
jml_kaleng        = COUNT(cans cabang, termasuk program? lihat §8b)
kaleng_aktif      = COUNT(condition = AKTIF)
tidak_aktif       = sisanya (NON_AKTIF/RUSAK/HILANG sesuai definisi)
```

Aturan selisih (agar Rowadi −58.680 dan Lambanggelun I +105.555 tidak lolos diam-diam):

- Toleransi pembulatan: `|selisih| ≤ Rp 10.000` → hijau, boleh FINAL langsung.
- Di atas itu → wajib pilih alasan: `KURANG_BAYAR (jadi piutang) | LEBIH_BAYAR | GABUNG_PERIODE (mis. Sawangan Juli+Agustus) | KOREKSI_ADMIN`.
- `GABUNG_PERIODE` wajib cantumkan `periode_terkait[]` (mis. `[2026-07, 2026-08]`) — pembayaran Sawangan Rp 1.600.000 dicatat menutup 2 periode.
- Dashboard MWC menampilkan flag merah otomatis untuk: selisih besar tanpa alasan, dan ranting hilang dari rekonsiliasi (kasus Taqwa Agustus: sudah lapor 48/Rp 1.791.000 tapi tidak ada di list sudah/belum pentasyarufan).

Semua komponen + `ekspektasi_share` + `selisih_share` + alasan disimpan per submission (snapshot) untuk audit — jika config % berubah bulan depan, laporan lama tidak ikut berubah.
Contoh Madendo lama (share 173.500 vs hitungan rumus lama 234.225 tanpa bulat ribuan) dicatat sebagai data historis pra-sistem, tidak dipakai sebagai acuan rumus. Ekspektasi rumus baru bulat atas = 234.150.

### 8b. Koin Taqwa — bukan ranting (keputusan 19 Sep 2026)

Fakta lapangan: Koin Taqwa adalah **program MWC langsung** (kotak di warung/toko sekecamatan yang bersedia), bukan ranting. Sistem sekarang membacanya sebagai ranting → itulah kenapa Taqwa hilang dari list pentasyarufan (program MWC tidak menyetor share ke MWC, karena memang milik MWC).

Solusi (rekomendasi: opsi 1, termurah):

**Opsi 1 — Diskriminator di `branches` (dipilih).**
Tambah kolom `branches.kind: 'RANTING' | 'PROGRAM_MWC'` (default RANTING; Taqwa = PROGRAM_MWC) + `branches.district_id` tetap sebagai pemilik.
- Kaleng/officer/assignment Taqwa tetap pakai `branch_id` yang sama → **tidak ada perubahan relasi**, scan dan metrik jalan seperti biasa.
- Yang berubah hanya agregasi: laporan ranting (`branch_submissions` + rekap WA) **filter `kind = RANTING`**; Taqwa masuk laporan tersendiri **"Program MWC"** (100% ke MWC, tanpa rumus share 30%).
- Permission: Taqwa dikelola Staf Pengumpulan / Admin level kecamatan (`districtId`), bukan ranting.
- Biaya migrasi: 1 kolom + backfill 1 baris (Taqwa) + ubah 3–4 query rekap.

**Opsi 2 — Tabel `programs` terpisah (ditolak untuk sekarang).** Lebih bersih jangka panjang bila program bertambah (mis. Kotak Masjid, Event), tapi memaksa `cans.branch_id` nullable + dual-path assignment. Ditunda sampai ada program ke-2.

Aturan laporan setelah perbaikan:
- Rekap "Ranting sudah/belum lapor" = hanya `kind = RANTING` (Taqwa tidak muncul di sini — benar).
- Rekap "Pentasyarufan 30%" = hanya RANTING (Taqwa tidak wajib setor share).
- Dashboard MWC punya 2 kartu: **Perolehan Ranting** (dengan share) dan **Perolehan Program MWC** (Taqwa, bruto penuh).
- `branch_submissions` tetap dipakai untuk Taqwa (satu baris per periode) tapi dengan `share_mwc = 0`, `net = total − bisyaroh`, dan label program — atau tabel yang sama dengan flag. Tidak perlu tabel baru.

---

### 8c. Merapikan "70 tidak aktif" (keputusan arah 19 Sep 2026)

Kondisi lapangan "tidak dijemput / kosong / non-aktif" dipetakan ke enum sistem yang sudah ada (`schema.ts:23-29`):

| Lapangan (campur) | Sistem | Masuk laporan sebagai | Dijemput? |
|---|---|---|---|
| Diisi rutin, ada donatur | AKTIF | kaleng_aktif | ya |
| Kosong terus / donatur pasif / menolak, tapi kotak masih ada | NON_AKTIF | tidak_aktif (rincian: non-aktif) | tidak (cukup dikunjungi verifikasi — alur B2) |
| Kotak pecah/rusak tapi donatur masih mau | RUSAK | tidak_aktif (rincian: rusak) | ya (donasi langsung ke PPK) + perlu ganti unit |
| Kotak hilang tapi donatur masih mau | HILANG | tidak_aktif (rincian: hilang) | ya (donasi langsung) + perlu kaleng baru |
| Kotak ditarik admin | DIKEMBALIKAN | keluar dari hitung (tidak di total maupun aktif) | tidak |

Laporan ranting format baru (pengganti "Tidak Aktif: 70" tunggal):

```
Jumlah Kaleng: 155 | Aktif: 85 | Non-aktif: 60 | Rusak: 6 | Hilang: 4 (ditarik: tidak dihitung)
```

Tugas Staf Pengumpulan saat generate: pastikan kondisi tiap kaleng mutakhir, agar angka ini benar sebelum PPK jalan.

---

## 9. Spec tabel (artinya: struktur simpan baru)

> "Spec tabel" = rancangan kolom, relasi, dan aturan kunci. Dibutuhkan karena sekarang tidak ada tempat simpan status FINAL/BA.

### 9.1 `ppk_submissions` (BARU)

Satu baris per PPK per periode. Unik `(officer_id, period_year, period_month)`.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| officer_id → `officers.id` | uuid | pemilik setoran |
| branch_id → `branches.id` | uuid | denormalisasi untuk query ranting cepat |
| period_year / period_month | int | periode assignment (bukan bulan `collected_at`) |
| total_amount | bigint | snapshot SUM nominal, dihitung server |
| collection_count | int | jumlah kaleng dijemput |
| bisyaroh_amount | bigint | snapshot 10% |
| net_amount | bigint | total − bisyaroh |
| formula_snapshot | json | `{bisyaroh_pct, rounding}` saat FINAL |
| status | `DRAFT \| FINAL` | awal DRAFT; reopen oleh Admin Ranting/MWC + alasan → kembali DRAFT, TTD hangus |
| finalized_at / finalized_by | timestamp / uuid(users) | kapan + siapa (admin yang mengunci di tingkat ranting, bila ada) |
| ppk_signer_id / ppk_signed_at / ppk_signature_url | uuid / timestamp / varchar | PPK (wajib, pertama) — coretan PNG kecil |
| bendahara_signer_id / bendahara_signed_at / bendahara_signature_url | uuid / timestamp / varchar | Bendahara ranting (wajib, kedua) — beda userId dengan PPK, ditolak server bila sama |
| version | int | naik tiap FINAL ulang setelah reopen; PDF lama arsip per versi |
| pdf_url | varchar | lokasi PDF versi terakhir (R2/S3); PDF lama disimpan per versi |
| created_at / updated_at | timestamp | |

Aturan: FINAL hanya jika tidak ada `assignments` ACTIVE tersisa milik officer+periode (semua COMPLETED/UNCOLLECTED) ATAU dipaksa dengan alasan + audit, DAN kedua TTD terisi beda userId. Setelah FINAL → tolak `POST /collections/submit` dan `POST /assignments/:id/skip` untuk officer+periode itu (cek di service, bukan cuma UI).

### 9.2 `branch_submissions` (BARU)

Satu baris per ranting per periode. Unik `(branch_id, period_year, period_month)`.

| Kolom | Tipe | Keterangan |
|---|---|---|
| id | uuid PK | |
| branch_id → `branches.id` | uuid | |
| district_id | uuid | denormalisasi MWC |
| period_year / period_month | int | |
| total_amount / bisyaroh_total / share_mwc / net_amount | bigint | snapshot agregat (`share_mwc` = aktual setor) |
| expected_share / share_variance | bigint | ekspektasi 30% × sisa + selisih (aktual − ekspektasi) |
| variance_reason | varchar | `NULL \| KURANG_BAYAR \| LEBIH_BAYAR \| GABUNG_PERIODE \| KOREKSI_ADMIN` (wajib bila \|selisih\| > 10rb) |
| linked_periods | json | mis. `[2026-07, 2026-08]` untuk GABUNG_PERIODE (Sawangan) |
| collection_count | int | |
| can_total / can_aktif / can_nonaktif / can_rusak / can_hilang / can_dikembalikan | int | snapshot statistik kaleng (B-4: 5 keranjang §8c, ditarik tidak dihitung) |
| formula_snapshot | json | `{bisyaroh_pct, share_pct: 30, share_base: "sisa_setelah_bisyaroh", rounding: "ceil_1000_bisyaroh"}` |
| status | `DRAFT \| FINAL \| FINAL_NOL` | FINAL_NOL = dikunci 0 pemasukan |
| finalized_at / finalized_by | timestamp / uuid | Admin Ranting |
| ranting_signer_id / ranting_signed_at / ranting_signature_url | uuid / timestamp / varchar | Admin Ranting (pertama) |
| mwc_bendahara_signer_id / mwc_bendahara_signed_at / mwc_bendahara_signature_url | uuid / timestamp / varchar | Bendahara MWC (kedua), beda userId |
| version | int | naik tiap FINAL ulang |
| pdf_url | varchar | PDF BA-Ranting → MWC (per versi) |
| created_at / updated_at | timestamp | |

Aturan: FINAL hanya jika semua `ppk_submissions` cabang+periode sudah FINAL (atau cabang tanpa PPK dengan alasan). Setelah FINAL → kunci penuh cabang+periode.

### 9.3 `period_calendar` (BARU, kecil — config tanggal tetap)

Karena tanggal tetap, tabel ini boleh statis/di-seed, tapi tetap perlu untuk audit + jika suatu bulan ada pengecualian (Ramadan, dsb).

| Kolom | Keterangan |
|---|---|
| period_year / period_month (PK) | |
| assign_date (tgl 20) | |
| due_date (tgl 27) | |
| tolerance_end (tgl 9 M+1 23:59 WIB) | |
| status `OPEN \| TOLERANCE \| LOCKED` | dihitung + di-cache, ditulis saat kunci |
| locked_at / locked_by | |

### 9.4 Yang TIDAK dipakai

- `collection_summaries` tidak dipakai untuk laporan FINAL (masih boleh untuk cache dashboard, tapi bukan sumber kebenaran MWC).
- Tidak ada edit nominal manual di submission — semua dari `collections`. Koreksi = resubmit collection sebelum FINAL, dengan alasan (`submitSequence`, `alasanResubmit` yang sudah ada).

---

## 10. Berita Acara digital (teks dulu, PDF lazy) — DIKUNCI 19 Sep

Pola disepakati: draft dibaca sebagai teks → co-sign bergantian di HP bendahara (stylus murah) → tampil BA bertanda tangan (teks) → PDF di-generate hanya saat tombol Unduh ditekan.

- **Sumber:** snapshot di submission (bukan hitung ulang saat unduh — agar PDF = data saat ditandatangani).
- **Isi BA-PPK:** kop LAZISNU, periode, nama PPK + ranting, tabel `total, bisyaroh, bersih, jumlah kaleng`, pernyataan penyerahan, 2 gambar TTD (PPK + bendahara) + `signer_id + timestamp` masing-masing + QR verifikasi (id submission + version).
- **Isi BA-Ranting:** kop, periode, nama ranting, tabel agregat format WA (total, bisyaroh, share MWC, bersih, kaleng aktif/non-aktif/rusak/hilang §8c), daftar PPK penyusun (nama + total masing-masing), pernyataan + 2 TTD (Admin Ranting + Bendahara MWC) + QR verifikasi.
- **Aturan tampil:** sebelum kedua TTD lengkap, yang tampil hanya draft bertanda "DRAFT — belum sah". Tombol Unduh PDF muncul hanya setelah FINAL.
- **Penyimpanan:** coretan TTD = PNG kecil (<50KB) di object storage; PDF = lazy-generate dari snapshot + TTD via pola `qrPdfService`, `pdf_url` per versi, immutable (hash disimpan bila perlu).
- **Angka tidak pas:** bukan urusan sistem — tombol tanda tangan tidak aktif sampai keduanya menyatakan pas; cara berhitung diselesaikan sendiri di tempat.

---

## 11. Perubahan kode (peta kerja)

| Area | File | Ubah |
|---|---|---|
| Fungsi periode | BARU `services/periodCalendar.ts` | `periodeUntuk(tanggal)`, `batasToleransi()`, `sudahDikunci()` — WIB |
| Scan | `routes/mobile/tasks.ts:357-384` | lookup toleran + kode `QR_WRONG_PERIOD` / `QR_PERIOD_CLOSED` |
| Dashboard/stats | `tasks.ts:35-100, 300-327` | group by assignment.period + countdown + badge Toleransi |
| Generate | `routes/scheduler.ts:50-73` | guard `STAF_PENGUMPULAN`, cron tgl 10 & 20, audit log |
| Submit/skip lock | `services/collectionSubmission.ts:44-66, 68-85`, `routes/mobile/collections.ts:60-95`, `tasks.ts:409-478` | tolak jika submission FINAL / periode LOCKED |
| Submission PPK | BARU `routes/ppk/submissions.ts` + tabel §9.1 | hitung otomatis, FINAL, PDF |
| Submission ranting | BARU `routes/admin/branchSubmissions.ts` + tabel §9.2 | agregat, syarat semua PPK FINAL, PDF |
| Laporan MWC | `routes/bendahara.ts`, `routes/admin/*` | hanya baca FINAL, filter `kind=RANTING` vs Program, flag selisih + tombol unduh BA |
| Mobile | `ScanScreen`, `DashboardScreen`, layar Setoran baru | chip periode/toleransi, tombol FINAL, unduh PDF |
| Web | halaman Staf (generate+monitor), halaman Ranting (kunci), halaman MWC (tarik) | sesuai matriks §3.2, bedakan kartu Ranting vs Program MWC |
| Migration | BARU `NNNN_period_submissions.sql` | enum role + 3 tabel + index unik + `branches.kind` + kolom variance §9.2 |

---

## 12. Rencana uji (per periode uji)

| # | Skenario | Ekspektasi |
|---|---|---|
| 1 | Scan assignment Sept pada 5 Okt | Lolos, badge Toleransi Sept |
| 2 | Scan assignment Sept pada 10 Okt (setelah kunci) | `QR_PERIOD_CLOSED`, tidak bisa submit |
| 3 | Jemputan 12 Okt (tanpa assignment Okt lama) | Lolos karena assignment Okt sudah digenerate 10 Okt; masuk rekap Okt |
| 4 | PPK FINAL lalu coba resubmit | Ditolak (locked) |
| 5 | Ranting kunci padahal 1 PPK DRAFT | Ditolak, sebut nama PPK |
| 6 | MWC tarik laporan (campur DRAFT+FINAL) | Hanya FINAL muncul |
| 7 | Ranting tanpa laporan → kunci NOL | Terbaca MWC sebagai 0 pemasukan Sept |
| 8 | PDF diunduh ulang sebulan kemudian | Isi = snapshot saat FINAL, tidak berubah |
| 9 | Rate limit scan 30/menit | Tetap berlaku |
| 10 | Data uji dipulihkan, WA hanya ke nomor uji | Prosedur H.7 |
| 11 | Scan Sept 09 Okt 23:59 vs 10 Okt 00:00 WIB | Lolos badge Toleransi / `QR_PERIOD_CLOSED` tepat di batas (§14.11) |
| 12 | HP TZ ≠ WIB (mis. UTC) jam sama | Batas dihitung server WIB, bukan jam HP |
| 13 | Jemput 27 Sep offline, sync 11 Okt | Ditolak Sept → Okt dipercepat, Sept UNCOLLECTED (§14.2); tidak hilang diam-diam |
| 14 | `collected_at` dimundurkan (20 Agu untuk Sept) | Ditolak/flag + audit; `serverTimestamp` bukti sah (§14.3) |
| 15 | 1 akun untuk 2 TTD | Ditolak (userId sama, constraint DB); wajib 2 sesi/2 HP (§14.6) |
| 16 | 2 admin tekan FINAL barengan | Sekali saja, `version` tidak dobel (§14.10) |
| 17 | Reopen 1 PPK | Ranting auto DRAFT, TTD-2 hangus, PDF lama arsip + hash (§14.8) |
| 18 | Ranting diam → MWC Kunci Periode | 27–9 tarik FINAL saja; 10+ muncul `FINAL_NOL` + audit + notif (§14.7) |
| 19 | Approve draft dobel | Tombol mati setelah 1 approve, tidak duplikat (§14.12) |
| 20 | Staf tekan FINAL/Kunci | 403 + `activity_logs` (§14.13) |
| 21 | Unduh PDF setelah reopen + FINAL ulang | V1 utuh hash sama, V2 beda terverifikasi (§14.8–14.9) |
| 22 | Beban generate penuh + notif massal | Tanpa timeout; WA gagal → DLQ, tidak gagalkan generate (§14.10/14.15) |

---

## 13. Yang belum dikunci (sisa sebelum koding)

1. ~~Rumus share~~ ✅ DIKUNCI 19 Sep: `share = 30% × (total − bisyaroh)`, toleransi selisih Rp 10rb, selebihnya wajib alasan (§8).
2. ~~Pembulatan bisyaroh~~ ✅ DIKUNCI 19 Sep, DIREVISI 20 Sep (B-3): 10% bulat atas ke ribuan (867.500 → 87.000).
3. ✅ DIKUNCI 19 Sep — REOPEN opsi B (state machine tunggal lihat §14.8): FINAL boleh dibuka kembali oleh Admin Ranting (untuk ppk_submissions rantingnya) dan ADMIN_KECAMATAN (untuk apa saja), wajib isi alasan + tercatat di `activity_logs` (siapa, kapan, submission apa, status lama→baru, alasan). Reopen mengembalikan status ke DRAFT dan membuka kunci collection/assignment periode itu; FINAL ulang menerbitkan PDF baru (PDF lama disimpan sebagai versi). Maksimal reopen tidak dibatasi di v1, tapi tiap reopen menambah versi.
4. ✅ DIKUNCI 19 Sep — CO-SIGN di HP bendahara: draft teks readable → PPK sign → bendahara sign (beda userId, Fraser ditolak bila sama) → tampil BA bertanda tangan (teks) → PDF lazy saat Unduh (§7, §10). Angka tidak pas = urusan mereka di tempat, tombol TTD nonaktif sampai pas. Tidak ada QR-pembuka/OTP (dibatalkan — berlebihan, PPK pasti hadir hitung bersama).
5. ✅ DIKUNCI ARAH 19 Sep — "70 tidak aktif" adalah campuran lapangan (tidak dijemput/kosong/non-aktif). Sistem yang merapikan via `can_condition`: AKTIF vs sisanya. Laporan ranting menampilkan rincian (bukan satu angka campur) — lihat §8c.
6. ✅ DIKUNCI 19 Sep — Taqwa dikelola **petugas khusus MWC** (opsi B): officer dengan `branch_id` = cabang Taqwa (PROGRAM_MWC) atau scope district; generate + monitoring oleh Staf Pengumpulan level kecamatan, bukan ranting.

---

## 14. Keputusan wajib sebelum koding — DIKUNCI 20 Sep 2026 (C-1/C-2 antrean offline vs kunci)

Keputusan pemilik produk atas 5 poin prioritas C-1/C-2 (menutup celah "jemputan sah hilang setelah kunci"):

1. **Patokan periode = assignment (YA).** Validasi submit memakai `assignments.(periodYear, periodMonth)`, bukan waktu kirim. `collected_at` 20 Sep–9 Okt dengan `assignment_id` Sept = pemasukan Sept.
2. **Telat lewat kunci = DITOLAK, dianggap Okt dipercepat.** Sync/submit Sept yang tiba setelah Kunci Sistem (10 Okt 00:00 WIB) ditolak untuk Sept, diarahkan ke assignment Okt (yang sudah di-generate otomatis 10 Okt 00:00, §6). Sept tercatat UNCOLLECTED/0, Okt bertambah. Trigger = Kunci Sistem otomatis, BUKAN tombol Kunci Ranting. Tombol Kunci Ranting tetap definisi awal: segel laporan final ranting → teruskan ke MWC, hanya aktif bila semua PPK sudah FINAL/UNCOLLECTED.
3. **Jam HP divalidasi (OKE).** `collected_at` harus ∈ `[assign_date 00:00 WIB, tolerance_end 23:59 WIB]` + toleransi clock-skew ±10 mnt. Di luar → tolak `VALIDATION_ERROR` / flag `anomaly_flags` + audit. `serverTimestamp` = bukti sah kapan sampai server; `collected_at` = klaim petugas.
4. **`QR_PERIOD_CLOSED` = sama seperti No.2.** Scan Sept setelah kunci → `409 QR_PERIOD_CLOSED` ("Sept sudah dikunci, pakai tugas Okt"), tidak retry ngotot, tidak hilang diam-diam, tidak spam (perlakuan khusus di `offline/sync.ts:54-60`).
5. **HP hilang 3 lapis (DISETUJUI).** a) Perkecil hilang via sistem (sync harian + auto-sync + pengingat H-3 s/d tgl 9); b) Lembar catatan kertas cadangan → admin salin entri manual per-kaleng + alasan `KOREKSI_ADMIN`; c) Kalau kertas ikut hilang → entri darurat agregat 1 angka total dari uang fisik + saksi bendahara + alasan `HP_HILANG` (masuk total, tidak masuk rincian kaleng). Semua tercatat di `activity_logs`.

6. **CO-SIGN 2 HP (DIKUNCI 20 Sep 2026, C-3 — merevisi §13.4).** PPK tanda tangan di HP PPK (sesi PPK) + bendahara di HP bendahara (sesi bendahara), ketemu di server → `DRAFT → PPK_SIGNED → FINAL`. `signer_id` = pemilik sesi login masing-masing, beda userId ditegakkan di server + constraint DB, bukan pilihan dari daftar. §7 alur "co-sign di HP bendahara" tidak dipakai lagi; §10 PDF lazy tetap.

7. **KUNCI BERLAPIS C-4 (DIKUNCI 20 Sep 2026, REVISI 2 TAHAP).** Pelaporan sejatinya s/d 30/31, 1–10 bulan berikut = toleransi keterlambatan, lewat 10 pukul 00.00 tidak ada toleransi. Admin Ranting tetap wajib punya tombol Kunci Ranting (segel FINAL rantingnya → teruskan ke MWC, syarat semua PPK FINAL/UNCOLLECTED). Tombol Kunci Periode MWC aktif sejak 27 pukul 00.00 dengan 2 tahap: (a) 27–9 hanya mengunci/menarik yang sudah FINAL (tidak men-nolkan); (b) sejak 10 pukul 00.00 (kunci keras otomatis) baru boleh men-nolkan sisa yang diam: sistem buatkan `FINAL_NOL` (0 pemasukan / tidak ada laporan penjemputan) untuk tiap `branch_id kind=RANTING` yang belum ada `branch_submissions` periode itu, dengan `locked_by=MWC` + `activity_logs` + notifikasi ke ranting. `FINAL_NOL` tidak dihitung "sudah lapor" (flag merah di dashboard MWC), tetap bisa reopen + koreksi susulan.

8. **REOPEN MENULAR C-5 (DIKUNCI 20 Sep 2026).** Reopen 1 PPK otomatis menurunkan `branch_submissions` pasangannya ke DRAFT + menghanguskan TTD tingkat 2. Pembukaan kunci hanya untuk officer itu + periode itu + jendela waktu (mis. 2x24 jam). Alur harian tetap tanpa PDF (teks readable di DB); PDF hanya dibuat saat tombol Unduh ditekan (lazy). Tetapi tiap FINAL ulang naik `version` + simpan `pdf_url + pdf_hash` per versi agar PDF yang sudah terlanjur diunduh orang tetap bisa diverifikasi (hash cocok = asli versi itu). Status: `OPEN → TOLERANSI → LOCKED → DIBUKA_SEBAGIAN → LOCKED`.

9. **BERKAS C-6 (DIKUNCI 20 Sep 2026, privat rasa publik).** R2 privat (tanpa akses publik, `Cache-Control: private`, nama key acak tak bisa ditebak), unduh via endpoint app → cek login + peran → `getSignedDownloadUrl` + audit tiap unduhan; rasa publik = tombol Unduh selalu bisa dipencet, kunci dibuatkan otomatis. QR di PDF = verifikasi minimal (`id + version + hash` → halaman "SAH / TIDAK", tanpa bocor nominal/pihak). Coretan TTD = persetujuan eksplisit + retensi + bisa hapus via `deleteFromR2` (UU 27/2022). Tambah kolom `pdf_hash` per versi.

10. **IDEMPOTENSI C-7 (DIKUNCI 20 Sep 2026).** FINAL idempoten: unique `(branch_id/officer_id, period_year, period_month)` + `version` optimistic lock + 1 transaksi DB. PDF via job/outbox + retry + DLQ (pola `workers/whatsapp.worker.ts`); FINAL tidak bergantung upload R2. Manfaatkan `offlineId` unik + `collection_assignment_can_sequence_unq`.

11. **ZONA WAKTU C-8 (DIKUNCI 20 Sep 2026).** `services/periodCalendar.ts` wajib pakai ulang `utils/operationalTimeZone.ts` (OPERATIONAL_TIMEZONE), bukan hitung WIB sendiri. Prasyarat: `TZ=Asia/Jakarta` + assertion boot (atau migrasi `timestamptz`). Uji batas 09 Okt 23:59 vs 10 Okt 00:00 + HP TZ ≠ WIB.

12. **GENERATE APPROVE C-9 (DIKUNCI 20 Sep 2026, REVISI: robot siapkan → manusia setujui).** Tidak ada dua tukang pencet. Pengaturan robot hanya sekali di awal sampai diedit ulang bila butuh penyesuaian (aturan mainnya). Tiap siklus robot siapkan draft siap-jalan tepat jadwal (tgl 10 & 20) sesuai pengaturan itu + kirim notifikasi approve ke aplikasi Staf Pengumpulan. Draft siap-jalan ini yang boleh diedit staf sebelum setuju (bukan pengaturannya). Staf setuju → draft jadi tugas aktif + push ke PPK + tombol approve mati (tidak bisa dobel). Jika Staf diam 24 jam → approve diteruskan ke Bendahara/Sekretaris (Staf Bid. Administrasi dan Keuangan). Sekali salah satu setuju, selesai. Tidak dimajukan: bila approve telat, tugas telat lahir sebagai konsekuensi kedisiplinan.

13. **PETA ORG C-10 (DIKUNCI 20 Sep 2026).** Manager Subarea (ketua ranting, 1) = `ADMIN_RANTING` (kunci FINAL ranting, BA, reopen rantingnya). Manager Area (ketua MWC, 1) = `ADMIN_KECAMATAN` (tarik FINAL, kunci periode, reopen apa saja). Staf Bid. Pengumpulan 1 per ranting (scope `branchId`) + 1 di MWC (scope `districtId`, urus program MWC/Taqwa): boleh siapkan/edit/setujui draft, pantau, tidak boleh FINAL/kunci/ubah nominal. Staf Bid. Adm & Keuangan 2 per ranting/MWC (sekretaris + bendahara, 1 kartu `STAF_KEUANGAN`, scope masing-masing): boleh approve eskalasi 24 jam, tanda tangan kedua saling menggantikan (tercatat siapa), unduh PDF, tidak boleh ubah nominal. Semua laporan ganti patokan surat tugas (§14.1).

14. **ROLLOUT C-11 (DIKUNCI 20 Sep 2026).** Berlaku 10 Okt (kunci keras pertama); Sept jalan aturan lama s/d 9 Okt. Data Juli/Agu dibiarkan tanpa BA (historis pra-sistem). 20 Sep–9 Okt dual-run (laporan lama tetap dibuka, baru dibentuk). Go/no-go: tidak ada uang hilang + MWC bisa tarik FINAL. Ada saklar balik + operator migrasi ditunjuk.

15. **NOTIFIKASI C-12 (DIKUNCI 20 Sep 2026).** Push ke app (akun login, `fcmToken`) dulu, gagal/tak dibaca → fallback WA otomatis (antrean + retry + DLQ, tidak menggagalkan tugas). Wajib 7: (1) tugas digenerate → PPK+Staf; (2) minta approve draft → Staf, eskalasi 24 jam → bendahara/sekretaris; (3) pengingat H-3 + mendekati kunci; (4) FINAL → tingkat atas; (5) reopen + alasan → terdampak; (6) selisih >10rb → Admin+MWC; (7) BA siap unduh. Template + penerima rinci saat koding.

16. **DAMPAK DOKUMEN (D-1…D-5).** B1 → DIREVISI oleh C1 §5 + §14.1–14.4 (jangan Opsi A saja; trigger 1 Okt di B1 §8 tidak berlaku, irama 20/27/10). Checklist staging (`checklist-uji-mobile-staging-2026-09-18.md:11,27,54,74`) + API doc (`API_DOCUMENTATION.md:199,229` + kode baru) + kontrak metrik (`dasar-perbaikan-metrik-tugas-mobile-2026-09-13.md` §4.3/§7 basis assignment) + `errorCatalog.ts` + `ScanScreen.tsx:33-40` wajib ikut direvisi saat koding. `canService.ts` + `overviewService.ts` masuk peta §11.

---

## 15. Tiket kerja (urutan tergantung — jangan loncat)

Patokan UI: 1 APK mobile + 1 web, tampil beda per kartu (PPK / Staf Pengumpulan / Staf Keuangan / Manager). Penjaga di server, bukan cuma sembunyikan tombol.

| ID | Nama | Acuan §14 | Selesai bila |
|---|---|---|---|
| T0 | Migrasi DB + peran | §14.10/13, B-4 | `branches.kind`, enum `STAF_PENGUMPULAN`/`STAF_KEUANGAN`, `ppk/branch_submissions` (5 kolom kaleng + `pdf_hash` + variance), `period_calendar`, unique index, backfill Taqwa, rounding `ceil_1000` |
| T1 | Kalender periode + WIB | §14.11, B-1/B-2 | `periodCalendar.ts` pakai `operationalTimeZone`, status `OPEN→TOLERANSI→LOCKED→DIBUKA_SEBAGIAN→LOCKED`, uji 09 23:59 vs 10 00:00 lulus |
| T2 | Scan + submit kunci | §14.1–14.4 | lookup toleran, `QR_WRONG_PERIOD`/`QR_PERIOD_CLOSED`, validasi `collected_at` + `serverTimestamp`, `sync.ts` tidak spam/hilang, tolak Sept→Okt |
| T3 | Generate approve | §14.12–14.13 | robot draft tepat tgl 10 & 20, edit draft, approve Staf → eskalasi 24 jam, tombol mati sekali, audit |
| T4 | Submission PPK | §14.5/10 | hitung ceil otomatis, FINAL, tolak resubmit/skip setelah FINAL, version |
| T5 | Co-sign 2 HP + BA lazy + berkas | §14.6/8/9 | `DRAFT→PPK_SIGNED→FINAL`, constraint beda userId, PDF lazy + hash + QR minimal, R2 privat-rasa-publik + consent TTD |
| T6 | Kunci berlapis | §14.7 | Kunci Ranting + Kunci Periode 2 tahap (27–9 tarik FINAL, 10+ `FINAL_NOL` + audit + notif, flag merah bukan lapor) |
| T7 | Reopen menular | §14.8 | 1 PPK → ranting DRAFT + TTD-2 hangus, buka khusus officer+periode + jendela waktu, arsip versi |
| T8 | Laporan MWC + selisih | §14.5/13 | hanya FINAL, filter `RANTING` vs Program (2 kartu), selisih >10rb wajib alasan, dukung `KOREKSI_ADMIN`/`HP_HILANG`/agregat |
| T9 | Mobile 1 APK peran | §14.6/13/15 | PPK (tugas/scan/setor/TTD) + Staf (setuju/monitor) + Keuangan (BA/TTD/unduh) + Manager (baca), chip toleransi, countdown, auto-sync + pengingat, push |
| T10 | Web peran | §14.7/13 | Staf (monitor), Ranting (kunci), MWC (tarik), unduh BA, audit log |
| T11 | Notifikasi 7 + WA fallback | §14.15 | push→WA, template, retry + DLQ, tidak gagalkan tugas |
| T12 | Rollout + docs + bersih-bersih | §14.14/16, §12 | dual-run s/d 9 Okt, saklar balik, B1/checklist/API/metrik direvisi, 22 uji lulus, `collectedAt` legacy → assignment |

Urutan: T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12.

---

*Keputusan user 19 Sep 2026: tanggal tetap; Staf Pengumpulan per ranting; jadwal = tugas digital pengganti pengumuman WA; setuju early-generate Okt; approve 2 tingkat co-sign di HP bendahara + PDF lazy (§7, §10); rumus share 30% × sisa + toleransi 10rb; Taqwa = PROGRAM_MWC petugas khusus MWC (§8b); reopen opsi B oleh Admin/MWC + TTD hangus; ubah data = PPK betulkan per kaleng, admin hanya buka gembok; angka tidak pas diselesaikan sendiri di tempat.*
