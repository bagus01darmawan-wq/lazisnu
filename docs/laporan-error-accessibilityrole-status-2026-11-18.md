# Laporan — Crash "Invalid accessibility role value: status" (2026-11-18)

## Ringkasan eksekutif

Aplikasi crash fatal di perangkat saat header utama menampilkan bar "Periode dari
penyimpanan — menyinkronkan…" (periode dibaca dari cache offline). Penyebab tunggal:
atribut `accessibilityRole="status"` dipakai pada sebuah `View`, padahal nilai `"status"`
**tidak ada** dalam enum `AccessibilityRole` Android React Native 0.88. `ViewManager`
native menolak prop itu dan melempar `IllegalArgumentException` — merobohkan seluruh JS frame.

Perbaikan: hapus role yang tidak valid dan gunakan `accessibilityLiveRegion="polite"`
untuk status non-mendesak di Android. Test regresi memeriksa banner dan atribut
`accessibilityRole` JSX eksplisit di `src/`; perilaku perangkat masih perlu diuji.

## Kronologi & gejala

- 2026-11-18, pengguna melaporkan aplikasi crash saat dibuka di HP (screenshot: layar
  merah RN dengan error):
  ```
  Error while updating property 'accessibilityRole' of a view managed by: RCTView
  Invalid accessibility role value: status
  ```
- Error terkait banner "periode basi" saat data periode berasal dari cache; karena itu
  kondisi ini tidak selalu muncul setiap aplikasi dibuka.

## Akar masalah

1. Commit `d2c2d4e` (`fix(mobile): tandai periode basi dari cache offline, bar sync di
   header utama`) menambahkan bar sinkronisasi di `AppHeader.tsx` dengan
   `accessibilityRole="status"`.
2. Android menerima hanya nilai `AccessibilityRole` dari enum native
   (`ReactAccessibilityDelegate.kt`, RN 0.88): `none, button, dropdownlist, togglebutton,
   link, search, image, imagebutton, keyboardkey, text, adjustable, summary, header,
   alert, checkbox, combobox, menu, menubar, menuitem, progressbar, radio, radiogroup,
   scrollbar, spinbutton, switch, tab, tabbar, tablist, timer, list, grid, pager,
   scrollview, horizontalscrollview, viewgroup, webview, drawerlayout, slidingdrawer,
   iconmenu, toolbar` (case-insensitive).
3. `"status"` adalah nilai ARIA, tetapi tidak ada dalam enum `accessibilityRole` Android:
   native melempar `IllegalArgumentException` pada `updateViewProp`.

## Perbaikan

**`src/components/ui/AppHeader.tsx`**
```diff
-            accessibilityRole="status"
+            accessibilityLiveRegion="polite"
```
Label aksesibilitas lama dipertahankan. `accessibilityLiveRegion="polite"` meminta
pengumuman non-interuptif di Android, tetapi apakah TalkBack mengumumkan banner yang baru
dipasang dan membacakan labelnya belum dibuktikan. Perilaku VoiceOver di iOS juga belum diuji.

## Test regresi

File: `apps/mobile/__tests__/components/AppHeader.test.tsx`

1. **Render banner periode basi** — `isStale: true` di store → banner tampil; node
   banner punya `accessibilityLiveRegion === 'polite'` dan tidak punya `accessibilityRole`.
2. **Audit atribut JSX eksplisit di `src/`** — parser TypeScript memeriksa literal dan
   kedua cabang ekspresi conditional terhadap enum Android dari React Native yang
   terpasang. `null` dan `undefined` diizinkan; ekspresi dinamis lain ditolak karena
   tidak dapat diverifikasi secara statis. Ada test untuk role valid, role invalid pada
   cabang conditional, dan nilai dinamis.

Batas audit: hanya atribut `accessibilityRole` yang ditulis eksplisit pada JSX dalam
file `.ts`/`.tsx` di `src/`. Audit tidak menelusuri props dari spread, `createElement`,
atau kode di luar cakupan tersebut. Test renderer dan audit tidak menjalankan validasi
native atau membuktikan perilaku TalkBack.

## Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| Typecheck dan Jest full sebelum revisi audit | Dilaporkan bersih: 47 suites / 329 tests; bukan verifikasi revisi audit |
| Setelah revisi: `npx tsc --noEmit` dan ESLint file test | Lulus |
| Setelah revisi: Jest `AppHeader.test.tsx --runInBand` | 5/5 test lulus |
| Device Android dan TalkBack | Belum diuji setelah perbaikan |
| VoiceOver iOS | Belum diuji |

## Pelajaran proses

- `accessibilityRole` harus divalidasi terhadap enum native Android, bukan disamakan
  dengan role ARIA.
- Pemeriksaan sintaks mengurangi risiko role invalid pada atribut JSX eksplisit,
  tetapi tidak menggantikan pemeriksaan native dan punya batas cakupan di atas.
- CI hijau tidak membuktikan tidak ada crash native atau pengumuman screen reader yang benar.

## Status

Perbaikan banner ada di `AppHeader.tsx`; audit dan test regresi ada di
`__tests__/components/AppHeader.test.tsx`. Status commit/push perlu diperiksa terpisah.

Untuk verifikasi perangkat: gunakan build terbaru, munculkan banner melalui kondisi
periode dari cache, pastikan aplikasi tidak crash, lalu aktifkan TalkBack dan periksa
banner saat layar dibuka serta saat banner muncul ketika layar sudah aktif. Catat versi
Android, build, teks yang dibacakan, dan apakah pengumuman berulang atau mengganggu.
