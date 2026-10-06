# RENCANA — Staging Lengkap: APK Staging Sejajar dengan Produksi

**Tanggal**: 2026-09-15
**Status**: DRAFT untuk tinjauan — **belum ada perubahan apa pun yang dieksekusi**
**Penanya**: Bagus Darmwan

---

## 1. Latar belakang dan pertanyaan

Pertanyaan: *"Apakah workflow CI saya support aplikasi mobile staging? Jika
production masuk dan ada di main, maka seharusnya yang ada di staging adalah
web, backend, mobile, shared-types yang sama lengkapnya seperti production,
sehingga bisa diujicoba secara nyata. Production tinggal menunggu hasil staging
beres semua, tanpa perlu dikorbankan."*

Jawaban singkat: **Saat ini TIDAK.** Staging saat ini hanya web + backend +
worker + redis. Aplikasi mobile tidak ada jalur staging. Detail penemuannya
dipaparkan di §2.

Tujuan rencana ini: membuat jalur **staging mobile yang benar-benar dapat
diuji**, sejajar dengan yang sudah ada untuk web/backend, dengan isolasi penuh
dari produksi.

---

## 2. Fakta lapangan saat ini (verifikasi langsung, bukan asumsi)

### 2.1 Staging hanya 4 service, tidak ada mobile

File `docker-compose.staging.yml` hanya memuat:

| Service | Image |
|---|---|
| `redis-staging` | `redis:7-alpine` |
| `backend-staging` | `ghcr.io/.../backend:latest` |
| `worker-staging` | `ghcr.io/.../backend:latest` |
| `web-staging` | `ghcr.io/.../web:staging` |

Tidak ada service mobile, tidak ada artefak APK, tidak ada distribusi mobile.
Mobile adalah aplikasi native Android — ia bukan container yang bisa
"berjalan" di compose; bentuk distribusinya adalah file APK yang dipasang di
HP. Jadi "staging mobile" = **menyediakan APK staging yang bisa dipasang dan
dicoba**, bukan menambah container.

### 2.2 CI hanya membangun APK debug yang TIDAK didistribusikan

`ci.yml` job `build-android-debug`:
- hanya menjalankan `./gradlew assembleDebug --no-daemon`
- hasilnya **tidak di-upload ke mana pun** (tidak ada `upload-artifact@v4`)
- tujuannya murni gerbang compile ("apakah Gradle masih bisa build?")

Akibatnya: APK staging sebenarnya tidak pernah tersedia untuk diujicoba.

### 2.3 APK produksi dibangun jalur terpisah yang melewati staging

`release.yml`:
- dipicu tag `v*` (dibuat oleh `scripts/release-bump.mjs --publish`)
- membangun 3 APK release-signing (arm64-v8a, armeabi-v7a, universal-ARM)
- mengunggah ke R2 (`apk.lazisnu.site`), lalu dispatch `ci.yml` pada ref tag
- fail-closed: satu gate gagal → tidak ada dispatch → produksi versi lama

Produksi mobile saat ini langsung dari tag ke publik. Staging tidak terlibat.

### 2.4 Aplikasi mobile membaca URL API saat bundling

`apps/mobile/src/services/api.ts`:

```ts
const getApiOrigin = () => {
  // API_URL di-inline saat bundling via
  // babel-plugin-transform-inline-environment-variables (set di .env).
  // development: http://10.0.2.2:3001 (backend lokal, dari emulator AVD)
  // production:  https://api.lazisnu.site
  if (process.env.API_URL) {
    return process.env.API_URL;
  }
  // Fallback: bundle tanpa API_URL ter-inline (HP fisik & emulator).
  return 'https://api.lazisnu.site';
};
```

URL API **di-inline ke JS bundle** oleh Babel, bukan dibaca runtime. Artinya:
APK staging harus **di-bundle ulang** dengan `API_URL=https://staging-api.lazisnu.site`.
Tidak bisa diubah setelah dipasang.

Saat ini **tidak ada** file `apps/mobile/.env` di repo — nilai `API_URL`
disuntikkan lewat environment CI saat build (lihat §4.2).

### 2.5 ApplicationId tunggal — belum ada variant

