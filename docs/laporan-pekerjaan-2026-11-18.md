# Laporan Pekerjaan — 18 November 2026

Scope sesi ini: aplikasi mobile petugas (`apps/mobile`, React Native 0.88) dan sedikit
backend (`apps/backend`, Fastify + drizzle). Seluruh pekerjaan diawali analisis "kenapa",
baru diperbaiki; semua klaim terverifikasi lewat typecheck, eslint, dan test suite.

## Ringkasan verifikasi akhir

| Pemeriksaan | Hasil |
|---|---|
| `mobile: npx tsc --noEmit` | bersih |
| `mobile: npx eslint` (file diubah) | bersih (hanya 3 warning lama pra-eksisting, tidak disentuh) |
| `mobile: npx jest` (full suite) | **46 suites / 327 test lulus** |
| `backend: npm run typecheck` | bersih |
| `backend: mobileRoles.integration.test.ts` | **8/8 lulus** (1 test baru ditambahkan) |
| Smoke boot app + route `/v1/mobile/keuangan/history` | 200 OK |
| Perangkat/emulator | **belum** — tampilan & perilaku keyboard belum dilihat di device |

Insiden proses: beberapa edit kode salah alamat baris (pola `PUT N.=M` dengan angka lama)
terjadi beberapa kali; semuanya tertangkap typecheck/test dan langsung diperbaiki. Nol
perubahan sampah tersisa di file akhir (diverifikasi dengan grep ulang dan suite penuh).

---

## 1. Filter Aktif/Non-Aktif di halaman Tugas dibuat mengambang

**Permintaan**: filter Aktif/Non-Aktif di halaman Tugas tidak mengambang seperti filter
halaman Riwayat; ingin kartu yang digulir terlihat di celah antar tombol.

**Perubahan** (`src/screens/TasksScreen.tsx`):
- Filter dipindah dari alur normal (diantara hero dan list) ke overlay
  `position: 'absolute'` (`top: Spacing.sm`, `zIndex: 10`) di dalam `listWrap`
  (`position: 'relative'`) — pola identik `HistoryScreen`.
- `FlatList` diberi `paddingTop: TASK_FILTERS_HEIGHT (54) + Spacing.xl` agar kartu pertama
  tidak tertutup; kartu tetap bergulir di bawah filter.
- `SegmentedControl` (solid, tanpa celah) diganti dua tombol diskret bergaya
  `historyFilter` (kartu putih, border hangat, shadow, gap `Spacing.xs`): label kecil
  di atas angka; terpilih = `brand.deepGreen` + teks inverse. Kartu kini terlihat dari
  celah antar tombol persis seperti Riwayat.
- Aksesibilitas dipertahankan: `accessibilityRole="tab"`, `accessibilityState.selected`,
  gestur geser-tab tidak berubah; `SegmentedControl` tetap dipakai Collection/Dashboard/Login.

## 2. Animasi kartu Tugas dihapus total

**Konfirmasi dahulu**: animasi "muncul" saat kartu di-render adalah `FadeInUp`
(`delay(index * 40)`, 320 ms) di `TaskItem`; tab Non-Aktif memakai `index = 0` (fade
serempak); tab Aktif bertahap. Riwayat **tidak punya** animasi entering sama sekali.
**Keputusan**: Tugas ikut tanpa animasi.
- `TaskItem.tsx`: `Animated.View` → `View` biasa; `entering`, `Layout.springify()`, dan
  import `react-native-reanimated` dihapus.
- Prop `index` yang menjadi tidak terpakai dihapus dari komponen dan kedua call site.
- Konsekuensi: tidak ada replay animasi saat pindah tab/refresh; reorder (Naikkan/Turunkan)
  kini instan tanpa spring.

## 3. Kondisi fisik kaleng hanya dipilih di modal konfirmasi

