# Retrospektif Sesi Kerja — 2026-08-24/25

Dokumen pembelajaran: seluruh pekerjaan yang ditempuh sepanjang sesi ini — yang berhasil, yang gagal, dan kenapa. Ditulis agar pengulangan kesalahan yang sama tidak terjadi lagi.

---

## 1. Ringkasan Eksekutif

| Kategori | Hasil |
|---|---|
| Fitur terkirim & hijau | Antrean koreksi-offline, redesign Beranda/Tugas/Profil, 6 perbaikan auth/biometrik/offline-restore, hapus tombol Scan QR Baru, penghematan arsitektur APK (Option A) |
| Tes | 151 → 161 lulus, semua hijau |
| Eksperimen ditarik mundur | Integrasi EAS Update (expo-updates) — 8 build gagal berturut, diputuskan ditunda |
| Siklus build EAS | #3 stabil → #4/#5 bug versionName → #6–#9 saga expo-updates (4 kegagalan berbeda) |

---

## 2. Pekerjaan yang Berhasil Terkirim

### 2.1 Antrean Koreksi Offline (data synced) — bug awal user
- **Masalah**: koreksi data synced yang dilakukan saat offline ditolak "tidak ada koneksi internet" karena jalur API langsung.
- **Solusi 6 fase commit `a2b60b4`**: modul antrean MMKV (`services/offline/corrections.ts`), overlay nominal optimistis pada `mergeCollectionsWithQueues`, alur submit di `useCollectionStore` + validasi dwi-jalur (offline→enqueue, NETWORK_ERROR di tengah online→enqueue), flush saat online di `sync.ts` dengan klasifikasi error server (`NOT_LATEST` → gagal permanen), badge "Koreksi Menunggu" + modal koreksi-ditolak, 15 tes baru.
- **Pola arsitektur yang terbukti**: antrean dengan suffix officer, collapse satu-koreksi-terbaru per `collection_id`, backoff eksponensial cap 3x, listener untuk badge sync.

### 2.2 Redesign Navigasi
- Kartu **Progres Tugas** dari Tugas → Beranda (di bawah Ringkasan Hari Ini).
- Hapus section "Tugas Berikutnya" + kartu kaleng kecil.
- Tombol **Selesai Periode** dipindah ke Profil (di atas tombol keluar), lengkap dengan dialog konfirmasi idem aslinya.
- `TaskSummaryCard` direfactor menjadi komponen murni (wrapper margin dipindah ke layar masing-masing), tombol aksi dibuat opsional.

### 2.3 Perbaikan Sesi & Biometrik (komit `a2b60b4`)
- **Keychain sinkron rotasi**: penyebab bug "sidik jari selalu gagal" — RT di Keychain tidak ikut di-rotasi setelah login normal; `refreshAccessToken` kini memanggil `updateBiometricToken` sekaligus.
- **`authService.refresh` keluar dari interceptor 401**: sebelumnya 401 memicu refresh ganda di belakang layar dan mengembalikan SESSION_EXPIRED palsu; kini fetch mentah → kode asli server sampai pemanggil.
- **Panel pemulihan** `sessionRecoveryAvailable`: saat sesi habis dengan biometrik aktif, halaman Login menampilkan panel "Gunakan Sidik Jari" (auto-prompt sekali).
- **Offline-first session restore** (`initializeAuth`): kegagalan `me()` karena jaringan tidak lagi menghapus sesi + cache — hanya kode penolakan eksplisit (`UNAUTHORIZED|SESSION_EXPIRED|REFRESH_REVOKED|FORBIDDEN`) yang mengeluarkan user.
- Divider "atau" untuk tombol biometrik yang sebelumnya menempel.
- `VisualStateAudit` mengunci absennya tombol Scan QR Baru (aserti negative).