`apps/mobile/android/app/build.gradle`:

```groovy
defaultConfig {
    applicationId "com.lazisnucollectorapp"
    ...
}
buildTypes {
    debug   { signingConfig signingConfigs.debug }
    release { signingConfig signingConfigs.release; ... }
}
```

Hanya ada `debug` dan `release`. Tidak ada `staging`. applicationId sama untuk
keduanya — APK debug dan release **tidak bisa terpasang berdampingan** di HP
yang sama (saling menimpa).

### 2.6 Update APK di-gate melalui endpoint backend

`apps/mobile/src/services/updates/abi.ts` membaca `release.apk_url` /
`apk_urls` dari backend untuk update in-app. Semua URL yang ada di kode
menunjuk ke `apk.lazisnu.site` (R2 produksi). Backend staging saat ini tidak
memiliki pasangan URL staging.

---

## 3. Rancangan solusi

Prinsip: **staging harus mencerminkan produksi dalam struktur, tetapi terisolasi
dalam identitas.** Dua perubahan besar: Gradle variant baru, dan pipeline baru
yang membangun-dan-mendistribusikan APK staging.

### 3.1 Gradle: build variant `staging`

Tambah `flavorDimensions "env"` + product flavors:

```groovy
flavorDimensions "env"
productFlavors {
    prod {
        dimension "env"
        applicationId "com.lazisnucollectorapp"          // status quo
    }
    staging {
        dimension "env"
        // WAJIB berbeda supaya bisa side-by-side dengan produksi di HP
        // Petugas bisa punya keduanya tanpa saling timpa.
        applicationId "com.lazisnucollectorapp.staging"
        // versi independen supaya tidak bentrok versionCode produksi
    }
}
```

Lalu `buildTypes` dipertahankan, menghasilkan kombinasi:
`prodRelease`, `stagingRelease`, `prodDebug`, `stagingDebug`.

**Mengapa variant, bukan sekadar build type?** Karena perlu mengubah
`applicationId` (varian) sekaligus signing + minify (build type). Build type
tidak bisa mengubah applicationId; flavor bisa.

### 3.2 URL API per variant — tanpa menyentuh kode TypeScript

RN membaca `process.env.API_URL` saat bundling. Pasang `resValue`/`buildConfig`
... sebenarnya yang paling bersih: Gradle menyuntikkan resource yang dibaca
**native**, tetapi karena `API_URL` dibaca JS, cara yang konsisten dengan kode
eksisting adalah: set `API_URL` di environment Gradle saat build, sesuai variant.

Contoh di CI (bukan perubahan repo):

```yaml
# stagingRelease → bundle JS dengan API staging
- name: Build APK staging
  working-directory: apps/mobile/android
  env:
    API_URL: https://staging-api.lazisnu.site
  run: ./gradlew assembleStagingRelease
```

**Tidak ada kode TypeScript yang diubah** — ini menghormati mekanisme yang
sudah ada (`api.ts` + babel inline).

> Catatan: pastikan `babel.config.js` benar-benar memuat plugin
> `transform-inline-environment-variables` dan whitelist `API_URL` (cek saat
> eksekusi; plugin ini hanya mem-inline nilai saat variabel **ada** di env).

### 3.3 Signing staging

APK staging harus bisa dipasang tanpa keystore produksi:

- **Opsi A (rekomendasi)**: pakai `signingConfigs.debug` yang sudah ada
  (`debug.keystore`, `android`/`androiddebugkey`). Tidak perlu secret baru,
  tidak ada keystore produksi yang bocor ke lingkungan staging.
- Opsi B: keystore staging terpisah sebagai secret CI baru.

Rekomendasi A karena tujuannya ujicoba internal, bukan distribusi publik.

### 3.4 Versi dan penomoran

`versionCode`/`versionName` saat ini 27 / "1.1.9" di `defaultConfig`.
Agar versionCode staging tidak ikut naik dari kode produksi (bisa tabrakan
dengan Play Store / update in-app):

```groovy
android {
    defaultConfig { ... versionCode 27; versionName "1.1.9" }
    productFlavors {
        staging {
            // versi staging tidak boleh lebih tinggi dari rilis publik;
            // gunakan rentang bawah yang tidak akan dipakai produksi.
            versionCode 1
            versionName "1.0.0-staging"
        }
    }
}
```

