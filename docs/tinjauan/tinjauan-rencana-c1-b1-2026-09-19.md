# Tinjauan Ulang: Rencana C1 (Siklus Periode + Approve + Berita Acara) & Plan B1 (Filter Periode Scan)

> Tanggal tinjauan: 19 Sep 2026
> Dokumen yang ditinjau:
> - `.hermes/plans/2026-09-19_c1-siklus-periode-approve-berita-acara.md` (26.459 byte)
> - `.hermes/plans/2026-09-18_b1-filter-periode-scan.md` (11.194 byte)
> Metode: setiap klaim faktual (nomor baris, nama file/kolom, enum, perilaku) dibaca langsung di tree kerja, bukan dari ringkasan.
> Ref kode saat tinjauan: branch `docs/checklist-uji-mobile-staging-2026-09-18` @ `2882a39` (parent = main `c4fa93d` + commit docs CI/checklist).
> **Penting:** fix B2 (`ensure-assignment`, `visit-required`) berada di `staging` dan **tidak ada** di tree ini, sehingga nomor baris dokumen B1 §3 yang mengacu `staging` @ `6ad127a` tidak selalu cocok di sini.

---

## 1. Ringkasan vonis

| Aspek | Vonis |
|---|---|
| Kelayakan konsep (siklus 20/27/9/10, approve 2 tingkat, BA digital) | **Kuat** — sejalan fakta lapangan; rumus share & contoh Jawa sudah dicek ulang dan cocok |
| Akurasi referensi kode | **Baik (~95%)** — 4 klaim geser 1–3 baris, 1 salah atribusi file, sisanya presisi |
| Konsistensi internal dokumen | **Perlu perbaikan** — 7 kontradiksi/ketidaklengkapan (Bagian B) |
| Kelengkapan sebelum koding | **Belum cukup** — 12 celah, 6 di antaranya *blocking* (Bagian C) |
| Dampak ke dokumen lain | **Belum tercatat** — 5 dokumen harus ikut disunting (Bagian D) |

Tiga risiko terbesar yang belum terjawab di dokumen:

1. **Antrean offline vs kunci periode** — jemputan sah yang tersinkron setelah tanggal 10 berpotensi hilang diam-diam (C-1).
2. **`collected_at` berasal dari jam HP dan tidak divalidasi periode** — backdating/forward-dating lolos (C-2).
3. **Tanda tangan 2 orang di 1 HP** — audit trail `signer_id` bisa jadi fiksi tanpa autentikasi per tanda tangan (C-3).

---

## 2. Ruang lingkup & cara verifikasi

Yang diverifikasi:

- Keberadaan & perilaku jalur kode yang disebut dokumen (scan, submit, skip, dashboard, scheduler, laporan bendahara).
- Nomor baris setiap sitasi (`file:line`) pada tree kerja.
- Kolom/enum/constraint yang diklaim belum ada (mis. `branches.kind`) atau akan ditambah.
- Aritmetika rumus rekap (§8) dan contoh angka laporan (Madendo, Pan. Barat, Taqwa).
- Komponen yang akan dipakai ulang untuk BA (`qrPdfService`, `r2`, `activity_logs`, jalur WA/notifikasi).
- Ketersediaan util zona waktu yang sudah ada, agar C1 tidak membuat jalur baru yang bertabrakan.

Perintah utama: pembacaan langsung berkas via `read_files`, pencarian pola via `Select-String` (`router.get`, `collectedAt`, `periodYear`, `pdf`, `fonnte|whatsapp|fcmToken`), dan pengecekan `git log`/`git status`.

---

## A. Klaim dokumen yang saya verifikasi — AKURAT

### A.1 C1 §2.2 — kode yang masih memakai bulan kalender

| Klaim C1 | Bukti di tree kerja | Status |
|---|---|---|
| `scheduler/calculate-summaries` group by `collectedAt` (`scheduler.ts:87-88, 91-96`) | `scheduler.ts:87` `startDate = new Date(year, month-1, 1)`; `:88` `endDate`; `:90-96` `findMany` dengan `gte/lte(collections.collectedAt, …)` | ✅ **exact** |
| `dashboard monthStats` (`tasks.ts:39-41, 66-75`) | `:40-41` `periodYear/periodMonth = now`; `:66-75` agregat `collections` dengan `gte(collectedAt, monthStart)` | ✅ **exact** |
| `stats-range` | `tasks.ts:289-304` — `and(periodYear=y, periodMonth=m)` untuk tugas, tetapi nominal `:301-302` pakai `gte/lte(collectedAt, startDate/endDate)` | ✅ akurat |

### A.2 C1 §5 — filter periode pada scan

