# Audit Fondasi CI/CD — Lazisnu

Tanggal audit: 31 Agustus 2026
Repo: `bagus01darmawan-wq/lazisnu`
Cakupan: 4 workflow (ci, release, security, g4-trial-build) + `scripts/deploy-blue-green.sh`
+ 30 run CI terakhir + konfigurasi repo (branch protection, environment, secret)

---

## Kesimpulan singkat

**Desain pipa: dewasa. Fondasi pengaman: belum kokoh.**

Arsitektur pipa ini jauh di atas rata-rata proyek sekelasnya — path filtering, gerbang mutu
terpisah, tes integration dengan database dan Redis sungguhan, rilis fail-closed dengan
verifikasi SHA-256, dan deploy blue-green. Ini bukan pipa hasil asal jadi.

Tetapi ada **tiga lubang yang membuat warna hijau tidak bisa dipercaya**:
rollback otomatis yang tidak mungkin jalan, cabang `main` yang tidak dilindungi, dan
pemindaian keamanan yang hasilnya sengaja dibuang.

> Analogi sederhana: pipa ini seperti mobil dengan mesin bagus, rem bagus, dan sabun
> kaca bagus — tapi kantung udaranya diam-diam sudah dicabut, pintunya tidak bisa
> dikunci, dan lampu peringatan di dashboard disolder supaya tidak pernah menyala.

---

## Data empiris

| Metrik | Nilai |
|---|---|
| Run CI 30 terakhir | 26 sukses, 4 gagal (86,7%) |
| Tren 12 run terakhir | 11 sukses, 1 gagal |
| Run rilis (release.yml) | 13 sukses, 1 gagal |
| Run keamanan (security.yml) | 10 terakhir seluruhnya sukses |
| Kerentanan dependensi | **154** (5 critical, 87 high, 53 moderate, 9 low) |
| Branch protection `main` | **Tidak ada** |
| Protection rules environment | **Kosong** (Production, staging, Preview) |

Yang menggembirakan: kegagalan yang terjadi (28 Agu, tiga run beruntun) tertahan di job
`Verify (lint · format · typecheck)`. Artinya gerbang mutu **bekerja** — kode yang tidak
rapi memang tidak lolos. Itu fondasi yang benar.

---

## Yang sudah kokoh (pertahankan)

1. **Path filtering** (`changes`) — mengubah kode mobile tidak memicu build image backend/web.
   Hemat menit runner secara nyata.
2. **Gerbang mutu terpisah** (`verify`) — lint, format, typecheck, dan cek migration orphans
   berjalan sebelum tes. Gagal cepat, sumber error jelas.
3. **Tes backend dengan service asli** — Postgres 16 dan Redis 7 berjalan sebagai container,
   bukan tiruan. Tes integration seperti ini jauh lebih bisa dipercaya.
4. **Rilis APK fail-closed** — tiga gate beruntun: gate per-ABI (tepat 1 APK, ABI eksak,
   ukuran terkalibrasi) → gate agregat (ketiganya wajib lengkap) → verifikasi SHA-256 dan
   ukuran antara APK lokal dan URL publik R2. Baru setelah itu `ci.yml` di-dispatch.
   Satu saja gagal, produksi tetap versi lama. Ini desain yang sangat baik.
5. **Blue-green deploy** — smoke test di warna baru sebelum nginx dialihkan.
6. **Higienis pipeline** — `timeout-minutes` di semua job, `concurrency` group,
   `permissions` least-privilege, secret SSH di level environment bukan level repo.
7. **Kontrak antar-workflow terdokumentasi** di header `ci.yml`.

---

## Temuan kritis

### 1. Rollback otomatis mustahil berjalan — SEVERITAS TERTINGGI

`ci.yml` baris 425 menjalankan deploy dengan `AUTO_TEARDOWN=1`. Akibatnya warna lama
dihancurkan segera setelah deploy dinyatakan sukses.

Bukti dari log deploy produksi terakhir (run 33348805795, 31 Agu 01:58):

```
Active (nginx) : green
  blue-backend (3001) : DOWN
  green-backend (3101) : HEALTHY
```

Warna lama (`blue`) sudah tidak ada. Padahal di baris 433–443, `ci.yml` memanggil
`deploy-blue-green.sh rollback` bila health check publik gagal. Skrip itu (baris 299–304)
akan menolak:

```
warn "blue tidak berjalan, tidak bisa rollback"
exit 1
```

Lalu `|| true` di `ci.yml` menelan kegagalan tersebut, dan `exit 1` mengakhiri job.

**Dampak:** jaring pengaman mati tepat pada skenario yang paling membutuhkannya —
kegagalan yang baru terlihat *setelah* lalu lintas dialihkan (masalah nginx, TLS, DNS,
cold start). Produksi ditinggalkan melayani versi rusak tanpa pemulihan otomatis,
dan perbaikan harus manual.

**Perbaikan** (pilih salah satu):
- Hapus `AUTO_TEARDOWN=1` dan biarkan warna lama hidup sampai batas waktu tertentu; atau
- Pindahkan teardown ke setelah health check publik lolos; atau
- Simpan tag image sebelumnya agar rollback bisa melakukan deploy ulang, bukan sekadar
  ganti warna.

### 2. Cabang `main` tidak dilindungi

`gh api .../branches/main/protection` → `Branch not protected` (HTTP 404).

Tidak ada required status check, tidak ada larangan force-push. Seluruh pipa saat ini
bersifat **informatif, bukan penghalang**. Siapa pun bisa mendorong langsung ke `main`,
dan hasil CI bisa diabaikan begitu saja.

**Perbaikan:** aktifkan branch protection untuk `main`, wajibkan status check
`Verify`, `Test backend`, `Test web`, `Test mobile`, dan larang force-push.

### 3. 154 kerentanan disembunyikan oleh `|| true`

`security.yml` baris 83:

```yaml
run: pnpm audit --audit-level moderate || true
```

Hasil audit terakhir: **154 kerentanan — 5 critical, 87 high**. Job tetap hijau, sehingga
workflow keamanan melaporkan sukses tanpa memberi sinyal apa pun.

Yang paling perlu perhatian, 3 dari 5 critical ada di `fast-jwt` — dan semuanya
menyangkut **bypass autentikasi**:

| Paket | Masalah |
|---|---|
| fast-jwt | JWT Algorithm Confusion via RSA public key berawalan spasi |
| fast-jwt | Cache Confusion — tabrakan cacheKeyBuilder mengembalikan klaim dari token lain (tertukar identitas/otorisasi) |
| fast-jwt | Bypass autentikasi JWT karena secret HMAC kosong diterima async key resolver |
| websocket-driver | Korupsi pesan via penyalahgunaan header panjang protokol |
| tar / node-tar | DoS saat dekompresi via input tak terbatas |

Ini aplikasi yang memproses uang infaq. Celah bypass autentikasi bukan masalah teoretis.

**Catatan jujur:** angka 154 mencakup seluruh monorepo termasuk `devDependencies`, jadi
tidak semuanya ikut ter-deploy ke produksi. Tetapi 5 critical tetap wajib ditriase satu
per satu — jangan langsung ditutup dengan alasan "dev only" tanpa dicek.

### 3a. Hasil triase `fast-jwt` — ketiganya TIDAK bisa dieksploitasi (dicek 31 Agu 2026)

Setelah ditelusuri, posisi `fast-jwt` ternyata **sentral**: `lazisnu-backend` →
`@fastify/jwt@8.0.1` → `fast-jwt@4.0.5`. Ia dipakai langsung di jalur autentikasi produksi
(`app.ts:47` mendaftarkan plugin, `middleware/auth.ts:106` menandatangani token).
Ini bukan dependensi numpang.

Namun ketiga critical tersebut **mensyaratkan konfigurasi yang tidak dipakai Lazisnu**:

| CVE | Skor | Syarat eksploitasi | Konfigurasi Lazisnu | Berlaku? |
|---|---|---|---|---|
| CVE-2026-34950 — Algorithm Confusion via RSA public key berawalan spasi | 9.1 | RS256 + kunci publik berawalan spasi + tanpa `algorithms` eksplisit | HS256, secret string statis, tanpa kunci RSA | **Tidak** |
| CVE-2026-35039 — Cache Confusion via `cacheKeyBuilder` | 9.1 | caching aktif **dan** `cacheKeyBuilder` kustom yang bertabrakan | tidak ada opsi `cache` sama sekali | **Tidak** |
| CVE-2026-44351 — Secret HMAC kosong via async key resolver | 9.1 | resolver bertipe fungsi yang mengembalikan `''` | resolver selalu mengembalikan secret tervalidasi ≥32 karakter | **Tidak** |

