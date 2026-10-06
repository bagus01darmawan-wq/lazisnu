# Implementation-Ready Plan — Blocker dan Technical Debt Lazisnu

- Status: siap dieksekusi
- Tanggal: 2026-09-24
- Branch aktif saat audit: `feat/kondisi-submit-filter-2026-09-24`
- Scope: backend, web, mobile, shared-types, CI/CD, deployment, dokumentasi, dan repository hygiene
- Sumber audit: static review codebase dan hasil verifikasi lokal

## 1. Tujuan dan aturan eksekusi

Rencana ini mengubah hasil audit menjadi task yang dapat langsung dikerjakan. Setiap task harus:

1. memiliki owner dan dependency eksplisit;
2. mengubah source atau konfigurasi yang teridentifikasi;
3. menambahkan atau memperbarui test;
4. lulus verification command yang relevan;
5. tidak mencampur artefak sementara ke dalam commit.

Urutan eksekusi wajib:

```text
Baseline → Verification → Condition contract → Backend security → Mobile offline → Web → CI/CD → Documentation → Final verification
```

Tidak ada commit otomatis. Setiap fase harus direview dan diverifikasi sebelum fase berikutnya.

## 2. Baseline dan keputusan yang harus dikonfirmasi

### 2.1 Baseline working tree

Task:

- audit `git status --short` dan `git diff`;
- pisahkan perubahan fitur `condition` dari `tmp/`, `output/`, `.commandcode/`, log, PDF, payload API, dan runbook sementara;
- jangan menggunakan `git add -A`;
- tentukan file untracked yang memang harus disimpan;
- tambahkan ignore policy hanya setelah audit isi artifact.

File/area:

- `.gitignore`;
- `tmp/`;
- `output/`;
- `.commandcode/`;
- `artifacts/`;
- `docs/ci/`.

Acceptance:

- tidak ada secret, token, credential, atau payload API yang dapat masuk commit;
- daftar file yang akan di-commit tersedia dan disetujui;
- `git diff --check` lulus.

### 2.2 Keputusan kontrak kondisi

Pilih satu kontrak sebelum mengubah UI atau backend:

- Opsi A: mobile hanya boleh mengirim `AKTIF`, `RUSAK`, `HILANG`;
- Opsi B: mobile boleh mengirim `AKTIF`, `RUSAK`, `HILANG`, `NON_AKTIF`, `DIKEMBALIKAN`, dengan aturan bisnis dan otorisasi eksplisit.

Rekomendasi: Opsi A untuk submission petugas. Perubahan `NON_AKTIF` atau `DIKEMBALIKAN` harus melalui condition proposal/admin flow yang sudah ada.

Keputusan wajib dicatat di:

- shared-types contract;
- schema backend;
- test schema;
- dokumentasi API;
- test UI mobile.

## 3. Fase A — Menstabilkan verification

### A-01 Mobile typecheck

Problem:

- `pnpm --filter lazisnu-collector-app run typecheck` gagal dengan `TS2322`;
- `apps/mobile/src/services/offline/sync.ts:16` meneruskan `string` ke shared union kondisi.

File:

- `packages/shared-types/src/index.ts`;
- `apps/mobile/src/services/api.ts`;
- `apps/mobile/src/services/offline/queue.ts`;
- `apps/mobile/src/services/offline/sync.ts`;
- `apps/mobile/src/stores/useCollectionStore.ts`.

Langkah:

1. gunakan `CanCondition` atau shared request type pada API, queue, store, dan sync;
2. hapus cast ke `string` yang melemahkan tipe;
3. pastikan optional `condition` tetap konsisten di online dan offline path;
4. tambahkan type-level contract test atau compile fixture.

Acceptance:

```text
pnpm --filter lazisnu-collector-app run typecheck
```

harus exit `0`.

### A-02 Mobile formatting

Problem:

- `pnpm --filter lazisnu-collector-app run format:check` gagal pada `apps/mobile/scripts/icon-preview.mjs`.

Langkah:

1. format file tersebut dengan tool repository;
2. jalankan `format:check` untuk seluruh mobile workspace;
3. verify tidak ada file source lain yang berubah tanpa alasan.

Acceptance:

```text
pnpm --filter lazisnu-collector-app run format:check
```

harus exit `0`.

### A-03 Backend test command Windows

Problem:

- `test:unit` gagal karena quoting regex `src/(services|middleware|utils)/__tests__` ditafsirkan oleh shell Windows;
- command tersebut tidak boleh bocor ke integration test atau database mutation.

