# Audit Implementasi — Kondisi Kaleng di Submit + Filter Tugas/Riwayat

**Tanggal audit:** 24 September 2026
**Pembaruan kalibrasi:** 25 September 2026
**Repository:** `C:\Users\user\Documents\lazisnu`
**Branch:** `feat/kondisi-submit-filter-2026-09-24`
**HEAD:** `ace38b3`
**Sinkronisasi remote:** branch lokal `ahead 1` terhadap `origin/staging`; belum dipush.

## 1. Kesimpulan Eksekutif

Rencana **“Kondisi Kaleng di Submit + Filter Tugas/Riwayat” sudah diimplementasikan secara kode pada jalur utama dan migration 0013 sudah terpasang pada DB target serta DB lokal**, tetapi belum boleh dinyatakan selesai seluruhnya.

Status aktual: kontrak, lifecycle, transaction, assignment, audit, Tasks/History, dokumentasi API, dan migration sudah dikerjakan; test integration lokal dan targeted test sudah lulus. Device smoke test, receipt E2E, race/idempotensi produksi, full CI, APK, dan deploy masih belum terverifikasi.

**Putusan:** fitur belum siap dinyatakan complete atau deploy; implementasi dan migration lokal/production terverifikasi, tetapi acceptance runtime dan artefak release masih terbuka.

Audit ini bersifat read-only terhadap baseline historis; calibration ini memperbarui status bukti tanpa mengganti temuan lama.

### 1.1 Kalibrasi terhadap implementasi aktual

Bagian di bawah membandingkan baseline audit lama dengan implementasi aktual. Temuan lama dipertahankan sebagai catatan historis; status di bawah ini adalah status kalibrasi terbaru. Suatu item tidak dianggap selesai hanya karena sudah memiliki kode atau targeted test.

| Temuan audit lama | Status aktual | Bukti dan batas verifikasi |
|---|---|---|
| Mobile belum memilih dan mengirim kondisi | **Selesai di kode, belum E2E** | `CollectionScreen`, store, queue, dan sync sudah membawa `condition`; belum ada device smoke test. |
| Batch/shared contract terlalu luas | **Selesai di kode dan targeted test** | Ordinary submit dibatasi ke `AKTIF`, `RUSAK`, `HILANG`; shared/backend/mobile typecheck lulus. |
| `CAN_DAMAGED` dan `CAN_LOST` masih hidup | **Selesai di executable TS/TSX** | Search terakhir menghasilkan `0 match`; dokumentasi dan boundary legacy perlu review akhir. |
| `Catat Kunjungan` masih tersedia | **Selesai di executable TS/TSX** | Search terakhir untuk label tersebut menghasilkan `0 match`. |
| Batch dapat menyentuh lifecycle nonaktif | **Selesai di guard, belum E2E** | Guard `NON_AKTIF` dan assignment validation sudah ada; online/offline device path belum diuji. |
| Audit dapat gagal setelah commit | **Selesai pada jalur yang disentuh, belum race E2E** | Transaction handle dipakai pada submit yang diuji; rollback/race production belum diuji. |
| Actor offline dapat `null` | **Selesai di kontrak sync, belum E2E** | `actorUserId` wajib pada sync dan assignment on-demand diteruskan; replay database penuh belum diuji. |
| Empty-streak dijalankan setelah commit | **Selesai di jalur disentuh, belum integrasi penuh** | Evaluasi dipindahkan ke transaksi submit; test integration collection submission lulus. |
| `visit-required` menampilkan assignment `COMPLETED` | **Selesai di kode, belum endpoint test** | Filter assignment `COMPLETED` sudah ditambahkan; endpoint smoke belum dilakukan. |
| Count Tasks salah | **Selesai di kode, belum device proof** | Count dan chip memakai item aktual yang sedang ditampilkan; runtime device belum diuji. |
| Riwayat belum memakai current condition | **Selesai di kode dan regression test** | Backend/shared/mobile membawa current condition; test response `HILANG` lulus, UI device belum diuji. |
| Dokumentasi, migration, CI, smoke, APK, deploy | **Sebagian selesai** | API docs diperbarui; migration 0013 terpasang di target dan lokal. Full CI, smoke, APK, dan deploy belum. |

**Kalibrasi tidak menghapus temuan lama.** Status `Belum lulus` pada bagian baseline di bawah berarti status ketika audit awal ditulis, bukan status terakhir implementasi aktual.

---

## 2. Keputusan Desain yang Diaudit

Auditor membandingkan implementasi terhadap keputusan berikut:

1. Pilihan kondisi di halaman nominal: **Baik (default mengikuti kondisi nyata) / Rusak / Hilang**.
2. Penjemputan selalu tersimpan, termasuk nominal nol; tidak ada konsep penjemputan gagal.
3. Pilihan PPK bersifat final dan langsung berlaku, dengan audit siapa dan kapan; tidak memerlukan persetujuan admin.
4. `CAN_DAMAGED` dan `CAN_LOST` dicabut dari daftar alasan skip.
5. Alur kunjungan `NON_AKTIF/PENCABUTAN` tidak boleh disentuh oleh submit kondisi.
6. Offline mengikuti aturan yang sama; queue dan payload batch harus membawa condition.
7. Riwayat mengikuti kondisi kaleng saat ini tanpa migrasi database.
8. `DIKEMBALIKAN` tidak boleh muncul dalam teks BA.

---

## 3. Status per Kriteria

| Kriteria | Status | Ringkasan |
|---|---|---|
| T1 — condition online/offline | **Sebagian selesai** | Backend direct/batch, mobile store/queue/sync, explicit condition, transition guard, dan actor sudah dikerjakan; device/offline E2E dan race production belum. |
| T2 — tutup pintu skip kondisi | **Sebagian selesai** | `CAN_DAMAGED`/`CAN_LOST` sudah hilang dari executable TS/TSX; review boundary legacy dan full search dokumentasi masih perlu. |
| T3 — history dan filter chip | **Sebagian selesai** | Backend/shared/mobile current condition, Tasks chip/count, dan filter `visit-required` sudah diimplementasikan; device UI/E2E belum. |
| T4 — dokumentasi dan verifikasi | **Sebagian selesai** | API docs dan migration 0013 sudah diperbarui/dipasang pada target dan lokal; test lokal terarah lulus, full CI/smoke/APK/deploy belum. |

---

## 4. T1 — Condition pada Submit Online/Offline

### 4.1 Yang sudah ada

Backend direct submit menerima condition pada `apps/backend/src/routes/mobile/collections.ts`. Batch schema dan service meneruskan condition melalui `apps/backend/src/services/mobileSyncService.ts` dan `apps/mobile/src/services/offline/sync.ts`.

`apps/backend/src/services/collectionSubmission.ts` melakukan validasi sebelum memasukkan nominal ke tabel collection. Transisi dicek dengan `isTransitionAllowed()`. Insert collection, update assignment, update agregat kaleng, dan update condition berlangsung dalam batas transaksi yang sama pada jalur bisnis utama.

Nominal nol secara teknis diterima oleh validasi backend karena nominal menggunakan nilai integer non-negative.

### 4.2 Masalah yang ditemukan

#### P1 — Mobile tidak memiliki pemilih kondisi

`apps/mobile/src/screens/CollectionScreen.tsx` hanya memiliki input nominal. Tidak ada state atau UI untuk:

- Baik;
- Rusak;
- Hilang;
- default dari `task.condition`;
- pilihan final PPK.

`apps/mobile/src/stores/useCollectionStore.ts` juga tidak memasukkan condition ke payload submit. Dengan demikian, perubahan backend belum dapat dipicu dari alur mobile nyata.

#### P1 — Offline queue dan sync belum type-safe

`apps/mobile/src/services/offline/queue.ts` mendefinisikan `condition?: string`, sedangkan shared type `BatchCollectionRequestItem` menggunakan union kondisi yang lebih sempit. Mobile typecheck gagal pada `apps/mobile/src/services/offline/sync.ts` saat queue diteruskan ke batch API.

Akibatnya, jalur offline belum memiliki bukti kelulusan typecheck.

#### P1 — Default kondisi belum menjadi default mobile

Backend dapat tidak mengubah kondisi bila field condition tidak dikirim, tetapi itu bukan default mobile yang mengikuti `task.condition`. Mobile tidak mengirim kondisi nyata sebagai fallback.

Endpoint direct memang memiliki fallback internal untuk kondisi saat ini, tetapi flow mobile saat ini tidak memakai direct single-submit; store membuat queue lalu mengirim batch sync.

#### P1 — Audit tidak atomik dengan transaksi

`insertActivityLog()` menggunakan database handle global, bukan transaction handle yang sama dengan update collection/condition. Error audit ditangkap dan ditelan.

Akibatnya:

- kondisi dan collection bisa commit tanpa audit;
- audit tidak otomatis rollback bersama kegagalan bisnis;
- pilihan kondisi yang tidak berubah tidak menghasilkan audit karena event hanya dibuat ketika kondisi berubah.

Ini belum memenuhi syarat bahwa kondisi dan audit selalu tercatat dalam alur/transaksi yang sama.