| Klaim C1 | Bukti | Status |
|---|---|---|
| `GET /mobile/scan/:qrCode` = `tasks.ts:333-406`, filter `:357-362` | route deklarasi `:334`, body selesai `:406`; filter periode di `:360-361` (`eq(assignments.periodYear, new Date().getFullYear())`) | ✅ geser 1–3 baris |
| `403 QR_NOT_ASSIGNED` pesan "periode berjalan" | `tasks.ts:384` persis teks itu | ✅ exact |
| Jalur skip = `tasks.ts:409-478` | `:409` `POST /assignments/:id/skip`; `:478` penutup | ✅ (lihat B-6 soal label "submit") |
| Rate limit scan 30/menit | `tasks.ts:336` `rateLimit: { max: 30, timeWindow: '1 minute' }` | ✅ exact |
| Kode `QR_WRONG_PERIOD` / `QR_PERIOD_CLOSED` belum ada | `utils/errorCatalog.ts:9-39` — hanya `QR_ALREADY_SUBMITTED`, `COLLECTION_NOT_FOUND`, `NOT_LATEST`, dst. | ✅ belum ada |
| App memetakan kode → pesan, `ScanScreen.tsx:33-40` | `:33-40` berisi `QR_INVALID`, `QR_NOT_ASSIGNED`, `QR_ALREADY_SUBMITTED`; pemakaian `:174` | ✅ exact |
| `docs/API_DOCUMENTATION.md:199, 229` | `:199` "hanya mengembalikan detail ketika assignment aktif dimiliki petugas pada periode berjalan"; `:229` `QR_NOT_ASSIGNED` | ✅ **exact** |

### A.3 C1 §3 — peran, izin, dan audit

| Klaim C1 | Bukti | Status |
|---|---|---|
| Role saat ini hanya 3 (`schema.ts:5`) | `schema.ts:5` `pgEnum('user_role', ['ADMIN_KECAMATAN','ADMIN_RANTING','PETUGAS'])` | ✅ **exact** |
| Belum ada Staf Pengumpulan / Staf Keuangan | tidak ada enum maupun rute terkait | ✅ |
| `activity_logs` tersedia untuk jejak reopen | `schema.ts:234` tabel `activity_logs`; penulis `services/auditLogService.ts:65` (`insertActivityLog`) | ✅ |
| Scope per peran di lapisan laporan = `branchId` / `districtId` | `users.branchId`/`districtId` (`schema.ts:59-60`); `collectionQueryService.ts:19` `getCollectionScope(role, branchId, districtId)`; `routes/bendahara.ts:12` `authorize('ADMIN_KECAMATAN','ADMIN_RANTING')`; `:225-226` percabangan scope | ✅ nyata (lihat C-10) |
| Generate masih manual | `scheduler.ts:50-73` `POST /generate-tasks` | ✅ **exact** |
| Penjaga rute scheduler = internal API key | `scheduler.ts:21-27` `x-internal-api-key` + audit `SCHEDULER_MISMATCH` `:28-38` | ✅ (lihat C-9) |

### A.4 C1 §8b — koin Taqwa

| Klaim C1 | Bukti | Status |
|---|---|---|
| `branches` belum punya diskriminator jenis | `schema.ts:42-49` hanya `districtId, code, name, createdAt, updatedAt` — **tidak ada** `kind` | ✅ |
| Opsi 1 murah (1 kolom + backfill 1 baris) | estimasi wajar: tidak ada tabel baru, relasi `cans.branchId` (`:97`), `officers.branchId`, `assignments` tetap | ✅ |

### A.5 C1 §8c — enum kondisi kaleng

| Klaim C1 | Bukti | Status |
|---|---|---|
| Nilai enum kondisi sudah cukup untuk memetakan lapangan | `schema.ts:23-29` = `AKTIF, NON_AKTIF, RUSAK, HILANG, DIKEMBALIKAN` | ✅ **exact** |
| `is_active` sudah dipersempit maknanya | `schema.ts:109-115` — komentar menegaskan `is_active` bukan untuk perilaku bisnis | ✅ |

### A.6 C1 §9/§10 — spec tabel & BA

| Klaim C1 | Bukti | Status |
|---|---|---|
| "Sekarang tidak ada tempat simpan status FINAL/BA" | tidak ada tabel submission apa pun; `collection_summaries` (`schema.ts:250`) hanya cache agregat | ✅ |
| Pola PDF/R2 bisa dipakai ulang | `services/qrPdfService.ts` (`generateSingleQRPDF`, `generateBatchQRPDF`, unggah via `uploadToR2`, `getSignedDownloadUrl`) + `services/r2.ts:43,72,92`; dependency `pdf-lib@^1.17.1` di `apps/backend/package.json` | ✅ |
| `collectionSubmissions` akan menolak resubmit setelah FINAL | `services/collectionSubmission.ts:44-66` `validateAssignmentForSubmit` hanya cek `ACTIVE`+pemilik+`canId`; `:68-85` `assertNoExistingFirstSubmit` → tempat menempel penolakan "submission FINAL/periode LOCKED" | ✅ relevan |
| Koreksi memakai `submitSequence`/`alasanResubmit` | `schema.ts:162-163`; dipakai `routes/mobile/collections.ts:215-216`; penjaga `resubmitCollection` `collectionSubmission.ts:144` | ✅ |
| `collections.assignment_id` NOT NULL | `schema.ts:148` `references(assignments.id).notNull()` | ✅ |

### A.7 Verifikasi aritmetika (§8)

| Uji | Hasil |
|---|---|
| Madendo: 867.500 − 86.000 − 173.500 | = 608.000 ✅ cocok dengan laporan WA |
| Kaleng: 155 = 85 aktif + 70 non-aktif | ✅ |
| Format baru §8c: 85 + 60 + 6 + 4 | = 155 ✅ konsisten |
| Pan. Barat: 5.600.700 × 30% | = 1.680.210 ✅ cocok dengan angka di dokumen |
| Agregat 19 ranting: 45.264.000 ÷ 2.368 | ≈ 19.114,9 → dibulatkan ~Rp 19.115 ✅ |
| Ekspektasi Madendo 234.225 | ⚠️ = 30% × (867.500 − **86.750**) → memakai bisyaroh **tanpa** `floor_1000`; dengan rumus terkunci seharusnya **234.450**. Lihat B-3 |

