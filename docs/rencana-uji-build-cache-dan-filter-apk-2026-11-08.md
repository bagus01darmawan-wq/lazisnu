# Rencana: Uji Gradle Build Cache & Perbaikan Filter Build APK

Tanggal: 8 November 2026
Repo: `bagus01darmawan-wq/lazisnu`
Status: **RENCANA SAJA — belum dilaksanakan.** Tidak ada perubahan kode, tidak ada build, tidak ada uji yang dijalankan. Menunggu keputusan Pion per bagian.
Diminta: Pion, 8 November 2026 — "tuliskan rencana uji coba build cache, tuliskan juga rencana untuk perbaikan filter sekalian".
Dasar: diagnosis durasi build APK 8 November 2026 (lihat §6 Sumber data).
Berkas yang **kelak** disentuh bila disetujui (bukan sekarang): `.github/workflows/ci.yml`, `apps/mobile/android/gradle.properties`.

---

## 0. Ringkasan untuk pembaca awam

Ada dua masalah yang berbeda dan sering tertukar:

1. **Satu build APK sekarang lebih lama** (4,8 → sekitar 11 menit). Penyebabnya sudah ketemu: upgrade React Native 0.88 / New Architecture pada 25 Oktober 2026. Ini bukan kerusakan, dan rencana A **tidak** akan mengembalikannya ke 4,8 menit.
2. **Build APK terlalu sering dipanggil**, termasuk untuk PR yang cuma mengganti nomor versi pustaka backend. Ini yang diperbaiki rencana B, dan dampaknya paling pasti.

Analogi dapur: rencana A mencoba menyimpan masakan supaya bisa dipanaskan lagi; rencana B memastikan dapur tidak menyala kalau tidak ada pesanan.

Keduanya **tidak** menurunkan versi React Native, tidak mematikan New Architecture, tidak mengubah isi APK.

---

## 1. Fakta hasil diagnosis (sudah diverifikasi)