### 3.5 Distribusi APK staging

Pilihan, dari yang paling sederhana:

| Opsi | Kelebihan | Kekurangan |
|---|---|--- aplikasi perlu
| | | mengunduh dari Actions (URL login) |
| **B. Artifact + halaman unduhan** | Akses mudah (bagikan link ke tester) | Perlu tempat hosting file |
| **C. Unggah ke R2 staging** (`apk-staging.lazisnu.site` atau folder staging) | Ujicoba nyata: download langsung dari HP, seperti produksi | Infrastruktur baru + biaya |

**Rekomendasi: A + B hybrid** — unggah artifact GitHub (audit, retensi 7 hari)
dan opsional unggah ke R2 staging untuk kemudahan distribusi.

> **Catatan `applicationIdSuffix`**: Kalau hanya butuh perubahan minimal, bisa
> pakai `applicationIdSuffix ".staging"` di build type. Tapi suffix di build
> type memerlukan perawatan relatif lebih rapuh (resource, provider, file
> provider). Flavor lebih jelas untuk aplikasi RN. Pertimbangkan suffix dulu
> bila ingin perubahan sekecil mungkin.

---

## 4. Rencana implementasi (bertahap, bisa dihentikan di setiap fase)

### Fase 0 — Verifikasi prasyarat (TANPA perubahan)
- [ ] Cek `babel.config.js` plugin inline env + whitelist `API_URL`
- [ ] Cek `apps/mobile/package.json` script build/bundle (ada `android`?)
- [ ] Cek `scripts/release-bump.mjs` — apakah dia menulis versionCode?
- [ ] Cek apakah backend staging punya endpoint `/v1/mobile/...` yang sehat

### Fase 1 — Gradle variant staging (repo)
- [ ] Tambah `flavorDimensions "env"` + `productFlavors { prod {...}; staging {...} }`
- [ ] Set `applicationId` staging = `com.lazisnucollectorapp.staging`
- [ ] Set `versionCode`/`versionName` staging terpisah
- [ ] Pastikan `debuggableVariants` di blok `react { }` diatur jika perlu
  (RN skip JS bundling untuk variant yang didebug)
- [ ] Tes lokal: `./gradlew assembleStagingRelease` (sebelum ubah CI)
- [ ] Cek `app.json`/`firebase` google-services JSON perlu duplikat
  (applicationId berbeda → `google-services.json` butuh entry baru)

### Fase 2 — CI pipeline staging APK
- [ ] Tambah job baru di `ci.yml`, sejajar `build-android-debug`:
  ```yaml
  build-android-staging-apk:
    needs: [changes, verify, test-mobile]
    if: >-
      always() && !cancelled() &&
      needs.verify.result == 'success' &&
      needs.test-mobile.result != 'failure' &&
      (needs.changes.outputs.mobile == 'true' ||
       github.event_name == 'workflow_dispatch')
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      # checkout, pnpm, setup-node (sama seperti build-android-debug)
      # setup-java + gradle (sama)
      # pnpm build:shared + pnpm install
      - name: Bundle JS staging + assemble
        working-directory: apps/mobile/android
        env:
          API_URL: https://staging-api.lazisnu.site
        run: ./gradlew assembleStagingRelease --no-daemon
      - uses: actions/upload-artifact@v4
        with:
          name: apk-staging-${{ github.sha }}
          path: apps/mobile/android/app/build/outputs/apk/staging/release/*.apk
          retention-days: 7
  ```
- [ ] Pertimbangkan: trigger juga saat `packages/shared-types` berubah
  (sudah masuk filter `mobile` ci.yml — aman)

### Fase 3 — Distribusi & ujicoba nyata
- [ ] Opsi A: unduh artifact dari GitHub Actions, pasang di HP, uji
- [ ] Opsi B/C: unggah ke R2 staging untuk link unduh publik internal
- [ ] Login di APK staging → verifikasi koneksi ke `staging-api.lazisnu.site`
- [ ] Verifikasi `apk_url`/`apk_urls` backend staging tidak membiarkan
  aplikasi staging "update" ke APK produksi (isolasi)

