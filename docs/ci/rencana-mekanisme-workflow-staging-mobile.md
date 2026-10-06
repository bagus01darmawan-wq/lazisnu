# RENCANA — Mekanisme Workflow: Live Debug (harian) + APK Release-Staging (gerbang rilis)

**Tanggal**: 2026-09-15
**Status**: DRAFT untuk tinjauan — **belum ada perubahan apa pun yang dieksekusi**
**Penanya**: Bagus Darmwan
**Pendahuluan**: jawaban atas "jika rekomendasi kamu diterapkan, mekanisme workflow
menjadi seperti apa?" — gabungan dari
`docs/ci/rencana-staging-mobile-sejajar-produksi.md` (APK staging) dan
`docs/ci/rencana-staging-mobile-live-debug.md` (live debug).

---

## 1. Filosofi: dua jalur, dua tujuan

Rekomendasi = **live debug untuk sehari-hari, APK staging hanya sebagai gerbang
sebelum rilis produksi**. Bukan salah satu, tapi keduanya di posisinya masing-masing.

| | **Live Debug** | **APK Release-Staging** |
|---|---|---|
| Tujuan | iterasi cepat saat coding | verifikasi "apakah ini aman dirilis?" |
| Kapan dipakai | setiap hari, saat buat fitur/betulkan bug | tepat sebelum tag rilis produksi |
| Frekuensi | puluhan kali sehari | sekali per rilis |
| CI terlibat | **tidak** | ya, satu job |
| Hasil | perubahan langsung di HP (~1 dtk) | APK yang bisa dipasang & dicoba |

**Inti: CI workflow tetap seperti sekarang untuk semua push.** Job APK staging
bukan pekerjaan rutin, tapi gerbang yang baru aktif saat siap rilis.

## 2. Alur kerja harian (TIDAK menyentuh CI sama sekali)

```
┌─────────────────────────────────────────────────────────────┐
│  Developer mesin lokal (sumber: mesin Bagus)                │
│                                                             │
│  edit apps/mobile/src/...tsx                                │
│         │                                                   │
│         ▼                                                   │
│  Metro (port 8081) — Fast Refresh                           │
│         │                                                   │
│         ▼                                                   │
│  HP fisik / emulator ── API ──▶ staging-api.lazisnu.site    │
└─────────────────────────────────────────────────────────────┘
```

Langkah konkrit (sekali saja):

```bash
cd apps/mobile
# HP fisik: arahkan port metro ke host
adb reverse tcp:8081 tcp:8081
# bangun + pasang debug APK + start metro (sekali)
API_URL=https://staging-api.lazisnu.site pnpm react-native run-android
```

Sesudahnya Metro jalan terus di latar; tinggal edit kode. Untuk ganti target
API atau setelah error aneh, restart metro:

```bash
API_URL=https://staging-api.lazisnu.site pnpm react-native start --reset-cache
```

> **Peringatan**: `API_URL` di-inline ke bundle oleh Babel pada bundling
> pertama. Ganti target API **tidak bisa hot-reload** — harus restart Metro
> + reload. Detail di rencana live-debug §5.2.

## 3. Alur kerja rilis: gerbang APK staging

Inilah perubahan pada workflow — **tambahan minimal, jalur produksi tetap utuh**.

### 3.1 Trigger: workflow_dispatch manual (bukan push)

```yaml
# .github/workflows/preview-staging-mobile.yml
name: Preview APK staging
on:
  workflow_dispatch:
    inputs:
      ref:
        description: "Branch/commit yang ingin diuji (default: staging)"
        required: false
        default: staging
```

**Mengapa dispatch, bukan push?** Job build APK makan ~4–8 menit di runner
dingin. Kalau dipicu setiap push, pemborosan besar untuk sesuatu yang hanya
diperlukan saat hampir rilis. Dispatch = on-demand, tepat saat dibutuhkan.

### 3.2 Membangun APK release-staging (bukan debug!)

```yaml
jobs:
  build-apk:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ github.event.inputs.ref }}
      - uses: pnpm/action-setup@v6
        with: { version: 10.33.2 }
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
          cache: 'pnpm'

      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Build shared types
        run: pnpm build:shared

      - uses: actions/setup-java@v6
        with: { distribution: 'temurin', java-version: '17' }
      - uses: gradle/actions/setup-gradle@v6

      - name: Build APK release (staging API)
        working-directory: apps/mobile/android
        env:
          API_URL: https://staging-api.lazisnu.site
        run: ./gradlew assembleRelease --no-daemon

      - uses: actions/upload-artifact@v4
        with:
          name: apk-staging-${{ github.event.inputs.ref }}
          path: apps/mobile/android/app/build/outputs/apk/release/*.apk
          retention-days: 7
```

**Mengapa `assembleRelease`, bukan `assembleDebug`?** Alasan teknis krusial:

> RN 0.74 **melewat pembuatan JS bundle untuk variant debug**
> (`if (!isDebuggableVariant)` di `TaskConfiguration.kt:57`). Debug APK hanya
> berisi stub kosong + membuka Metro dev server di port 8081. **APK debug dari
> CI tidak bisa jalan tanpa Metro** — Metro tidak ada di GitHub Actions.
>
> Jadi untuk artifact yang benar-benar bisa dipasang dan dicoba, **wajib
> `assembleRelease`** — satu-satunya variant yang membungkus JS bundle.