Sebelumnya **ganda**: section "Kondisi Fisik Kaleng" (SegmentedControl inline) di form
`CollectionScreen`, ditambah picker yang sama di dalam modal `Konfirmasi Penjemputan`.
Section di form dihapus; picker hanya ada di modal (state `condition` dan initialisasi dari
`physical_condition` terakhir tidak berubah).
- `__tests__/screens/CollectionScreen.test.tsx`: test "memakai kondisi observasi
  terakhir…" diubah mengikuti kontrak baru — menegaskan tidak ada `SegmentedControl` di
  form (`toHaveLength(0)`), lalu membuka modal dan menegaskan default `RUSAK` di dalamnya.

## 4. Modal Konfirmasi Penjemputan dirombak

- Teks nominal dihapus dari modal.
- Kata kondisi (`Baik`/`Rusak`/`Hilang`) di kalimat info dibuat **bold**
  (`confirmationCondition`, 700/`text.primary`) di kedua cabang (tercatat / asumsi Baik).
  Catatan: label picker memang sudah bold dari `Typography.button`.
- Tombol **berdampingan**: `confirmationActions` jadi `flexDirection: 'row'` +
  `confirmationAction: {flex: 1}`. **Batal** di kiri dengan `variant="outline"` (persis
  tampilan "Tidak Dijemput" di halaman detail). **Konfirmasi & Simpan** tetap primary
  di kanan. Layout mirror "Konfirmasi & Simpan" yang baru.
- Test helper `renderedText`/`flattenChildren` ditambahkan untuk assertion teks yang
  kini bersarang di dalam `<Text>` (mengikuti aturan repo: guard, bukan cast).

## 5. Modal Status Sinkronisasi (ikon awan) dirombak & dibagi

Sebelumnya `Alert.alert` polos (muncul dari ikon awan di Beranda & Tugas) —
tidak ada styling, teks padat, tiga tombol setara.

**Baru**: `src/components/SyncStatusModal.tsx` (`SyncStatusModal`) — komponen bersama
berisi header (badge ikon awan, `cloud-alert` saat ada item gagal), dua tile statistik
(`Menunggu dikirim` warningSoft / `Perlu diperiksa` errorSoft, angka tabular-nums), teks
kontekstual, tombol berdampingan `[Nanti outline] [Coba Kirim Lagi primary]`
(bila antrean > 0; selain itu `[Lihat Detail primary]`), plus tautan teks
"Lihat detail masalah yang perlu diperiksa" (membuka `SyncIssuesSheet`) bila ada antrean.
Di-wire di `TasksScreen` dan `DashboardScreen` (import `Alert` di Dashboard dihapus karena
sudah tidak dipakai).

## 6. Riwayat — meninggalkan tab menutup detail otomatis

Kartu di Riwayat membuka detail via state lokal `selectedCollection` (bukan navigation),
dan tab bottom tidak unmount — kembali ke tab Riwayat selalu menampilkan sisa detail.
Perbaikan (`HistoryScreen.tsx`): satu `useFocusEffect` baru dengan cleanup
`setSelectedCollection(null)` — meninggalkan tab menutup detail; kembali ke tab selalu
menampilkan daftar. Modal koreksi yang terbuka di dalam detail ikut tertutup (konsekuensi
wajar dari "otomatis tertutup").

## 7. Diagnosis & perbaikan: kolom Kata sandi tertutup keyboard (login)

**Akar masalah**: bukan keyboard "menimpa" isi. `windowSoftInputMode="adjustResize"` sudah
benar (jendela menyusut), tetapi konten `ScrollView` top-anchored di `LoginScreen`, dan
RN tidak auto-scroll ke input fokus di Android — kolom Kata sandi di tengah konten
(~500 dp) tertinggal di bawah garis keyboard. `KeyboardAvoidingView` tidak menolong
(`behavior: undefined` di Android = view biasa).

**Perbaikan**:
- `LoginScreen.tsx`: `ScrollView` + wrapper field diberi ref; `onFocus` field memanggil
  `measureLayout` → `scrollTo(y - Spacing.sm)`. Wrapper diberi `collapsable={false}`.
