# Rencana susulan: pemetaan mobile untuk alur overview / status kaleng

**Tanggal:** 16 September 2026
**Status:** Dieksekusi 16 September 2026 (Fase 0–5, kode + uji; lihat "Catatan eksekusi" di bawah).
**Pemicu:** fix overview 500 (`0e99267`, `getReturnedCounts` → `gte`/`lt`) hanya menyentuh backend + web. Verifikasi ulang menemukan 4 alur bisnis yang seharusnya menyentuh mobile tetapi luput, plus 1 temuan tambahan.

## Dokumen acuan (normatif, tidak diputuskan ulang)

1. `docs/audit/dasar-perbaikan-metrik-tugas-mobile-2026-09-13.md` — **kontrak metrik final**: `tugas_selesai = COMPLETED + UNCOLLECTED`, `tugas_total = seluruh assignment pada scope + periode`, `tugas_belum = ACTIVE`. Rencana ini tidak mengubah keputusan itu; Fase 2 hanya mengeksekusi §7–§8 dokumen tersebut yang terpantau belum diterapkan di kode (backend masih `completed + active`).
2. `docs/audit/rencana-implementasi-overview-kaleng/07-alur-kode-alasan-mobile.md` — alur kirim `reason_code` dari APK (sudah jalan untuk skip; belum ada untuk kunjungan).
3. `apps/backend/src/services/conditionRules.ts` — sumber tunggal transisi kondisi dan label aksi.

## Hasil verifikasi per saran awal

| # | Saran awal | Verdict | Koreksi routing |
|---|------------|---------|-----------------|
| 1 | Endpoint status usulan (`GET /mobile/proposals` atau embed di `/mobile/tasks`) | Arah benar, routing belum tepat | Server **sudah** mengirim `proposal_id` saat skip (`apps/backend/src/routes/mobile/tasks.ts:448-454`), client yang membuangnya (tipe `apps/mobile/src/services/api.ts:654` tak mencantumkan; `useTasksStore.skipAssignment` di `apps/mobile/src/stores/useTasksStore.ts:432-451` hanya kembalikan `{success:true}`). Jadi Langkah 0 = teruskan field yang sudah ada, Langkah 1 = endpoint baca status (dipilih tegas, bukan "atau"). |
| 2 | Selaraskan `task_total` **atau** dokumentasikan perbedaan | Temuan benar, solusi "atau dokumentasi" ditolak | Drift nyata (`overviewService.ts:238-246` = 5 status vs `tasks.ts:84-92,305-313` dan `useTasksStore.ts:249-251` = `active+completed`). Optimisme lokal skip (`completed+1`, `useTasksStore.ts:441-450`) terpatahkan saat refresh server. Dokumentasi saja tidak memperbaiki perilaku → wajib samakan rumus + regression test. |
| 3 | Tampilkan efek kunjungan di dashboard | Understated, sasaran salah | `recordCanVisit` (`api.ts:673`) **nol pemanggil** di `apps/mobile/src`; tidak ada layar/tombol/rute (`navigation/types.ts`). Alur belum tersambung sama sekali, bukan sekadar efek tak tampil. Tampilan yang benar = riwayat (History), bukan dashboard, karena kunjungan by design bukan penjemputan. |
| 4 | Guard umum larangan interpolasi `Date` di `sql``` | Benar, perlu dipertajam | Satu-satunya guard `overviewReturnedCounts.test.ts` (sempit, satu fungsi); tidak ada eslint backend. `officerService.ts:50-51` dan `collectionReportService.ts:136-137` **tidak bug hari ini** (yang diinterpolasi string `YYYY-MM-DD`, bukan `Date`) — larangan harus berbunyi "objek `Date` di dalam `sql```", bukan semua interpolasi. |
| 5 | (temuan baru saat verifikasi) Pesan kaleng DIKEMBALIKAN di mobile | Belum pernah dipetakan | Kaleng yang ditarik admin keluar dari `ASSIGNABLE_CONDITIONS` sehingga tugas mobile menyusut diam-diam; scan hanya menjawab `QR_INVALID` generik (`tasks.ts:359-362`). |

---

## Fase 0 — Teruskan `proposal_id` skip yang sudah ada (tanpa endpoint baru)

**Tujuan:** petugas langsung tahu usulannya terbentuk (atau tidak perlu usulan) sesaat setelah skip.