File:

- `apps/backend/package.json`;
- konfigurasi Jest bila diperlukan.

Langkah:

1. ganti command menjadi pola yang aman di PowerShell/cmd/CI Linux;
2. pastikan test unit benar-benar hanya memilih unit test;
3. tambahkan guard agar test database tidak ikut accidental;
4. jalankan dari cmd PowerShell dan runner Linux secara berurutan jika environment tersedia.

Acceptance:

- command backend unit tidak menghasilkan error shell;
- hanya unit test yang berjalan;
- exit code dan jumlah suite tercatat.

### A-04 Web test resource isolation

Problem:

- default Vitest sempat gagal karena fork worker timeout;
- single-worker berhasil menjalankan seluruh test.

File:

- `apps/web/package.json`;
- `apps/web/vitest.config.*` jika tersedia;
- konfigurasi test runner.

Langkah:

1. tentukan mode default yang stabil untuk repo;
2. batasi worker berdasarkan resource CI;
3. pertahankan mode lokal yang dapat diulang;
4. dokumentasikan command single-worker sebagai fallback, bukan satu-satunya proses yang diperbaiki.

Acceptance:

```text
pnpm --filter web test
```

lulus konsisten dan tidak menghasilkan worker timeout.

### A-05 Mobile test teardown

Problem:

- seluruh assertion mobile lulus, tetapi exit code `1` karena asynchronous animation/logging setelah Jest environment ditutup;
- output menunjukkan `ReferenceError` setelah environment teardown dan peringatan `act`.

File:

- `apps/mobile/jest.setup.js`;
- `apps/mobile/src/signature/signaturePng.ts`;
- test `apps/mobile/__tests__/screens/ProfileBerita acara.test.tsx` dan test screen terkait.

Langkah:

1. stop animation/timer saat component unmount atau test selesai;
2. flush/clear pending async task;
3. bungkus state update dengan `act` bila memang asynchronous;
4. tambahkan regression test untuk teardown;
5. pastikan tidak ada `console.error` setelah test selesai.

Acceptance:

- assertion lulus;
- exit code `0`;
- tidak ada post-teardown log atau unhandled rejection.

### A-06 Warning lint

Warning bukan failure, tetapi harus punya disposition.

Web:

- `apps/web/src/app/dashboard/wa-monitor/page.tsx:362`: `react-hooks/exhaustive-deps`; tambahkan dependency callback atau stabilkan callback tanpa membuat loop.

Mobile:

- perbaiki `if` tanpa braces;
- migrasikan `TouchableOpacity` ke `AppPressable` pada komponen baru/tercatat legacy;
- hapus unused variable;
- ganti `void` yang tidak diperlukan;
- dokumentasikan pengecualian bitwise pada algoritma `signaturePng.ts`, atau tambahkan rule override yang sempit dan teruji.

Acceptance:

- zero lint error;
- warning yang tersisa memiliki alasan teknis dan tidak berasal dari perubahan baru.

## 4. Fase B — Blocker fitur condition

### B-01 Kontrak shared-types

File:

- `packages/shared-types/src/index.ts`.

Langkah:

1. definisikan satu source of truth untuk kondisi collection;
2. gunakan tipe yang sama pada request online dan batch;
3. jangan memakai union string terpisah dari enum;
4. dokumentasikan optionality dan default no-op.

Acceptance:

- shared build lulus;
- tidak ada duplicate condition union yang dapat drift.

### B-02 UI mobile capture kondisi

File:

- `apps/mobile/src/screens/CollectionScreen.tsx`.

Langkah:

1. tampilkan kondisi saat ini dari task/can;
2. izinkan hanya kondisi yang disetujui kontrak;
3. kirim nilai pada `submitCollection`;
4. tampilkan error jika kondisi tidak tersedia atau tidak valid;
5. pastikan online dan offline memakai input yang sama.

Acceptance:

- pengguna dapat memilih kondisi;
- tidak ada call submit tanpa kondisi ketika kondisi diwajibkan;
- test UI menerima pilihan tersebut.

### B-03 Store, queue, dan sync

File:

- `apps/mobile/src/stores/useCollectionStore.ts`;
- `apps/mobile/src/services/offline/queue.ts`;
- `apps/mobile/src/services/offline/sync.ts`;
- `apps/mobile/src/services/api.ts`.

Langkah:

1. simpan `condition` dengan tipe shared;
2. pertahankan nilainya pada retry dan quarantine;
3. kirim pada batch payload;
4. jangan mengubah condition menjadi `undefined` saat fallback assignment;
5. validasi lagi sebelum enqueue dan sebelum sync.

Acceptance:

- test online dan offline mempertahankan condition;
- retry tidak menghapus nilai;
- batch payload sesuai shared contract.

### B-04 Backend validation dan transition

File:

- `apps/backend/src/routes/mobile/schemas.ts`;
- `apps/backend/src/routes/mobile/collections.ts`;
- `apps/backend/src/services/collectionSubmission.ts`;
- `apps/backend/src/services/conditionRules.ts`.

Langkah:

1. batasi schema sesuai keputusan Opsi A/B;
2. validasi transition terhadap current condition;
3. lakukan read, validation, update dalam transaksi;
4. lock row can atau gunakan conditional update berdasarkan expected condition;
5. hitung `isActive` dari final condition;
6. tolak request jika row berubah oleh request lain.

Acceptance:

- invalid transition menghasilkan 4xx;
- concurrent submit tidak dapat menghasilkan dua final condition berbeda;
- test transaction rollback lulus.

### B-05 Proposal dan audit integration

File:

- `apps/backend/src/services/conditionProposalService.ts`;
- `apps/backend/src/services/collectionSubmission.ts`;
- `apps/backend/src/services/auditLogService.ts`;
- `apps/backend/src/services/overviewService.ts`.

Langkah:

1. tentukan apakah submission kondisi membuat proposal atau menutup proposal pending;
2. tutup proposal pending yang sudah obsolete dalam transaksi yang sama;
3. buat audit dengan transaction-aware insert;
4. jangan menelan failure audit tanpa status yang terdokumentasi;
5. ensure overview membaca sumber kondisi yang konsisten.

Acceptance:

- tidak ada pending proposal yang menunjuk kondisi lama setelah kondisi berubah;
- audit dan perubahan data commit/rollback bersama;
- test concurrency dan rollback lulus.

### B-06 Test suite condition

Test baru:

- schema online dan batch;
- allowed/rejected transition;
- `isActive`;
- proposal lifecycle;
- audit success/failure;
- concurrent submit;
- queue persistence dan retry;
- UI → store → queue → batch.

## 5. Fase C — Backend security dan data integrity

### C-01 Dashboard bendahara scope

File:

- `apps/backend/src/routes/bendahara.ts`;
- `apps/backend/src/services/dashboardReportService.ts`.

Langkah:

1. ambil district/branch dari authenticated actor;
2. wajibkan branch untuk Admin Ranting dan district untuk Admin Kecamatan;
3. terapkan scope pada seluruh query;
4. tolak actor tanpa scope dengan 403;
5. tambah integration test dua district.

### C-02 QR authorization

File:

- `apps/backend/src/routes/admin/cans.ts`;
- `apps/backend/src/services/qrPdfService.ts`.

Langkah:

1. validasi ownership single QR;
2. validasi setiap item bulk QR;
3. jangan hanya membatasi role;
4. tolak seluruh batch jika ada item di luar scope atau fail dengan partial result yang eksplisit.

### C-03 Assignment validation

File:

- `apps/backend/src/routes/admin/assignments.ts`;
- `apps/backend/src/services/canService.ts`;
- database schema/index.

Langkah:

1. validasi can, officer, branch, dan district berada pada scope yang sama;
2. validasi primary dan backup officer;
3. terapkan validasi pada create, update, bulk, dan transfer;
4. tambahkan unique index untuk active assignment per can/periode bila diperlukan;
5. tambahkan test create lintas district dan transfer lintas wilayah.

### C-04 Hierarchy invariant

File:

- `apps/backend/src/routes/admin/officers.ts`;
- `apps/backend/src/services/canService.ts`;
- `apps/backend/src/database/schema.ts`.

Langkah:

1. validasi branch terhadap district actor;
2. validasi dukuh terhadap branch can;
3. gunakan transaction untuk insert user/officer/can;
4. tambahkan constraint atau service invariant;
5. buat migration jika schema change diperlukan.

### C-05 WA, audit, dan queue

File:

- `apps/backend/src/routes/admin/wa.ts`;
- `apps/backend/src/routes/admin/audit.ts`.

Langkah:

1. scope logs berdasarkan collection → can → branch → district;
2. scope failed jobs dan payload;
3. batasi retry/flush failed jobs;
4. audit WA memakai scope district/branch;
5. sanitasi data sensitif pada response;
6. test cross-tenant access.

### C-06 Idempotency collection

