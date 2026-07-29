# Rekonstruksi Design System Mockup Mobile LAZISNU

Status: spesifikasi visual berbasis sembilan mockup PNG  
Platform sasaran: React Native Android  
Tujuan: bahan rekayasa ulang; bukan spesifikasi implementasi final

## 1. Cara membaca dokumen

Mockup adalah gambar raster, bukan file desain yang menyimpan nilai warna, font,
grid, dan ukuran asli. Karena itu token di bawah merupakan rekonstruksi visual
yang sengaja dinormalisasi menjadi sistem yang konsisten.

- Warna bertanda `core` cukup stabil untuk dijadikan fondasi.
- Ukuran memakai satuan React Native logical pixel (`dp`/`sp`), bukan pixel
  mentah dari gambar.
- Nilai dekorasi, blur, dan gradient perlu dikalibrasi kembali pada emulator.
- Mockup menjadi sumber visual utama. Aturan visual lama proyek tidak dipakai
  untuk mengoreksi arah estetika mockup.

## 2. Karakter visual

Konsep visualnya adalah **Islamic institutional premium**:

- deep emerald sebagai bidang merek dan navigasi;
- ivory hangat sebagai kanvas dan permukaan kartu;
- champagne gold sebagai aksen, outline, tombol utama, dan status tertentu;
- pola geometri Islam beropacity rendah sebagai tekstur;
- kurva berlapis seperti pita pada sudut kanan atas dan kiri bawah;
- kartu terang, outline hangat tipis, serta shadow lembut;
- ikon outline dengan stroke seragam;
- hierarki angka dan nama lebih kuat daripada deskripsi.

Bahasa visual ini tidak minimalis murni. Ornamen adalah bagian identitas, tetapi
konten transaksi tetap harus lebih dominan daripada ornamen.

## 3. Foundation tokens

### 3.1 Warna

Nilai berikut adalah estimasi visual yang dinormalisasi. Sebelum implementasi
final, sampling ulang dari aset asli disarankan.

```ts
export const mockupColors = {
  brand: {
    emerald950: '#073F33', // bidang paling gelap, scanner
    emerald900: '#0A4B3D', // header dan tombol gelap
    emerald850: '#0D5645', // variasi header
    emerald700: '#087A45', // progress dan scan action
    emerald600: '#079447', // check/success terang
    teal500: '#69AAA1',    // teks bantuan scanner
  },
  gold: {
    champagne300: '#F4D792', // highlight tombol
    champagne400: '#EBC77D', // tombol dan aksen utama
    sand300: '#E8D4AA',      // border hangat
    sand200: '#F2E5CA',      // badge background
    bronze600: '#9A6F27',    // teks badge/metode
  },
  neutral: {
    ivory50: '#FFFCF6',      // kartu/input utama
    ivory100: '#FBF7EF',     // background halaman
    ivory200: '#F4EDE1',     // track/divider/subtle fill
    white: '#FFFFFF',
    ink900: '#103F35',       // teks utama bernuansa hijau
    gray700: '#55595D',      // teks sekunder
    gray500: '#777A7D',      // placeholder/inactive
    gray300: '#C9C4BA',      // disabled border
  },
  semantic: {
    success: '#079447',
    successDark: '#086D3D',
    successSoft: '#E4F0E4',
    warning: '#9A6F27',
    warningSoft: '#F5E7C9',
    danger: '#B42318',
    dangerSoft: '#FDECEC',
    offline: '#A26C13',
  },
  overlay: {
    scanner: 'rgba(4, 24, 20, 0.68)',
    greenGlass: 'rgba(7, 63, 51, 0.82)',
    lightGlass: 'rgba(255, 252, 246, 0.94)',
    patternLight: 'rgba(255, 255, 255, 0.06)',
    patternGold: 'rgba(235, 199, 125, 0.18)',
  },
};
```

#### Gradient

