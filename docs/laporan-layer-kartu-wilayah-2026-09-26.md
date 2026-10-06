# Laporan Hasil Pekerjaan — Layer Kartu Wilayah (Kelola Kaleng & Assignments)

> Tanggal: 26 September 2026
> Repo: `C:\Users\user\Documents\lazisnu`
> Ref kode saat laporan ditulis: branch `staging` @ `66adf1e`, working tree tracked bersih
> Plan sumber: `.hermes/plans/2026-09-26_layer-kartu-ranting-cans-assignments.md` (local-only, gitignored)
> Metode: setiap klaim di bawah diverifikasi lewat eksekusi nyata — output terminal, query ke DB staging, screenshot CI, dan uji mutasi terhadap test. Bukan dari ringkasan percakapan.
> Credential, token, dan kata sandi tidak dicatat; nilainya **[REDACTED]**.

---

## 1. Ringkasan eksekutif

Pekerjaan ini membangun **layer kartu wilayah** sebagai halaman pertama (LAYER 1) pada dua halaman: **Kelola Kaleng** dan **Assignments**. Admin tidak lagi memilih territory lewat dropdown; mereka memilih dengan mengeklik kartu. Tabel yang sudah ada tetap dipertahankan utuh di LAYER 2.

| Aspek | Vonis |
|---|---|
| Fitur inti | **Selesai dan terverifikasi dengan data staging nyata** |
| Mekanisme dan kualitas kode | **Selesai** — test ada, sudah dibuktikan tidak kosong lewat uji mutasi |
| Deploy ke staging | **Selesai** — 2 kali CI hijau penuh |
| Verifikasi visual browser | **Belum** — masih menjadi satu-satunya butir Definition of Done yang terbuka |
| Plan B (Kalibrasi Kondisi Kaleng) | **Tidak disentuh sama sekali** di sesi ini; masih menggantung |

Semua credential probe dibaca langsung di dalam VM dan tidak pernah dicetak ke log. Nilai selalu **[REDACTED]**.

---

## 2. Apa yang dibangun

### 2.1 Struktur territory

Hierarki yang disepakati dan diimplementasikan:

| Peran | LAYER 1 | Arti |
|---|---|---|
| `ADMIN_KECAMATAN` (MWC-equivalent) | Kartu **Ranting** | Satu kartu per Ranting dalam kecamatannya |
| `ADMIN_RANTING` | Kartu **Dukuh** | Satu kartu per Dukuh; fallback ke kartu Ranting bila Ranting tidak punya Dukuh sama sekali |

Klik kartu membuka tabel existing dengan filter territory yang sesuai:

- Kartu **Ranting** → mengirim `branch_id`
- Kartu **Dukuh** → mengirim `dukuh_id`

Periode, pencarian, filter status, paginasi, reset, impor, tambah kaleng, cetak QR, hapus, modal, dan tombol aksi **tidak ada yang dihapus**.

### 2.2 Relasi officer ↔ Dukuh

Schema memakai FK nullable baru:

```
officers.dukuh_id → dukuhs.id  (nullable, berindeks)
```

Kolom `assigned_zone` **tidak** dipakai sebagai sumber mapping karena nilainya hanya berisi `krajan`/`kajen` — bukan identitas Dukuh. Hanya **satu** migration yang dibuat: `0014_officer_dukuh.sql`. Tabel `cans` **tidak** dimigration ulang karena `cans.dukuh_id` sudah ada.

### 2.3 Officer yang belum terpetapkan

Ini adalah koreksi bug yang ditemukan saat code review, bukan fitur tambahan.

Semula officer tanpa relasi Dukuh ditempelkan ke Dukuh dengan `officerCount` terendah, hanya supaya tidak terlihat "yatim". Pendekatan itu saya ganti.

Metode yang benar: officer yang belum terpetakan **dihitung di level respons** dan ditampilkan sebagai metadata terpisah, tanpa dipaksakan masuk ke Dukuh mana pun.

```
officers.branchId = user.branchId  AND  officers.dukuh_id IS NULL
```