Penjelasan baris terakhir: `@fastify/jwt` memang membungkus secret statis dalam callback,
tetapi callback itu selalu mengembalikan `config.JWT_ACCESS_SECRET`, yang divalidasi
`z.string().min(32)` di `config/env.ts` dan ditegakkan dengan `process.exit(1)` saat boot.
Jadi secret kosong mustahil terjadi.

**Kesimpulan: tidak ada darurat.** Tetap layak diperbarui, bukan karena sedang terbuka,
melainkan karena **rapuh** — keamanannya bergantung pada detail konfigurasi. Tiga
perubahan yang tampak sepele akan langsung menghidupkannya:

- pindah ke RS256 / JWKS dengan kunci publik → CVE-2026-34950 hidup;
- mengaktifkan caching dengan `cacheKeyBuilder` kustom → CVE-2026-35039 hidup;
- mengubah resolver menjadi pencarian kunci dengan fallback `|| ''` → CVE-2026-44351 hidup.

**Pengerasan murah yang tersedia sekarang.** Tambahkan `verify: { algorithms: ['HS256'] }`
pada pendaftaran plugin di `app.ts:47`. Ini menetralisir seluruh kelas algorithm-confusion
tanpa peduli versi. Sudah diuji langsung pada `fast-jwt@4.0.5`: nama opsi yang **dipakai**
adalah `algorithms` (token HS384 ditolak saat hanya HS256 diizinkan); `allowedAlgorithms`
justru diabaikan — jadi jangan salah menulis.

**Biaya upgrade sebenarnya.** Menambal butuh `fast-jwt ≥ 6.2.0`, yang hanya tersedia lewat
`@fastify/jwt ≥ 10` (versi 9 masih memakai `fast-jwt ^5`, belum ditambal). Sementara
Fastify di repo ini masih `^4.27.0`, dan `@fastify/jwt@10` membutuhkan `fastify-plugin ^6`.
Jadi upgrade aman = lompat dua mayor sambil mempertimbangkan migrasi Fastify 4 → 5.
Lakukan terencana beserta pengujian, bukan terburu-buru.

**Perbaikan:** triase 5 critical lebih dulu, lalu hapus `|| true`. Sebagai langkah antara
bisa dipakai `--audit-level critical` tanpa `|| true` supaya hanya temuan terparah yang
menggagalkan build.

---

## Temuan penting

### 4. Tidak ada langkah migrasi database di jalur deploy

Pencarian kata `migrate` di seluruh jalur deploy produksi dan staging: **nol hasil**.

- `ci.yml` menjalankan `db:migrate` — tetapi hanya di database *test* (baris 203).
- `docker-compose.prod.yml` / `docker-compose.staging.yml`: tidak ada.
- `deploy-blue-green.sh`: tidak ada.
- `apps/backend/Dockerfile`: folder migrasi ikut di-`COPY`, tetapi `CMD` hanya
  `node apps/backend/dist/index.js`.
- `src/database/manual_migrate.ts` diberi label "emergency/dev-only".

Artinya perubahan skema produksi diterapkan **manual lewat SSH** — satu-satunya langkah
manual di tengah pipa yang serba otomatis. Tanpa jejak audit, tanpa pencatatan, dan kalau
terlupa, aplikasi melayani kode baru di atas skema lama.

**Perbaikan:** tambahkan job/jalur migrasi sebelum lalu lintas dialihkan (mis. init
container sekali jalan), atau jadikan migrasi langkah eksplisit di `deploy-blue-green.sh`.

### 5. Environment Production tanpa pengaman

Ketiga environment (`Production`, `staging`, `Preview`) memiliki `protection_rules: []`
dan `can_admins_bypass: true`. Tidak ada required reviewer, tidak ada wait timer, tidak
ada pembatasan cabang.

Karena `release.yml` memicu pada `push: tags: ["v*"]`, siapa pun yang bisa mendorong tag
bisa merilis ke produksi tanpa persetujuan siapa pun.