```ts
export const mockupGradients = {
  hero: ['#0A4B3D', '#0D5645', '#073F33'],
  primaryGold: ['#E8BC67', '#F5D995', '#E7B85E'],
  primaryGreen: ['#0A4B3D', '#087A45'],
  activeScan: ['#079447', '#006E3D'],
  decorativeRibbon: ['#397D70', '#0A4B3D'],
};
```

Gradient tombol gold bergerak horizontal: lebih gelap di sisi, terang di pusat.
Header memakai gradient halus dan tidak boleh terlihat seperti dua warna keras.

### 3.2 Tipografi

Mockup menyerupai keluarga sans-serif condensed. Kandidat terdekat adalah
`Roboto Condensed`; gunakan satu keluarga konsisten agar angka, judul, dan kartu
tetap padat. Jangan mengandalkan font sistem jika kesamaan mockup menjadi target.

```ts
export const mockupTypography = {
  family: {
    regular: 'RobotoCondensed-Regular',
    medium: 'RobotoCondensed-Medium',
    semibold: 'RobotoCondensed-SemiBold',
    bold: 'RobotoCondensed-Bold',
  },
  style: {
    display:   { fontSize: 40, lineHeight: 46, fontWeight: '700' },
    metricXL:  { fontSize: 36, lineHeight: 42, fontWeight: '700' },
    metricLG:  { fontSize: 30, lineHeight: 36, fontWeight: '700' },
    titleXL:   { fontSize: 28, lineHeight: 34, fontWeight: '700' },
    titleLG:   { fontSize: 24, lineHeight: 30, fontWeight: '700' },
    titleMD:   { fontSize: 20, lineHeight: 26, fontWeight: '700' },
    titleSM:   { fontSize: 18, lineHeight: 24, fontWeight: '600' },
    bodyLG:    { fontSize: 18, lineHeight: 25, fontWeight: '400' },
    bodyMD:    { fontSize: 16, lineHeight: 22, fontWeight: '400' },
    bodySM:    { fontSize: 14, lineHeight: 20, fontWeight: '400' },
    labelLG:   { fontSize: 17, lineHeight: 22, fontWeight: '700' },
    labelMD:   { fontSize: 15, lineHeight: 20, fontWeight: '600' },
    labelSM:   { fontSize: 13, lineHeight: 18, fontWeight: '600' },
    caption:   { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  },
};
```

Aturan hierarki:

- judul layar: `titleXL`, putih pada hero;
- nama donatur/petugas: `titleMD`, emerald/ink;
- nominal penting: `metricLG` atau `metricXL`;
- label statistik: `bodyMD`, abu-abu;
- badge: uppercase `labelSM`;
- tombol utama: `titleSM` atau `labelLG`;
- panjang baris teks penjelas maksimal sekitar 32–38 karakter.

### 3.3 Spacing dan grid

Gunakan base grid 4. Seri utama:

```ts
export const mockupSpacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
};
```

Layout yang direkomendasikan:

- padding horizontal layar utama: `20`;
- padding auth: `24–28`;
- padding kartu reguler: `16`;
- padding kartu besar: `20–24`;
- jarak antar-section: `24`;
- jarak antarkartu daftar: `12`;
- gap ikon ke teks: `12`;
- gap label ke input: `8`;
- konten tidak boleh tertutup bottom navigation; sisakan `96–112`.

### 3.4 Radius

```ts
export const mockupRadius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  hero: 32,
  sheet: 28,
  circle: 999,
};
```

Pemakaian:

- badge kecil: `circle`;
- tombol: `12–16`;
- input: `12–16`;
- kartu daftar: `16`;
- kartu ringkasan: `20`;
- auth panel: `24`;
- ujung hero bawah: `32`;
- scanner viewport: `32`.

### 3.5 Border

```ts
export const mockupBorders = {
  subtle: { width: 1, color: '#E8D4AA' },
  card: { width: 1, color: '#DFC89B' },
  focus: { width: 1.5, color: '#087A45' },
  goldFocus: { width: 1.5, color: '#EBC77D' },
  danger: { width: 1, color: '#B42318' },
};
```