File:

- `apps/backend/src/database/schema.ts`;
- `apps/backend/src/routes/mobile/collections.ts`;
- `apps/backend/src/services/mobileSyncService.ts`.

Langkah:

1. ubah uniqueness dari global `offline_id` menjadi per officer atau schema crypto key;
2. query existing collection berdasarkan actor dan offline key;
3. validasi assignment/can pada retry;
4. kembalikan conflict bila key dipakai dengan payload berbeda;
5. tambahkan migration dan regression test lintas officer.

### C-07 Concurrent condition/proposal

File:

- `apps/backend/src/services/conditionProposalService.ts`;
- `apps/backend/src/database/schema.ts`.

Langkah:

1. tambahkan partial unique index untuk pending proposal;
2. lock proposal dan can;
3. update dengan predicate `status = PENDING`;
4. tolak approval jika tidak ada row yang di-update;
5. test dua approval paralel.

### C-08 Visit dan report boundary

File:

- `apps/backend/src/routes/mobile/tasks.ts`;
- `apps/backend/src/services/collectionReportService.ts`;
- `apps/backend/src/services/collectionQueryService.ts`.

Langkah:

1. jadikan visit, condition, dan assignment update satu transaksi;
2. validasi sebelum insert;
3. gunakan server timestamp atau toleransi waktu;
4. gunakan assignment period untuk laporan;
5. gunakan latest collection policy;
6. gunakan half-open date range.

## 6. Fase D — Mobile offline dan session safety

### D-01 Legacy queue migration

File:

- `apps/mobile/src/services/offline/queue.ts`.

Langkah:

1. migrasikan active dan failed legacy key;
2. validasi ownership legacy queue;
3. dedupe berdasarkan `offline_id`;
4. gunakan migration marker;
5. jangan tandai migration selesai sebelum semua key diproses;
6. test crash/retry migration.

### D-02 Cache namespace dan logout

File:

- `apps/mobile/src/stores/useAuthStore.ts`;
- `apps/mobile/src/stores/useDashboardStore.ts`;
- `apps/mobile/src/stores/useTasksStore.ts`;
- `apps/mobile/src/stores/useCollectionStore.ts`;
- `apps/mobile/src/services/offline/cache.ts`;
- `apps/mobile/src/services/offline/taskOrderCache.ts`.

Langkah:

1. namespace seluruh cache per user ID;
2. hapus cache global saat reset;
3. increment session epoch pada login/logout;
4. ignore response dari session lama;
5. abort request aktif;
6. test user A logout → user B login.

### D-03 Atomic sync lock

File:

- `apps/mobile/src/services/offline/sync.ts`.

Langkah:

1. claim lock sebelum `NetInfo.fetch()`;
2. gunakan shared single-flight promise;
3. pastikan `isSyncing` konsisten;
4. test dua autoSync paralel.

### D-04 Correction idempotency

File:

- `apps/mobile/src/services/offline/corrections.ts`;
- `apps/mobile/src/services/offline/sync.ts`;
- endpoint resubmit backend.

Langkah:

1. kirim correction ID sebagai idempotency key;
2. tambahkan unique constraint server;
3. gunakan expected sequence/version;
4. retry harus membedakan already-processed vs failed;
5. test response timeout lalu retry.

### D-05 Partial batch dan corrupt queue

File:

- `apps/mobile/src/services/offline/sync.ts`;
- `apps/mobile/src/services/offline/queue.ts`.

Langkah:

1. classify item tanpa result sebagai retryable unknown;
2. increment retry counter;
3. batasi retry;
4. validasi JSON dan schema item;
5. pindahkan record invalid ke quarantine;
6. test malformed JSON, non-array, dan missing field.

### D-06 Mobile authorization dan update security

File:

- `apps/mobile/src/navigation/AppNavigator.tsx`;
- privileged screens;
- `apps/mobile/src/services/updates/versionCheck.ts`;
- `apps/mobile/src/services/updates/apkDownload.ts`.

Langkah:

1. guard route privileged berdasarkan role;
2. tetap pertahankan backend authorization;
3. validasi APK URL, filename, package name, dan versionCode;
4. verifikasi SHA-256/signed manifest;
5. sanitasi nama file;
6. test role matrix dan checksum rejection.

## 7. Fase E — Web contract, UX, dan accessibility

### E-01 Assignment transfer

File:

- `apps/web/src/app/dashboard/assignments/page.tsx`.

Langkah:

1. ganti single transfer ke endpoint transfer;
2. gunakan endpoint transfer untuk bulk;
3. periksa response envelope `data`;
4. tampilkan partial failure;
5. refresh list hanya bila ada sukses;
6. tambahkan contract test.

### E-02 Filter periode

File:

- assignment page;
- `apps/web/src/app/dashboard/assignments/page.tsx`;
- backend assignment routes.

Langkah:

1. tentukan dukungan multi-bulan;
2. jika didukung, kirim dan validasi `months[]`;
3. jika tidak, ubah UI ke single month;
4. jangan menampilkan label periode yang tidak sama dengan query.

### E-03 Error vs zero/empty

File:

- `apps/web/src/app/dashboard/reports/page.tsx`;
- list pages yang mengonversi error menjadi array kosong.

Langkah:

1. representasikan `success`, `empty`, dan `error` secara terpisah;
2. jangan render zero saat request gagal;
3. tambahkan retry state;
4. server-side 401 harus memicu recovery/redirect yang benar;
5. test 401, 403, 500, empty, dan success.

### E-04 Navigation, filter, dan race

File:

- overview components;
- cans/users/assignments pages.

Langkah:

1. gunakan route detail yang benar;
2. inisialisasi filter dari URL;
3. sinkronkan state dengan back/forward;
4. debounce/cancel request lama;
5. gunakan request sequence guard;
6. test response lama selesai setelah response baru.

### E-05 Import CSV dan accessibility

File:

- `apps/web/src/app/dashboard/cans/page.tsx`;
- `apps/web/src/components/ui/Input.tsx`;
- `apps/web/src/components/ui/GlassSelect.tsx`.

Langkah:

1. validasi ukuran, MIME, header, dan jumlah baris;
2. gunakan parser CSV yang menangani quoted field;
3. tampilkan preview dan error per baris;
4. hubungkan label dengan input;
5. tambahkan `aria-invalid` dan `aria-describedby`;
6. implementasikan combobox/listbox semantics atau gunakan native select.

### E-06 Web auth hardening

File:

- login/refresh route handlers;
- `apps/web/src/lib/api.ts`;
- `apps/web/src/lib/auth.ts`;
- `apps/web/next.config.ts`.

Langkah:

1. gunakan access token in-memory atau BFF HttpOnly cookie;
2. hapus persistent JavaScript token jika memungkinkan;
3. tambah CSP, HSTS, frame policy, referrer policy, permissions policy;
4. perbaiki rate-limit key agar tidak memakai satu IP proxy untuk semua user;
5. tambahkan contract test refresh/logout.

## 8. Fase F — CI/CD, deployment, dan security

### F-01 Android sebagai required gate

File:

- `.github/workflows/ci.yml`.

Langkah:

1. masukkan Android production/staging build ke `ci-status`;
2. pastikan mobile-only PR tidak boleh hijau tanpa compile;
3. pin action ke immutable SHA;
4. tambahkan artifact/digest verification.

### F-02 Release workflow

File:

- `.github/workflows/release.yml`.

Langkah:

1. jalankan lint, typecheck, tests, security gate sebelum upload;
2. upload hanya setelah semua job hijau;
3. samakan versionName, versionCode, filename, dan metadata;
4. tambahkan checksum dan package verification;
5. hapus atau batasi manual version override.

### F-03 Deploy immutable dan rollback

File:

- `.github/workflows/ci.yml`;
- `.github/workflows/preview-staging.yml`;
- `scripts/deploy-blue-green.sh`;
- `docker-compose.blue-green.yml`.

Langkah:

1. deploy berdasarkan SHA/digest;
2. verifikasi provenance image;
3. migrasi DB tidak boleh dilewati diam-diam;
4. rollback API, web, dan worker sebagai satu unit;
5. gunakan expand–migrate–contract;
6. smoke test seluruh worker dan endpoint internal.

### F-04 Redis, Grafana, backup, SSH

File:

- `redis/redis.conf`;
- compose production/staging;
- `scripts/backup-kuma.sh`;
- `scripts/vm-migration-export.sh`;
- `scripts/fix-ssh.sh`.

Langkah:

1. pisahkan network production/staging;
2. aktifkan Redis AUTH/ACL;
3. hapus fallback password Grafana;
4. enkripsi backup export sebelum upload;
5. verify upload dan decryptability;
6. nonaktifkan root/password SSH;
7. jalankan `sshd -t` sebelum reload.

### F-05 Static dan image quality gate

Tambahkan job infrastructure:

- actionlint;
- shellcheck;
- `docker compose config` untuk semua variant;
- `nginx -t`;
- promtool config check;
- image vulnerability scan;
- SBOM.

## 9. Fase G — Documentation dan repository hygiene

### G-01 Readme dan runbook

File:

- `README.md`;
- `ARCHITECTURE.md`;
- `docs/DEPLOYMENT.md`;
- `docs/VM-STRUCTURE.md`.

Tugas:

1. selaraskan struktur `apps/*`;
2. selaraskan Node, pnpm, release flow, role, dan image repository;
3. tambahkan last verified commit/date;
4. tandai dokumen historis sebagai archive.

### G-02 Implementation tracker

File:

- `docs/implementation/README.md`;
- `docs/implementation/TASK-PENDING.md`;
- `docs/implementation/VERIFICATION-PENDING.md`.

Tugas:

1. pilih satu source of truth;
2. hapus status pending yang sudah selesai;
3. sinkronkan decisions log;
4. tambahkan link ke rencana technical debt ini.

### G-03 Shared validator

File:

- `scripts/validate-shared-types.ts`;
- `scripts/validate-shared-types.js`.

Tugas:

1. pilih satu validator AST-based;
2. hapus validator duplicate/stale;
3. jalankan di CI;
4. jangan menyimpan generated report lama sebagai bukti validasi.

### G-04 Governance

Tambahkan atau tetapkan:

- CODEOWNERS;
- CONTRIBUTING;
- security disclosure policy;
- LICENSE yang disetujui;
- template PR dan checklist verification.

## 10. Verification matrix

| Area | Command | Target |
|---|---|---|
| Shared | `pnpm build:shared` | exit 0 |
| Backend type | `pnpm --filter lazisnu-backend run lint` | exit 0 |
| Backend unit | script `test:unit` yang sudah diperbaiki | exit 0 |
| Backend integration | test dengan database/Redis test environment | seluruh lulus, tidak ada data production |
| Web lint | `pnpm --filter web run lint` | 0 error, warning disposition |
| Web type | `pnpm --filter web run typecheck` | exit 0 |
| Web test | `pnpm --filter web test` | exit 0 |
| Web build | `pnpm build:web` | exit 0 |
| Mobile lint | `pnpm --filter lazisnu-collector-app run lint` | 0 error |
| Mobile format | `pnpm --filter lazisnu-collector-app run format:check` | exit 0 |
| Mobile type | `pnpm --filter lazisnu-collector-app run typecheck` | exit 0 |
| Mobile test | `pnpm --filter lazisnu-collector-app test -- --runInBand` | exit 0 tanpa teardown error |
| Backend build | `pnpm build:backend` | exit 0 |
| Android | production/staging Gradle compile | exit 0 |
| Infra | lint/config/security checks | seluruh lulus |
| Diff | `git diff --check` | exit 0 |

## 11. Definition of Done

Fase dianggap selesai hanya jika:

- task memiliki source change dan test yang sesuai;
- test baru gagal sebelum fix dan lulus setelah fix jika bug sedang diperbaiki;
- tidak ada data production yang disentuh oleh test;
- tidak ada secret atau artefak sementara dalam staged diff;
- semua command verification relevan lulus;
- perubahan terdokumentasi;
- rollback plan tersedia untuk perubahan database, deployment, atau storage.

## 12. Rollback plan

- Database: gunakan expand–migrate–contract; jangan menghapus kolom/constraint pada release yang sama dengan deploy aplikasi.
- Backend: rollback image hanya jika migration tetap backward-compatible.
- Worker: hentikan consumer versi baru sebelum rollback traffic.
- Mobile: simpan release sebelumnya yang masih dapat membaca queue/schema lama sampai migration client terbukti stabil.
- Web: deploy previous immutable image/digest.
- CI: revert workflow commit dan verifikasi status gate sebelum release berikutnya.

## 13. Status awal hasil audit

| Item | Status awal |
|---|---|
| Mobile typecheck | gagal, deterministik |
| Mobile format check | gagal, deterministik |
| Mobile test assertion | lulus, tetapi exit code teardown `1` |
| Backend unit command | gagal karena quoting Windows |
| Web default test | timeout worker; single-worker lulus |
| Web lint | 0 error, 1 warning |
| Mobile lint | 0 error, 118 warning |
| Shared/backend/web build | lulus pada audit awal |
| Working tree | banyak artefak untracked; perlu higiene sebelum commit |
| Blocker condition | fitur belum end-to-end dan belum aman secara concurrency |