**Kesimpulan Bagian A:** dokumen C1 dan B1 **bukan** dokumen spekulatif. Semua jalur kode, tabel, dan enum yang diklaim benar-benar ada di repo, dan rumus bisnis sudah diverifikasi terhadap data nyata.

---

## B. Koreksi internal dokumen (bisa dikerjakan tanpa keputusan baru)

### B-1 🔴 §2.1 — tabel siklus kontradiksi sendiri (ASSIGN vs GENERATE_AWAL)

Baris *ASSIGN* menyatakan assignment periode `(Y, M)` dibuat **tgl 20 M**, sementara baris *GENERATE_AWAL* menyatakan periode `(Y, M+1)` dibuat **10 M+1**. Keduanya peristiwa yang sama, dua tanggal berbeda. Akibatnya tidak jelas kapan sebuah periode benar-benar "terbuka".

**Usul rumusan pengganti:**

> - **Dibuka (tgl 10):** setelah periode M−1 dikunci pada 10 M, assignment periode **M** digenerate. Inilah pembukaan periode.
> - **(Re)generate tgl 20 M:** pemindaian ulang untuk kaleng/officer **baru** yang belum punya assignment periode M, plus pemicu pengingat.
> - Satu periode hanya boleh punya satu baris `period_calendar`.

### B-2 🔴 §6 catatan cron — menyebut bulan yang salah

Kalimat: *"cron terjadwal (tgl 20 untuk bulan berjalan + tgl 10 untuk bulan berikut setelah kunci)"*. Pada 10 Okt yang digenerate adalah **Okt (bulan berjalan)**, bukan Nov. Bila diimplementasikan harfiah, cron akan membuka periode Nov sejak 10 Okt (2 periode di depan).

**Usul:** *"tgl 10 M+1 00:00: kunci periode M **dan** generate periode M+1 (bulan berjalan saat itu). tgl 20 M+1: re-scan kaleng baru + kickoff pengingat."*

### B-3 🟡 §8 — contoh Madendo memakai rumus lama, menyamar sebagai ekspektasi baru

`234.225 = 30% × (867.500 − 86.750)`. Padahal §8 sendiri mengunci bisyaroh `floor_1000` → 86.000 → ekspektasi **234.450**. Dokumen sudah menandai Madendo sebagai "data historis pra-sistem", tetapi angkanya diletakkan pada baris yang sama dengan contoh perhitungan rumus terkunci sehingga rawan dikutip keliru.

**Usul:** beri keterangan eksplisit — *"dihitung dengan rumus lama: bisyaroh 10% tanpa pembulatan ribuan"* — atau pindahkan contoh ini ke catatan kaki.

### B-4 🔴 §8c vs §9.2 — kolom snapshot tidak cukup

§8c meminta laporan menampilkan 5 keranjang (`Aktif / Non-aktif / Rusak / Hilang / ditarik tidak dihitung`), tetapi `branch_submissions` hanya punya `can_total`, `can_aktif`, `can_nonaktif`.

**Usul:** tambah `can_rusak`, `can_hilang`, `can_dikembalikan` — atau satu kolom `can_stats json` berisi snapshot kelima angka. Tanpa ini, rincian §8c tidak akan pernah bisa dicetak ke BA/PDF (BA membaca snapshot, bukan hitung ulang — §10).

### B-5 🔴 §3.1 vs §3.2 vs §13.6 — atribusi "generate" tidak konsisten

| Sumber | Yang tertulis |
|---|---|
| §3.2 baris "Generate assignment" | Admin Ranting "✅ darurat saja"; MWC "✗ (kecuali program MWC)" |
| §3.1 tabel peran | Admin Ranting **tidak** diberi wewenang generate sama sekali |
| §13.6 (Taqwa) | "generate + monitoring oleh **Staf Pengumpulan level kecamatan**" |

Padahal §3.1 mendefinisikan Staf Pengumpulan ber-scope **`branchId` (per ranting)** — tidak ada scope distrik. Jadi siapa yang men-generate Program MWC tidak punya pemilik izin.

**Usul:** satu baris keputusan eksplisit, pilih salah satu:
1. `STAF_PENGUMPULAN` boleh punya `districtId` (bukan hanya `branchId`) — peran ganda level ranting + level MWC; atau
2. Program MWC digenerate oleh `ADMIN_KECAMATAN` saja, dan baris §3.2 "✗ (kecuali program MWC)" dipertahankan; atau
3. Peran baru terpisah untuk level MWC.

### B-6 🟡 §11 baris "Submit/skip lock" — salah atribusi file

Tertulis: `services/collectionSubmission.ts`, `tasks.ts:409-478`. Namun `tasks.ts:409-478` **hanya jalur skip** (`POST /assignments/:id/skip`). Jalur submit ada di `routes/mobile/collections.ts:60-95` (memanggil `validateAssignmentForSubmit` lalu `submitCollection`).