Mockup banyak memakai garis hangat. Hindari gray border dingin karena akan
mengubah keseluruhan nuansa.

### 3.6 Shadow dan elevation

```ts
export const mockupShadows = {
  card: {
    shadowColor: '#5B4930',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  floating: {
    shadowColor: '#153F34',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.20,
    shadowRadius: 12,
    elevation: 7,
  },
  glowSuccess: {
    shadowColor: '#079447',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 8,
    elevation: 4,
  },
};
```

Shadow harus lembut dan hangat. Jangan memakai outline dan shadow kuat sekaligus
kecuali pada tombol scan mengambang.

### 3.7 Ukuran komponen

```ts
export const mockupComponentSizes = {
  touchTargetMin: 48,
  iconButton: 48,
  button: 56,
  buttonLarge: 60,
  input: 58,
  inputNominal: 84,
  otpCell: 54,
  avatarSmall: 52,
  avatarLarge: 132,
  bottomNav: 84,
  scanAction: 72,
  listThumbnail: 76,
};
```

Mockup ditujukan untuk petugas lapangan; target sentuh jangan diperkecil hanya
agar seluruh konten muat dalam satu layar.

### 3.8 Ikon

- Gaya: outline membulat, stroke sekitar `2–2.25 dp`.
- Ikon aktif boleh filled; ikon inactive tetap outline abu-abu.
- Ukuran inline: `20–24`.
- Ukuran quick action: `32–36`.
- Ukuran bottom navigation: `26–30`.
- Jangan mencampur lebih dari satu keluarga ikon jika stroke-nya berbeda.
- Kandidat awal: Material Community Icons, tetapi beberapa ikon scan dan brand
  perlu SVG khusus agar sama dengan mockup.

## 4. Struktur layout global

### 4.1 Safe area

- Status bar transparan/menyatu dengan header gelap.
- Auth dan splash memakai bidang emerald sampai seluruh layar.
- Layar utama memakai hero emerald sekitar 220–300 dp lalu content ivory.
- Bottom navigation fixed, berlatar ivory, dengan top corners `28–32`.

### 4.2 Header ornamental

Header konsisten terdiri dari:

1. gradient emerald;
2. pola geometri Islam beropacity `4–7%`;
3. pita kurva kanan atas dengan outline emas tipis;
4. logo putih atau judul layar;
5. sudut bawah membulat besar pada layar utama.

Ornamen sebaiknya menjadi aset SVG/PNG terpisah:

- `islamic-pattern`;
- `top-right-ribbons`;
- `bottom-left-ribbons`;
- `brand-frame`;
- `nu-mark-white`;
- `collection-can`.

Jangan menggambar ornamen kompleks menggunakan puluhan `View`; sulit diskalakan
dan mahal dirawat.

### 4.3 Bottom navigation

Urutan tetap:

1. Beranda
2. Tugas
3. Scan
4. Riwayat
5. Profil

Token perilaku:

- tinggi visual `84`;
- ikon inactive abu-abu;
- ikon dan label tab aktif emerald;
- Scan berbentuk lingkaran `72`, naik sekitar `20` dari bar;
- Scan memakai gradient hijau dan ring ivory/gold tipis;
- label Scan tetap di bawah lingkaran;
- area tap tetap persegi minimal `72 × 72`, bukan hanya ikon.

## 5. Katalog komponen

### 5.1 `BrandHero`

Props konseptual:

```ts
type BrandHeroProps = {
  title?: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  height: 'compact' | 'regular' | 'auth';
  roundedBottom?: boolean;
};
```

Dipakai pada Beranda, Tugas, Riwayat, Profil, Input, Login, OTP, dan Splash
dengan komposisi berbeda.

### 5.2 `SummaryCard`

- surface ivory;
- border gold tipis;
- radius `20`;
- metric dibagi divider vertikal;
- progress opsional;
- shadow `card`;
- label sekunder abu-abu.

Varian:

- 2 kolom: Riwayat;
- 3 kolom: Beranda, Tugas, Profil;
- progress: Beranda dan Tugas.

### 5.3 `AppCard`

Varian:

- `plain`: daftar/settings;
- `elevated`: summary dan transaksi;
- `outlined`: input/form;
- `glassDark`: scanner controls;
- `selected`: metode bayar atau filter aktif.

### 5.4 `PrimaryButton`

- tinggi `56–60`;
- gradient champagne untuk aksi simpan/login/verifikasi;
- gradient emerald untuk Scan QR;
- radius `12–16`;
- ikon opsional `24`;
- label emerald gelap pada gold, putih pada emerald;
- state: default, pressed, loading, disabled.

State yang tidak tampak di mockup tetapi wajib:

- pressed: brightness turun ±8%;
- disabled: opacity `0.45`, tanpa shadow;
- loading: spinner menggantikan ikon, label tetap atau menjadi “Menyimpan…”;
- error submission: tombol aktif kembali dan error tampil dekat sumbernya.

### 5.5 `SegmentedControl`

- satu container outlined;
- item membagi lebar secara merata;
- aktif memakai gradient/dark emerald;
- label aktif gold;
- inactive ivory dengan label emerald;
- tinggi `48–52`;
- radius container `18`, item aktif `14–16`.

### 5.6 `StatusBadge`

Varian semantic:

- pending/belum/tunai: sand soft + bronze;
- selesai/aktif/sent: emerald + white atau success soft + success dark;
- transfer/latest: success soft + success dark;
- sync pending: icon clock + warning text;
- error: danger soft + danger.

Badge tidak boleh menjadi satu-satunya pembeda; sertakan teks dan bila perlu ikon.

### 5.7 `TaskCard`

Anatomi:

- status badge;
- period/calendar;
- thumbnail kaleng;
- donor name;
- can/QR code + copy;
- address;
- divider;
- previous collection amount;
- contextual Scan QR action.

Layout harus responsif. Pada layar sempit, nominal dan tombol turun menjadi dua
baris, bukan mengecilkan teks.

### 5.8 `HistoryCard`

Anatomi:

- date/time;
- payment method badge;
- thumbnail;
- can code + copy;
- donor/address;
- divider;
- nominal;
- delivery/sync/version status;
- action Koreksi Data.

`Koreksi Data` secara visual adalah secondary outlined button. Secara domain,
aksi ini harus mengarah ke resubmit/versioning, bukan mengedit transaksi lama.

### 5.9 `FormField`

- label di luar field untuk form umum;
- outlined floating label digunakan pada login;
- icon kiri opsional;
- icon aksi kanan opsional;
- tinggi `58`;
- border warm;
- focus border emerald/gold;
- error border red dan helper text eksplisit.

### 5.10 `NominalField`

- prefix `Rp` tetap;
- nilai rata kanan;
- angka `36–40 sp`;
- tinggi sekitar `84`;
- input hanya angka;
- helper maksimum di bawah;
- angka disimpan integer, format ribuan hanya presentasi.

### 5.11 `SyncIndicator`

Varian:

- banner gold: “Semua data tersinkronisasi”;
- compact card: timestamp terakhir;
- icon-only header dengan badge antrean;
- inline pending: “Menunggu Sinkronisasi”.

Status harus berasal dari sumber state yang sama agar Beranda, Tugas, Riwayat,
dan Profil tidak menampilkan informasi saling bertentangan.

### 5.12 `ScannerViewport`

- camera full-screen;
- overlay gelap;
- viewport rounded besar;
- empat corner guide champagne;
- scan line emerald dengan glow;
- status pill;
- flash toggle;
- close action;
- fallback tempel kode dan galeri;
- scanner langsung dinonaktifkan sesudah QR terdeteksi.

## 6. Spesifikasi per halaman

### 6.1 Splash

Komposisi:

- full emerald ornamental background;
- brand frame besar di pusat atas;
- wordmark “LAZISNU”;
- tagline gold;
- NU mark dan deskripsi lembaga;
- three-dot loading;
- teks status loading.