#### P1 — Batch schema terlalu luas

Kontrak batch/shared type masih menerima kondisi di luar tiga kondisi submit yang dikunci, termasuk `NON_AKTIF` dan `DIKEMBALIKAN`. `isTransitionAllowed()` juga mengizinkan transisi dari kondisi biasa ke kedua kondisi tersebut.

Dengan demikian, batch sync berpotensi menyentuh alur `NON_AKTIF`/pencabutan. Pemeriksaan ownership assignment saja belum menjadi boundary yang cukup untuk lock keputusan bahwa submit kondisi tidak boleh mengubah alur tersebut.

#### P2 — Direct online route tidak dipakai flow mobile

`POST /mobile/collections` tersedia, tetapi `useCollectionStore.submitCollection()` selalu membuat antrean lokal dan kemudian melakukan sync batch. Tidak ditemukan consumer mobile yang benar-benar memakai `collectionService.submitCollection()` untuk submit online langsung.

Selain itu, direct API client tidak mengirim `skip`, sementara route direct mewajibkan `skip: z.boolean()`. Kontrak direct route dan flow mobile belum terbukti konsisten.

#### P2 — Actor identity offline tidak seragam

Audit rejection pada `mobileSyncService` dapat mengisi `userId: null`. Audit condition juga dapat null bila relasi officer-user tidak ditemukan. Online dan offline belum memiliki sumber actor identity yang seragam untuk seluruh event audit.

---

## 5. T2 — Penutupan Pintu Skip Kondisi

T2 **sudah dikerjakan pada executable code**, tetapi review akhir terhadap boundary legacy dan E2E device belum selesai.

### Mobile

`CAN_DAMAGED` dan `CAN_LOST` sudah tidak ditemukan lagi pada executable TS/TSX. Label lama pada dokumentasi historis tidak dihitung sebagai kode executable.

### Backend

Guard/schema baru menolak lifecycle condition dari ordinary submit; `NON_AKTIF` dan `DIKEMBALIKAN` dipisahkan ke visit/receipt flow. Search final seluruh boundary dan review dokumentasi masih menjadi bagian gate release.

---

## 6. T3 — History dan Filter Tugas/Riwayat

### 6.1 Tugas

`TasksScreen` sekarang menampilkan chip dan count berdasarkan item aktual yang sedang ditampilkan, termasuk label kondisi saat ini. Backend juga mengembalikan `condition` dan `is_active`; filter `visit-required` tidak lagi memasukkan assignment `COMPLETED`. Device UI dan endpoint smoke masih belum diuji.

### 6.2 Riwayat

`GET /mobile/history` sekarang mengembalikan `condition` mengikuti kondisi kaleng saat ini. Shared contract, mapping backend, dan `HistoryItem` mobile sudah memakai field tersebut; regression test current condition `HILANG` lulus. Migrasi tambahan tidak diperlukan.

### 6.3 Bug visit-required dan count

Filter assignment `COMPLETED` dan count berbasis item yang ditampilkan sudah dikoreksi di kode. Masih diperlukan device/runtime verification untuk memastikan perubahan terlihat pada alur mobile nyata.

---

## 7. T4 — Dokumentasi, Test, dan Build

### 7.1 Dokumentasi

`docs/API_DOCUMENTATION.md` sudah diperbarui untuk condition required pada ordinary submit, nominal non-negatif termasuk nol, lifecycle visit/outcome, dan current condition pada history. D-log penuh dan review dokumentasi legacy belum selesai.

### 7.2 Typecheck dan test aktual

| Verifikasi | Hasil |
|---|---|
| `pnpm --filter @lazisnu/shared-types build` | Lulus |
| `pnpm --filter lazisnu-backend typecheck` | Lulus |
| `pnpm --filter lazisnu-collector-app typecheck` | Lulus |
| `pnpm --filter lazisnu-backend lint` | Lulus; script lint backend menjalankan typecheck |
| `pnpm --filter lazisnu-collector-app lint` | Lulus |
| `pnpm build:all` | Lulus: shared, backend, dan web |
| Backend full Jest | **Lulus**: 68 suite / 568 test; notification integration sudah hijau setelah isolasi state notifikasi test |
| Mobile full Jest | **Lulus**: 35 suite / 262 test tanpa `--forceExit`; async teardown/Jest environment dan warning `act(...)` sudah bersih. Console warning domain lain tetap non-fatal dan tidak menggagalkan test. |
| Mobile `format:check` | **Lulus**; enam file yang sebelumnya gagal sudah diformat |
| Android local build | **Tidak diulang** sesuai larangan; build lokal sebelumnya gagal karena resource Material dan `react-native-mmkv` `Permission denied`. `com.google.android.material:material:1.12.0` sudah ditambahkan sebagai kandidat perbaikan, tetapi belum diverifikasi |
| `git diff --check` | Lulus; hanya warning normalisasi CRLF |
| Repeat migration lokal | Lulus; `REPEAT_MIGRATE_OK` dan schema tetap utuh |