**Perbaikan:** tambahkan required reviewers di environment `Production` dan deployment
branch policy yang membatasi hanya tag `v*`.

### 6. Verifikasi pasca-deploy terlalu dangkal

Health check hanya dua `curl`: `/health/ready` dan `/api/health` yang mengembalikan
`{"status":"ok"}`. Tidak ada pengujian alur kritikal — login, pencatatan transaksi,
pembacaan dashboard.

Tes web juga masih tipis: 3 file (`ui-components.test.tsx`, `audit-log-formatters.test.ts`,
`formatters.test.ts`), semuanya unit test. Belum ada tes alur bisnis, belum ada E2E.

Sebuah aplikasi bisa lulus semua tes ini sementara halaman utamanya menampilkan error.

---

## Kebersihan (prioritas rendah)

7. `g4-trial-build.yml` masih ada, padahal komentarnya sendiri berbunyi "HAPUS file ini
   setelah konfirmasi resmi via EAS". Eksperimen split-ABI sudah permanen di `release.yml`,
   jadi berkas ini sudah tidak berguna.
8. Secret `EAS_ACCESS_TOKEN` masih tersimpan meski build sudah pindah dari EAS ke Gradle.
   Secret mati = permukaan serangan tanpa manfaat.
9. Deploy menjalankan `git stash push` lalu `git checkout -f $IMAGE_TAG` di VM. Tidak ada
   verifikasi bahwa kode di VM benar-benar berada di tag yang diminta.

---

## Sistem peringatan dini (temuan tambahan, 31 Agu 2026)

### 10. Alarm pemindaian dibungkam, penolong belum dipanggil

Dua masalah terpisah yang bersama-sama membuat 154 temuan tak pernah muncul ke permukaan.

**Alarmnya dibungkam.** `security.yml` baris 83 diakhiri `|| true`, sehingga job pemindaian
mingguan tidak pernah bisa gagal. Log tetap mencatat "154 vulnerabilities found", tetapi
dasbor selalu hijau. Ini **lebih berbahaya daripada tidak punya pemindai**, karena
menghasilkan tanda aman palsu.

**Penolongnya belum dipanggil.** Tiga pengaturan GitHub berikut semuanya **nonaktif**:

| Pengaturan | Keadaan | Fungsi kalau diaktifkan |
|---|---|---|
| Dependabot vulnerability alerts | Nonaktif (HTTP 404) | Mengirim email + menampilkan peringatan di tab Security saat ada advisori baru |
| Automated security fixes | Nonaktif (`enabled: false`) | Membuka PR berisi perbaikan secara otomatis |
| Secret scanning | Nonaktif | Mendeteksi kredensial yang tak sengaja ikut ter-commit |

Secret scanning layak mendapat perhatian khusus: repo ini menyimpan kredensial database,
secret JWT, dan kunci R2. Saat ini tidak ada yang akan tahu bila salah satunya bocor.

### 11. Dependabot hanya memantau GitHub Actions

`.github/dependabot.yml` saat ini hanya berisi satu entri:

```yaml
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
```

Itu sebabnya PR seperti "bump gradle/actions from 4 to 6" bermunculan, sementara 154
temuan di dependensi npm sama sekali tidak terpantau.

**Catatan penting — dependabot.yml bersifat opsional untuk keamanan.** Dependabot *alerts*
dan *security updates* bekerja dari **dependency graph**, yang dibaca otomatis dari
`pnpm-lock.yaml`; keduanya **tidak** bergantung pada `dependabot.yml`. Jadi mengaktifkan
kedua pengaturan di atas sudah cukup untuk mendapat penolong. Entri `dependabot.yml`
hanya mengatur *version updates* — peningkatan versi rutin, urusan yang berbeda.

---

## Rekomendasi lengkap

### R1. Aktifkan penolong (pengaturan repo) — paling penting

Lakukan di **Settings → Code security and analysis**. Tidak perlu mengubah kode:

1. **Dependabot alerts** → Enable. Anda akan menerima email saat ada celah baru.
2. **Dependabot security updates** → Enable. Dependabot membuka PR perbaikan otomatis.
3. **Secret scanning** → Enable. Repo ini menyimpan kredensial database, JWT, dan R2.