- `apps/mobile/src/services/api.ts:650-667` — tambahkan `proposal_id?: string` pada tipe respons `skipAssignment`. Tidak ada perubahan wire (server sudah mengirim).
- `apps/mobile/src/stores/useTasksStore.ts:432-467` — kembalikan `proposalId`/`reasonCode` ke pemanggil, bukan hanya `{success:true}`.
- `apps/mobile/src/screens/TaskDetailScreen.tsx:31-50`, `apps/mobile/src/screens/ScanScreen.tsx:116-133` — setelah sukses: bila `proposal_id` ada tampilkan konfirmasi "Usulan status terkirim, menunggu persetujuan admin"; bila tidak ada (alasan biasa) tampilkan "Ditandai tidak dijemput" seperti sekarang. Tetap `fetchTasks('ACTIVE')` + `goBack` seperti alur kini.
- Kompatibilitas APK lama: tidak terdampak (field tambahan diabaikan klien lama; server tetap memetakan tanpa `reason_code` → `OTHER`).

**Terima bila:** skip `CAN_DAMAGED` menampilkan pesan usulan + `proposal_id` benar tersimpan di `can_condition_proposals`; skip `OWNER_ABSENT` tidak membuat usulan; APK lama tetap sukses skip.

## Fase 1 — Baca status usulan dari mobile

**Keputusan routing (tegas):** bangun **endpoint detail per assignment** dulu; endpoint list hanya bila UI daftar disetujui.

- Opsi A (wajib): `GET /mobile/assignments/:id/proposal-status` — kembalikan usulan terbaru untuk kaleng pada assignment milik petugas (`PENDING`/`APPROVED`/`REJECTED` + `to_condition` + label aksi dari `conditionRules.actionLabel`). Scope via `assertCanAccess` (cabang petugas), konsisten dengan `POST /mobile/cans/:canId/visits`.
- Opsi B (opsional, bila dibutuhkan layar "Usulanku"): `GET /mobile/proposals?status=PENDING|ALL` berpaginasi, difilter ke kaleng cabang petugas. Jangan embed ke `/mobile/tasks` (join per assignment = N+1 untuk list 10–20 item).
- Mobile: tipe respons di `api.ts`, pemakaian on-demand dari detail tugas (bukan polling dashboard), teks status: "Menunggu admin" / "Disetujui → <label>" / "Ditolak".
- **Tidak** membuka `getCanDetail` admin ke mobile (`canService.ts:246-276` + `routes/admin/cans.ts:59` tetap admin-only); mobile hanya dapat proyeksi status, bukan detail penuh.

**Terima bila:** petugas yang skip `CAN_LOST` dapat melihat status berubah PENDING → APPROVED/REJECTED setelah admin bertindak; petugas lain/cabang lain tidak dapat mengintip (403).

## Fase 2 — Samakan definisi tugas mobile dengan kontrak 2026-09-13 (bukan re-desain)

**Rumus final (mengikat dari dokumen acuan):** `tugas_belum = ACTIVE`, `tugas_selesai = COMPLETED + UNCOLLECTED`, `tugas_total = seluruh assignment scope + periode`. `REASSIGNED` tampil terpisah, tidak masuk penjemputan.

- `apps/backend/src/routes/mobile/tasks.ts` — `GET /mobile/dashboard` (`month_stats`) dan `GET /mobile/tasks/stats-range`: hitung per status (`ACTIVE`/`COMPLETED`/`UNCOLLECTED`), kembalikan `task_active`, `task_closed (= COMPLETED+UNCOLLECTED)`, `task_completed`, `task_uncollected`, `task_total` sesuai kontrak §7 dokumen acuan. Pertahankan field lama selama 1 rilis untuk APK lama (tambah field, jangan ganti nama).
- `packages/shared-types/src/index.ts` — tambah field kontrak pada `MonthStats`/`RangeStatsResponse` (daftar persis §8 dokumen acuan).
- `apps/mobile/src/screens/DashboardScreen.tsx:286-289`, `apps/mobile/src/screens/RangeStatsScreen.tsx:121-124,207-211` — tampilkan `task_closed/task_total` sebagai "tugas selesai", `task_active` sebagai "tugas belum", `collected` berlabel "penjemputan" (§2–§3 dokumen acuan).
- `apps/mobile/src/stores/useTasksStore.ts` (`fetchStats`, `skipAssignment` optimisme, `completePeriod`) dan `useDashboardStore.ts` (merge + rekonsiliasi offline) — samakan denominator agar optimisme lokal tidak terpatahkan refresh server; `UNCOLLECTED` lokal dihitung tutup, bukan hilang.
- Regression test backend: dashboard + stats-range dengan assignment ACTIVE/COMPLETED/UNCOLLECTED campuran; test mobile store: skip → refresh tidak melompat mundur.