Full gate lokal yang boleh dijalankan di laptop sekarang hijau untuk shared build, typecheck, lint, `build:all`, backend full Jest, mobile full Jest, dan format check. Android **belum boleh dinyatakan hijau**: verifikasi hanya dapat dilakukan melalui GitHub Actions/remote runner, tanpa build Android lokal. Device E2E, race/idempotensi receipt, dan offline replay database penuh juga belum terverifikasi.

### 7.3 Deployment dan artifact

`pnpm build:all` lulus, tetapi belum ada APK yang dapat diverifikasi. Android build lokal sebelumnya gagal dan **tidak diulang** karena larangan eksplisit; kandidat perbaikan dependency Android sudah masuk working tree, tetapi harus diverifikasi melalui GitHub Actions/remote runner. Belum ada smoke staging atau deployment. Commit lokal `ace38b3` sudah dibuat dan belum dipush.

### 7.4 Migration

Migration `0013_can_visit_outcome.sql` sudah diterapkan ke DB target dan DB lokal. Verifikasi schema: empat kolom `can_visits` baru, index `can_visits_return_pending_idx`, dan FK `can_visits_received_by_users_fk` tersedia. Data counts sebelum/sesuai tidak berubah pada target yang diperiksa.

---

## 8. File yang Sedang Berubah

Modified files yang terkait audit dan implementasi terbaru:

- `apps/backend/src/routes/mobile/collections.ts`
- `apps/backend/src/routes/mobile/schemas.ts`
- `apps/backend/src/routes/mobile/tasks.ts`
- `apps/backend/src/services/collectionSubmission.ts`
- `apps/backend/src/services/mobileSyncService.ts`
- `apps/backend/src/services/conditionRules.ts`
- `apps/backend/src/routes/admin/cans.ts`
- `apps/mobile/src/screens/CollectionScreen.tsx`
- `apps/mobile/src/screens/TasksScreen.tsx`
- `apps/mobile/src/screens/history/HistoryItem.tsx`
- `apps/mobile/src/services/offline/queue.ts`
- `apps/mobile/src/services/offline/sync.ts`
- `apps/mobile/src/stores/useCollectionStore.ts`
- `packages/shared-types/src/index.ts`
- `docs/API_DOCUMENTATION.md`
- `apps/backend/src/database/migrations/0013_can_visit_outcome.sql`
- `apps/mobile/android/app/build.gradle`
- `apps/mobile/__tests__/screens/ProfileBeritaAcara.test.tsx`
- `apps/mobile/__tests__/screens/TaskDetailScreen.test.tsx`
- `apps/mobile/__tests__/screens/AuthenticatedScreens.test.tsx`
- `apps/mobile/__tests__/screens/VisualStateAudit.test.tsx`
- `apps/mobile/__tests__/updates/UpdateModal.test.tsx`
- `apps/mobile/src/components/__tests__/SkipReasonSheet.test.tsx`
- regression tests backend dan mobile yang relevan

Audit ini tidak mengubah, menghapus, atau memindahkan file working tree lain. Working tree masih memiliki banyak untracked/WIP yang tidak disentuh.

---

## 9. Remaining Work

1. Device E2E untuk memilih dan mengirim `AKTIF`, `RUSAK`, dan `HILANG` dari `CollectionScreen`.
2. E2E ordinary submit online/batch/offline untuk nominal normal, nol, invalid transition, dan idempotent replay.
3. E2E receipt lifecycle: `ISI`, `KOSONG`, `DIKEMBALIKAN`, `TIDAK_DIKUNJUNJI`, ownership, role, row-count, duplicate, dan dua admin bersamaan.
4. Verifikasi device untuk Tasks chip/count, `visit-required`, History current condition, dan assignment `COMPLETED`.
5. Review akhir boundary dokumentasi legacy; pastikan `CAN_DAMAGED`/`CAN_LOST` tidak reopened.
6. Lengkapi D-log dan audit acceptance evidence.
7. Jalankan full backend/mobile CI, smoke staging, build dan install APK, lalu verifikasi pada device.
8. Lakukan commit tematik hanya setelah gate di atas lulus; jangan commit otomatis.

**Status akhir: belum selesai.**
