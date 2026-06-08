# Implementation Plan Gabungan Review AI — Lazisnu Infaq System

Tanggal: 2026-05-17  
Tujuan: rencana eksekusi terkurasi dari review Antigravity, Claude, Jules, dan DeepSeek. File ini ditujukan untuk AI/agent lain agar bisa mengeksekusi perbaikan dengan prioritas yang benar dan tanpa membawa klaim review yang sudah dikoreksi.

## Ringkasan Eksekutif

Status: **Needs Changes sebelum production/deployment**.

Review terbaik sebagai baseline adalah **Antigravity**, karena menemukan bug mobile submit yang nyata (`can_id` salah) dan celah refresh token. Review Claude sangat akurat untuk isu performa backend, tetapi scope-nya sempit. Review Jules dan DeepSeek berguna sebagai pelengkap, terutama untuk shared-types dan konsistensi response, namun beberapa istilah/risiko perlu dikoreksi.

Prioritas utama:

1. Perbaiki kontrak `Task.can_id` end-to-end agar mobile submit collection tidak salah kirim `can_id`.
2. Perbaiki `/auth/refresh` agar tidak menerbitkan token baru untuk akun nonaktif.
3. Batasi `/mobile/scan/:qrCode` agar tidak membocorkan data kaleng di luar assignment/scope petugas.
4. Rapikan idempotency `offline_id` agar duplicate retry tidak menjadi error mentah.
5. Refactor summary/report yang menarik ribuan row ke memori menjadi agregasi SQL.
6. Blokir permanent delete kaleng yang sudah punya transaksi koleksi.
7. Sinkronkan `packages/shared-types` dengan kontrak aktual backend/mobile.

## Instruksi Untuk Agent Eksekutor

Sebelum mengubah kode, baca rule/workflow berikut karena plan ini lintas backend, mobile, shared-types, auth, QR scan, dan data finansial:

- `AGENTS.md`
- `.agents/rules/00-workflow-guarantee.md`
- `.agents/rules/10-sprint-aktif.md`
- `.agents/rules/02-arsitektur-database.md`
- `.agents/rules/03-api-conventions.md`
- `.agents/rules/04-business-rules.md`
- `.agents/rules/05-konvensi-kode.md`
- `.agents/rules/06-pedoman-mobile.md`
- `.agents/rules/08-pedoman-backend.md`
- `.agents/workflows/build-qr-scanner.md`
- `.agents/workflows/build-backend-auth.md`
- `.agents/workflows/run-testing.md`

Prinsip wajib:

- Jangan UPDATE/DELETE row di tabel `collections` untuk koreksi transaksi. `collections` immutable.
- Gunakan nama aktual implementasi: `submit_sequence`, `alasan_resubmit`, `can_id`, `assignment_id`, `offline_id`.
- Jangan mengganti istilah menjadi `sequence_pengajuan` atau `alasan_revisi`; itu istilah dari review Jules yang tidak sesuai kode aktual.
- Setelah mengubah API contract, cek backend, mobile Android, web, dan `packages/shared-types`.
- Untuk mobile, fokus Android dan offline-first dengan MMKV.

## Validasi Review AI

| Reviewer | Nilai | Dipakai Untuk | Catatan Koreksi |
|---|---:|---|---|
| Antigravity | 8.5/10 | Baseline prioritas bug lintas app, auth, scan QR, data integrity | Sebagian wording terlalu dramatis; M7 bukan rekursi tak terbatas karena ada `MAX_RETRIES`, tetapi refactor tetap layak. |
| Claude | 8/10 | Performa `reportService.ts`, `assignmentGenerator.ts`, type safety | Istilah "memory leak" kurang tepat; lebih akurat: memory pressure/OOM risk. |
| Jules | 7/10 | Idempotency, shared-types, bulk assignment, QR PDF performance | Nama field salah: harus `submit_sequence`/`alasan_resubmit`, bukan `sequence_pengajuan`/`alasan_revisi`. Klaim race update total cans terlalu spekulatif karena SQL increment sudah atomic. |
| DeepSeek | 6.5/10 | Konsistensi env/API response/shared-types kecil | Beberapa item bercampur konteks refactor sebelumnya; tetap valid untuk fallback `NEXT_PUBLIC_API_URL`, scheduler response, dan shared-types. |

## P0 — Wajib Fix Sebelum Deployment

### P0.1 Fix `can_id` Pada Mobile Submit Collection