Rekomendasi:

- gunakan layout vertikal responsif, bukan posisi absolut dari screenshot;
- logo utama sekitar 58–66% lebar layar;
- animasi hanya pada loading dots atau fade, bukan seluruh ornamen;
- hormati `reduce motion`;
- tampilkan fallback error jika inisialisasi autentikasi gagal terlalu lama.

### 6.2 Login

Komposisi:

- hero emerald ornamental;
- brand frame;
- title dan subtitle;
- auth panel ivory;
- mode switch Kata Sandi / WhatsApp OTP;
- phone input;
- password input;
- gold primary action;
- secure-storage note;
- institutional footer.

Rekomendasi:

- segmented mode harus mengubah field dan aksi secara nyata;
- nomor telepon memakai keyboard `phone-pad`;
- password memiliki show/hide dengan accessible label;
- panel dapat discroll ketika keyboard terbuka;
- logo/footer boleh menyusut pada layar pendek, form tidak boleh tertutup.

### 6.3 OTP

Komposisi:

- back button;
- brand frame;
- title, explanation, masked number;
- ivory panel;
- WhatsApp shield;
- enam OTP cells;
- countdown;
- gold verify button;
- resend state;
- security note.

Rekomendasi:

- gunakan satu input tersembunyi dengan representasi enam cell agar paste dan
  autofill OTP bekerja;
- focus cell memiliki border emerald dan glow ringan;
- jangan hanya mengandalkan countdown visual;
- resend aktif setelah timer, dengan status loading dan error;
- kode OTP tidak boleh dicatat ke log.

### 6.4 Beranda

Komposisi:

- logo, notification, avatar;
- greeting dan tanggal;
- sync banner;
- overlapping daily summary;
- primary “Mulai Penjemputan”;
- tiga quick actions;
- next tasks preview;
- fixed bottom navigation.

Rekomendasi:

- summary overlap sekitar `40–52 dp`;
- quick actions memiliki ukuran dan bobot setara;
- hanya tampilkan 2–3 tugas berikutnya;
- tombol utama menjelaskan state trip: mulai, lanjutkan, atau selesai;
- badge notifikasi maksimal `99+`.

### 6.5 Daftar Tugas

Komposisi:

- hero title/period/sync;
- three-metric summary dan progress;
- Pending/Selesai/Semua segmented control;
- search;
- task cards;
- bottom navigation.

Rekomendasi:

- gunakan list virtualization;
- filter dan query tidak hilang saat kembali dari Scan;
- progress dihitung dari total/success yang sama dengan kartu;
- pending bukan sinonim offline queue;
- tampilkan empty state per filter dan no-results state untuk pencarian.

### 6.6 Scan

Komposisi:

- camera full screen;
- close, title, flash;
- status scanner;
- framed QR target;
- instructional text;
- fallback panel;
- dark bottom navigation.

Rekomendasi:

- viewport bukan crop area fisik; jelaskan lewat overlay;
- fallback galeri memerlukan izin dan pesan penolakan yang jelas;
- “Tempel Kode” harus divalidasi sama seperti hasil kamera;
- state: ready, detecting, validating, success, invalid, not assigned, duplicate,
  offline queued;
- hentikan scanner segera setelah pembacaan pertama.

### 6.7 Input Penjemputan

Komposisi:

- compact emerald header;
- verified can card;
- task badge;
- nominal field;
- payment method cards;
- optional note;
- WhatsApp evidence notice;
- confirmation reminder;
- gold save button.

Rekomendasi:

- field nominal menjadi fokus pertama setelah verifikasi;
- payment method adalah single select;
- WhatsApp notice bukan janji sinkron; pengiriman tetap asynchronous;
- save menampilkan review/confirmation jika data finansial belum dikonfirmasi;
- nominal maksimum divalidasi di mobile dan backend;
- jangan mengedit record koleksi lama dari halaman ini.

### 6.8 Riwayat

Komposisi:

- hero title/period/sync;
- two-metric summary;
- date filters dan search;
- transaction cards;
- bottom navigation.

Rekomendasi:

- filter horizontal harus dapat discroll pada layar kecil;
- status WA, version, dan sync merupakan tiga status berbeda;
- “Versi Terbaru” hanya muncul jika model versioning memang menyatakan record
  tersebut latest;
- koreksi data membuat resubmission baru;
- list memakai pagination/virtualization.

### 6.9 Profil

Komposisi:

- hero header;
- large profile summary;
- status and metrics;
- sync card;
- settings rows;
- danger-outline logout;
- institutional footer;
- bottom navigation.

Rekomendasi:

- edit photo memerlukan state upload dan fallback initials;
- nilai statistik memakai sumber data server yang sama dengan Riwayat;
- logout meminta konfirmasi jika masih ada offline financial queue;
- versi aplikasi diambil dari build config, bukan hardcoded;
- menu yang belum tersedia diberi status jelas atau disembunyikan.

## 7. State matrix yang perlu direkayasa

Mockup terutama menunjukkan happy path. Implementasi perlu desain tambahan:

| Area | State minimum |
|---|---|
| Global | loading, offline, sync pending, sync failed, maintenance |
| Auth | idle, invalid phone, invalid password, submitting, locked |
| OTP | typing, complete, invalid, expired, resend wait, resend ready |
| Tasks | loading, empty, filtered empty, error, refreshing |
| Scan | permission denied, ready, detected, validating, invalid, success |
| Collection | invalid nominal, saving, queued offline, saved, WA queued |
| History | loading, empty, pending sync, latest, superseded, WA failed |
| Profile | loading, photo upload, sync warning, logout blocked by queue |

## 8. Accessibility dan responsivitas

- Kontras teks kecil terhadap ivory minimal 4.5:1.
- Gold muda jangan digunakan sebagai teks kecil di atas ivory.
- Semua target sentuh minimal `48 × 48`.
- Label tidak boleh digantikan icon tanpa accessible label.
- Support font scale setidaknya sampai `1.3`; metric boleh dibatasi secara hati-hati.
- Gunakan `numberOfLines` hanya untuk preview, bukan data kritis seperti alamat.
- Bottom navigation dan tombol fixed harus memperhitungkan Android safe inset.
- Keyboard tidak boleh menutup input nominal, OTP, atau tombol submit.
- Gunakan haptic ringan untuk scan sukses, bukan untuk setiap tap.
- Status warna selalu ditemani teks atau ikon.

## 9. Peta file terhadap repository saat ini

### 9.1 Foundation yang sudah ada dan perlu direkayasa

| File aktual | Peran yang disarankan |
|---|---|
| `apps/mobile/src/theme/colors.ts` | ganti alias lama dengan palette mockup dan semantic tokens |
| `apps/mobile/src/theme/typography.ts` | tambahkan font family dan type scale mockup |
| `apps/mobile/src/theme/spacing.ts` | perluas dari 6 token menjadi skala 4-point |
| `apps/mobile/src/theme/radius.ts` | selaraskan radius card, hero, scanner, nav |
| `apps/mobile/src/theme/shadows.ts` | gunakan shadow hangat dan success glow |
| `apps/mobile/src/theme/component-sizes.ts` | tambah OTP, avatar, nav, scan action |
| `apps/mobile/src/theme/layout.ts` | pisahkan hero/auth/list/scanner layout constants |
| `apps/mobile/src/theme/index.ts` | tetap menjadi public theme barrel |

Catatan: `colors.ts` masih memiliki alias tema lama seperti `primary`,
`secondary`, `slate`, `background`, dan `card`. Alias ganda berisiko membuat
layar terlihat campuran. Migrasi harus menghapus alias secara bertahap setelah
semua pemakaian dipetakan.

### 9.2 Komponen yang sudah ada