### Fase 4 — Sinkronisasi dengan rilis produksi (opsional, jangka panjang)
- [ ] Pertimbangkan: `release.yml` membangun APK staging DULU sebagai gerbang
  tambahan sebelum rilis produksi (fail-closed untuk mobile)
- [ ] Atau: buat tag staging `v*-staging` yang memicu build staging tanpa R2
  produksi

---

## 5. Dampak dan risiko

**Dampak positif:**
- Staging benar-benar lengkap: web + backend + worker + shared-types + **mobile**
- Bug mobile terdeteksi sebelum produksi (mis. overview fix tadi juga punya
  komponen mobile — bisa diuji sebelum rilis)
- Produksi tidak dikorbankan: semua verifikasi di staging, rilis tinggal
  menunggu hasil

**Risiko / hal yang perlu dijaga:**

| Risiko | Penanganan |
|---|---|
| `google-services.json` hanya untuk applicationId produksi → build staging crash di plugin Firebase | Tambah client entry untuk applicationId staging (lihat Fase 1) |
| `versionCode` staging tabrakan dengan Play Store / update in-app | Version code staging tetap di rentang bawah, tidak pernah naik ke level produksi |
| Variant baru → ProGuard/R8 config duplikat untuk `stagingRelease` | Pakai file proguard yang sama; verifikasi ukuran APK |
| Penggunaan `applicationId` berbeda → MMKV / storage terpisah | Otomatis aman (data terpisah per applicationId); tidak ada data yang bocor |
| Update in-app staging salah ambil APK produksi | Endpoint backend staging harus punya `apk_url` sendiri; uji isolasi (Fase 3) |
| CI makin lambat (+1 job build APK ~4 menit) | Job paralel; hanya jalan saat mobile/shared-types berubah |
| Lockfile CI `--frozen-lockfile` | Tidak ada dependensi baru → tidak ada perubahan lockfile |

**Yang TIDAK diubah:**
- `release.yml` (jalur rilis produksi) tetap utuh
- Keystore produksi tetap hanya di job rilis
- `api.ts` tidak diubah (mekanisme inline env tetap dipakai)

---

## 6. Pilihan keputusan untuk Bagus

1. **Tingkat isolasi**: Flavor dengan `applicationId` berbeda (rekomendasi) vs
   `applicationIdSuffix` minimal?
2. **Distribusi APK staging**: artifact GitHub saja (rekomendasi) atau sampai
   R2 staging?
3. **Signing**: keystore debug (rekomendasi) atau keystore staging baru?
4. **Maju ke Fase 4** (release.yml membangun staging dulu sebelum rilis)?

---

## 7. Estimasi usaha

| Fase | Perkiraan | Catatan |
|---|---|---|
| Fase 0 | 10 menit | Cek prasyarat, tanpa perubahan |
| Fase 1 | 30–60 menit | Gradle variant + tes build |
| Fase 2 | 30 menit | Job CI baru |
| Fase 3 | 20 menit | Pasang di HP + uji koneksi |
| Fase 4 | 60+ menit | Merubah alur rilis — butuh hati-hati |

Total **~2–3 jam** untuk Fase 1–3 (staging mobile yang berfungsi penuh).

---

## 8. Catatan khusus: mengapa aplikasi web sekarang bukan alternatif mobile

"Staging lengkap" untuk mobile bisa dicek di web staging (responsif). Tapi:

1. Aplikasi mobile pakai **bundle terpisah** dengan API inline — perlu dibangun
   sendiri, tidak bisa digantikan web.
2. Banyak fitur mobile spesifik (ML Kit, QR scanner, Crashlytics) yang **tidak
   ada di web** — harus diuji di APK asli.
3. Update in-app (`apk_url`) adalah alur yang hanya ada di mobile.

Jadi: web staging responsif membantu, tetapi tidak menggantikan APK staging.
---

## 9. Status

**Rencana ini belum dieksekusi.** Tidak ada file diubah, tidak ada CI
dimodifikasi, tidak ada branch dibuat. Menunggu persetujuan Bagus.