- **Bug akar di `components/ui/AppTextInput.tsx`**: `{...restProps}` di-spread setelah
  `onFocus` internal — handler internal (set `isFocused`, border fokus) kalah oleh spread
  sehingga pemanggil `onFocus` mematikan border-fokus dan tidak pernah tersusun. Sekarang
  spread dulu, lalu `onFocus`/`onBlur` yang tersusun (fokus diatur + handler pemanggil
  dipanggil).

## 8. Perbaikan menyeluruh masalah "input tertutup keyboard"

Root cause umum dikonfirmasi: di Android edge-to-edge (RN 0.88, targetSdk 36), `adjustResize`
hanya menyusutkan jendela utama; **jendela `Modal` tidak ikut menyusut** (komentar di
`PasswordSheet` lama menyebut ini; terbukti dari perilaku sheets).

**Hook bersama baru**:
- `src/hooks/useFieldReveal.ts` — `measureLayout` wrapper field + `scrollTo` ScrollView
  induk; deps `[historyVisible…]` tidak relevan; dipakai untuk input yang berada jauh dari
  atas konten.
- `src/hooks/useAndroidKeyboardLift.ts` — dengar `keyboardDidShow/Hide`, kembalikan tinggi
  keyboard (0 di iOS; iOS tetap `KeyboardAvoidingView`).

**Penerapan**:
- `LoginScreen` — refactor memakai kedua hook.
- `PasswordSheet` — refactor agar memakai `useAndroidKeyboardLift` (dedup logika inline) +
  `useFieldReveal` untuk 3 inputnya (OTP, sandi baru, ulangi sandi) — sheet terangkat di
  atas keyboard **dan** auto-scroll ke input fokus.
- `SkipReasonSheet` — sebelumnya **tidak ada penanganan keyboard sama sekali**; sekarang
  lift Android + reveal saat "Catatan" fokus.
- `HistoryCorrectionModal` — dibungkus `KeyboardAvoidingView` (iOS) + `paddingBottom`
  keyboard (Android).
- `OTPScreen` — konten jadi `ScrollView` + reveal ke baris input OTP saat fokus (layar
  kecil bisa membuatnya berada di bawah garis keyboard).
- `ScanManualModal` tidak diubah (overlay in-tree ikut menyusut); `CollectionScreen` dan
  OTP row sudah selalu terlihat (skip). Semua wrapper yang diukur diberi `collapsable={false}`.

## 9. Kartu "Riwayat Berita Acara" Staf Keuangan — analisis & implementasi end-to-end

