# B1 — Filter Periode pada Scan QR Kaleng (audit & rencana perbaikan)

**Status: 🔄 DIREVISI oleh C1 §5 + §14 (20 Sep 2026)** — DITANGGUHKAN 18 Sep dicabut. Jangan kerjakan Opsi A saja. Jawaban Q1–Q3 dikunci di C1 §14.1–14.4: patokan assignment, telat lewat kunci ditolak → Okt dipercepat, scan toleran + `QR_WRONG_PERIOD`/`QR_PERIOD_CLOSED`, `collected_at` divalidasi + `serverTimestamp` bukti sah.
**Disusun:** 18 Sep 2026 · **Repo:** `bagus01darmawan-wq/lazisnu`
**Ref kode utama:** `origin/staging` @ `6ad127a` — semua nomor baris di dokumen ini mengacu ke ref ini. Padanan `origin/main` ada di §9.

> ⚠️ **Penomoran:** "B1" di dokumen ini = temuan sesi uji HP 16–18 Sep 2026 (label internal sesi, dipakai juga oleh plan B2). Di `docs/mobile-audit-2026-08-22.md`, "B1" adalah temuan **berbeda** (release build ditandatangani debug keystore). Jangan tertukar.

---

## 1. Ringkasan

Saat petugas memindai QR kaleng, server hanya mau menampilkan detail kaleng bila ada **assignment milik petugas itu pada periode berjalan** (bulan/tahun dari `new Date()` server). Selain itu → `403 QR_NOT_ASSIGNED` dengan pesan:

> "Kaleng ini bukan tugas Anda pada periode berjalan"

Masalahnya: **satu pesan untuk tiga situasi berbeda**, dan dua di antaranya menyesatkan petugas.

| Situasi data | Pesan sekarang | Akurat? |
|---|---|---|
| Kaleng bukan tugas petugas itu sama sekali | "Kaleng ini bukan tugas Anda pada periode berjalan" | ✅ |
| Kaleng **tugas petugas**, tetapi assignment-nya **periode lain** (mis. Juli / sisa periode lalu yang belum tuntas) | sama | ❌ petugas menyimpulkan "bukan tugas saya" padahal tugasnya |
| Kaleng tugas petugas **periode berjalan**, statusnya **sudah dijemput** (COMPLETED) | sama | ❌ seharusnya "sudah dijemput (…)" |

## 2. Gejala terverifikasi

- Sesi uji 17–18 Sep 2026 (HP nyata, staging — semua data = periode Juli): scan kaleng yang assignment-nya Juli gagal dengan `QR_NOT_ASSIGNED`; filter `periodYear=2026, periodMonth=9` vs tugas Juli — **terkonfirmasi masih aktif** (plan B2 baris 264 mencatat contoh: assignment periode berjalan berstatus COMPLETED → pesan yang sama).
- Efek ke pengujian: B2-5 hanya bisa divalidasi dengan menyiapkan data assignment **periode berjalan** + jalur **Tempel Kode** (plan B2 baris 196).
- Yang tampil di HP = pesan dari server; app memetakan kode error di `QR_ERROR_MESSAGES` (`ScanScreen.tsx:37`) lalu menampilkan Alert "QR Tidak Dapat Diproses" (`ScanScreen.tsx:172-175`).
- Jalur input manual ("Tempel Kode") menempuh **endpoint yang sama** → tidak bisa menembus filter periode.

## 3. Peta titik "periode berjalan" (staging @ `6ad127a`)

| Konsumen / alur | Lokasi | Perilaku |
|---|---|---|
| **Scan QR (mobile)** | `routes/mobile/tasks.ts:567-580`, error `:599` | assignment dicari dengan `officerId` + `status='ACTIVE'` + periode **hari ini**; gagal → `403 QR_NOT_ASSIGNED` |
| Daftar tugas mobile | `tasks.ts:386-427`; nominal `:429-445` | item list **tidak** difilter periode (hanya officer + status); filter periode hanya di total nominal COMPLETED |
| Kunjungan kaleng NON_AKTIF (B2) | `tasks.ts:207-300` (`:260-267`) | tidak lewat scan; lookup assignment **periode berjalan** per kaleng; bila tidak ada → app memanggil ensure-assignment |
| ensure-assignment (B2) | `tasks.ts:299-380` (`:320-329`) | mekanisme yang **sudah ada** untuk membuat assignment periode berjalan on-demand |
| Beranda (dashboard) | `tasks.ts:66-67, 108-109` | `pending_tasks` periode berjalan — by design |
| Tutup periode | `tasks.ts:746-791` | `POST /periods/complete` memakai periode berjalan — by design |
| Admin web — daftar kaleng | `services/canService.ts:118-160, 174-183` | status ASSIGNED/COMPLETED relatif periode berjalan (konsumen lain; di luar scope B1) |
| Generator assignment | `services/assignmentGenerator.ts:18-19, 80-111` | pembuat assignment per periode — by design |
| Peta pesan error app | `apps/mobile/src/screens/ScanScreen.tsx:33-40` | kode → teks tampil; `QR_NOT_ASSIGNED` tampil sama persis dengan pesan server |
| Dokumen API | `docs/API_DOCUMENTATION.md:199, 229` | kontrak endpoint scan |
| Uji pengunci perilaku | `apps/backend/src/middleware/__tests__/scan-qr.test.ts` | `QR_NOT_ASSIGNED` **tidak boleh** membocorkan `owner_name/phone/address` |
| (beda tahap) submit collection | `services/collectionSubmission.ts:83`, `utils/errorCatalog.ts:56-57` | `QR_ALREADY_SUBMITTED` muncul saat **submit**, bukan saat scan — jangan dicampur |