Ini yang menjawab pertanyaan mendasar: *untuk apa alarm berteriak kalau tidak ada yang
datang?* Dependabot datang bukan sekadar berteriak, tetapi membawa perbaikan.

**Yang perlu Anda sadari:** ini berarti email dari GitHub akan mulai masuk, dan PR
perbaikan akan muncul otomatis. Itu pekerjaan baru yang nyata. Membiarkannya mati dengan
sadar adalah keputusan yang sah — asal diambil dengan tahu, bukan karena tidak pernah
 melihat sakelarnya.

### R2. Jangan cabut `|| true` dulu — ada masalah dasar

Kalau `|| true` dicabut hari ini, pipa langsung merah dan akan terus merah, karena 154
temuan sudah menumpuk. Pipa yang merah permanen lalu diabaikan sama buruknya dengan
pipa yang dibungkam.

Urutan yang benar: **bersihkan dasarnya dulu, baru kunci gerbangnya.** Kabar baiknya,
sebagian sudah selesai — 5 critical selesai ditriase dan **nol yang bisa dieksploitasi**
(lihat bagian 3a). Yang tersisa untuk ditelusuri bertahap adalah 87 temuan tingkat tinggi.

Setelah dasar bersih, baru ganti menjadi:

```yaml
run: pnpm audit --audit-level critical
```

### R3. Tambahkan ekosistem npm ke dependabot.yml — dengan satu kejelasan penting

**Pertanyaan yang sering muncul: proyek ini memakai pnpm, mengapa nilainya `npm`?**

Jawabannya: dalam `dependabot.yml`, nilai yang dipakai adalah **"YAML value"**, bukan nama
package manager-nya. Tabel resmi GitHub menyatakan:

| Package manager | Nilai `package-ecosystem` yang dipakai |
|---|---|
| npm | `npm` |
| **pnpm** | **`npm`** |
| yarn | `npm` |

**Tidak ada nilai `"pnpm"`.** Menulis `package-ecosystem: "pnpm"` akan ditolak. Jadi `npm`
memang benar untuk proyek pnpm — penamaannya yang membingungkan, bukan nilainya.

Karena ini **monorepo** (`pnpm-workspace.yaml` berisi `apps/*` dan `packages/*`), wajib
memakai `directories` **bentuk jamak**, karena `directory` tunggal tidak mendukung pola
glob. Berikut konfigurasi yang siap ditempel ke `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"

  # package-ecosystem "npm" juga berlaku untuk pnpm — tidak ada nilai "pnpm".
  # Monorepo wajib memakai `directories` (jamak), bukan `directory` (tunggal).
  - package-ecosystem: "npm"
    directories:
      - "/"                    # package.json + pnpm-lock.yaml induk
      - "/apps/backend"
      - "/apps/web"
      - "/packages/shared-types"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      npm-monorepo:
        group-by: "dependency-name"
```

Tiga hal yang perlu dipahami dari konfigurasi ini:

- **`apps/mobile` sengaja tidak dicantumkan.** Peningkatan versi React Native terkenal
  mudah memecahkan build native, jadi sebaiknya dikerjakan manusia. Tetapi ini **tidak**
  membuat mobile kehilangan pemantauan keamanan: `pnpm-lock.yaml` di root memuat seluruh
  dependensi semua workspace, sehingga Dependabot alerts tetap mencakup mobile.
- **`group-by: dependency-name`** menggabungkan pembaruan dependensi yang sama lintas
  direktori menjadi satu PR, bukan satu PR per direktori. Tanpa ini, monorepo akan
  menghasilkan banjir PR.
- **`open-pull-requests-limit: 5`** membatasi antrean agar tidak menumpuk.

Konfigurasi di atas hanya mengatur *version updates*. **Alerts dan security fixes tetap
berjalan dari pengaturan repo (R1), bukan dari berkas ini.**

### R4. Pengerasan autentikasi satu baris

`apps/backend/src/app.ts` baris 47, tambahkan pembatasan algoritma:

```js
await server.register(jwt, {
  secret: config.JWT_ACCESS_SECRET,
  sign: { expiresIn: config.JWT_EXPIRES_IN },
  verify: { algorithms: ['HS256'] },   // tambahkan ini
});
```