**Usul:** `| Submit/skip lock | services/collectionSubmission.ts:44-66, 68-85; routes/mobile/collections.ts:60-95; tasks.ts:409-478 | … |`

### B-7 🟡 Urutan seksi & rujukan silang

- Urutan fisik dokumen: §8 → **§8c → §8b**, sehingga rujukan "lihat §8b/§8c" rawan salah kutip. Urutkan §8a/§8b/§8c secara alfabetis atau ubah nomor menjadi §8.1/§8.2.
- §13.3 menyebut *"Admin Ranting (untuk `ppk_submissions` rantingnya)"* sedangkan matriks §3.2 hanya menulis "REOPEN … ✅ (rantingnya)". Satukan menjadi satu tabel *state machine* (lihat C-5) agar cakupan reopen tidak ditafsirkan berbeda oleh dua pembaca berbeda.

---

## C. Celah sebelum koding

### C-1 🔴 BLOCKING — Antrean offline vs kunci periode (risiko kehilangan pemasukan nyata)

**Fakta kode.**

- `apps/mobile/src/screens/CollectionScreen.tsx:67` menyetel `collected_at: new Date().toISOString()` — **jam HP**, tidak dari server.
- Antrean lokal: `apps/mobile/src/services/offline/queue.ts:44-60` (`QueuedCollection`), pengiriman batch `offline/sync.ts:7-18`.
- Cap retry `MAX_RETRIES = 3` (`offline/sync.ts:35`); daftar kode yang dipindah ke **gagal permanen** berisi `NOT_LATEST, COLLECTION_NOT_FOUND, ASSIGNMENT_INVALID, FORBIDDEN, VALIDATION_ERROR` (`offline/sync.ts:54-60`).
- `docs/audit/checklist-uji-mobile-staging-2026-09-18.md:74` mensyaratkan item tolakan permanen **tetap di antrean** dan bisa "Kirim Ulang" dari Detail Gagal.

**Masalah.** C1 §2.1 menetapkan kunci tgl 10 00:00: assignment ACTIVE dibekukan dan "tidak bisa scan/submit lagi untuk periode itu". Di lapangan: PPK menjemput 27 Sep dalam kondisi offline, perangkat baru tersinkron 11 Okt. Dua kemungkinan yang sama-sama buruk — masuk daftar gagal permanen (uang nyata tidak tercatat di sistem), atau tetap di antrean dengan backoff tanpa pernah bisa masuk (aturan kunci menolak selamanya).

Dokumen C1 belum menyebut antrean offline sama sekali; B1 hanya menyebut "kebijakan admin" di §4.

**Yang perlu diputuskan (pilih eksplisit):**

1. Validasi submit memakai **`assignment.period`**, bukan waktu submit — lalu diberi **jendela tenggang sinkronisasi** (mis. 24–72 jam setelah kunci) yang menerima `collected_at` ≤ `tolerance_end` dan menandai `late_sync = true`.
2. Tenggang ini **tampil merah** di monitoring Admin Ranting/MWC + masuk `activity_logs`, supaya tidak jadi celah menutup buku secara curang.
3. Alternatif tanpa tenggang: jalur **rekonsiliasi manual** (admin membuat entri koreksi dengan alasan wajib) + prosedur operasional "sinkronkan HP sebelum tanggal 9".
4. Kode error tolakan kunci (mis. `QR_PERIOD_CLOSED`) harus diberi perlakuan khusus di `offline/sync.ts:54-60`, agar tidak memicu retry berulang yang menyampah.

---

### C-2 🔴 BLOCKING — `collected_at` diterima mentah, tanpa validasi periode

**Fakta kode.**

- `routes/mobile/collections.ts:89` → `collectedAt: new Date(body.collected_at)`.
- `services/collectionSubmission.ts:44-66` (`validateAssignmentForSubmit`) hanya memeriksa: `id` cocok, `officerId` = pemilik, `status = 'ACTIVE'`, dan `assignment.canId === canId`. **Tidak ada** pemeriksaan `periodYear/periodMonth` maupun rentang tanggal.
- `serverTimestamp` (`schema.ts:156`, diisi `collectionSubmission.ts:119`) tersimpan, tetapi tidak dipakai sebagai penjaga.

**Masalah.** Klien bisa mengirim `collected_at` kapan saja: (a) backdating — mengisi "20 Sep" padahal sebenarnya 12 Okt; (b) forward-dating; (c) jam HP tidak akurat (perangkat TZ UTC atau jam salah beberapa jam) sehingga jemputan 09 Okt 23:50 WIB tercatat 10 Okt 00:50.

**Yang perlu diputuskan:**

- Validasi `collected_at ∈ [assign_date 00:00 WIB, tolerance_end 23:59 WIB]` milik assignment (dengan toleransi clock-skew, mis. ±10 menit).
- Kalau di luar → **tolak** `VALIDATION_ERROR` (kode sudah ada di `errorCatalog.ts:31`), atau terima dengan penanda + audit `anomaly_flags`.
- Bukti sah tetap `serverTimestamp`; `collected_at` diperlakukan sebagai "klaim petugas".
- Uji wajib: HP dengan TZ ≠ WIB pada jam yang sama (lihat E-12).

---

### C-3 🔴 BLOCKING — Tanda tangan 2 orang di 1 HP: audit trail bisa jadi fiksi