**Terima bila:** skenario §9 dokumen acuan lolos (normal, semua tertutup, tanpa collection, transfer, tanpa POSTPONED); contoh `38 penjemputan / 0 belum / 60-60 selesai` tampil identik di web overview dan mobile.

## Fase 3 — Sambungkan alur kunjungan (entry point dulu, tampilan di riwayat)

**Prinsip:** kunjungan verifikasi/penggantian **bukan** penjemputan — tidak menambah `collected`/nominal/hitungan kosong (`schemas.ts:61`, `tasks.ts:519-527`).

- Entry point baru mobile (belum ada sama sekali): dari TaskDetail/Scan untuk kaleng NON_AKTIF → tawarkan `VERIFIKASI`; RUSAK/HILANG → tawarkan `PENGGANTIAN`; panggil `recordCanVisit` yang kini menganggur. Tanpa ini label aksi web ("Kunjungi untuk verifikasi / Ganti unit kaleng") tidak dapat dieksekusi petugas.
- Tampilan: riwayat kunjungan di `HistoryScreen` (sumber: endpoint riwayat yang sudah ada atau proyeksi `visits` milik petugas), **bukan** kartu dashboard. Copy eksplisit: "Kunjungan tercatat — angka infak tidak berubah".
- Web overview tidak perlu query `can_visits` (by design); cukup pastikan perubahan kondisi hasil kunjungan (→ AKTIF via `conditionAfterReplacementVisit`) terbaca lewat agregat kondisi yang sudah ada.
- `POSTPONED`/transfer mengikuti dokumen acuan §5–§6 bila disentuh.

**Terima bila:** petugas dapat menyelesaikan kasus NON_AKTIF/RUSAK/HILANG dari HP; kunjungan tercatat di riwayat; angka penjemputan/nominal tidak bergerak akibat kunjungan; `PENGGANTIAN` menutup kasus → angka `action_required` web turun.

## Fase 4 — Pesan kaleng DIKEMBALIKAN di mobile

- Backend `GET /mobile/scan/:qrCode`: bedakan kaleng nonaktif karena DIKEMBALIKAN dari QR invalid — kode baru mis. `CAN_RETURNED` dengan pesan "Kaleng sudah ditarik admin, bukan tugas aktif".
- `ScanScreen.tsx:33-39` (`QR_ERROR_MESSAGES`): tambah copy `CAN_RETURNED`.
- Pastikan generator/listing tugas yang mengecualikan DIKEMBALIKAN tidak membuat tugas "hilang misterius": tugas yang kalengnya ditarik diberi penjelasan pada daftar (bukan sekadar lenyap dari `ACTIVE`).

**Terima bila:** scan kaleng yang sudah DIKEMBALIKAN memberi pesan yang benar (bukan "format QR tidak valid"); daftar tugas konsisten dengan kondisi web.

## Fase 5 — Guard kelas bug `Date` di `sql``` (hardening, bukan fix darurat)

- Presisi aturan: yang dilarang = **objek `Date` sebagai interpolan `sql```**; interpolasi string/number tetap sah. Pola wajib = operator Drizzle (`gte`/`lt`/`lte`) agar ter-bind sebagai parameter — sesuai perbaikan `0e99267`.
- Seragamkan `officerService.ts` dan `collectionReportService.ts` dari `sql`${col} >= ${string}`` ke `gte`/`lte` (perilaku sama, pola tunggal, menutup celah regresi bila suatu saat dikirimi `Date`).
- Perluas `overviewReturnedCounts.test.ts` menjadi guard pola: (a) pindai pemakaian `sql``` berinterpolasi tanggal di `services/` dan gagalkan bila menemukan `Date` mentah; atau (b) minimal tambah kasus mock-driver untuk `GET /mobile/dashboard` + `stats-range` sebagai penjaga jalur yang sudah benar. Pilih (a) bila tooling mengizinkan, bila tidak maka (b) + aturan tinjauan kode tertulis.
- Dokumentasikan pola di komentar modul (satu kalimat per service yang memakai filter tanggal).