Masalah:

- `apps/mobile/src/screens/CollectionScreen.tsx` mengirim:
  - `assignment_id: task.id`
  - `can_id: task.id`
- `task.id` adalah ID assignment, bukan ID kaleng.
- Backend `/mobile/tasks` belum mengirim `can_id`.
- `packages/shared-types/src/index.ts` interface `Task` juga belum punya `can_id`.

File terdampak:

- `packages/shared-types/src/index.ts`
- `apps/backend/src/routes/mobile/tasks.ts`
- `apps/mobile/src/screens/CollectionScreen.tsx`
- Cari penggunaan lain dengan `rg "Task|can_id|assignment_id|pending_tasks|/mobile/tasks" apps packages`.

Langkah implementasi:

1. Tambahkan `can_id: string` pada interface `Task`.
2. Pastikan naming tetap snake_case untuk API/shared contract.
3. Di `/mobile/tasks`, tambahkan `can_id: a.can.id` pada response `tasks`.
4. Di `/mobile/dashboard` bagian `pending_tasks`, pertimbangkan menambahkan `can_id: a.can.id` juga jika screen memakai task dari dashboard.
5. Di `CollectionScreen.tsx`, ubah `can_id: task.id` menjadi `can_id: task.can_id`.
6. Pastikan field alamat konsisten: shared type memakai `owner_address`, sementara dashboard response saat ini punya `address`; sinkronkan jika screen memakai data dashboard sebagai `Task`.

Acceptance criteria:

- Mobile submit mengirim `assignment_id` berisi assignment ID dan `can_id` berisi can ID.
- Backend `validateAssignmentForSubmit()` tidak gagal karena mismatch `can_id`.
- TypeScript membantu mencegah penggunaan `task.id` sebagai `can_id`.

Manual test:

1. Login sebagai petugas.
2. Ambil task dari `/mobile/tasks`.
3. Submit nominal dari `CollectionScreen`.
4. Pastikan row `collections.can_id` sama dengan kaleng yang di-scan/ditugaskan.

### P0.2 Validasi Akun Aktif Saat `/auth/refresh`

Masalah:

- `apps/backend/src/routes/auth.ts` endpoint `/auth/refresh` verify refresh token dan blacklist, lalu langsung `generateTokens(decoded, request.server)`.
- Jika admin menonaktifkan user, refresh token lama masih bisa menerbitkan access token baru selama token belum expired/blacklisted.

File terdampak:

- `apps/backend/src/routes/auth.ts`
- `apps/backend/src/middleware/auth.ts` sebagai referensi validasi payload dan status user.
- `apps/web/src/lib/api.ts` dan mobile auth store jika behavior refresh error perlu disesuaikan.

Langkah implementasi:

1. Setelah `jwt.verify(refresh_token)` dan validasi `tokenType === 'refresh'`, query user dari database berdasarkan `decoded.userId`.
2. Jika user tidak ada atau `isActive === false`, return `401` atau `403` dengan code konsisten, misalnya `ACCOUNT_DISABLED` atau `INVALID_TOKEN`.
3. Jika `decoded.officerId` ada, cek officer masih ada dan aktif jika flow petugas mensyaratkan itu.
4. Generate token dari payload yang disusun ulang dari database terkini, bukan langsung dari `decoded`, agar perubahan role/branch/district ikut terbawa.
5. Opsional: blacklist refresh token lama setelah rotate token baru, jika kebijakan refresh token rotation ingin diperketat.

Acceptance criteria:

- User aktif dengan refresh token valid tetap mendapat token baru.
- User nonaktif tidak bisa refresh token.
- Token baru memuat role/scope terbaru dari database.

Manual test:

1. Login user aktif dan simpan refresh token.
2. Nonaktifkan user.
3. Call `POST /auth/refresh` dengan refresh token lama.
4. Harus gagal, tidak mengembalikan `access_token`.

### P0.3 Batasi Data Scan QR Berdasarkan Assignment/Scope Petugas

Masalah:

- `apps/backend/src/routes/mobile/tasks.ts` endpoint `/mobile/scan/:qrCode` mencari kaleng dari QR, lalu mengembalikan nama, nomor HP, alamat, dan koordinat.
- Jika petugas scan QR kaleng lain, endpoint tetap bisa mengembalikan data pemilik walau `activeAssignment` kosong.
- Ini scope leak/data privacy issue.

