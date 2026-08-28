# Konvensi Spacing Judul Section — Mobile

> Ditetapkan: 2026-08-28 (hasil audit jarak layar, keputusan user — Opsi 2 "akar masalah").
> Latar: pengukuran piksel di HP fisik (440dpi, 1dp = 2,75px) menemukan jarak judul-section
> dari header hijau tidak seragam antar layar (0/16/24dp) karena tiap layar menulis style sendiri.

## Aturan

Judul section (`Typography.heading3`, warna `Colors.brand.deepGreen`) wajib memakai:

| Posisi judul | Token | Nilai | Contoh |
|---|---|---|---|
| **Pertama** setelah header hijau | `Spacing.md` | 16dp (44px @440dpi) | "Hari Ini", "Informasi akun", "Terbaru", "Perlu Dijemput" |
| **Berikutnya** di tengah halaman | `Spacing.lg` | 24dp (66px @440dpi) | "Bulan Ini", "Detail Kaleng", "Keamanan Biometrik" |

Angka 24dp dipilih karena sudah dipakai mayoritas layar sebelum konvensi ini —
aturan ini membakukan praktik yang sudah ada, bukan menambah nilai baru.

## Implementasi

Setiap layar mendefinisikan dua style di `StyleSheet`-nya:

```tsx
sectionTitle: {
  ...Typography.heading3,
  color: Colors.brand.deepGreen,
  marginTop: Spacing.lg,        // judul tengah halaman
  marginBottom: Spacing.sm,
},
sectionTitleFirst: {marginTop: Spacing.md}, // override utk judul pertama
```

Pemakaian di JSX:

```tsx
<Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>Informasi akun</Text>
<Text style={styles.sectionTitle}>Keamanan Biometrik</Text>
```

**Larangan:**
- Dilarang mencapai jarak judul pertama lewat `paddingTop` container list —
  jarak harus datang dari `marginTop` judul itu sendiri (satu mekanisme, mudah diaudit).
- Dilarang memakai angka literal (margin/marginTop selain token `Spacing`).

## Pemetaan layar (saat konvensi ditetapkan)

| Layar | Judul pertama | Perubahan yang dilakukan |
|---|---|---|
| Dashboard | "Hari Ini" | 0dp → 16dp (sebelumnya tanpa margin) |
| Tugas | "Perlu Dijemput" | **judul baru** (sebelumnya tidak ada judul) |
| Riwayat | "Terbaru" | 16dp (sudah benar; `paddingTop` container dipindah ke `marginTop` judul; style `listTitle` → `sectionTitle`) |
| Profil | "Informasi akun" | 24dp → 16dp (`sectionTitleFirst`) |
| Collection | "Detail penerimaan" | 24dp → 16dp (`sectionTitleFirst`) |

Catatan Dashboard: ritme antar-section ("Hari Ini" → "Bulan Ini" → "Lihat Rekap")
tetap memakai `sectionGap` (24dp) — setara token `Spacing.lg`, tidak diubah.

## Cara verifikasi cepat

1. `pnpm run typecheck` + `pnpm exec eslint src/`.
2. Live di HP: `adb shell uiautomator dump` → bandingkan `bounds` teks judul
   dengan tepi bawah header; selisih ÷ 2,75 harus = 16dp (pertama) / 24dp (tengah).