**Fakta dokumen.** §9.1 C1 mengisi `ppk_signer_id`, `bendahara_signer_id` dan aturan "beda userId, ditolak server bila sama". Namun alur §7.4 menempatkan **PPK tanda tangan di HP bendahara** — sesi perangkat itu milik bendahara.

**Masalah.** `ppk_signer_id` hanya bisa berarti: (a) bendahara mengetik/memilih nama PPK, (b) PPK mencoret lalu bendahara memilih identitasnya. Tanpa autentikasi per tanda tangan, kolom `signer_id + timestamp` **tidak punya nilai audit** — padahal justru itu tujuan §3.1 ("pemisahan yang generate vs yang pegang uang vs yang mengunci harus terbaca di `activity_logs`"). Larangan "userId sama" jadi kosmetik karena bisa dilewati dengan memilih identitas PPK yang berbeda dari dirinya.

**Yang perlu diputuskan (minimal salah satu):**

1. **Login bergantian**: PPK masuk di perangkat bendahara (sesi PPK) untuk menandatangani, lalu keluar; jejak = dua sesi berbeda + device id sama (ditandai di audit).
2. **PIN/OTP singkat milik PPK** sebelum tanda tangan (pola OTP sudah ada di `routes/auth.ts`, berikut rate limit + attempt counter).
3. Perangkat kedua (HP PPK sendiri) untuk tanda tangan PPK; sinkronisasi via server.
4. Kalau tetap tanpa verifikasi: ganti nama kolom menjadi `signed_on_behalf_by` dan nyatakan di SOP bahwa BA ini **bukan** tanda tangan elektronik tersertifikasi — agar tidak diklaim sebagai bukti otentik.

Wajib juga: tegakan larangan akun sama di level DB (constraint/trigger), bukan hanya validasi aplikasi.

---

### C-4 🔴 BLOCKING — Siapa mengunci ranting yang tidak lapor?

**Fakta dokumen.** §2.1: "Tanpa laporan ranting → dinyatakan 0 pemasukan oleh MWC". §7 "Status yang dinyatakan 0": *"Admin Ranting **wajib** kunci dengan `FINAL_NOL`"*.

**Masalah.** Aturan ini justru dipicu ketika ranting **tidak aktif** (contoh yang dipakai dokumen: Taqwa tidak muncul di rekonsiliasi). Menyerahkan penguncian kepada pihak yang tidak respons = laporan menggantung `ACTIVE`, dan MWC tetap tidak bisa menarik data DRAFT (§7.4: MWC hanya membaca FINAL).

**Usul:** tombol **Kunci Periode** milik MWC (§3.2) men-generate `FINAL_NOL` otomatis untuk setiap `branch_submissions` ber-`kind = RANTING` yang belum ada pada periode itu — disertai audit `locked_by = MWC`, notifikasi ke ranting, dan tetap bisa dibuka lewat jalur reopen §13.3. Tentukan juga secara eksplisit: `FINAL_NOL` **tidak** dihitung sebagai "ranting sudah lapor".

---

### C-5 🔴 BLOCKING — Cascade reopen belum didefinisikan

`§13.3` mengizinkan reopen oleh Admin Ranting dan `ADMIN_KECAMATAN`; `§9.1` menyatakan reopen "mengembalikan status ke DRAFT dan membuka kunci collection/assignment periode itu". Efeknya ke lapisan atas belum ditetapkan.

**Yang harus eksplisit:**

1. Reopen `ppk_submissions` **otomatis** menurunkan `branch_submissions` pasangannya ke DRAFT dan **menghanguskan TTD tingkat 2** (sesuai §7.5) — bukan opsional.
2. Pembukaan kunci collection/assignment terbatas **hanya pada officer tersebut** di periode itu.
3. `branch_submissions.version` naik; PDF lama tetap arsip (sudah disebut §13.3) dan **hash versi lama disimpan** agar bisa diverifikasi ulang (lihat C-6).
4. State machine periode: `OPEN → TOLERANCE → LOCKED → REOPENED_PARTIAL → LOCKED`. Tanpa status antara, kombinasi tak terdefinisi mungkin terjadi (mis. PPK DRAFT sementara ranting FINAL, atau BA versi 2 dengan TTD tingkat 2 versi 1).
5. Perilaku `period_calendar.status` (`§9.3`) saat `REOPENED_PARTIAL`: apakah scan kembali terbuka untuk officer itu? Nyatakan jawabannya (usul: ya, hanya untuk assignment officer tersebut, dan tetap dibatasi jendela waktu).

---

### C-6 🟡 BLOCKING (legal/teknis) — Akses berkas BA, privasi TTD, dan hash versi

**Fakta kode.** `services/r2.ts:72` menyediakan `getSignedDownloadUrl(key, expiresInSeconds = 3600)`, dan `qrPdfService.ts:115` sudah memakai pola presigned URL.

**Yang belum ditetapkan dokumen:**