File terdampak:

- `apps/backend/src/routes/mobile/tasks.ts`
- Mobile scanner screen/service yang mengonsumsi response scan.

Langkah implementasi:

1. Pastikan request memiliki `officerId`; jika tidak ada, return 403.
2. Setelah `can` ditemukan, cek `activeAssignment` untuk officer tersebut pada periode berjalan.
3. Jika tidak ada assignment aktif, return error 403/404 dengan code seperti `NOT_ASSIGNED` atau `FORBIDDEN`, jangan return detail owner.
4. Alternatif yang lebih ramah UX: return minimal `{ status: 'UNASSIGNED' }` tanpa `owner_phone`, `owner_address`, koordinat, dan tanpa data sensitif.
5. Pastikan mobile menangani error `NOT_ASSIGNED` dengan pesan jelas.

Acceptance criteria:

- QR invalid tetap 400.
- QR valid tapi bukan tugas petugas tidak membocorkan detail owner.
- QR valid dan assignment aktif mengembalikan `assignment_id`, `can_id`, dan detail yang diperlukan untuk submit.

Manual test:

1. Petugas A scan QR milik tugasnya: sukses.
2. Petugas A scan QR milik petugas/ranting lain: gagal tanpa data owner.
3. Scan QR palsu: gagal 400.

### P0.4 Perbaiki Idempotency `offline_id`

Masalah:

- `apps/backend/src/routes/mobile/collections.ts` mengecek duplicate `offline_id` sebelum transaksi.
- Database sudah punya unique constraint pada `collections.offline_id`, tetapi concurrent retry bisa tetap masuk ke transaksi lalu salah satunya kena unique violation mentah.
- Target behavior untuk mobile offline-first: duplicate retry harus aman dan predictable.

File terdampak:

- `apps/backend/src/routes/mobile/collections.ts`
- `apps/backend/src/services/collectionSubmission.ts`
- Mobile sync handling di `apps/mobile/src/services/offline/sync.ts`

Langkah implementasi:

1. Pertahankan unique constraint `offline_id`.
2. Pindahkan cek duplicate ke dalam transaction atau tangkap error Postgres `23505` dari insert.
3. Jika duplicate ditemukan, return response idempotent yang mobile bisa pahami:
   - untuk single submit: 200/409 dengan code `ALREADY_SYNCED` atau `DUPLICATE`;
   - untuk batch sync: item-level status `ALREADY_SYNCED`.
4. Jangan increment `totalCollected` atau `collectionCount` dua kali untuk `offline_id` yang sama.
5. Pastikan duplicate tidak membuat WhatsApp notification terkirim dua kali.

Acceptance criteria:

- Dua request bersamaan dengan `offline_id` sama menghasilkan hanya satu row `collections`.
- Response kedua tidak menjadi 500.
- Mobile menghapus item dari queue jika status `ALREADY_SYNCED`.

Manual test:

1. Kirim dua request `POST /mobile/collections` paralel dengan body dan `offline_id` yang sama.
2. Cek database: hanya satu row.
3. Cek response: satu sukses, satu duplicate/idempotent.

### P0.5 Blokir Permanent Delete Kaleng Yang Punya Riwayat Koleksi

Masalah:

- `apps/backend/src/routes/admin/cans.ts` mengizinkan permanent delete kaleng.
- Jika kaleng sudah punya transaksi, delete berisiko merusak relasi historis/audit atau membuat data laporan tidak konsisten.

File terdampak:

- `apps/backend/src/routes/admin/cans.ts`
- Cek juga bulk delete cans di file yang sama.

Langkah implementasi:

1. Untuk `DELETE /cans/:id?permanent=true`, cek apakah kaleng punya `collectionCount > 0` atau ada row di `collections`.
2. Jika ada riwayat, tolak permanent delete dengan 409 `HAS_COLLECTION_HISTORY`.
3. Untuk bulk permanent delete, filter/tolak kaleng yang punya history. Lebih aman: tolak seluruh request dengan daftar ID bermasalah.
4. Soft delete (`isActive=false`) tetap boleh.

Acceptance criteria:

- Kaleng tanpa transaksi bisa permanent delete sesuai role.
- Kaleng dengan transaksi tidak bisa permanent delete.
- Response memberi pesan jelas agar user memakai nonaktifkan kaleng.

## P1 — Performa, Konsistensi Kontrak, Dan Stabilitas