**Signing release di CI:** pakai secret `MYAPP_UPLOAD_STORE_FILE` dll. yang
**sama** dengan `release.yml` (keystore produksi). Karena keystore yang sama,
APK ini tidak bisa dipasang berdampingan dengan produksi — tapi ini sesuai
tujuan: ini adalah "versi kandidat rilis yang ditandatangani", bukan aplikasi
paralel. Untuk isolasi penuh (side-by-side), perlu Gradle variant terpisah —
lihat §6.

### 3.3 Alur lengkap rilis (sebelum vs sesudah)

**Sebelum (sekarang):**
```
semua kode ──▶ main/staging ──▶ CI (build+test) ──┐
                                                  │
tag v* ──▶ release.yml: build 3 APK ──▶ R2 ──▶ dispatch ci.yml ──▶ PRODUKSI
```
Mobile produksi langsung dari tag ke publik. Tidak ada tempat mencoba APK
tersebut sebelum benar-benar dirilis.

**Sesudah (rekomendasi):**
```
semua kode ──▶ main/staging ──▶ CI (build+test) ──▶ staging web+backend+worker
     │                                            (tidak berubah!)
     │
     └──▶ [manual] preview-staging-mobile.yml
                │
                ▼
          APK release-staging ──▶ artifact GitHub (7 hari)
                │
                ▼
          Bagus pasang di HP, uji sungguhan
                │
        ┌───────┴────────┐
   ✅ LOLOS            ❌ ADA MASALAH
        │                  │
        ▼                  └──▶ betulkan di staging, ulang dispatch
  tag v* ──▶ release.yml ──▶ R2 ──▶ PRODUKSI
```

**Kunci:** `release.yml` **tidak diubah sama sekali**. Yang baru adalah
kesempatan menguji APK kandidat **sebelum** tag dibuat — sebelumnya kesempatan
itu tidak ada.

## 4. Yang berubah vs tidak berubah

| Komponen | Status |
|---|---|
| `ci.yml` (semua push) | ✅ **tidak berubah** — termasuk `build-android-debug` yang sudah ada |
| `release.yml` (jalur rilis) | ✅ **tidak berubah** |
| `preview-staging.yml` (web preview) | ✅ tidak diubah |
| `security.yml`, `lockfile-fix.yml` | ✅ tidak diubah |
| **`preview-staging-mobile.yml`** | 🆕 **file baru** — workflow dispatch, build APK release + artifact |
| `apps/mobile/` kode | ✅ **tidak diubah** (tidak perlu Gradle variant untuk MVP ini) |
| `apps/mobile/babel.config.js` | ✅ tidak diubah (`API_URL` inline sudah aktif) |
| `docker-compose.staging.yml` | ✅ tidak diubah |

**Ringkasnya: tambah 1 file workflow, tidak sentuh yang lain.**

## 5. Cost & implikasi

| Item | Nilai |
|---|---|
| Runner GitHub extra | hanya saat dispatch (~4–8 menit/run, on-demand) |
| Storage artifact | 7 hari lalu hangus otomatis |
| Secret CI baru | **tidak ada** — pakai secret yang sudah dipakai `release.yml` |
| Risiko produksi | **nol** — `release.yml` tidak tersentuh |
| Perubahan repo mobile | tidak ada |

## 6. Batasan & pilihan lanjutan

### 6.1 Tidak side-by-side dengan produksi

Karena signing pakai keystore & applicationId yang sama, memasang APK staging
akan **menimpa** aplikasi produksi di HP. Untuk MVP ini dapat diterima
(ujicoba kandidat rilis). Kalau butuh isolasi penuh, baru aktifkan Fase 1 dari
rencana APK staging (Gradle variant `staging` + `applicationIdSuffix`).

### 6.2 Dev menu & performa

`assembleRelease` menonaktifkan dev menu, minify aktif — ini sebenarnya
**keuntungan**: ini persis seperti APK produksi. Tapi tidak ada live edit di
artifact ini (Metro tidak terlibat). Live edit hanya di alur §2.

### 6.3 Skala penuh (opsional, nanti)

- Variant staging terpisah + applicationId berbeda → side-by-side dengan produksi
- Upload ke R2 staging untuk link unduh mudah (bukan artifact Actions)
- `release.yml` membangun APK staging otomatis sebelum rilis produksi (fail-closed)

## 7. Urutan eksekusi (jika disetujui)

1. **Buat file** `.github/workflows/preview-staging-mobile.yml` (satu file, ~60 baris)
2. **Jalankan dispatch** pada branch `staging` untuk menguji workflow
3. **Unduh artifact**, pasang di HP, verifikasi: login jalan, koneksi ke
   `staging-api.lazisnu.site`, fitur utama (QR scanner, list kaleng) bekerja
4. **Kalau baik**: workflow siap dipakai sebagai gerbang rilis rutin
5. **Kalau ada masalah**: betulkan kode di staging, ulang dispatch

**Estimasi: ~30 menit implementasi** (satu file workflow + dispatch + verifikasi).

---

## 8. Status

**Rencana ini belum dieksekusi.** Tidak ada file workflow dibuat, tidak ada CI
dimodifikasi, tidak ada Metro dijalankan. Menunggu persetujuan Bagus.