| Fakta | Angka / bukti |
|---|---|
| Durasi job APK, 24 Okt (median 5 run) | 4,8 menit (debug & staging) |
| Durasi job APK, 6–8 Nov (median 8 run) | debug 12,2 menit; staging 10,9 menit |
| Lonjakan pertama | 27 Okt: 14,2 menit |
| Komit pemicu | `836dcc0` (25 Okt 2026) `upgrade react-native 0.74.1 -> 0.88.0 (new architecture)` |
| Langkah yang membengkak | `./gradlew assemble…`: 3m42s (24 Okt) → 8m6s (8 Nov), 10m51s (6 Nov) |
| Yang tidak berubah | `pnpm install` 0,2 menit; `setup-gradle` 0,3 → 0,9 menit |
| Cache pnpm | kena di run lama & baru (~324–355 MB) |
| Cache Gradle User Home | **kena** di 3 run yang dibaca: `Cache hit for restore-key: gradle-home-v2\|Linux-X64\|build-android-debug[…]`, ~6 MB |
| Task Gradle | 371 actionable / 371 executed (24 Okt) → 517 / 517 (6 & 8 Nov) |
| `FROM-CACHE` | **0** di ketiga run |
| `UP-TO-DATE` | 49 → 33; `SKIPPED` 4 → 19 |
| Codegen pustaka | `SKIPPED` (24 Okt) → jalan di banyak pustaka (8 Nov) |
| Baris native/C++ | 23 → 70 |
| Setelan baru | `newArchEnabled=true`, `hermesEnabled=true`, Gradle 9.4.1, compileSdk 37, NDK 27.1 |
| Filter `mobile` | `ci.yml:138-141` = `apps/mobile/**`, `packages/shared-types/**`, **`pnpm-lock.yaml`** |
| Dampak filter | 4 PR Dependabot (#185–#188, 6 Nov) yang cuma menyentuh `apps/backend/package.json` + `pnpm-lock.yaml` memicu **8 job APK**, sekitar 1,5 jam mesin build |
| Perbedaan debug vs staging | debug tanpa `-PabiFilter` → 2 ABI; staging `-PabiFilter=arm64-v8a` → 1 ABI (`app/build.gradle:97`) |

**Koreksi terbuka (dicatat terus terang):** pada diagnosis awal, poin "apakah cache Gradle miss" diragukan. Setelah log dibaca tuntas, cache dependensi Gradle ternyata **hidup**. Yang tidak aktif adalah **cache hasil kompilasi** — dan itu sudah tidak aktif sejak era build cepat. Jadi ini bukan penyebab lonjakan 2,5x.

---

## 2. Rencana A — Uji coba Gradle build cache

### 2.1 Tujuan
Mengukur apakah menyalakan Gradle build cache memangkas durasi `./gradlew` **tanpa** mengubah kualitas atau isi APK. Hasil "tidak ada penghematan" pun sah dan harus dicatat.

### 2.2 Mengapa layak dicoba, dan batasnya
`apps/mobile/android/gradle.properties` (49 baris) **tidak memuat** `org.gradle.caching=true`; `ci.yml` tidak memakai `--build-cache`. Akibatnya `FROM-CACHE: 0` dan 517/517 task dieksekusi ulang tiap run. `gradle/actions/setup-gradle@v6` sudah memakai `cache-provider: enhanced` dengan `gradle-home-cache-includes: caches`, jadi direktori `~/.gradle/caches` (tempat local build cache) berada dalam jangkauan cache yang disimpan — **uji pertama tidak perlu mengubah workflow**.

Batas penting: karena `FROM-CACHE: 0` juga terjadi pada run 24 Okt yang cepat, **rencana A bukan solusi atas kelambatan 2,5x**. Ini peluang penghematan terpisah.

### 2.3 Perubahan yang diusulkan (satu variabel)
Tambah **satu baris** di `apps/mobile/android/gradle.properties`:

```
org.gradle.caching=true
```

`org.gradle.parallel=true` (baris 18, saat ini masih komentar) **tidak** dinyalakan pada uji pertama. Kalau nanti dicoba, itu uji terpisah supaya hasilnya bisa diatribusi.

### 2.4 Cara uji tanpa mengganggu `staging`
1. Buat cabang uji dari `staging`, terapkan hanya 1 baris di atas.
2. Dorong cabang itu; biarkan GitHub Actions yang menjalankan build. **Tidak ada build di PC Pion.**
3. Bila perlu memaksa, pakai `workflow_dispatch` pada **cabang uji** (bukan `staging`). Catatan: pada ref `staging`, langkah filter path tetap dihitung; pada ref lain filter dilewati sehingga semua area dipaksa berubah dan job APK pasti jalan.
4. Jangan merge ke `staging` sebelum kriteria §2.6 terpenuhi.

### 2.5 Cara mengukur (metrik identik dengan baseline)
Untuk minimal **3 run uji**, ambil dari API `GET /repos/.../actions/runs/{id}/jobs` dan log job:

- durasi langkah `Build Android Debug APK` dan `Build Staging APK (arm64-v8a)` dari `steps[]`;
- baris `BUILD SUCCESSFUL in …`;
- ringkasan `N actionable tasks: X executed, Y from cache, Z up-to-date`;
- jumlah penanda `FROM-CACHE`, `UP-TO-DATE`, `SKIPPED`;
- durasi `Run gradle/actions/setup-gradle@v6` **dan** `Post Run …` (restore + save cache) — cache yang membengkak bisa jadi biaya baru;
- ukuran entry cache Gradle (`Cache Size`) sebelum vs sesudah.

Bandingkan **median**, bukan satu run. Baseline: 8m6s / 10m51s, 517/517 executed, `FROM-CACHE: 0`, setup-gradle 0,9 menit.

### 2.6 Kriteria lulus / gagal (ditetapkan sebelum uji)
**Lulus** bila semua terpenuhi:

- median durasi `./gradlew` turun **≥ 20%**;
- `FROM-CACHE > 0`;
- tidak ada job yang gagal;
- waktu restore + save cache naik **< 1 menit**.

**Gagal / kembalikan** bila:

- `FROM-CACHE` tetap 0 (banyak task Android/React Native memang tidak cacheable), **atau**
- total durasi job tidak turun karena restore/save cache membengkak, **atau**
- muncul kegagalan yang tidak ada di baseline.

Hasil "gagal" tetap ditulis sebagai temuan, lalu 1 baris itu dikembalikan.

### 2.7 Risiko & mitigasi
- **Hasil task basi** bila ada task yang tidak mendeklarasikan input dengan benar. Mitigasi: cache key `setup-gradle` sudah per-job + hash; awasi 3 run dan bandingkan ukuran/hash APK bila perlu.
- **Cache membengkak** (sekitar 6 MB sekarang) → waktu restore/save naik. Itu sebabnya metrik §2.5 ikut diukur.
- **Configuration cache tidak diuji** — variabel lain, sering bentrok dengan plugin React Native.
- **Jangan mengubah** versi RN/Gradle/AGP, `newArchEnabled`, `hermesEnabled`, atau ABI filter selama uji A; kalau tidak, hasilnya tidak bisa diatribusi.

---

## 3. Rencana B — Perbaikan filter build APK

### 3.1 Masalah
`pnpm-lock.yaml` termasuk filter `mobile` (`ci.yml:141`). Gerbang kedua job APK (`ci.yml:443-448`, `:505-510`) memakai `needs.changes.outputs.mobile == 'true'`. Konsekuensinya, perubahan lockfile saja — walau berasal dari pustaka backend — tetap membangun 2 APK penuh.

### 3.2 Opsi & rekomendasi

| Opsi | Isi | Penilaian |
|---|---|---|
| **1 (rekomendasi)** | Pisahkan sinyal: `mobile` tetap untuk `test-mobile`; tambah sinyal baru (usulan nama `mobile_code`) yang **hanya** mencakup `apps/mobile/**` + `packages/shared-types/**`, dan pakai itu di gerbang dua job APK | Aman: tes JS mobile tetap jalan saat lockfile berubah; APK hanya dibangun bila kode yang dibundel ke APK berubah |
| 2 | Hapus `pnpm-lock.yaml` dari filter `mobile` | **Ditolak**: perubahan dependensi tidak lagi mengetes mobile sama sekali |
| 3 | Job APK hanya pada `push`/`workflow_dispatch`, tidak pada `pull_request` | **Ditolak**: PR yang mengubah kode Android lolos tanpa verifikasi APK |

### 3.3 Perubahan persis yang kelak diperlukan di `.github/workflows/ci.yml`
Nama `mobile_code` di bawah **usulan**, belum ada di kode saat ini.

1. Blok `filters:` (sekitar baris 128–147): tambah
   ```
   mobile_code:
     - 'apps/mobile/**'
     - 'packages/shared-types/**'
   ```
   `mobile` **dibiarkan** apa adanya (masih memuat `pnpm-lock.yaml`).
2. `outputs:` job `changes` (baris 83–91): tambah `mobile_code: ${{ steps.decide.outputs.mobile_code }}`.
3. `env:` langkah `decide` (baris 154–161): tambah `F_MOBILE_CODE: ${{ steps.filter.outputs.mobile_code }}`.
4. Fungsi `semua_berubah()` (baris 165–167): tambah `emit mobile_code true` — **wajib**, kalau tidak, jalur pengaman justru mematikan sinyal baru.
5. Akhir langkah `decide` (baris 210–214): tambah `emit mobile_code "$F_MOBILE_CODE"`.
6. Gerbang `build-android-debug` (baris 443–448) dan `build-staging-apk` (baris 505–510): ganti `needs.changes.outputs.mobile == 'true'` menjadi `needs.changes.outputs.mobile_code == 'true'`; **pertahankan** `github.event_name == 'workflow_dispatch'`, `needs.verify.result == 'success'`, dan `needs.test-mobile.result != 'failure'`.
7. `test-mobile` (baris 358) dan `verify` **tidak diubah**.

Catatan jaring pengaman: langkah `decide` punya cabang "semua area dipaksa berubah" (baris 171–175, 197–208). Perubahan nomor 4 memastikan cabang itu tetap konsisten. `ci-status` (baris 945) sudah memasukkan kedua job APK sejak `0e692bf` (29 Okt 2026); jangan dibuka lagi.

### 3.4 Skenario gerbang yang wajib diuji **tanpa build**
Resep: parse `ci.yml`, ekstrak `steps[].run` ke berkas `.sh`, jalankan dengan `env` berbeda (lihat `CI-CD-CATATAN.md` baris 114–117; cara ini pernah dipakai membuktikan 7 skenario perbaikan `ci-status`).

| # | Skenario | Hasil yang diharapkan |
|---|---|---|
| a | Hanya `pnpm-lock.yaml` berubah | `mobile=true`, `mobile_code=false` → `test-mobile` jalan, **kedua APK skipped** |
| b | `apps/mobile/**` berubah | keduanya true → `test-mobile` + **kedua APK jalan** |
| c | `packages/shared-types/**` berubah | keduanya true → **kedua APK jalan** |
| d | `workflow_dispatch` di `staging` | APK tetap jalan lewat jalan pintas |
| e | `workflow_dispatch` di cabang lain | filter dilewati, semua area true → APK jalan |
| f | Rilis tag `v*` lewat `release.yml` | APK jalan |
| g | APK `skipped` karena (a) | `ci-status` tetap `success` |
| h | APK `failure` saat `mobile_code=true` | `ci-status` **merah** (celah `0e692bf` tidak boleh terbuka) |

### 3.5 Cara membuktikan di GitHub Actions
Setelah perubahan didorong, amati PR berikutnya yang **hanya** mengubah lockfile:

- dua job APK berstatus `skipped`;
- `ci-status` tetap `success`;
- tidak ada job yang gagal.

Lalu amati satu PR/cabang yang mengubah `apps/mobile/**`: kedua APK harus tetap `success`. Hitung penghematan dari jumlah job APK yang tidak jalan (baseline: 8 job / 4 PR Dependabot pada 6 Nov).

### 3.6 Risiko terbesar
Salah memisahkan sinyal bisa membuat **semua** build APK ter-skip, termasuk saat kode Android benar-benar berubah. Karena `ci-status` meloloskan `skipped`, ini akan jadi **hijau palsu** — lebih berbahaya daripada build lambat. Skenario (b), (c), (d), (f), (h) wajib lulus sebelum merge.

Risiko kecil lain: menyentuh `ci.yml` sendiri termasuk filter `infra`, sehingga menyalakan lint + tes ketiga aplikasi pada PR perbaikan ini. Wajar, tapi jangan dikira regresi. PR Dependabot juga memicu `lockfile-fix.yml` yang menulis commit `pnpm-lock.yaml` → `synchronize` → run kedua; perhitungkan saat mengukur penghematan.

### 3.7 Yang tidak dikerjakan dalam rencana B
Tidak mengubah filter `backend` / `web` / `infra`, tidak mengubah jalur deploy, tidak mengubah `release.yml` / rilis APK produksi ke R2, tidak mengubah `test-mobile`, tidak menggabungkan PR Dependabot, tidak menghapus data.

---

## 4. Urutan & keputusan yang diminta Pion

1. Pion memilih: **A saja**, **B saja**, atau **keduanya**. Rekomendasi saya: **B dulu** (dampaknya paling pasti dan paling murah), **A menyusul** sebagai eksperimen terpisah. Jangan digabung dalam satu PR, supaya kalau ada yang meleset, sumbernya jelas.
2. Sebelum menyentuh berkas mana pun, saya akan **mengulang rencana ini lagi** — perubahan persis, berkas, dan yang tidak dikerjakan — lalu menunggu Pion membenarkan.
3. Pembuktian selalu lewat GitHub Actions. Tidak ada build/tes di PC Pion.

---

## 5. Yang TIDAK dilakukan dokumen ini

- Tidak mengubah berkas kode/konfigurasi apa pun.
- Tidak menjalankan build, tes, `gradlew`, `next build`, `docker build`, atau instalasi berat di PC Pion.
- Tidak menggabungkan/menutup PR, tidak mengubah setelan repo, tidak menghapus data.
- Tidak mengubah versi React Native / Gradle / AGP, tidak mematikan New Architecture.
- Tidak mengubah `MEMORY.md` atau dokumentasi lain selain berkas ini.
- Semua angka di §1 adalah **hasil bacaan data**, bukan hasil uji; rencana A **belum pernah diuji**.

---

## 6. Sumber data (bisa diaudit ulang)

- GitHub Actions API, workflow `ci.yml`, 100 run terakhir: rentang 24 Okt – 8 Nov 2026.
- Run yang dibaca detail: `40065988894` (24 Okt), `40580503113` (27 Okt), `42154637473` (6 Nov), `42432487700` (8 Nov); median dihitung dari 8 run terbaru dan 5 run 24 Okt.
- Durasi per langkah: `GET /repos/bagus01darmawan-wq/lazisnu/actions/runs/{id}/jobs` → `jobs[].steps[]`.
- Log job: `GET /repos/.../actions/jobs/{job_id}/logs` (cache pnpm/Gradle, `BUILD SUCCESSFUL`, `actionable tasks`, codegen, CMake).
- PR Dependabot: `#185`–`#188` (6 Nov 2026), perubahan berkas via `GET /pulls/{n}/files`.
- Berkas kode: `.github/workflows/ci.yml`, `.github/workflows/lockfile-fix.yml`, `.github/dependabot.yml`, `apps/mobile/android/gradle.properties`, `apps/mobile/android/app/build.gradle`, `apps/mobile/android/build.gradle`, `apps/mobile/android/gradle/wrapper/gradle-wrapper.properties`.
- Riwayat: `git log` untuk `.github/workflows/ci.yml`, `apps/mobile/android`, `apps/mobile/package.json` (20 Okt – 9 Nov 2026); komit `836dcc0`, `0e692bf`, `553e7cb`.
- Catatan internal: `.workbuddy-ai/memory/CI-CD-CATATAN.md` (matriks gerbang, jebakan `workflow_dispatch`, resep uji logika gerbang tanpa build).

---

Dokumen ini sengaja memisahkan **"sudah diverifikasi"** (§1) dari **"rencana, belum diuji"** (§2–§3). Kalau ada angka yang berubah saat uji dijalankan, tambahkan revisi bertanggal; jangan menimpa catatan lama.