Ini menetralisir seluruh kelas algorithm-confusion tanpa peduli versi `fast-jwt`.
Sudah diuji langsung pada `fast-jwt@4.0.5`: nama opsi yang **dipakai** adalah `algorithms`;
`allowedAlgorithms` justru **diabaikan tanpa peringatan** — jadi jangan tertukar, karena
kalau salah tulis pengamanan itu diam-diam tidak berfungsi.

### R5. Urutan perbaikan yang disarankan

Disusun ulang setelah triase: `fast-jwt` turun dari urutan pertama karena **tidak ada
keadaan darurat** — posisinya digantikan oleh dua hal yang menentukan apakah insiden
pulih dengan sendirinya.

| Urutan | Tindakan | Alasan |
|---|---|---|
| 1 | Aktifkan Dependabot alerts + security updates + secret scanning (R1) | Menghadirkan penolong; tanpa ini temuan baru tetap tak terlihat |
| 2 | Perbaiki agar rollback benar-benar bisa jalan | Menentukan apakah insiden pulih sendiri atau harus dibetulkan manual |
| 3 | Aktifkan branch protection di `main` | Mengubah CI dari sekadar informasi menjadi penghalang |
| 4 | Tambahkan pengerasan `algorithms: ['HS256']` (R4) | Satu baris, menutup satu kelas celah selamanya |
| 5 | Tambahkan migrasi database ke jalur deploy | Mencegah kode baru berjalan di atas skema lama |
| 6 | Tambahkan required reviewer di environment Production | Mencegah rilis ke produksi tanpa persetujuan |
| 7 | Tambahkan entri npm ke `dependabot.yml` (R3) | Opsional — pembaruan versi rutin, bukan keamanan |
| 8 | Triase 87 temuan tingkat tinggi, lalu cabut `\|\| true` (R2) | Baru setelah dasar bersih, gerbang boleh dikunci |
| 9 | Perluas smoke test pasca-deploy ke alur kritikal | Menangkap kerusakan yang tak terlihat dari `/health` |
| 10 | Bersihkan `g4-trial-build.yml` dan secret `EAS_ACCESS_TOKEN` | Kebersihan |

### R6. Yang perlu diputuskan sendiri

- **Umur token refresh 365 hari.** Token akses 15 menit sudah baik. Token refresh setahun
  bisa jadi pilihan yang disengaja untuk petugas lapangan agar tidak perlu login ulang,
  tetapi perlu disadari: kalau ponsel petugas hilang, aksesnya tidak benar-benar mati
  sampai hampir setahun kecuali ada mekanisme pencabutan token.
- **Migrasi Fastify 4 → 5.** Ini prasyarat menambal `fast-jwt` secara bersih. Butuh
  perencanaan, bukan keputusan hari ini.

---

## Cara memverifikasi perbaikan

**Rollback.** Uji dengan sengaja menyebabkan health check publik gagal (misalnya dengan
mematikan backend di warna baru sesaat sebelum pemeriksaan). Rollback yang sehat akan
mengembalikan lalu lintas ke warna lama dan job berakhir gagal, bukan meninggalkan
produksi rusak. Pipa yang tidak pernah diuji kegagalannya sama dengan pipa tanpa
jaring pengaman.

**Pengerasan JWT.** Setelah menambahkan `algorithms: ['HS256']`, buat token bertanda tangan
HS384 lalu kirim ke endpoint yang dilindungi. Permintaan harus ditolak. Kalau masih
diterima, berarti opsi salah tulis.

**Dependabot.** Setelah diaktifkan, buka tab **Security → Dependabot alerts**. Dalam
beberapa jam seharusnya muncul daftar temuan. Kalau tetap kosong, berarti
`pnpm-lock.yaml` belum terbaca — periksa apakah dependency graph aktif di pengaturan repo.

---

## Status eksekusi (malam 31 Agu 2026)

### Sudah dikerjakan lewat berkas (belum di-commit — lihat catatan di bawah)