### 3b. Temuan tambahan saat menyusun dokumen ini

1. **Asimetri daftar vs scan.** Daftar tugas menampilkan tugas lintas periode (filter periode tidak dipakai untuk item), tetapi scan-nya menolak. Petugas bisa melihat kaleng "di daftar tugas saya" lalu tidak bisa discan — sumber kebingungan tambahan.
2. **Scan kaleng NON_AKTIF tanpa assignment periode berjalan** menghasilkan `QR_NOT_ASSIGNED` yang sama (padahal kaleng itu muncul di daftar "Perlu Dikunjungi"). Jalur resmi kunjungan NON_AKTIF = buka dari daftar "Perlu Dikunjungi", bukan scan. Bila kelak diharapkan "scan NON_AKTIF → Detail Kaleng" benar-benar berlaku (checklist bab 3), perilaku ini ikut diputuskan di B1.

## 4. Kenapa ini bukan sekadar bug kode (perlu keputusan produk)

Mengizinkan scan lintas periode menyentuh **semantik periode & metrik**:

- `collections.assignment_id NOT NULL` → penjemputan selalu menempel ke satu assignment; assignment milik satu periode.
- Kontrak metrik (`docs/audit/dasar-perbaikan-metrik-tugas-mobile-2026-09-13.md`): `tugas_total` = assignment pada scope **+ periode**; penyelesaian dihitung per periode.
- Maka kalau kaleng Juli dijemput September: penyelesaian tercatat **Juli** (menempel assignment Juli) atau harus dibuatkan **assignment September** (masuk "tugas" September)? → kebijakan admin, bukan pilihan teknis.
- Preseden yang sudah ada: alur B2 memilih model "buat assignment periode berjalan" (`ensure-assignment`, notes: *"Dibuat otomatis saat petugas menandai kaleng NON_AKTIF berisi (B2)"*).

## 5. Keputusan terbuka (Q1–Q3, untuk user/admin)

- **Q1 — Bolehkah petugas menjemput kaleng yang assignment-nya periode lampau?**
  - Tidak → cukup Opsi A; tulis aturan di SOP (kaleng periode lampau diurus admin / di-assign ulang).
  - Ya → pilih Opsi B atau C, dan tentukan aturan metriknya (§4).
- **Q2 — Kalau kaleng sudah dijemput periode berjalan, petugas tetap boleh scan (untuk melihat info)?** Minimal: pesannya harus benar.
- **Q3 — Batas lintas periode (bila diizinkan):** berapa periode ke belakang, dan status mana (`ACTIVE`/`UNCOLLECTED` saja? termasuk `COMPLETED`?).

## 6. Opsi perbaikan

### Opsi A — Perbaiki pesan & informasi (tanpa mengubah kebijakan) — *rekomendasi tahap 1*
1. Lookup dua tahap di endpoint scan: (i) seperti sekarang (officer + ACTIVE + periode berjalan) → sukses; (ii) bila kosong → cari assignment petugas+kaleng lintas periode (terbaru) untuk membedakan sebab.
2. Kode balasan baru (usul): `QR_WRONG_PERIOD` (409) + payload `period` (mis. `"2026-07"`) → pesan: *"Kaleng ini tugas Anda pada periode 2026-07 — di luar periode berjalan"*; untuk yang sudah dijemput: *"Kaleng ini sudah dijemput pada periode berjalan (± 12 Agu 2026, Rp …)"*; untuk yang benar-benar bukan tugasnya tetap `403 QR_NOT_ASSIGNED` dengan pesan lebih tepat: *"Kaleng ini bukan tugas Anda"*.
3. App: tambah kode baru di `QR_ERROR_MESSAGES` (+ tampilkan chip periode). Catatan: app menampilkan `QR_ERROR_MESSAGES[kode]` lebih dulu — kode baru yang tak terdaftar otomatis memakai pesan server.
4. **Wajib**: kasus "benar-benar bukan tugas" tetap tanpa data owner (jaminan privasi; uji `scan-qr.test.ts` harus tetap lulus).
- Ukuran kecil; tidak menyentuh metrik, assignment, atau collection.