- Bucket privat (tanpa akses publik), masa berlaku URL pendek, `Cache-Control: private`, dan audit tiap unduhan.
- Endpoint QR verifikasi BA — **hanya** memverifikasi `id + version + hash` dan mengembalikan status sah/tidak; **jangan** membocorkan nominal/pihak (sejalan dengan penjagaan privasi di `middleware/__tests__/scan-qr.test.ts`).
- Coretan tanda tangan = data biometrik (UU 27/2022): perlu pernyataan persetujuan penandatangan, kebijakan retensi + mekanisme penghapusan (mendukung `deleteFromR2` `r2.ts:92`), dan larangan menandatangani tanpa consent.
- Konsistensi: `§9.1/§9.2` menyebut `pdf_url` per versi, tetapi belum ada kolom `pdf_hash`. Tanpa hash, klaim "immutable" (§10) tidak bisa dibuktikan.

---

### C-7 🟡 Idempotensi, transaksi, dan kegagalan separuh jalan

Belum ada aturan untuk: dua admin menekan FINAL bersamaan; FINAL ulang karena permintaan ganda; generate PDF dua kali; serta kondisi "FINAL sukses tetapi unggah PDF ke R2 gagal" (bisa berujung status FINAL tanpa berkas, atau berkas tanpa status).

**Usul:** `unique (branch_id, period_year, period_month)` + `version` sebagai optimistic lock + satu transaksi DB untuk perubahan status; PDF dibuat via job/outbox dengan retry (pola worker + DLQ sudah ada di `workers/whatsapp.worker.ts`), sehingga FINAL tidak pernah bergantung pada keberhasilan unggah. Manfaatkan juga idempotensi yang sudah ada: `collections.offlineId` unik (`schema.ts:160`) dan `collection_assignment_can_sequence_unq` (`schema.ts:167`).

### C-8 🔴 Zona waktu: sudah ada "rumah" — jangan bikin jalur baru

`apps/backend/src/utils/operationalTimeZone.ts` sudah ada (`OPERATIONAL_TIMEZONE`, `operationalOffsetMinutes`) dan sudah dipakai `services/overviewService.ts`. Komentar berkas itu juga mencatat bahwa kolom timestamp di DB bertipe `timestamp without time zone` dan **server wajib berjalan pada zona operasional**.

**Konsekuensi untuk C1:** `services/periodCalendar.ts` (§11) harus **memakai ulang** util ini, bukan membuat perhitungan WIB sendiri. Tambahkan prasyarat eksplisit: (a) migrasi ke `timestamptz` atau penegasan `TZ=Asia/Jakarta` + assertion saat boot, (b) uji batas 09 Okt 23:59 WIB vs 10 Okt 00:00 WIB, (c) uji HP ber-TZ berbeda.

### C-9 🟡 "Guard role baru" pada generate tidak sesederhana itu

`scheduler.ts:21-27` memakai header `x-internal-api-key`, bukan sesi pengguna. Tombol **Generate Penugasan** untuk Staf Pengumpulan dari web tidak bisa lewat hook itu apa adanya.

**Usul:** rute admin baru (mis. `POST /admin/periods/generate`) dengan `authorize('STAF_PENGUMPULAN','ADMIN_RANTING','ADMIN_KECAMATAN')` + rate limit + audit, sementara `POST /scheduler/generate-tasks` tetap khusus key internal (untuk cron). Tuliskan pilihan ini di §11 agar tidak ada dua jalur yang saling menimpa.

### C-10 🟡 Dua role baru memaksa ubah lapisan scope & authorize (belum ada di §11)

- `collectionQueryService.ts:19` → `getCollectionScope(role, branchId, districtId)` harus mengenal `STAF_PENGUMPULAN`/`STAF_KEUANGAN`.
- `routes/bendahara.ts:12` → `authorize('ADMIN_KECAMATAN','ADMIN_RANTING')` harus diperluas.
- `collectionQueryService.ts:52-53` → `buildCollectionsQuery` masih memfilter `gte/lte(collections.collectedAt)`; inilah tempat nyata laporan MWC berubah (dipakai `/collections`, `/reports/summary`, `/reports/stats`).
- `services/canService.ts` (status ASSIGNED/COMPLETED relatif periode berjalan — disebut sendiri oleh B1 §3) dan `services/overviewService.ts` belum masuk peta kerja §11.

### C-11 🔴 Rollout, backfill, dan masa transisi belum ada

Belum diputuskan: nasib periode yang sudah tutup (Jul/Agu 2026 — di-backfill `FINAL` historis atau dibiarkan tanpa BA?), tanggal mulai berlaku aturan baru (20 Sep? 10 Okt?), dual-run laporan lama vs baru beserta kriteria go/no-go, feature flag & rollback, dan siapa operator migrasi. Padahal September 2026 sedang berjalan dengan aturan lama (`tasks.ts:360-361` hanya melihat periode kalender), sehingga hari-hari pertama perubahan pasti tumpang tindih — termasuk dengan data staging yang saat ini seluruhnya periode Juli (`checklist-uji-mobile-staging-2026-09-18.md:27`).

### C-12 🟡 Notifikasi belum jadi deliverable yang rinci

Infrastrukturnya ada: tabel `notifications` (`schema.ts:218`) + `users.fcmToken` (`schema.ts:63`), serta antrean WA + worker + DLQ (`services/whatsapp.ts`, `workers/whatsapp.worker.ts`, kode `WA_SEND_FAILED` di `errorCatalog.ts:35`). Yang belum: daftar **event → kanal → template → penerima** untuk minimal: tugas digenerate, pengingat H-3, periode mendekati kunci, FINAL, reopen, selisih > Rp 10rb, dan BA siap diunduh. Tanpa rincian ini, klaim §4 ("jadwal = pengganti pengumuman WA") tidak punya komponen yang menegakkan.