| File aktual | Arah rekayasa |
|---|---|
| `components/ui/AppButton.tsx` | variants gold, green, outline, danger; loading/disabled |
| `components/ui/AppCard.tsx` | plain, elevated, outlined, glassDark, selected |
| `components/ui/AppHeader.tsx` | berkembang menjadi `BrandHero` atau wrapper-nya |
| `components/ui/AppTextInput.tsx` | regular, floating label, nominal, error/focus |
| `components/ui/SegmentedControl.tsx` | gradient active dan layout mockup |
| `components/ui/StatusBadge.tsx` | semantic variants yang konsisten |
| `components/ui/SyncBanner.tsx` | banner, card, compact/header states |
| `components/ui/index.ts` | ekspor komponen baru |

### 9.3 Komponen baru yang layak dipisahkan

Rekomendasi penempatan:

```text
apps/mobile/src/components/
  branding/
    BrandFrame.tsx
    BrandHero.tsx
    IslamicPattern.tsx
    InstitutionalFooter.tsx
  navigation/
    CollectorBottomTabBar.tsx
    FloatingScanAction.tsx
  collection/
    CollectionCanThumbnail.tsx
    NominalField.tsx
    PaymentMethodSelector.tsx
    VerifiedCanCard.tsx
  tasks/
    TaskCard.tsx
    TaskSummaryCard.tsx
  history/
    HistoryCard.tsx
    HistorySummaryCard.tsx
  scanner/
    ScannerOverlay.tsx
    ScannerStatusPill.tsx
    ScannerFallbackPanel.tsx
  profile/
    OfficerSummaryCard.tsx
    SettingsRow.tsx
```

Folder baru ini adalah rekomendasi, bukan perubahan repository pada tahap ini.

### 9.4 Pemetaan halaman

| Mockup | File aktual |
|---|---|
| Splash | splash inline di `src/navigation/AppNavigator.tsx`; sebaiknya dipisah |
| Login | `src/screens/LoginScreen.tsx` |
| OTP | `src/screens/OTPScreen.tsx` |
| Beranda | `src/screens/DashboardScreen.tsx` |
| Tugas | `src/screens/TasksScreen.tsx` |
| Scan | `src/screens/ScanScreen.tsx` |
| Input Penjemputan | `src/screens/CollectionScreen.tsx` |
| Riwayat | `src/screens/HistoryScreen.tsx` |
| Profil | `src/screens/ProfileScreen.tsx` |
| Bottom navigation | `src/navigation/AppNavigator.tsx` |

### 9.5 Aset

Aset aktif saat ini hanya terlihat memiliki
`apps/mobile/src/assets/branding/logo-lazisnu.png`. Mockup membutuhkan audit dan
ekspor aset tambahan:

```text
apps/mobile/src/assets/
  branding/
    logo-lazisnu.png
    logo-lazisnu-white.png
    nu-mark-white.png
    brand-frame.png
  patterns/
    islamic-pattern.png
    ribbon-top-right.png
    ribbon-bottom-left.png
  illustrations/
    collection-can.png
    officer-placeholder.png
```

Gunakan SVG untuk ornamen/ikon yang memang tersedia sebagai vector. Gunakan PNG
WebP beresolusi sesuai density untuk foto dan ilustrasi raster. Jangan mengambil
logo dari screenshot karena tepinya sudah terkompresi.

### 9.6 Test yang perlu diselaraskan saat implementasi kelak

- `__tests__/components/ui/AppButton.test.tsx`
- `__tests__/components/ui/AppTextInput.test.tsx`
- `__tests__/components/ui/SegmentedControl.test.tsx`
- `__tests__/components/ui/StatusBadge.test.tsx`
- `__tests__/screens/VisualStateAudit.test.tsx`
- `__tests__/screens/AuthenticatedScreens.test.tsx`

Tambahkan visual-state assertions untuk loading, offline, sync pending, dan
error; jangan hanya menguji teks happy path.

## 10. Urutan rekayasa yang disarankan