### P1.1 Refactor Report Summary/Dashboard Ke SQL Aggregation

Masalah:

- `apps/backend/src/routes/bendahara.ts` endpoint `/reports/summary` memanggil `getCollectionsList({ limit: 10000 })`, lalu agregasi di JavaScript.
- `apps/backend/src/services/reportService.ts` `getDashboardData()` juga menarik collection bulan berjalan dan menghitung total/by district/by officer di Node.js.
- Ini bukan data integrity bug, tetapi production scalability risk.

File terdampak:

- `apps/backend/src/routes/bendahara.ts`
- `apps/backend/src/services/reportService.ts`

Langkah implementasi:

1. Buat helper query agregasi Drizzle untuk:
   - total amount dan count;
   - by district;
   - by branch;
   - by officer.
2. Gunakan `SUM`, `COUNT`, `GROUP BY`, join ke `cans`, `branches`, `districts`, `officers/users`.
3. Hindari `inArray()` dengan ribuan `canIds`; gunakan join/subquery untuk scope branch/district.
4. Pastikan filter `syncStatus = COMPLETED` dan latest collection condition tetap dipakai.
5. Untuk recent transactions, tetap boleh query terbatas `limit 10`.

Acceptance criteria:

- Summary tidak lagi bergantung pada `limit: 10000`.
- Total tidak salah ketika transaksi lebih dari 10.000.
- Response shape tetap kompatibel dengan web/dashboard.

### P1.2 Sinkronkan `packages/shared-types`

Masalah:

- `Task` belum punya `can_id`.
- `Collection` belum punya `submit_sequence` dan `alasan_resubmit`.
- `Collection` punya field yang tidak ada di schema seperti `notes` dan `whatsapp_sent`; evaluasi apakah benar dipakai sebagai computed API field atau harus dihapus.
- `OfflineCollection` dan mobile `QueuedCollection` duplikatif.

File terdampak:

- `packages/shared-types/src/index.ts`
- Semua consumer di `apps/mobile` dan `apps/web`.

Langkah implementasi:

1. Tambahkan field yang memang dikirim/dibutuhkan:
   - `Task.can_id: string`
   - `Collection.submit_sequence?: number`
   - `Collection.alasan_resubmit?: string | null`
2. Audit `notes` dan `whatsapp_sent`:
   - Jika tidak ada response API yang mengirim, hapus dari shared type.
   - Jika itu computed UI field, beri nama jelas dan pastikan backend mengirim.
3. Pertimbangkan mengganti `OfflineCollection` agar sejalan dengan `QueuedCollection`, atau export satu tipe shared untuk queue payload.
4. Jalankan typecheck/build shared dan cek consumer.

Acceptance criteria:

- Shared types mencerminkan API contract aktual.
- Tidak ada penggunaan `any` hanya karena shared type kurang field.
- Mobile compile dengan `task.can_id`.

### P1.3 Perbaiki Mapping `dukuh` Saat Create Kaleng

Masalah:

- `apps/backend/src/routes/admin/cans.ts` mengisi `dukuh` dari `owner_address`.
- Ini membuat data wilayah salah dan bisa mengacaukan label QR/laporan.

File terdampak:

- `apps/backend/src/routes/admin/cans.ts`
- Schema request di `apps/backend/src/routes/admin/schemas.ts` jika field `dukuh` belum ada.
- Web form create/edit kaleng jika mengirim field dukuh.

Langkah implementasi:

1. Cari schema create can dan form web terkait.
2. Jika sudah ada `dukuh_id`, gunakan relasi `dukuhId`; field legacy `dukuh` bisa null/kosong atau diisi nama dukuh hanya jika request memang menyediakan.
3. Jangan isi `dukuh` dari alamat.
4. Pastikan bulk create juga konsisten.

Acceptance criteria:

- `dukuh` tidak lagi berisi alamat.
- QR label memakai `dukuhDetails.name` atau field wilayah yang benar.

### P1.4 Perbaiki Return Value Sync Store Mobile

Masalah:

- `apps/mobile/src/stores/useSyncStore.ts` `triggerSync()` selalu return `{ success: 1, failed: 0 }` walau sync gagal/0 item.
- Ini dapat membuat UI menampilkan hasil sync yang menyesatkan.

File terdampak:

- `apps/mobile/src/stores/useSyncStore.ts`
- `apps/mobile/src/services/offline/sync.ts`
- Screen yang memanggil `triggerSync`.