**Terima bila:** simulasi interpolasi `Date` mentah gagal di CI sebelum mencapai staging; seluruh filter tanggal memakai operator Drizzle.

---

## Urutan pengerjaan dan ketergantungan

1. Fase 0 → 1 (rantai usulan; 0 tanpa backend baru, 1 butuh endpoint baru).
2. Fase 2 (metrik; independen dari 0–1, bisa paralel; tetapi UI pesan "tugas selesai" dipakai ulang oleh Fase 1).
3. Fase 3 → 4 (kunjungan dulu, lalu pesan penarikan; keduanya menyentuh copy alur kaleng bermasalah).
4. Fase 5 kapan saja (tidak mengubah perilaku).

## Rencana uji per fase

- Unit: rumus metrik campuran status; `proposalForSkipReason`/`conditionAfterReplacementVisit` sudah ada di `conditionRules.test.ts` — tambah kasus DVB (DIKEMBALIKAN visibility).
- Integrasi (mock driver ala `overviewReturnedCounts.test.ts`): skip → proposal terbentuk; approve → status terbaca mobile; kunjungan → kondisi berubah tanpa menyentuh angka collection.
- Manual: matikan jaringan saat skip/kunjungan (pesan jujur, bukan tuduhan sinyal — pola `useTasksStore` G1/G3); APK lama tanpa `reason_code` tetap skip sukses.
- Web–mobile sejajar: satu skenario end-to-end (skip → usulan → approve → angka overview berubah → status mobile berubah) dijalankan di staging sebelum rilis.

## Risiko dan mitigasi

- **APK lama di lapangan:** semua respons hanya *menambah* field; validasi `reason_code` tetap opsional di server. Mitigasi:filosofi masa transisi `07-alur-kode-alasan-mobile.md` dipertahankan.
- **Definisi ganda tugas:** satu-satunya sumber = dokumen 2026-09-13 §2–§7; setiap angka baru wajib menunjuk baris kontraknya.
- **Kunjungan disalahartikan sebagai setoran:** copy "bukan penjemputan" diwajibkan di setiap titik UI kunjungan; tidak ada nominal pada payload maupun tampilan.

---

## Catatan eksekusi (16 September 2026)

Seluruh Fase 0–5 diimplementasikan. Verifikasi: `tsc --noEmit` backend hijau;
12 suite unit backend (87 tes) hijau termasuk guard baru; typecheck mobile tanpa
error baru (18 vs 22 baseline, sisa mismatch tipe lib pre-existing); 3 suite
mobile terkait hijau (34 tes); prettier mobile hijau.

Penyimpangan dari rencana (disengaja, tercatat):

1. **Fase 5 — `gte`/`lte` menolak string polos** (tipe Drizzle untuk kolom
   timestamp: `Date | SQLWrapper`). Literal `YYYY-MM-DD` dibungkus `sql`...``
   (`gte(col, sql`${startDate}`)`) agar semantik runtime identik dengan
   sebelumnya (string di-bind apa adanya, tanpa risiko geser zona waktu yang
   akan muncul bila dikonversi ke `Date` UTC). Guard
   `noRawDateInterpolation.test.ts` dipersempit sesuai itu: yang dilarang
   adalah interpolasi tanggal sebagai **operand perbandingan langsung** di
   dalam `sql`, bukan setiap interpolasi tanggal. Kontrol negatif: pola bug
   lama (`updated_at >= ${start}`) terbukti tertangkap guard.
2. **Fase 3 — endpoint `GET /mobile/visits` ditambahkan** (tidak eksplisit di
   rencana) sebagai sumber data seksi kunjungan di `HistoryScreen`; tanpa ini
   seksi riwayat tidak punya sumber.
3. **Penghapusan enum `POSTPONED` ditunda** (butuh migrasi data, di luar scope
   rencana ini). Sebagai gantinya `task_total` dihitung dari seluruh baris
   status yang ada sehingga definisinya tetap "seluruh assignment scope +
   periode" walau baris `POSTPONED`/`REASSIGNED` masih muncul.
4. Rencana uji manual end-to-end staging (skenario skip → usulan → approve →
   angka berubah → status mobile berubah) dan uji APK lama di lapangan belum
   dijalankan — menjadi langkah rilis berikutnya.