---

## D. Dampak ke dokumen lain (harus ikut disunting)

| # | Dokumen | Perubahan yang diperlukan |
|---|---|---|
| D-1 | `.hermes/plans/2026-09-18_b1-filter-periode-scan.md` | Status masih **"⏸️ DITANGGUHKAN"** padahal C1 §5 sudah menjawab Q1–Q3 (kebijakan: scan toleran lintas periode + kode error baru). Tandai *"DIREVISI/DITUTUP oleh C1 §5"* dan catat jawaban Q1–Q3 di §5, agar tidak ada yang mengerjakan Opsi A saja. Trigger §8 poin 4 ("pergantian periode pertama di produksi 1 Okt 2026") juga sudah tidak sesuai irama 20/27/10. |
| D-2 | `docs/audit/checklist-uji-mobile-staging-2026-09-18.md` | Baris 11 (B1 ditangguhkan), 27 (data staging = periode Juli), 54 (pesan scan tidak menyesatkan), dan 74 (item ditolak permanen tetap di antrean) akan tidak valid setelah C1 berlaku — perlu revisi + entri tanggal. |
| D-3 | `docs/API_DOCUMENTATION.md` (§ scan, baris 195-233) | Kontrak berubah: kode baru `QR_WRONG_PERIOD`, `QR_PERIOD_CLOSED`, chip periode pada respons, dan perilaku toleransi. |
| D-4 | `apps/backend/src/utils/errorCatalog.ts` + `apps/mobile/src/screens/ScanScreen.tsx:33-40` | Katalog menyatakan dirinya "satu sumber kebenaran" — kode baru wajib masuk ke `ErrorCode` (bukan string literal), dan `QR_ERROR_MESSAGES` harus punya entri + chip periode. |
| D-5 | `docs/audit/dasar-perbaikan-metrik-tugas-mobile-2026-09-13.md` | Definisi periode tugasnya selaras dengan C1 §2.2 (baris 75-76, 106, 313) ✅ — tetapi §4.3 (statistik rentang) dan §7 (kontrak metrik) perlu catatan revisi karena laporan berganti basis `collectedAt` → periode assignment. |

Catatan tambahan untuk peta kerja §11 C1: `services/canService.ts` (status ASSIGNED/COMPLETED relatif periode berjalan — dikutip sendiri oleh B1 §3) dan `services/overviewService.ts` (rekap MWC) belum masuk daftar file yang diubah.

---

## E. Tambahan rencana uji (§12 C1 saat ini hanya 10 baris)

| # | Skenario baru | Ekspektasi |
|---|---|---|
| 11 | Scan assignment Sept pada 09 Okt 23:59 WIB vs 10 Okt 00:00 WIB | Lolos dengan badge Toleransi / `QR_PERIOD_CLOSED` — tepat di batas |
| 12 | HP dengan TZ ≠ WIB (mis. UTC) pada jam yang sama | Batas tetap dihitung server (WIB), bukan jam perangkat |
| 13 | Scan 27 Sep offline, HP baru sync 11 Okt | Sesuai kebijakan C-1: diterima berflag `late_sync` **atau** ditolak terkontrol — bukan hilang diam-diam |
| 14 | Kirim `collected_at` dimundurkan (mis. 20 Agu untuk period Sept) | Ditolak/berflag + audit; `serverTimestamp` tetap dicatat |
| 15 | PPK & bendahara memakai satu akun untuk dua TTD | Ditolak server (userId sama) — dan teruji, bukan hanya di UI |
| 16 | Dua admin menekan FINAL/Kunci bersamaan | Efek satu kali (idempoten), `version` tidak dobel |
| 17 | Reopen PPK → ranting | Ranting otomatis DRAFT, TTD tingkat 2 hangus, PDF lama tetap arsip |
| 18 | Ranting tanpa laporan → MWC menekan Kunci Periode | Muncul `FINAL_NOL` + audit + notifikasi, tidak menggantung ACTIVE |
| 19 | Generate dobel (cron + tombol manual bersamaan) | Index unik `can_officer_period_unq` menahan duplikat, respons jelas |
| 20 | `STAF_PENGUMPULAN`/`STAF_KEUANGAN` menekan FINAL/Kunci | 403 + tercatat di `activity_logs` |
| 21 | Unduh PDF setelah reopen + FINAL ulang | Versi 1 utuh (hash sama), versi 2 berbeda dan terverifikasi |
| 22 | Beban: generate 1 periode penuh + notifikasi massal (push + WA) | Selesai tanpa timeout; kegagalan WA masuk DLQ, tidak menggagalkan generate |

---

## F. Rekomendasi tindakan (urutan yang disarankan)