### 2.4 Penghematan Arsitektur
- `reactNativeArchitectures=armeabi-v7a,arm64-v8a` (buang x86/x86_64 emulator-only) — target ±80 → ±40–45 MB.
- **Wawasan penting yang terbukti di lapangan**: `buildType:"apk"` + splits → EAS internal distribution membungkus semua varian dalam **`.tar.gz`** (build #5), sehingga petugas tak bisa lagi menginstall satu-klik. Split dibatalkan demi jalur distribusi sederhana. Flagnya ditinggalkan di kode (dinonaktifkan) dengan komentar kenapa.

### 2.5 Nomor Versi Satu-Sumber
- `src/config/appConfig.json` sebagai kebenaran tunggal → label Profil + runtime version manifest.
- **Fakta yang terbukti di build #4/#5**: `versionName appConfig.version` (ekspresi Groovy) DIPERLIHATKAN EAS sebagai `"appConfig.version"` — mekanisme `appVersionSource: remote` membaca nilai sebagai teks literal. Penyelesaian: `versionName` kembali literal `"1.1.0"` + tes penjaga `appVersionSync.test.ts` yang membandingkan ketiga tempat.

---

## 3. Saga Gagal: Integrasi EAS Update (expo-updates)

Delapan build EAS gagal berturut (#6–#9, ditambah dua percobaan submit yang gagal lebih awal). Setiap kegagalan bersumber di lapisan berbeda — jalur nonbaku bare RN + expo-updates.

| Urutan | Gejala | Sebab Asli & Bukti |
|---|---|---|
| Submit a | `eas.json "updates"/"runtimeVersion" is not allowed` | Kedua kolom itu bukan milik eas.json (dok resmi membuktikan `updates.url` ada di `app.json`) |
| Submit b | Proyek EAS tidak terdeteksi | `projectId` saya pindah ke dalam `expo.extra`; eas-cli bare membaca top-level `extra.eas.projectId` |
| Build #6 | `entryFile has no value` | expo-updates-gradle-plugin membaca `entryFile` saat apply — template RN 0.74 membiarkannya kosong (expo/expo#24590) |
| Build #7 | `Could not get unknown property 'projectRoot'` | Saya menempel incantation template Expo tanpa variabel yang mereka sediakan sendiri |
| Build #8 | `expo-json-utils:compileReleaseKotlin — 'javac' (17) vs 'kaptKotlin' (11)` | PM modul Expo tidak menyetel jvmTarget; javac mengikuti JDK 17 EAS sementara Kotlin kembali ke default 11 |
| Build #9 | `expo-updates:kaptReleaseKotlin — NonExistentClass` di stub Room | Kapt tidak mengenal anotasi `@ExpoMethod` milik expo-modules-core saat membuat Java stubs |
| Build #10 | `(udah dibatalkan pre-submit)` | Penambahan `kapt project(...)` mekanisme yang keliru: kapt menolak dependensi project Android-library (varian debug/release ambigu) |
| Build #11 | `could not resolve :expo-modules-core` varian | Konfirmasi resmi bahwa jalur anno-processor-via-project salah secara Gradle |
| Build #12 | `stubs/UpdatesModule.java:36: cannot find symbol ExportedModule` | `correctErrorTypes=true` menyatakan stub tidak lengkap — masalah lebih dalam di modul librarynya |

### Yang sudah benar sepanjang jalan:
- Skrip patch postinstall lokal **terbukti berjalan di EAS** (penanda `[patch]` ditemukan di log remote).
- Setiap kegagalan membaca; tiap pelajaran secara langsung mempersempit ruang masalah.

### Kenapa berhenti menjadi keputusan benar:
Biaya per siklus ±30–45 menit antre EAS — dan setelah perbaikan jaringan-low-level di Room/jvmTarget, error menunjukkan masalah di dalam implementasi library itu sendiri (alah-alih konfigurasi konsumen). Biaya berikutnya keluar proporsional dibanding alternatif (modal update Tingkat 1).

---

## 4. Pelajaran Kunci untuk Dibawa ke Depan

### 4.1 Teknis
1. **EAS `appVersionSource: remote` membaca literal teks** — jangan pernah express variable di `versionName`/`versionCode`; tambahkan tes sinkron otomatis di mana pun sumber tunggal berdiri.
2. **Internal distribution + split APK = tar.gz**. Distribusi manual butuh universal APK; split disimpan untuk era Play Store saja.
3. **Pactch package di pnpm monorepo** tidak mewakili state .pnpm — gunakan skrip `postinstall` khusus yang idempoten + fail-fast supaya perubahan pihak-ketiga sampai ke mesin build apa pun.
4. **Setiap 401 dari endpoint refresh TIDAK BOLEH lewat interceptor auto-refresh** — endpoint autentikasi/refresh wajib fetch mentah untuk menjaga kode error asli (merusak berbagai penanganan disabilitas biometrik yang kritis).
5. **Keychain biometrik wajib disinkronkan SETIAP rotasi token**, bukan hanya saat flow biometrik — token rotasi adalah kejadian arus-utama pemakaian normal.

### 4.2 Proses
6. **Satu perubahan infrastruktur per build** — gabungan split+expo-updates dalam satu siklus membuat diagnosis ratusan kali lebih lama. Beri tahap verifikasi dan jangan mendaki tangga berikutnya sebelum tarik pesta hijau.
7. **Membuktikan jejak di log EAS sebelum perbaikan berikutnya**: dua siklus saya hampir salah arah karena belum mengecek bahwa perbaikan sebelumnya benar-benar dijalankan di mesin remote — setelah memeriksa `[patch]` di log, narasi diagnosis sempurna.
8. **Set flag berhenti eksplisit sejak awal iterasi**: dengan pola "satu dua kali lagi lalu evaluasi" percobaan tetap larut. Kerangka biaya ekonomis (biaya-siklus × teka-teki-yang-belum-selesai) harus dievaluasi aturan tiap siklus.

---

## 5. Status Akhir & Langkah Berikutnya

- [x] Semua pekerjaan sah terkirim dan ter-commit (sampai `1558d7b`)
- [x] **Rencana pembongkaran bersih expo-updates** — dieksekusi 2026-08-25, lihat `docs/implementation/TUNDA-EXPO-UPDATES-2026-08-25.md` §6
- [x] Build rilis stabil (v1.1.0, tanpa expo) terkonfirmasi hijau 2026-08-25 — vc 17, 40,5 MB (detail: TUNDA-EXPO-UPDATES §6)
- [ ] Sesi berikutnya: fitur update-in-app Tingkat 1 (endpoint versi + modal + link APK)
- [ ] Integrasi expo-updates hanya layak dibuka kembali setelah upgrade ke Expo SDK ≥ 52 (Room & Kotlin resmi lebih baru)