Langkah implementasi:

1. Gunakan return dari `syncService.autoSync()` untuk mengisi jumlah sukses.
2. Jika `autoSync()` gagal, return failed berdasarkan pending queue atau minimal `{ success: 0, failed: 1 }` dengan error jelas.
3. Pastikan `pendingCount` dan `permanentFailedCount` refresh setelah sync.

Acceptance criteria:

- UI tidak melaporkan "1 berhasil" saat tidak ada data atau sync gagal.
- Error sync tampil jelas.

### P1.5 Konsolidasikan Retry Logic `syncService.autoSync`

Masalah:

- Retry memakai rekursi terbatas (`MAX_RETRIES = 3`). Ini bukan infinite loop, tetapi lebih mudah dirawat jika dibuat iteratif.
- Logic retry tersebar di branch response `success=false` dan `catch`.

File terdampak:

- `apps/mobile/src/services/offline/sync.ts`

Langkah implementasi:

1. Ubah rekursi menjadi loop `for`/`while` dengan attempt counter.
2. Satukan path retry untuk response gagal dan exception.
3. Pastikan offline/no network langsung return tanpa retry panjang.
4. Jangan menghapus item queue kecuali status item `COMPLETED` atau `ALREADY_SYNCED`.

Acceptance criteria:

- Maksimal retry tetap 3.
- Tidak ada nested recursive call.
- Behavior `permanentFailures` tetap sama.

## P2 — Optimasi Lanjutan Dan Cleanup

### P2.1 Optimasi Assignment Generator

Masalah:

- `apps/backend/src/services/assignmentGenerator.ts` memakai `any[]`.
- Round-robin menghitung index dengan `.filter()` dalam loop sehingga O(N²).
- `findCansWithoutAssignment()` menarik assigned can IDs ke array lalu pakai `notInArray`.

File terdampak:

- `apps/backend/src/services/assignmentGenerator.ts`
- `apps/backend/src/routes/scheduler.ts`

Langkah implementasi:

1. Definisikan tipe lokal untuk can dengan branch/officers relation.
2. Definisikan tipe assignment insert berdasarkan Drizzle `$inferInsert`.
3. Ganti round-robin dengan `Map<branchId, number>` counter per branch.
4. Untuk skala besar, pertimbangkan query subquery `NOT EXISTS` atau batching.

Acceptance criteria:

- Tidak ada `any[]` untuk assignment data utama.
- Round-robin O(N).
- Behavior assignment per branch tetap sama.

### P2.2 Bulk Assignment `/assignments/bulk-branch`

Masalah:

- `apps/backend/src/routes/admin/assignments.ts` menarik semua active cans ke memori lalu insert array.
- Risiko memory pressure untuk data besar.

Langkah implementasi:

1. Untuk jumlah kecil/menengah, batching cukup.
2. Untuk solusi ideal, gunakan insert-from-select SQL atau query subquery yang mengecualikan assignment existing periode berjalan.
3. Pastikan unique constraint `can_officer_period_unq` tidak cukup mencegah can assigned ke officer berbeda pada bulan sama; bila business rule adalah satu can satu assignment per bulan, cek constraint/schema perlu dievaluasi terpisah.

Acceptance criteria:

- Endpoint tidak perlu load seluruh branch besar sekaligus.
- Tidak membuat assignment duplikat untuk periode yang sama.

### P2.3 Response Scheduler Konsisten

Masalah:

- `apps/backend/src/routes/scheduler.ts` masih memakai `reply.send()` manual di beberapa endpoint.

Langkah implementasi:

1. Gunakan `sendSuccess()`, `sendError()`, `sendInternalError()` untuk konsistensi.
2. Bungkus delete+insert `calculate-summaries` dalam transaksi agar summary lama tidak hilang jika insert gagal.

Acceptance criteria:

- Response scheduler konsisten dengan endpoint lain.
- Recalculate summary atomic.

### P2.4 `NEXT_PUBLIC_API_URL` Production Guard

Masalah:

- `apps/web/src/lib/api.ts` fallback ke `http://localhost:3001`.
- Aman untuk dev, berbahaya jika production lupa env.

Langkah implementasi:

1. Jika `NODE_ENV === 'production'` dan `NEXT_PUBLIC_API_URL` kosong, throw error saat init.
2. Pertahankan fallback localhost hanya untuk development.

Acceptance criteria:

- Production build/runtime gagal cepat jika API URL belum diset.
- Development tetap mudah dijalankan.

### P2.5 QR PDF Bulk Background Job

Masalah:

- `apps/backend/src/routes/admin/cans.ts` `bulk-generate-qr` memproses PDF sinkron untuk banyak kaleng.

Langkah implementasi:

1. Pertimbangkan BullMQ background job untuk batch besar.
2. Untuk sekarang, bisa tambahkan batas maksimal IDs per request dan pesan error jelas.

Acceptance criteria:

- Endpoint tidak timeout/OOM untuk batch besar.

## Temuan Yang Jangan Dieksekusi Mentah-Mentah

- Jangan menambahkan `sequence_pengajuan` atau `alasan_revisi`. Nama aktual adalah `submit_sequence` dan `alasan_resubmit`.
- Jangan menganggap update `cans.totalCollected = totalCollected + diff` otomatis race bug. SQL increment tersebut atomic. Tetap boleh audit transaction isolation, tetapi ini bukan P0.
- Jangan menyebut mobile sync retry sebagai infinite recursion. Ada `MAX_RETRIES = 3`; refactor iteratif adalah maintainability improvement.
- Jangan menghapus field shared-types tanpa mengecek apakah field itu computed API response. Audit consumer dulu.
- Jangan membuat ulang struktur auth/QR dari nol. Repo sudah punya implementasi; lakukan patch terarah.

## Urutan Eksekusi Disarankan

1. P0.1 `Task.can_id` end-to-end.
2. P0.2 `/auth/refresh` active-user validation.
3. P0.3 QR scan scope protection.
4. P0.4 `offline_id` idempotency.
5. P0.5 block permanent delete cans with collection history.
6. P1.2 shared-types sync cleanup.
7. P1.1 report summary/dashboard SQL aggregation.
8. P1.3 dukuh mapping.
9. P1.4 sync return value.
10. P1.5 iterative sync retry.
11. P2 cleanup/optimization items.

## Test Plan Minimum

Shared:

```bash
pnpm build:shared
```

Backend:

```bash
pnpm build:backend
pnpm --filter lazisnu-backend test
```

Web:

```bash
pnpm build:web
pnpm --filter web lint
```

Mobile:

```bash
pnpm --filter lazisnu-collector-app lint
```

Jalankan command yang tersedia di repo. Jika nama package berbeda, cek `package.json` root dan package masing-masing.

Manual regression checklist:

- Login valid/invalid.
- Refresh token user aktif sukses.
- Refresh token user nonaktif gagal.
- Logout lalu refresh token lama gagal.
- `/mobile/tasks` mengembalikan `id` assignment dan `can_id` kaleng.
- Submit collection dari mobile sukses dengan `can_id` benar.
- Submit duplicate `offline_id` tidak membuat row ganda.
- Scan QR milik petugas sukses.
- Scan QR luar assignment tidak membocorkan data owner.
- Permanent delete kaleng dengan riwayat koleksi ditolak.
- Report summary tetap benar untuk data > 10.000 row secara konsep/query.

## Learning Checkpoint Untuk Developer Pemula

Konsep yang dipakai:

- **API Contract**: `packages/shared-types` harus mencerminkan data yang benar-benar dikirim backend dan dipakai mobile/web.
- **Semantic ID**: sama-sama string bukan berarti sama makna. `assignment_id` dan `can_id` harus dipisah eksplisit.
- **Idempotency**: request offline bisa terkirim lebih dari sekali. `offline_id` harus membuat retry aman, bukan menggandakan transaksi.
- **Auth Freshness**: refresh token harus mengecek status user terkini, bukan hanya percaya isi JWT lama.
- **Database Aggregation**: laporan besar sebaiknya dihitung dengan SQL `SUM/COUNT/GROUP BY`, bukan loop JavaScript.
- **Immutable Ledger**: transaksi finansial jangan diubah langsung; koreksi memakai insert versi baru.

Latihan kecil:

1. Tambahkan `can_id` ke `Task`, lalu jalankan typecheck/lint untuk melihat file mana saja yang terkena dampak.
2. Bandingkan `Collection` di `shared-types` dengan schema `collections` di backend. Tandai field yang hilang dan field yang berlebih.
3. Buat dua request dengan `offline_id` sama dan amati kenapa unique constraint di database adalah "penjaga terakhir" untuk idempotency.
