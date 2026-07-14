# Tahap 1 — Design Tokens

## File yang Dibuat

### `apps/mobile/src/theme/colors.ts`

Kelompok token:

- `brand`: identitas utama.
- `surface`: background dan kartu.
- `text`: hierarki teks.
- `border`: garis pembatas.
- `status`: success, warning, error, info.
- `overlay`: transparansi untuk kamera, modal, dan glass surface.

Palet utama:

```ts
deepGreen: '#2C473E'
warmBeige: '#F4F1EA'
emerald: '#1F8243'
mutedSand: '#EAD19B'
accentGold: '#7A571E'
mutedTeal: '#6B9E9F'
```

`mutedTeal` tetap merupakan warna merek/dekorasi, bukan warna teks kecil.
Token teks dan status menggunakan varian lebih gelap agar memenuhi kontras WCAG
pada surface terang:

```ts
text.secondary: '#5F6F69'
text.muted: '#5F6A75'
status.success: '#176B38'
status.warning: '#8A5A00'
status.error: '#B42318'
status.info: '#1D5FA7'
```

Warna surface semantik wajib memakai token berikut, bukan nilai hex langsung:

```ts
surface.avatar: '#F8F1E5'
surface.successSubtle: '#E8F0E9'
surface.successSoft: '#E8F5EC'
surface.warningSoft: '#F5E8CE'
surface.errorSoft: '#FDECEC'
surface.progressTrack: '#E9E2D5'
border.summary: '#DDCDB2'
```

### `apps/mobile/src/theme/spacing.ts`

Gunakan grid kelipatan empat:

```ts
xs: 4
sm: 8
md: 16
lg: 24
xl: 32
xxl: 48
```

### `apps/mobile/src/theme/radius.ts`

```ts
sm: 8
md: 12
lg: 16
card: 20
panel: 24
pill: 999
```

### `apps/mobile/src/theme/component-sizes.ts`

```ts
buttonHeight: 56
inputHeight: 56
iconButton: 48
minimumTouchTarget: 48
bottomTabHeight: 68
```

### `apps/mobile/src/theme/layout.ts`

Token layout menjaga kepadatan dan proporsi antarlayar:

```ts
Layout.screenPadding: 16
Layout.sectionGap: 16
Layout.cardPadding: 16
Layout.compactCardPadding: 12
Layout.contentMaxWidth: 560
```

`DashboardLayout` menjadi baseline layar operasional padat:

```ts
heroBottomPadding: 72
heroCornerRadius: 32
heroOverlap: 52
summaryMinHeight: 202
taskCardHeight: 68
```

Halaman lain harus memakai `Layout` untuk padding dan ritme umum. Token
`DashboardLayout` hanya dipakai ketika struktur layar mengikuti pola dashboard.

### `apps/mobile/src/theme/typography.ts`

Minimal variant:

- `display`: angka nominal atau judul besar.
- `heading1`, `heading2`, `heading3`.
- `body`, `bodySmall`.
- `label`, `caption`, `button`.

Gunakan `fontWeight` dengan literal type (`as const`) agar sesuai tipe React Native.

### `apps/mobile/src/theme/shadows.ts`

Sediakan:

- `soft`: kartu list.
- `medium`: summary dan form card.
- `strong`: panel autentikasi.

Android memakai `elevation`; properti shadow lain dipertahankan agar struktur style konsisten.

### `apps/mobile/src/theme/index.ts`

Hanya mengekspor token:

```ts
export * from './colors';
export * from './component-sizes';
export * from './radius';
export * from './shadows';
export * from './spacing';
export * from './typography';
```

Tambahkan compatibility export jika screen lama masih membutuhkan bentuk objek sebelumnya.

## Aturan Pemakaian

Benar:

```ts
backgroundColor: Colors.surface.page
borderRadius: Radius.card
padding: Spacing.md
```

Hindari:

```ts
backgroundColor: '#F4F1EA'
borderRadius: 19
padding: 15
```

Warna situasional seperti error tetap harus menjadi token. Jangan menambahkan warna baru di screen hanya karena terlihat menarik.

## Verifikasi Tahap 1

```powershell
pnpm --filter lazisnu-collector-app typecheck
pnpm --filter lazisnu-collector-app lint
```

## Risiko

- Menghapus key lama terlalu cepat akan memecahkan screen.
- Mengubah `background` menjadi object dapat memecahkan pemakaian yang mengharapkan string.
- Font terlalu kecil melanggar kebutuhan petugas lapangan.