### Opsi B — Aktifkan scan lintas periode (memakai assignment lama)
- Lookup: ACTIVE periode berjalan → ACTIVE terbaru (periode apa pun) → COMPLETED terbaru; response membawa `period`.
- Konsekuensi: collection menempel ke assignment periode lampau → penyelesaian **tercatat di periode assignment itu**; "tugas" periode berjalan tidak bertambah.
- Butuh jawaban Q1 & Q3; hati-hati pada periode yang sudah ditutup (`POST /periods/complete`).

### Opsi C — Scan lintas periode + auto-assignment periode berjalan (pola B2)
- Bila kaleng milik petugas (periode apa pun) dan belum ada assignment periode berjalan → buat lewat mekanisme `ensure-assignment` → collection menempel **periode berjalan**.
- Konsisten dengan preseden B2; efek: `tugas_total` periode berjalan bertambah 1 otomatis per kaleng; assignment lama menggantung sampai ditutup / direkonsiliasi admin.
- Butuh Q1 + Q3; juga berarti angka "kaleng belum di-assign" di web admin berubah makna.

**Rekomendasi:** kerjakan **A** lebih dulu (murah & aman, menghapus pesan menyesatkan). B/C menunggu Q1. Selama B1 terbuka, uji staging tetap memakai data periode berjalan (praktik yang sudah dipakai pada retest B2).

## 7. Rencana uji (berlaku untuk opsi apa pun)

| # | Persiapan data | Ekspektasi |
|---|---|---|
| 1 | Kaleng bukan tugas petugas (assignment petugas lain / tanpa assignment) | Pesan benar; **tanpa** data owner (uji privasi lulus) |
| 2 | Kaleng milik petugas, assignment **periode lampau** (ACTIVE) | Opsi A: kode+periode jelas; Opsi B/C: sukses sesuai kebijakan |
| 3 | Kaleng milik petugas, **periode lampau** (COMPLETED) | idem #2 |
| 4 | Kaleng milik petugas, **periode berjalan** (ACTIVE) | Sukses (regresi — tidak boleh berubah) |
| 5 | Kaleng milik petugas, **periode berjalan** (COMPLETED) | Opsi A: pesan "sudah dijemput" + info; bukan "bukan tugas Anda" |
| 6 | Kaleng DIKEMBALIKAN (ditarik admin) | Tetap `CAN_RETURNED` (regresi Fase 4) |
| 7 | Kaleng NON_AKTIF (alur B2) | Alur "Perlu Dikunjungi" tetap utuh (regresi B2-1…B2-8) |
| 8 | Input manual "Tempel Kode" | Perilaku sama dengan scan kamera |

Catatan uji: rate limit scan = 30 req/menit (`tasks.ts:549-552`); setelah uji, **pulihkan data** (pola H.7); verifikasi WA tetap hanya ke nomor uji.

## 8. Trigger untuk melanjutkan

1. Keluhan petugas produksi "kaleng saya tidak bisa discan" — terutama **awal bulan** (sebelum assignment periode baru digenerate) atau saat masih ada sisa tugas periode lalu.
2. Sebelum uji staging menyeluruh berikutnya (checklist bab 0) → minimal **putuskan Q1**.
3. Saat fix B2 dirilis ke produksi (alur NON_AKTIF menyentuh assignment periode berjalan — pastikan pesan scan tidak menambah kebingungan).
4. Pergantian periode pertama di produksi (1 Okt 2026) — observasi perilaku lintas periode yang nyata, lalu evaluasi.

## 9. Padanan `origin/main` @ `c4fa93d` (produksi saat dokumen dibuat)

- Scan: `apps/backend/src/routes/mobile/tasks.ts:352-402` (filter `:358-361`, `QR_NOT_ASSIGNED` `:384`) — **perilaku sama; B1 ada juga di produksi**.
- Daftar tugas: `tasks.ts:173-252` (nominal `:226-227`).
- `ensure-assignment` & `visit-required` **belum ada di main** (bagian dari fix B2 yang masih di staging).

## 10. Referensi

- Plan B2: `.hermes/plans/2026-09-18_fix-b2-kaleng-nonaktif.md` (baris 31, 196, 264).
- Checklist uji: `docs/audit/checklist-uji-mobile-staging-2026-09-18.md` (baris 11, 27, 54, 134).
- Kontrak metrik: `docs/audit/dasar-perbaikan-metrik-tugas-mobile-2026-09-13.md`.
- API: `docs/API_DOCUMENTATION.md:199, 229`.
- KB hidup: `50-projects/projects/prj-lazisnu-website.md` baris 112.