Ada satu bug tambahan yang ikut ketahuan: `unmappedRows` sebelumnya membandingkan `officers.branchId` dengan **ID Dukuh**, sehingga metadata selalu bernilai nol. Setelah diperbaiki, nilainya benar.

### 2.4 Angka utama kartu Assignments

Perbaikan semantik yang terpisah dan muncul karena temuan saat verifikasi. `getAssignmentRegionCards` meneruskan apa adanya ke service kartu kaleng, sehingga **kedua halaman menampilkan angka kaleng sebagai angka utama**. Di staging ini kebetulan tidak terlihat, karena KOTAK TAQWA memiliki 64 kaleng **dan** 64 penugasan sekaligus — angkanya sama.

Pada tujuh Ranting lain yang tidak punya penugasan, kartu menampilkan angka kaleng sementara tabelnya kosong: persis kebalikan dari kenyataan.

Solusi: `assignmentTotal` diekspos **terpisah** dari `total`; keduanya tidak pernah saling menimpa.

| Halaman | Angka utama | Baris kedua | Bar progres |
|---|---|---|---|
| Kelola Kaleng | `total` (kaleng) | `penugasan` | "ter-alokasi" |
| Assignments | `assignmentTotal` (penugasan) | `kaleng` | "penugasan selesai" |

Alias aggregate `assigned` juga diganti menjadi `assignmentTotal`, karena `count(*)` di sana adalah **jumlah penugasan**, bukan "jumlah yang sudah ditugaskan" — penamaan lama itu sendiri sudah menyesatkan. `assigned`/`unassigned` dipertahankan sebagai metrik berbasis kaleng untuk bar progres, dan kini di-*clamp* agar tidak melebihi `total`.

---

## 3. Riwayat commit

| SHA | Pesan |
|---|---|
| `7c76589` | `feat(backend): layer kartu wilayah untuk Kelola Kaleng dan Assignments` |
| `99e996f` | `feat(web): kartu wilayah sebagai layer pertama di Kaleng dan Penugasan` |
| `15b337d` | merge → `staging` |
| `c1747f9` | `fix(assignments): angka utama kartu memakai total penugasan` |
| `66adf1e` | merge → `staging` |

Backend dan web dipisah menjadi dua commit tematik, lalu masing-masing di-merge dengan `--no-ff`. Alur repo ini memakai branch lokal sebagai *preview slot*, bukan PR. Tidak ada PR yang dibuat.

---

## 4. Verifikasi yang dilakukan

