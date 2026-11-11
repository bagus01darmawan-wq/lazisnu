# Rencana Perbaikan Dependabot: `minimatch` GHSA-g3hv-75wg-m249

Tanggal: 11 November 2026
Repo: `bagus01darmawan-wq/lazisnu`
Status: **SELESAI — commit `43768c8` sudah dipush; CI dan Security lulus; alert #237 sudah fixed.**

## Ringkasan

Dependabot alert [#237](https://github.com/bagus01darmawan-wq/lazisnu/security/dependabot/237) melaporkan kerentanan tingkat **moderate** pada paket npm `minimatch`, advisory [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) / CVE-2026-118764.

Rentang yang terdampak adalah `>=7.0.0` dan `<11.0.1`. Versi pertama yang ditandai sudah diperbaiki adalah `11.0.1`. Masalahnya berupa potensi *denial of service*: pola glob yang dikendalikan penyerang dapat memperbesar pekerjaan pemrosesan sehingga menggunakan CPU atau memori secara berlebihan. Advisory menjelaskan kondisi teknisnya pada `optimizationLevel >= 2`.

Alert berstatus terbuka, bertipe dependensi transitive, berada di `pnpm-lock.yaml`, dan ditandai memiliki scope runtime. Artinya paket tersebut masuk melalui paket lain; bukan dependensi aplikasi yang dipanggil langsung oleh kode Lazisnu.

## Temuan pada lockfile lokal

Pemeriksaan dilakukan dengan `pnpm -r why minimatch` dan pencarian di `pnpm-lock.yaml` pada branch staging.

- `minimatch@10.2.6` berada pada jalur runtime backend melalui `@fastify/swagger-ui@6.1.1` → `@fastify/static@10.1.3` → `glob@13.0.6`.
- `minimatch@9.0.9` juga terlihat pada pohon dependensi runtime yang berujung pada `firebase-admin@14.5.0`, melalui `glob@10.5.0`.
- Salinan lain yang perlu ditinjau mencakup `9.0.7`, `10.2.5`, dan `10.2.6` pada tooling atau dependensi pengembangan.
- `minimatch@3.1.5` dan `5.1.8` berada di bawah versi awal rentang advisory (`7.0.0`), sehingga tidak termasuk kerentanan spesifik ini.
- Workspace sudah memiliki override untuk `minimatch@5` dan override tersarang `@typescript-eslint/typescript-estree>minimatch` ke `9.0.7`. Override tersebut perlu ditinjau; versi `9.0.7` berada dalam rentang advisory.

Backend mensyaratkan Node.js `>=22`. Metadata npm untuk `minimatch@11.0.1` mencantumkan dukungan Node `18`, `20`, dan `>=22`, sehingga batas engine backend memenuhi syarat. Namun, versi perbaikan merupakan major baru terhadap salinan 9.x dan 10.x. Kecocokan dengan paket induk tetap harus diperiksa sebelum override diterapkan.

## Rencana pelaksanaan

1. **Periksa ulang alert dan cabang yang terdampak.** Pastikan alert #237 masih terbuka dan periksa status `pnpm-lock.yaml` pada branch default serta `staging`. Alert GitHub yang disebut pada pemeriksaan ini dilaporkan pada branch default.

2. **Petakan semua salinan rentan.** Jalankan `pnpm -r why minimatch`, baca entri terkait pada `pnpm-lock.yaml`, dan tandai setiap versi `>=7.0.0` sampai `<11.0.1` menurut jalur runtime atau pengembangan. Periksa apakah dependensi baru di branch sudah mengubah pohon yang dilihat Dependabot.

3. **Periksa paket induk dan batas versinya.** Lihat rilis paket induk yang tersedia, rentang versi `minimatch` yang dimintanya, perubahan kompatibilitas, serta dukungan Node.js. Utamakan pembaruan paket induk yang secara resmi menerima versi minimatch yang telah diperbaiki.

4. **Pilih perbaikan paling sempit yang aman.** Jika pembaruan paket induk belum menyediakan versi aman, pertimbangkan override `pnpm` yang terbatas pada jalur rentan. Jangan langsung memaksa semua versi `minimatch` menjadi 11.x: salinan 3.x dan 5.x berada di luar advisory ini, sedangkan konsumen 9.x atau 10.x mungkin memiliki batas major atau perilaku API yang harus diuji. Tinjau dan perbarui override tersarang yang masih mematok `9.0.7` bila jalur tersebut perlu ditangani.

5. **Regenerasi lockfile melalui package manager.** Ubah versi paket induk atau override pada berkas konfigurasi yang semestinya, lalu jalankan instalasi pnpm untuk menghasilkan lockfile. Jangan mengedit nomor versi langsung di lockfile tanpa memperbarui deklarasi dependensinya.

6. **Buktikan semua jalur sudah aman.** Jalankan kembali `pnpm -r why minimatch` dan audit dependensi. Untuk jalur runtime, pastikan tidak tersisa versi `>=7.0.0` dan `<11.0.1`. Pastikan versi `minimatch@11.0.1` atau versi aman berikutnya dapat dipasang tanpa konflik.

7. **Periksa kompatibilitas backend.** Jalankan typecheck dan build backend serta test yang relevan untuk dependensi runtime dan dokumentasi API. Tinjau hasil lockfile dan perubahan paket induk sebelum commit.

8. **Commit dan push ke `staging`.** Catat versi paket induk/override yang diubah, semua jalur runtime yang ditutup, dan hasil pemeriksaan.

9. **Promosikan melalui alur repo.** Push ke `staging` saja tidak menjamin alert #237 tertutup, karena GitHub mengaitkan alert ini dengan branch default. Setelah perubahan ditinjau dan lolos CI, gabungkan perbaikan ke branch default melalui proses repo, lalu periksa ulang status alert.

## Kriteria selesai

- Semua salinan runtime `minimatch` yang tercakup advisory sudah di versi aman.
- Tidak ada override major lintas versi tanpa alasan kompatibilitas yang terdokumentasi.
- `pnpm-lock.yaml` konsisten dengan deklarasi dependensi dan audit tidak melaporkan GHSA ini untuk runtime.
- Typecheck, build, dan test yang relevan lulus.
- Perbaikan tersedia di branch default dan alert #237 berstatus tertutup atau diperbaiki.

## Hasil pelaksanaan

- Default branch GitHub dikonfirmasi `staging`; branch `main` bukan default. Jadi perbaikan akan dipush ke `staging` dan tidak memerlukan merge terpisah.
- `@fastify/swagger-ui` diperbarui dari `6.1.1` ke `6.1.3`. Jalur `@fastify/static` kini `10.1.10` dan memakai `glob@14.0.4` / `minimatch@11.0.7`.
- `@google-cloud/firestore` diperbarui dari `9.3.1` ke `9.4.1`, yang membawa `firestore-api@0.7.1`, `google-gax@6.17.0`, `google-auth-library@11.3.4`, dan `gaxios@8.3.2`; jalur runtime lama melalui `glob@10` hilang.
- Override terbatas membawa `glob@13` serta `test-exclude@7` ke `glob@14.0.4`, dan membawa dependensi minimatch langsung `test-exclude@7`, `@typescript-eslint/typescript-estree`, serta `@ts-morph/common` ke `minimatch@11.0.7`. Dua paket terakhir tidak mengimpor minimatch di kode terpasangnya. API `minimatch` dan `glob.sync` yang dipakai tooling diuji dengan pemeriksaan smoke.
- `pnpm -r why minimatch` kini hanya menampilkan `3.1.5` dan `11.0.7`; versi `3.1.5` berada di bawah rentang advisory. Audit tidak melaporkan GHSA ini.
- Basis audit diperbarui untuk membuang entri usang `GHSA-g3hv-75wg-m249` (minimatch) dan `GHSA-3g3m-2fjr-6pw4` (glob).
- Build backend lulus; lint web dan mobile lulus dengan peringatan yang sudah ada; gerbang `audit-baseline.mjs` lulus tanpa temuan baru.
- Tes Jest backend penuh di lingkungan lokal dicoba tetapi dihentikan setelah sejumlah tes integrasi gagal, termasuk karena PostgreSQL lokal di `localhost:5432` tidak tersedia. Runner GitHub kemudian menjalankan tes backend unit dan integrasi hingga selesai dengan status lulus.
- Commit `43768c8` dipush ke branch default `staging`. [CI run](https://github.com/bagus01darmawan-wq/lazisnu/actions/runs/42955622313) lulus, termasuk lint, typecheck, test backend/web/mobile, build image, dan deploy staging. Deploy production dilewati. [Security run](https://github.com/bagus01darmawan-wq/lazisnu/actions/runs/42955622253) juga lulus, termasuk audit pnpm dan CodeQL.
- Dependabot alert [#237](https://github.com/bagus01darmawan-wq/lazisnu/security/dependabot/237) berubah otomatis ke status **fixed** setelah push.