**Sebelum**: kartu placeholder statis (ikon abu-abu + "Menyusul — riwayat BA untuk
bendahara belum ada endpointnya. Menunggu backend."), tidak pressable, tidak berfungsi.
PPK punya padanannya yang berfungsi (`getSignedBaHistory` → `BaHistorySheet` → unduh PDF).

**Temuan backend**: tidak ada endpoint daftar BA untuk Bendahara; `/mobile/keuangan/inbox`
hanya memuat antrean `PPK_SIGNED` (menghilang setelah ditandatangani);
`/mobile/submissions/signed-history` bergerbang `PETUGAS` (403 untuk STAF_KEUANGAN);
`/admin/branch-submissions` bergerbang `rantingOnly` (`ADMIN_RANTING`/`ADMIN_KECAMATAN`,
403 juga). STAF_KEUANGAN hanya boleh membaca BA satuan (`berita-acara`, `pdf`,
`pdf-versions`, `pdf/generate`).

**Keputusan desain** (didiskusikan): baris hanya tombol
`Unduh BA <Bulan Tahun> - <Nama>`; unduh per-PPK; daftar per periode; default periode
= `display_period` (konsisten dengan seluruh layar Laporan); tidak membuat PDF gabungan.

**Implementasi**:
- Backend `getKeuanganHistory(actor, year, month)` (`services/mobileRoles.ts`): gerbang
  `STAF_KEUANGAN`, wajib scope `branchId` (`FORBIDDEN_SCOPE` bila null), validasi periode,
  hanya submission `FINAL` ranting periode itu, join nama PPK, urut nama. Route
  `GET /v1/mobile/keuangan/history` (pola identik `/keuangan/inbox`).
  Integration test baru: FINAL saja, scope ranting, gerbang peran/scope. **8/8 lulus.**
- Mobile: `KeuanganHistoryItemDto` + `c1Service.getKeuanganHistory`; komponen baru
  `KeuanganHistorySheet.tsx` — panah `‹ Oktober 2026 ›` (batas "periode berjalan" dari jam
  Jakarta, panah kanan nonaktif), daftar tombol `Unduh BA Oktober 2026 - Budi Santoso`
  (outline + ikon, nonaktif saat satu unduhan berjalan), state loading/error/kosong per
  periode; kartu di `KeuanganScreen` jadi pressable (a11y label + chevron), periode
  di-reset ke `display_period` tiap sheet dibuka; unduh via `c1Service.getPdf(id)` →
  `Linking.openURL(download_url)` (endpoint yang memang sudah boleh diakses
  STAF_KEUANGAN).

---

## Keputusan & kontrak yang berubah

1. Tugas kini **tanpa** animasi entering (sebelumnya `FadeInUp` stagger) — sesuai keputusan.
2. Kondisi fisik kaleng ditentukan **hanya** di modal konfirmasi, bukan di form.
3. Modal Status Sinkronisasi kini komponen bersama (`components/SyncStatusModal`) —
   menggantikan `Alert.alert` di Beranda & Tugas.
4. Kartu "Riwayat Berita Acara" Staf Keuangan = arsip BA FINAL ranting per periode,
   bukan mirror dari riwayat PPK (yang datar seumur petugas & tanpa periode).
5. `AppTextInput` kini men-compose `onFocus`/`onBlur` milik pemanggil dengan handler
   internalnya — perilaku fokus internal dan milik pemanggil sama-sama jalan.
6. Riwayat menutup detail otomatis saat tab ditinggalkan.

## Risiko / catatan terbuka

- **Tidak ada verifikasi di device/emulator** — semua perubahan layout/keyboard/sheet
  belum dilihat berjalan (terutama: posisi kolom Kata sandi vs tinggi keyboard asli;
  tinggi sheet + panah periode di layar kecil; replay tidak-sengaja animasi hilang).
- `OTPScreen` berubah struktural (konten → `ScrollView`) — layout visual perlu diperiksa.
- Panah "periode berjalan" di sheet riwayat dihitung dari jam Jakarta (UTC+7) di sisi
  klien; bila backend mengubah definisi periode berjalan, batas panah perlu diselaraskan.
- Reorder tekan-lama di Tugas kini tanpa animasi spring — sudah dikonfirmasi sesuai
  keputusan "tanpa animasi", tapi kalau terasa mendadak, opsi dipisah: entrance tetap
  mati, spring untuk reorder saja.
- `openSign` di `KeuanganScreen` dan `react/self-closing-comp` di `SignSheet` adalah
  warning pra-eksisting, sengaja tidak diubah (di luar scope).

## File berubah/baru

Backend (3): `routes/mobile/roles.ts`, `services/mobileRoles.ts`,
`services/__tests__/mobileRoles.integration.test.ts`.
Mobile berubah (16): `services/api.ts`, `screens/{TasksScreen, DashboardScreen, HistoryScreen,
CollectionScreen, LoginScreen, OTPScreen, KeuanganScreen}.tsx`,
`screens/history/HistoryCorrectionModal.tsx`, `screens/tasks/TaskItem.tsx`,
`components/{PasswordSheet, SyncStatusModal[baru], KeuanganHistorySheet[baru]}.tsx`,
`components/ui/{AppTextInput, SkipReasonSheet}.tsx`,
`hooks/{useFieldReveal, useAndroidKeyboardLift}.ts` (baru),
`__tests__/screens/CollectionScreen.test.tsx`.