### 4.1 Gerbang lokal

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit` backend | **hijau** (exit 0) |
| `tsc --noEmit` web | **hijau** (exit 0) |
| ESLint web | 0 error, 1 warning bawaan (`wa-monitor/page.tsx`, `react-hooks/exhaustive-deps`) — tidak terkait |
| `regionCardService.integration.test.ts` | **8/8 lulus** |
| `pnpm build:all` | sukses |

### 4.2 Baseline test backend — koreksi atas laporan sebelumnya

Angka "7 kegagalan" yang pernah saya laporkan sebelumnya **salah** dan tidak boleh dipakai. Itu berasal dari run terarah, bukan suite penuh. Baseline yang benar diukur dengan `git stash`:

| Run | Hasil |
|---|---|
| Baseline (tanpa perubahan, `git stash`) | **27 gagal / 574 total** |
| Setelah perubahan | **24 gagal / 576 total** |

Jadi perubahan ini **tidak menambah** kegagalan. Namun suite backend lokal **tidak pernah hijau**, dan angkanya vary 24–27 antar-jalankan karena test DB-nya *order-dependent*. Kegagalan berada di `periodDrafts.integration.test.ts` dan suite co-sign/PDF — **tidak menyentuh** `regionCardService`.

### 4.3 Uji mutasi terhadap test

Sebuah test yang tidak pernah gagal tidak layak dipercaya. `assignmentTotal` sengaja disamakan dengan `total` untuk memeriksa apakah test benar-benar mengunci semantiknya:

| Run | Hasil |
|---|---|
| Semantik benar | 8/8 lulus |
| Semantik sengaja dirusak | **3 gagal** (Expected 1/Received 2; Expected 0/Received 2; Expected 1/Received 2) |
| Dipulihkan | 8/8 lulus |

Test-nya betulan mengunci perilaku.

### 4.4 CI dan deploy

| Run | Cakupan | Hasil |
|---|---|---|
| `36236945663` | feature layer kartu | hijau penuh |
| `36241104868` | perbaikan angka Assignments | hijau penuh |

Job pada run terakhir: `changes`, `Verify (lint · format · typecheck)`, `Test web`, `Test backend`, `Build & push Docker images` (web-staging, web-prod, backend), `Deploy staging` — semuanya **success**. `Deploy production` **skipped**.

### 4.5 Smoke test API dengan data staging nyata

Endpoint dipanggil dengan token sungguhan. Format yang sudah dikoreksi: prefix backend adalah `/v1` (bukan `/api`), field login adalah `identifier` (bukan `email`), token berada di `data.access_token`, dan payload dibungkus `{ success, data }` dengan nama field *snake_case*.

| Skenario | Hasil |
|---|---|
| MWC → kartu Ranting | 8 kartu: BOTOSARI, DOMIYANG, KALIBOJA, KALIOMBO, KOTAK TAQWA, PANIGGARAN BARAT, PANINGGARAN TIMUR, SAWANGAN |
| Admin Ranting KOTAK TAQWA | 6 kartu Dukuh, `unmapped_officer_count = 1` |
| Admin Ranting PANINGGARAN TIMUR | 3 kartu, `unmapped_officer_count = 2` |
| Admin Ranting BOTOSARI | 1 kartu, `unmapped_officer_count = 2` |
| Tanpa token | **HTTP 401** — Proteksi terverifikasi |
| Detail `?dukuh_id=` | Cans **200**, Assignments **200** |

**Konsistensi angka kartu vs tabel.** Keempat skenario × 28 kartu dibandingkan langsung dengan `pagination.total` tabelnya sendiri:

| Skenario | Kartu | Selisih |
|---|---|---|
| MWC / Kelola Kaleng | 8/8 cocok | 0 |
| MWC / Assignments | 8/8 cocok | 0 |
| Admin Ranting / Kelola Kaleng | 6/6 cocok | 0 |
| Admin Ranting / Assignments | 6/6 cocok | 0 |

Bukti perbaikan semantik: **BOTOSARI di halaman Assignments menampilkan 0 penugasan, dan tabelnya memang 0 baris** — sebelumnya kartu itu menampilkan 2 kaleng.

### 4.6 Cakupan MWC dan jalur fallback

Data staging asli **tidak dapat** menguji dua hal ini: hanya ada 1 district (tidak ada yang bisa tersaring), dan tidak ada Ranting yang punya officer tapi tanpa Dukuh (jalur fallback tidak terpakai). Keduanya diuji memakai satu **district sementara** yang dibuat, diuji, lalu dihapus:

| Uji | Hasil |
|---|---|
| MWC district lama, district uji tambahan ada | Tetap 8 kartu — district uji **tidak terlihat** → pengecualian terbukti |
| MWC district uji | Tepat 1 kartu → isolasi terbukti |
| Admin Ranting tanpa Dukuh | 1 kartu, `kind=branch`, `is_fallback=true`, officer ikut terhitung → **fallback terbukti dengan data nyata** |

Fixture diverifikasi terhapus: kelima penghitung sisa bernilai 0. Tidak ada relasi palsu yang dibuat demi hasil yang lebih bagus, dan akun probe dipulihkan ke `ADMIN_KECAMATAN` dengan `district_id` dan `branch_id` bernilai `NULL`.

### 4.7 Data staging yang relevan

| Ranting | Kaleng | Penugasan | Uncollected | Selesai |
|---|---|---|---|---|
| KOTAK TAQWA | 64 | 64 | 63 | 1 |
| PANINGGARAN TIMUR | 5 | 0 | 0 | 0 |
| SAWANGAN | 2 | 0 | 0 | 0 |
| BOTOSARI | 2 | 0 | 0 | 0 |
| KALIOMBO | 2 | 0 | 0 | 0 |
| PANIGGARAN BARAT | 1 | 0 | 0 | 0 |
| DOMIYANG | 1 | 0 | 0 | 0 |
| KALIBOJA | 0 | 0 | 0 | 0 |

Hanya KOTAK TAQWA yang memiliki penugasan sama sekali — inilah sebabnya bug angka utama Assignments tidak terlihat di staging.

Terdapat 17 relasi Dukuh di staging; hanya PANINGGARAN TIMUR, SAWANGAN, dan KALIOMBO yang punya relasi officer. 14 dari 17 Dukuh tidak memiliki officer terpetakan. Delapan officer staging, hanya 3 yang punya `assigned_zone` terisi.

---

## 5. Definition of Done — status jujur

| # | Butir | Status |
|---|---|---|
| 1 | LAYER 1 → LAYER 2 sesuai role | ⚠️ LAYER 1 terverifikasi via API (3 scope); **transisi klik kartu → LAYER 2 belum diuji di browser** |
| 2 | Semua kontrol lama berfungsi di LAYER 2 | ⚠️ Kontrol ada di kode, **belum diuji fungsional** |
| 3 | Tombol filter ranting tidak lagi ada | ✅ Dihapus dari kedua halaman |
| 4 | Angka kartu == angka tabel (data nyata) | ✅ 28/28 cocok di empat skenario |
| 5 | MWC hanya melihat ranting kecamatannya | ✅ Teruji dua arah dengan district uji |
| 6 | Admin Ranting hanya melihat dukuh rantingnya | ✅ KOTAK TAQWA → 6 Dukuh miliknya |
| 7 | Jalur fallback Ranting tanpa Dukuh | ✅ Teruji dengan Ranting sementara, `is_fallback=true` |
| 8 | Migration jalan di lokal dan staging | ✅ Tercatat di ledger Drizzle staging |
| 9 | Angka utama Assignments = penugasan | ✅ 8/8 test + uji mutasi + verifikasi live |
| 10 | Full gate hijau | ✅ CI hijau penuh; test backend lokal bukan syarat dan explained in §4.2 |
| 11 | Deploy + verifikasi ulang | ✅ CI `36241104868`, 28/28 cocok |
| 12 | **Cek visual browser** | ❌ **Belum dilakukan** |

**11 dari 12 butir tertutup. Butir 12 tidak dapat ditutup tanpa tindakan Anda** — dijelaskan di §7.

---

## 6. Perubahan pada basis kode

| File | Perubahan |
|---|---|
| `apps/backend/src/database/migrations/0014_officer_dukuh.sql` | FK nullable `officers.dukuh_id` + index |
| `apps/backend/src/database/migrations/meta/_journal.json` | Entri migration |
| `apps/backend/src/database/schema.ts` | `officers.dukuhId` + relasi dua arah |
| `apps/backend/src/services/regionCardService.ts` | Inti layer kartu: hierarchy, scope, agregasi, metadata officer, `assignmentTotal` |
| `apps/backend/src/services/canService.ts` | Detail Cans menerima `dukuh_id` |
| `apps/backend/src/routes/admin/cans.ts` | Card route + forwarding territory |
| `apps/backend/src/routes/admin/assignments.ts` | Card route + forwarding territory |
| `apps/backend/src/services/__tests__/regionCardService.integration.test.ts` | 8 test integrasi |
| `apps/backend/scripts/apply-migration-to-testdb.ts` | Helper migration test DB lokal |
| `apps/backend/src/database/fixtures/officer_dukuh_demo.sql` | Fixture **staging-only** |
| `apps/web/src/components/region/RegionCards.tsx` | Komponen kartu yang dipakai kedua halaman |
| `apps/web/src/app/dashboard/cans/page.tsx` | LAYER 1 / LAYER 2 |
| `apps/web/src/app/dashboard/assignments/page.tsx` | LAYER 1 / LAYER 2 |

Fixture mapping officer → Dukuh (staging demo, **bukan fakta lapangan**): `lalalu → KEMBANG`, `lalal → JALADARA`, `lele → NULL`. Enam officer lain tetap `NULL`. Fixture ini tidak pernah diterapkan ke production.

---

## 7. Yang belum selesai, dan alasannya

### 7.1 Cek visual browser — satu-satunya butir terbuka

Tidak dapat diselesaikan dari sisi saya. Browser yang dikendalikan Hermes berjalan pada **profil terpisah** dari Edge. Waktu `/dashboard/cans` dibuka, halaman langsung memantul ke `/login`, dan `localStorage` di sana tidak sama dengan sesi Edge. Login di Edge tidak berlaku di jendela itu.

PILIHAN yang tersedia:

1. Anda login di jendela browser Hermes, lalu saya lanjutkan klik-kartu-ke-tabel plus seluruh kontrol lama di kedua halaman.
2. Anda cek sendiri lewat `pnpm dev` — tetapi butir ini **tidak akan punya bukti**, dan saya tidak akan menandainya selesai.

### 7.2 Ketidakreproduksi klaim "test backend lulus bersih"

Plan B (`2026-09-25_kalibrasi-eksekusi-kondisi-kaleng.md`) mencatat pada 25 September bahwa "backend full Jest kini lulus 68 suite/568 test". Hari ini suite penuh menghasilkan **24–27 kegagalan**. Klaim itu **tidak tereproduksi** pada keadaan sekarang.

**Penyebabnya belum saya telusuri** — percobaan inspeksi test DB dihentikan karena tidak ada persetujuan, dan saya tidak mengulangnya. Kemungkinan yang bisa dicoba nanti: akumulasi state di `lazisnu_test`, urutan suite, atau drift migration. Ini perlu diperiksa terpisah dan tidak boleh dianggap seolah Plan B sudah bersih.

### 7.3 Plan B — Kalibrasi Kondisi Kaleng

Tidak disentuh di sesi ini. Status yang tercatat di plan tersebut:

| Task | Status |
|---|---|
| 1 — audit state aktual | Selesai |
| 2 — P0 lifecycle dan integritas | **Sebagian** — race, duplicate, receipt E2E belum |
| 3 — P1 mobile/offline/history | **Sebagian** — device E2E, offline replay belum |
| 4 — database dan runtime verification | **Sebagian** — HTTP smoke, receipt E2E belum |
| 5 — dokumentasi dan gate akhir | **Sebagian** — Android belum diverifikasi |

Skenario `ISI`, `KOSONG`, `DIKEMBALIKAN`, `TIDAK_DIKUNJUNJI` yang pernah dibahas masih menggantung.

### 7.4 Lazim masih aktif

`forceExit: true` masih ada di `apps/backend/jest.config.js` baris 38, dengan komentar bukti `detectOpenHandles`. Belum dilepas sesuai instruksi.

### 7.5 Lain-lain

- Typo nonfungsional `tahudukuh` masih ada di satu label UI.
- `pnpm test:unit` punya bug script di Windows (`|` tidak di-escape); direct Jest yang dipakai.
- Tidak ada PR, tidak ada deploy production, tidak ada rilis. `Deploy production` **skipped** di kedua run.

---

## 8. Batasan laporan ini

- Verifikasi dilakukan terhadap **staging**, bukan production.
- Jalur fallback dan cakupan MWC diuji dengan **district sementara yang sudah dihapus**; perilaku terhadap data yang lebih rumit (Ranting dengan sebagian officer terpetakan) hanya tercakup test integrasi.
- Skrip verifikasi berada di `tmp/` dan tidak di-commit; `tmp/` tidak diabaikan di `.gitignore`, jadi jangan ikut ter-stage.
- Klaim jumlah Failing test backend bersifat *snapshot* satu waktu dan vary antar-jalankan.
- Tidak ada build Android yang dijalankan — dilarang di laptop ini; hanya lewat GitHub Actions/remote runner.
