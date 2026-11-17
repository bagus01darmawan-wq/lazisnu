# Rencana Pemulihan CI, Security, dan Deploy Staging

**Tanggal penyusunan:** 17 November 2026
**Status:** Rencana untuk ditinjau; belum dieksekusi.
**Basis pemeriksaan:** branch lokal `fix/offline-visit-history-2026-11-17` pada commit `4937889`, yang telah dipush langsung ke `origin/staging`.

## 1. Tujuan

Memulihkan pemeriksaan otomatis dan menyiapkan staging agar menerima perubahan secara aman, tanpa mengubah riwayat Git yang sudah dibagikan, tanpa menutupi kerentanan, dan tanpa menyatakan fitur berhasil sebelum versi yang benar benar-benar terpasang serta diverifikasi.

Rencana memisahkan tiga pekerjaan: perbaikan format mobile, penanganan advisory dependensi, dan verifikasi/deploy perubahan offline. Masing-masing memiliki bukti dan keputusan sendiri.

## 2. Kondisi awal yang sudah diketahui

| Aspek | Bukti dan status pada saat penyusunan |
|---|---|
| Git | Commit `4937889` dibuat pada branch perbaikan lalu dipush langsung ke `staging`; tidak melalui PR. Branch lokal tersebut tidak otomatis berarti branch itu sudah dipush ke remote. |
| CI | [Run 44009728542](https://github.com/bagus01darmawan-wq/lazisnu/actions/runs/44009728542) **gagal** pada Prettier mobile. Job tes, build image dan deploy staging **dilewati**. |
| Security | [Run 44009728522](https://github.com/bagus01darmawan-wq/lazisnu/actions/runs/44009728522): CodeQL sukses; `pnpm audit` gagal karena temuan baru moderate `next` GHSA-mfr8-8qww-v76h. Log menyebut versi tertambal `>=16.4.5`; verifikasi kembali advisory sebelum memilih versi. |
| Basis audit | Log juga menandai GHSA-gcqx-w48m-w2h4 `deepmerge` sebagai entri yang sudah tidak muncul. Ini bukan alasan untuk menyembunyikan temuan Next.js. |
| Versi repo | `apps/web/package.json` menyatakan `next: 16.4.1` dan `eslint-config-next: 16.3.8`; `pnpm-lock.yaml` mencatat versi yang sama. Periksa ulang sebelum implementasi. |
| Staging | API `/health/live` pernah menjawab sehat, tetapi itu **bukan bukti versi deploy**. Job deploy terakhir yang diketahui sukses berasal dari commit sebelumnya `8661fca`. Status nyata image, commit, dan migrasi tetap perlu diverifikasi read-only. |
| Kode offline | Tes lokal sebelumnya: 72 mobile dan 49 backend terarah dilaporkan lulus; tidak berarti seluruh CI atau pengujian HP staging lulus. Replay transaksi lama tanpa `offline_payload_hash` masih butuh penanganan aman. |

### Catatan tentang pemicu deploy

`.github/workflows/ci.yml` mendeteksi area berdasarkan diff per event. Push susulan yang **hanya** menyentuh `apps/mobile/**` dapat menjalankan pemeriksaan mobile tanpa membangun image backend/web atau men-deploy staging. Sebaliknya, perubahan `pnpm-lock.yaml`, web, backend atau infra dapat memicu build image dan deploy saat push/merge ke `staging`; `workflow_dispatch` pada ref `staging` juga dapat menjalankan seluruh area dan deploy. Cek lagi kondisi `if:` aktual sebelum setiap merge atau dispatch.

**CI dan Security adalah workflow terpisah.** Job deploy CI tidak secara otomatis menunggu hasil workflow Security yang terpisah. Maka hasil PR hijau saja, atau rencana memeriksa Security setelah merge, tidak cukup sebagai gerbang keamanan sebelum deploy otomatis. Pastikan proteksi branch/required checks atau proses persetujuan yang benar-benar efektif; jika itu tidak dapat dibuktikan, **jangan merge perubahan pemicu deploy dan minta keputusan pengguna tentang mekanisme gate yang aman**. Jangan mengubah workflow/proteksi secara diam-diam.

## 3. Prinsip keselamatan dan cakupan

1. Jangan `git push --force`, reset branch bersama, amend commit yang sudah dipush, atau menulis ulang riwayat `staging`.
2. Siapkan branch susulan dari `origin/staging` terbaru; bila ada commit baru, periksa dan sesuaikan rencana sebelum bekerja. Jangan mengasumsikan branch lama sudah remote atau perlu dibuat ulang.
3. Buka PR dengan `--base staging` secara eksplisit. Konfirmasi base/head dan isi PR, lalu tunggu verifikasi yang relevan sebelum merge.
4. Jangan `|| true`, menonaktifkan pemeriksaan, mematikan migration/auth probe, atau memperbarui basis audit sekadar membuat lampu hijau. Pengakuan risiko sementara hanya dengan bukti, pemilik, batas waktu dan persetujuan eksplisit.
5. Uji yang menulis data hanya pada database tes terisolasi. Database staging/produksi tidak dipakai untuk tes integrasi lokal. Uji HP yang menciptakan transaksi staging memerlukan persetujuan khusus: data audit/keuangan dapat permanen.
6. Jangan merilis APK/OTA atau mengubah produksi hanya karena backend staging ter-deploy. Tinjau status APK staging dan minta persetujuan jika suatu langkah berdampak pada perangkat atau data uji.
7. Jangan menganggap versi yang sudah commit sama dengan versi running: buktikan image/ref, migrasi, health dan fungsi sesuai cakupan. Jangan menampilkan kredensial atau isi file `.env` di log/dokumen.
8. Catat bukti dan keterbatasan setiap tahap; jika ada kegagalan baru, hentikan jalur deploy dan selidiki, bukan ulang otomatis tanpa diagnosis.

## 4. Tahap A — Memastikan status Git dan lingkungan

**Tujuan:** mengetahui versi yang ada di Git, CI dan staging sebelum memperbaiki.

1. Periksa `git status --short --branch`, `git log -3 --oneline`, `git fetch origin` dan `git rev-list --left-right --count HEAD...origin/staging`; simpan SHA hasilnya. Jangan menimpa perubahan lokal baru milik pengguna.
2. Periksa run terbaru dengan `gh run list --branch staging --limit 10` dan `gh run view <id> --json status,conclusion,headSha,jobs,url`. Catat hasil aktual, bukan hanya status historis pada dokumen ini.
3. Secara read-only, periksa identitas image/container staging dan versi commit bila tersedia, riwayat migrasi `0022`–`0024`, dan health. Gunakan akses read-only yang sah; tidak mencetak rahasia. Jika versi tidak bisa diidentifikasi secara meyakinkan, tulis **belum diketahui**, jangan menyimpulkan dari health.
4. Periksa perubahan `4937889` untuk migrasi dan keterkaitan backend/mobile; siapkan daftar item yang harus diuji setelah deploy. Tinjau kembali risiko transaksi lama tanpa `offline_payload_hash`: jangan otomatis menandainya sukses hanya karena nominal cocok.

**Selesai bila:** SHA dan status CI/deploy/schema yang dapat dibuktikan dicatat; sisanya dinyatakan belum diketahui. Tidak ada perubahan data staging.

## 5. Tahap B — PR format mobile

**Berkas dari log CI:**

- `apps/mobile/__tests__/screens/CollectionScreen.test.tsx`
- `apps/mobile/__tests__/services/offlineCorrections.test.ts`
- `apps/mobile/src/screens/CollectionScreen.tsx`
- `apps/mobile/src/screens/TasksScreen.tsx`
- `apps/mobile/src/services/offline/actionQueue.ts`
- `apps/mobile/src/stores/useCollectionStore.ts`

1. Buat branch susulan dari SHA `origin/staging` yang baru diverifikasi, misalnya `fix/ci-format-mobile-2026-11-17`.
2. Jalankan Prettier **hanya** pada keenam file tersebut. Periksa diff bahwa perubahan benar-benar format, tidak mengubah logika atau memformat seluruh monorepo.
3. Jalankan format check mobile yang sama dengan CI, lint/typecheck dan tes terarah yang terkena dampak; catat perintah, exit code dan warning. Hindari `pnpm run … -- <flag>` jika meneruskan `--` secara salah di Windows; gunakan `pnpm --filter lazisnu-collector-app exec prettier ...` sesuai sintaks sebenarnya.
4. `git diff --check`, stage hanya file format, tinjau `git diff --cached --name-status`, commit dan push branch. Buka PR ke `staging`, konfirmasi base dan cek statusnya.
5. Sebelum merge, periksa apakah PR hanya mengubah mobile dan apa yang akan dipicu sesudah merge. **Lulus PR format tidak membuktikan backend/migrasi dari `4937889` teruji atau ter-deploy.**

**Selesai bila:** keenam file lolos pemeriksaan format dan PR mempunyai hasil pemeriksaan yang relevan; tiap job yang skip dicatat sebagai skip. Jangan menyatakan deploy berhasil dari PR ini.

## 6. Tahap C — Audit dan PR dependensi terpisah

**Tujuan:** tangani advisory Next.js secara nyata, dengan lockfile konsisten dan tanpa perubahan dependensi tersembunyi.

1. Baca advisory GHSA-mfr8-8qww-v76h dari sumber resmi: dampak, konfigurasi yang terpengaruh, rentang terdampak dan versi fix. Catat tanggal, tautan dan kesimpulan; jangan menganggap layanan pasti tereksploitasi atau tidak terdampak hanya dari tingkat severity.
2. Inventaris semua manifest/import dan dependensi transitif seluruh workspace (`apps`, `packages`, root, lockfile) untuk `next` dan `eslint-config-next`. Tentukan pasangan versi yang kompatibel dengan Next.js 16, Node, React dan konfigurasi proyek. `16.4.5` adalah batas dari log saat itu, **bukan otomatis versi final**; verifikasi patch terbaru/aman saat eksekusi.
3. Buat branch dependensi tersendiri dari `origin/staging` terbaru setelah koordinasi dengan PR format. Perbarui dependency langsung dengan upgrade normal; gunakan override hanya jika terbukti perlu. Selaraskan `eslint-config-next` bila hasil kompatibilitas mengharuskan, bukan otomatis tanpa bukti.
4. Perbarui `pnpm-lock.yaml` dengan pnpm versi yang dikunci proyek. Tinjau seluruh diff lockfile: jika resolver memperbarui banyak paket yang tidak terkait, berhenti, selidiki dan pisahkan/putuskan sebelum commit. Verifikasi `pnpm install --frozen-lockfile` pada lingkungan aman dan bahwa versi perbaikan benar-benar terpasang.
5. Jalankan lint, typecheck, tes dan build web; uji kompatibilitas lint/config, kemudian jalankan gerbang lint/test/build workspace yang terpengaruh dan build image yang dibutuhkan. Catat versi Node/pnpm dan exit code. Tes tidak boleh menyentuh database eksternal.
6. Jalankan audit aktual; bandingkan terhadap `security/audit-baseline.json`. Hapus entri `deepmerge` hanya jika terbukti sudah tidak muncul. Jangan menambahkan advisory Next.js ke baseline sebagai jalan pintas; jika patch tidak dapat dipasang, dokumentasikan risiko dan alternatif lalu minta persetujuan eksplisit.
7. Commit hanya perubahan dependensi/lockfile dan dokumentasi yang relevan; push branch dan buka PR terpisah ke `staging`. Pastikan dependency review, CodeQL dan audit yang relevan benar-benar berjalan: pada PR tanpa perubahan dependency sebagian audit memang bisa di-skip; jangan anggap skip sebagai lulus.

**Selesai bila:** temuan Next.js ditangani pada versi yang diverifikasi, lockfile konsisten, seluruh pemeriksaan relevan lulus dan sisa temuan dijelaskan. Jika patch mustahil, status tetap **terbuka/terblokir**, bukan hijau palsu.

## 7. Tahap D — Gerbang sebelum merge dan deploy

1. Pastikan PR format dan PR dependensi berbasis SHA terbaru dan tidak bertentangan. Review kode finansial/offline serta migrasi `0022`, `0023`, `0024`, khususnya kompatibilitas aplikasi lama dan urutan schema-sebelum-kode.
2. Verifikasi status **Security dan CI untuk SHA yang benar**, bukan hanya PR lama. Tentukan apakah pengaturan branch atau workflow saat itu benar-benar mencegah deploy ketika Security gagal; bila tidak, hentikan merge pemicu deploy hingga mekanisme aman disetujui dan diterapkan terpisah.
3. Tinjau workflow dan efek samping: job image menulis tag GHCR `backend:latest`, `web:latest`, dan `web:staging`; job staging dapat menjalankan migrasi pada database staging lalu restart container. Dispatch manual **bukan sekadar menjalankan tes**, dan tidak boleh dipicu hanya untuk mendapatkan tanda hijau tanpa memahami efeknya. Pastikan tidak menyentuh produksi.
4. Pastikan ada cadangan dan prosedur rollback yang valid sebelum migrasi; konfirmasi database yang dituju benar. Jangan memakai `skip_db_migrate` atau `skip_auth_probe` untuk melewati kegagalan tanpa keputusan darurat yang terdokumentasi. Bila belum ada bukti keselamatan migrasi, jangan deploy.
5. Pastikan seluruh cakupan dari `4937889` benar-benar ikut diverifikasi. Jika diff PR susulan menyebabkan filter melewatkan backend/web/migrasi, rencanakan run lengkap yang secara eksplisit mencakup seluruh area. Sebelum memilih `workflow_dispatch`, pahami bahwa dispatch pada `staging` dapat build image **dan deploy**; dapat digunakan hanya setelah gerbang dan izin deploy terpenuhi.
6. Setelah merge yang disetujui, pantau SHA, status CI, Security dan job deploy. Jika Security gagal atau deploy dilewati/gagal, laporkan tepat sebagaimana adanya; jangan menandai staging sudah terpasang.

## 8. Tahap E — Bukti pascadeploy dan mobile

1. Pastikan job Deploy staging sukses untuk SHA yang diharapkan; baca log langkah migrasi dan probe, lalu periksa versi image/ref dan riwayat migrasi secara read-only. Health `200` saja tidak cukup. Jika job sukses tetapi versi runtime tak dapat diverifikasi, tetap beri label **belum terbukti**.
2. Uji web/API dengan akun uji yang sah; jangan cetak token atau data pribadi. Validasi endpoint dan kondisi kesehatan, termasuk transaksi lama tanpa hash yang harus tetap diperlakukan konservatif.
3. Verifikasi apakah build APK staging benar-benar dibuat dan versi/commit apa yang terkandung; job `Build Staging APK` dan deploy backend adalah hal berbeda. Jangan menyebut perangkat diperbarui jika APK/OTA belum dipasang.
4. Sebelum membuat fixture staging untuk HP, minta persetujuan eksplisit atas akun/kaleng yang dipakai dan jelaskan bahwa catatan finansial/audit mungkin permanen. Tanpa izin itu, uji perangkat yang mutasi data tetap **tertunda**, bukan diam-diam dijalankan.
5. Pada fixture yang disetujui, uji alur penjemputan/koreksi dan kunjungan offline Kosong, Dikembalikan, Isi, reconnect, tombol kondisi dan konflik; bandingkan HP, hasil API/log, dan SELECT read-only. Catat versi APK, backend, waktu, hasil dan kondisi data; hindari menganggap tombol awan bersih sebagai bukti server benar.
6. Laporkan terpisah: commit di Git, CI, Security, image dan deploy, migrasi, APK terpasang, serta bukti uji HP. Jika salah satu belum terlaksana, tulis **belum diverifikasi**.

## 9. Pencegahan agar tidak berulang

- Default kerja: branch fitur/perbaikan → push branch → PR dengan base eksplisit → review + checks → merge; push langsung hanya bila pengguna meminta secara eksplisit **setelah** memahami bahwa itu dapat memicu deploy dan melewati PR.
- Sebelum commit/push: tampilkan branch, daftar file staged, target remote dan efek workflow. Periksa `git diff --cached --check`; stage file eksplisit kecuali pengguna benar-benar meminta seluruh worktree dan file sensitif sudah dikecualikan.
- Pisahkan PR logika finansial, perubahan dependensi dan format; pengecualian harus dijelaskan. Jalankan gerbang format yang sama dengan CI sebelum PR.
- Evaluasi perlindungan `staging` agar direct push dan merge tanpa checks/approval tidak terjadi secara tak sengaja. Perubahan ruleset, izin atau workflow adalah pekerjaan terpisah yang memerlukan tinjauan dan persetujuan, bukan bagian otomatis dari rencana ini.
- Periksa audit secara berkala dan kelola baseline sebagai inventaris risiko, bukan daftar pembenaran permanen.

## 10. Keputusan dan pekerjaan yang masih menunggu

- Izin untuk menerapkan rencana dan membuat PR: **menunggu persetujuan**.
- Versi Next.js pilihan akhir: **menunggu audit advisory dan kompatibilitas**.
- Mekanisme yang menjamin Security selesai sebelum deploy otomatis: **menunggu verifikasi proteksi/keputusan**.
- Pengujian mutasi di HP/staging: **memerlukan persetujuan fixture terpisah**.
- Penanganan replay lama tanpa hash: **belum selesai; jangan dinyatakan aman tanpa desain dan tes**.