| Butir | Perubahan |
|---|---|
| R4 | `verify: { algorithms: ['HS256'] }` di `app.ts`. Diuji: 88 tes lolos; token HS384 **ditolak**, HS256 diterima. |
| Rollback | `ci.yml` memakai `KEEP_OLD_COLOR=1`; warna lama dibongkar hanya **setelah** verifikasi publik lolos, lewat perintah baru `teardown` yang **menolak membongkar warna live**. `|| true` pada pemanggilan rollback dicabut — kalau rollback ikut gagal, log berteriak jelas. |
| Smoke test | Verifikasi pasca-deploy kini: isi `status:"ready"` (bukan sekadar 200), kesehatan web, **`/v1/auth/me` harus 401** (kalau 500 berarti verifikasi JWT rusak), dan kode di VM harus persis commit yang diminta. |
| R3 | Entri `npm` di `dependabot.yml` (dengan `directories` jamak, tanpa `apps/mobile`). |
| Migrasi DB | `migrate-cli.ts` baru (jalan di dalam image, tanpa drizzle-kit) + perintah `migrate` di skrip deploy + langkah sebelum nginx diswitch. **Sengaja nonaktif (RUN_MIGRATIONS=0)** — lihat alasannya di skrip. |
| Bersih-bersih | `g4-trial-build.yml` dihapus; secret `EAS_ACCESS_TOKEN` dihapus. |

### Sudah dipasang lewat API GitHub (langsung aktif)

- **R1 lengkap:** Dependabot alerts, Dependabot security updates, secret scanning, **dan push protection** (push berisi rahasia akan ditolak).
- **Branch protection `main`:** pemeriksaan wajib = **`CI status`**, force-push & hapus branch diblokir. `enforce_admins` dimatikan, jadi Anda sebagai pemilik tetap bisa push langsung seperti biasa — aturan ini mengikat kontributor lain, bukan Anda.
- **Environment Production:** wajib persetujuan (required reviewer) sebelum deploy jalan.

### Koreksi terhadap rekomendasi semula (R5 butir 3)

Saran awal menyebut mewajibkan empat job: Verify, Test backend, Test web, Test mobile.
**Itu keliru dan akan mengunci semua PR selamanya** — keempat job itu sering dilewati
oleh penyaringan path, dan job yang dilewati tidak pernah melaporkan status "sukses".
Yang benar: wajibkan **`CI status`** saja — job agregat yang selalu berjalan dan hanya
gagal bila ada job yang benar-benar gagal.

### Temuan BARU (paling serius dari seluruh audit) — 12. `.env.staging` bocor di repo PUBLIK

Ditemukan saat mengaktifkan secret scanning: **`apps/backend/.env.staging` terlacak
git di repo publik** dan berisi kredensial nyata: `DATABASE_URL`/`DIRECT_URL`, tiga
secret JWT, `WA_ACCESS_TOKEN`, kunci R2 (yang sama dengan secret backup), `INTERNAL_API_KEY`,
`APP_SECRET`. `.gitignore` hanya menangkap berkas berakhiran `.env`, sehingga berkas
ini lolos sejak commit `570fc9e`.

**Sudah ditangani sebagian:** berkas dilepas dari pelacakan git (`git rm --cached`,
berkas di disk tetap ada untuk deploy) dan `.gitignore` diperluas.

**Belum selesai — hanya Anda yang bisa:** kredensial itu tetap tersimpan di riwayat git
yang bisa dibaca siapa pun. **Wajib rotasi:** password database (Supabase), ketiga
secret JWT, token WhatsApp, access key + secret R2, `INTERNAL_API_KEY`, `APP_SECRET`.
Rotasi adalah satu-satunya perbaikan yang benar; menghapus riwayat hanya kosmetik.
(`.env.test` juga terlacak, tetapi isinya nilai uji — risiko rendah.)

### Masih tersisa (butuh kerja terpisah, tidak dikerjakan malam ini)

- **R2:** triase 87 temuan tingkat tinggi, baru cabut `|| true` di `security.yml`.
- **Rekonsiliasi jurnal migrasi** (tandai migrasi yang sudah diterapkan di produksi),
  setelah itu `RUN_MIGRATIONS=1` boleh dipakai.
- **Rotasi kredensial** di atas.

> **Catatan commit:** semua perubahan berkas di atas masih di working tree, belum
> di-commit/dorong. Saran: commit sekarang, lalu rilis berikutnya akan memakai
> alur rollback yang baru.