1. **Perbaiki 7 butir internal** (B-1 … B-7) — < 30 menit, tidak butuh keputusan baru. Paling mendesak: B-1 dan B-2 karena keduanya menyangkut tanggal/cron yang akan dikode apa adanya.
2. **Kunci 6 celah blocking** (C-1, C-2, C-3, C-4, C-5, C-11) sebagai §14 baru "Keputusan wajib sebelum koding". Ini yang bisa membatalkan sebagian desain bila baru ditemukan saat implementasi.
3. **Lengkapi keputusan teknis pendukung**: C-6 (akses berkas + hash), C-7 (idempotensi), C-8 (zona waktu), C-9/C-10 (jalur generate + scope role baru), C-12 (matriks notifikasi).
4. **Tambahkan §13.7 di C1**: daftar dokumen yang ikut direvisi (D-1 … D-5) supaya kontrak metrik, checklist uji, dan API doc tidak tertinggal.
5. **Naikkan status B1** dari "DITANGGUHKAN" → "DIREVISI oleh C1 §5" + jawab Q1–Q3.
6. Baru sesudah itu: pecah §11 C1 menjadi tiket kerja per area (backend → mobile → web → migrasi → docs), dengan urutan yang menghormati ketergantungan: migrasi DB & enum role → services periode/scan → submission/lock → approve 2 tingkat + BA/PDF → notifikasi → laporan web → pembersihan `collectedAt` legacy.

---

## Lampiran A — Rangkuman jumlah temuan

| Bagian | Isi | Jumlah |
|---|---|---|
| A | Klaim terverifikasi akurat | 30+ butir (termasuk 6 verifikasi aritmetika) |
| B | Koreksi internal dokumen | 7 (4 merah: B-1, B-2, B-4, B-5; 3 kuning: B-3, B-6, B-7) |
| C | Celah sebelum koding | 12 (7 merah: C-1…C-5, C-8, C-11; 5 kuning: C-6, C-7, C-9, C-10, C-12; blocking: C-1…C-6, C-11) |
| D | Dokumen lain yang terdampak | 5 |
| E | Skenario uji tambahan | 12 |

## Lampiran B — Bukti utama yang diperiksa langsung di tree kerja

| Tema | Berkas & baris |
|---|---|
| Peran & enum | `apps/backend/src/database/schema.ts:5` (role), `:23-29` (can_condition), `:42-49` (branches, tanpa `kind`), `:125-143` (assignments + index unik), `:146-169` (collections), `:218` (notifications), `:234` (activity_logs), `:250` (collection_summaries) |
| Scan & periode | `apps/backend/src/routes/mobile/tasks.ts:334-406` (scan), `:358-361` (filter periode), `:384` (QR_NOT_ASSIGNED), `:336` (rate limit 30/mnt), `:409-478` (skip), `:530+` (periods/complete) |
| Submit & validasi | `apps/backend/src/services/collectionSubmission.ts:44-66` (validateAssignmentForSubmit — tanpa cek periode), `:68-85` (assertNoExistingFirstSubmit), `apps/backend/src/routes/mobile/collections.ts:60-95` (terima `collected_at` mentah di `:89`) |
| Laporan & scope | `apps/backend/src/services/collectionQueryService.ts:19` (getCollectionScope), `:52-53` (buildCollectionsQuery by collectedAt); `apps/backend/src/routes/bendahara.ts:12, 225-226` |
| Scheduler | `apps/backend/src/routes/scheduler.ts:21-27` (internal key), `:50-73` (generate-tasks), `:87-96` (calculate-summaries by collectedAt) |
| Zona waktu | `apps/backend/src/utils/operationalTimeZone.ts:15-29`; pemakaian di `services/overviewService.ts` |
| Antrean offline | `apps/mobile/src/screens/CollectionScreen.tsx:67`; `apps/mobile/src/services/offline/queue.ts:44-60`; `apps/mobile/src/services/offline/sync.ts:35, 54-60` |
| Pesan & kode error | `apps/mobile/src/screens/ScanScreen.tsx:33-40, 174`; `apps/backend/src/utils/errorCatalog.ts:9-39`; `docs/API_DOCUMENTATION.md:195-233` |
| PDF & penyimpanan | `apps/backend/src/services/qrPdfService.ts` (+ `services/r2.ts:43,72,92`); dependency `pdf-lib@^1.17.1` pada `apps/backend/package.json` |
| WhatsApp & notifikasi | `apps/backend/src/services/whatsapp.ts`, `apps/backend/src/workers/whatsapp.worker.ts` (queue + retry + DLQ) |

## Lampiran C — Keterbatasan tinjauan

- Verifikasi dilakukan pada tree kerja `docs/checklist-uji-mobile-staging-2026-09-18` @ `2882a39`; fix B2 di `origin/staging` **tidak** diperiksa baris-per-baris, sehingga nomor baris B1 §3 (yang merujuk `6ad127a`) tidak dapat dikonfirmasi di sini.
- Nomor baris di dokumen C1/B1 yang diverifikasi di sini adalah nomor pada tree kerja; bila C1 mulai dikode dari basis `staging`, semua sitasi baris perlu dipetakan ulang.
- Tinjauan tidak mencakup apps/web secara mendalam (hanya memastikan keberadaan `apps/web` dan tidak ada PDF generator di sana).
- Data lapangan (WA Agustus 2026, angka per ranting seperti Rowadi/Lambanggelun/Sawangan) tidak dapat diverifikasi dari repo — hanya konsistensi internal & aritmetika yang diperiksa.

---

*Disusun otomatis dari pemeriksaan langsung kodebase — 19 Sep 2026. Laporan ini tidak mengubah dokumen yang ditinjau; tindak lanjut (pembetulan C1/B1) menunggu keputusan pemilik produk.*