1. Kunci aset logo, ornamen, ikon, dan font.
2. Kalibrasi foundation token pada satu device acuan.
3. Bangun `BrandHero`, `AppCard`, button, field, badge, dan bottom navigation.
4. Rekayasa Splash/Login/OTP untuk memvalidasi branding.
5. Rekayasa Beranda sebagai pembuktian summary, quick action, dan task preview.
6. Rekayasa Tugas/Riwayat memakai komponen kartu bersama.
7. Rekayasa Scan dan Input Penjemputan tanpa mengubah aturan domain.
8. Rekayasa Profil.
9. Tambahkan seluruh non-happy states.
10. Audit Pixel 6 API 34, layar kecil Android, font scale, keyboard, dan offline.

Jangan mengerjakan sembilan layar secara independen. Jika foundation dan
komponen tidak dikunci lebih dulu, perbedaan radius, gold, padding, dan ikon akan
muncul kembali.

## 11. Risiko utama

1. **Raster dianggap nilai absolut.** Ukuran screenshot tidak sama dengan dp.
2. **Dekorasi mengalahkan keterbacaan.** Pattern harus tetap beropacity rendah.
3. **Gold gagal kontras.** Gold cocok sebagai fill/aksen, bukan semua teks.
4. **Bottom bar menutup konten.** Perlu safe inset dan list bottom padding.
5. **Kartu terlalu padat pada layar kecil.** Layout harus dapat wrap.
6. **Tema campuran.** Alias warna lama perlu dimigrasikan, bukan dibiarkan hidup.
7. **Happy-path-only.** State offline, error, loading, dan queue harus didesain.
8. **UI merusak domain.** “Koreksi Data” wajib tetap membuat versi baru.
9. **Status sinkron tidak konsisten.** Gunakan satu sync state/store.
10. **Aset hasil crop screenshot.** Wajib meminta sumber logo/ornamen berkualitas.

## 12. Kriteria review visual

Rekayasa dapat dianggap mendekati mockup bila:

- emerald, ivory, dan champagne terasa konsisten pada seluruh layar;
- semua header memakai pola dan pita dari keluarga aset yang sama;
- radius dan border kartu tidak berubah-ubah;
- type scale jelas: judul, nama, metric, body, badge;
- tombol gold/green mempunyai tinggi, radius, dan pressed state yang sama;
- bottom navigation identik di lima layar utama;
- daftar tetap terbaca pada font scale 1.3;
- state offline/sync tidak mengubah hierarki layout secara mengejutkan;
- layar input aman dari keyboard;
- perbedaan screenshot emulator dengan mockup dapat dijelaskan oleh token, data,
  atau ukuran viewport—bukan magic number per layar.

## 13. Learning checkpoint

### Konsep

Design token adalah keputusan visual bernama dan dapat digunakan ulang. Token
memisahkan **nilai** (`#0A4B3D`, `16`, `56`) dari **pemakaian**
(`headerBackground`, `cardRadius`, `primaryButtonHeight`).

### Alasan

Sembilan halaman tampak satu keluarga karena mengulang keputusan yang sama.
Mengimplementasikan setiap screenshot secara terpisah akan menghasilkan sembilan
versi hijau, radius, dan spacing.

### Risiko

Token yang terlalu generik seperti `green1` atau `size2` mudah disalahgunakan.
Gunakan dua tingkat bila perlu: primitive (`emerald900`) lalu semantic
(`heroBackground`, `textPrimary`, `statusSuccess`).

### Cara validasi

Ambil screenshot emulator pada viewport acuan, lalu bandingkan:

1. siluet besar dan proporsi;
2. warna dan gradient;
3. spacing/radius;
4. typography;
5. detail icon/shadow.

Perbaiki foundation sebelum menambah magic number pada screen.

### Latihan kecil

Pilih kartu Ringkasan Beranda dan tandai setiap propertinya sebagai:
`color`, `typography`, `spacing`, `radius`, `border`, `shadow`, atau
`component size`. Jika ada nilai yang tidak masuk kategori atau hanya dipakai
sekali tanpa alasan, nilai itu kemungkinan belum menjadi token yang baik.
