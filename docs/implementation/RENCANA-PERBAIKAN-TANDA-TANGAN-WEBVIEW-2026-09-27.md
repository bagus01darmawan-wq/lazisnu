# Rencana Implementasi: Peningkatan Kualitas Tanda Tangan Digital Berbasis WebView (Offline-First)

**Target Proyek:** `apps/mobile` (Lazisnu Collector Mobile App)  
**Dokumen Terkait:** `apps/mobile/src/components/SignaturePad.tsx`, `SignSheet.tsx`, `apps/backend/src/services/cosign.ts`  
**Status:** Siap Dieksekusi  
**Prinsip Utama:** Kualitas Halus (Bézier Smooth), Dukungan Offline 100%, Kepatuhan Batas Ukuran Backend (< 50 KB PNG), Zero Breaking Changes pada API & Dokumen PDF.

---

## 1. Latar Belakang & Masalah Saat Ini

Pengguna/petugas di lapangan merasakan coretan tanda tangan **tidak presisi, patah-patah, kaku, dan lambat merespons**.
Berdasarkan audit teknis, akar penyebabnya adalah:
1. **Algoritma Garis Lurus:** Kanvas lama memakai `react-native-svg` `<Polyline>` tanpa interpolasi kurva lengkung (Bézier).
2. **Re-render Berat di JS Thread:** Event sentuhan jari `onPanResponderMove` memicu `push()` yang memanggil rasterisasi CPU matriks piksel dan `setState` di setiap pergeseran piksel, menyebabkan *dropped frame/lag*.
3. **Resolusi Grid Sangat Rendah:** Grid dipaksa turun ke `240 × 120 px`, sehingga detail lekukan hilang dan hasil tanda tangan pada dokumen PDF terlihat tebal, buram, dan pixelated.

---

## 2. Sasaran Perbaikan

1. **Pengalaman Pengguna (UX):** Coretan licin, responsif tanpa lag, mengikuti ujung jari/stylus secara natural persis seperti platform profesional (*Signaturely / SignWell*).
2. **Offline-First:** Tidak memerlukan koneksi internet untuk menampilkan kanvas tanda tangan (aset HTML & script berjalan lokal di dalam APK).
3. **Kualitas PDF:** Hasil gambar beresolusi tajam saat disematkan ke berkas Berita Acara (BA) PDF di backend.
4. **Keamanan & Kompatibilitas Backend:** Berkas tetap berupa PNG murni (magic bytes `0x89 50 4E 47`) dan ukuran berkas tetap berada di bawah batas ketat server yaitu **50 KB**.
5. **Keutuhan Pengujian (CI/CD):** Seluruh suite tes Jest (`npm test`) tetap berstatus hijau/lulus (34/34 suites, 257+ test).

---

## 3. Komponen & Arsitektur Solusi

Menggunakan standar industri React Native:
- **`react-native-webview`** (v13+): Engine webview terisolasi bawaan sistem OS.
- **`react-native-signature-canvas`**: Komponen kanvas berbasis `signature_pad` (Bézier curve, kecepatan pen, smoothing) yang menyimpan HTML/JS di dalam bundle lokal (offline-first).

```
+-------------------------------------------------------------+
|                        SignSheet.tsx                        |
|  - Nomor & Teks Berita Acara                                |
|  - Checkbox Persetujuan (Consent)                           |
|  +-------------------------------------------------------+  |
|  |                 SignaturePad.tsx                      |  |
|  |   [ react-native-signature-canvas (Offline WebView) ] |  |
|  |   - Cubic Bézier Curve                                |  |
|  |   - Zero JS-thread lag                                |  |
|  |   - Tombol Hapus (Clear)                              |  |
|  +-------------------------------------------------------+  |
|  - Tombol Submit (Validasi hasContent & consent)            |
+-------------------------------------------------------------+
                             |
                   Export PNG Base64
                             |
                             v
               Validasi Ukuran (< 50 KB)
                             |
                             v
                  c1Service.signSubmission
                  c1Service.signBranch
                             |
                             v
             Backend: cosign.ts -> R2 Storage
```



---

## 4. Langkah-Langkah Eksekusi (Step-by-Step)

### Tahap 1: Instalasi Dependensi Mobile
Jalankan instalasi dependensi pada workspace `apps/mobile`:
```bash
cd apps/mobile
npm install react-native-webview react-native-signature-canvas
```
*Catatan Android:* Pada React Native 0.74, library native terhubung otomatis (*autolinked*). Tidak perlu mengubah kode Java/Kotlin manual.

---

### Tahap 2: Konfigurasi Mock Testing (Supaya CI Jest Tetap Hijau)
Karena WebView tidak berjalan di environment test Node.js/Jest tanpa antarmuka grafis, siapkan mock pengujian:

1. Buat / daftarkan mock pada `apps/mobile/jest.setup.js`:
```javascript
jest.mock('react-native-signature-canvas', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      clearSignature: jest.fn(),
      readSignature: jest.fn(),
    }));
    return React.createElement(View, { testID: 'mock-signature-canvas', ...props });
  });
});
```

---

### Tahap 3: Pembaruan `SignaturePad.tsx`
Ganti implementasi `PanResponder` + SVG kaku dengan `SignatureScreen` dari `react-native-signature-canvas`:

**Poin-poin Konfigurasi:**
1. **Style Kanvas Web (CSS):**
   ```css
   .m-signature-pad { box-shadow: none; border: none; background-color: transparent; }
   .m-signature-pad--body { border: none; }
   .m-signature-pad--footer { display: none; margin: 0px; }
   body, html { width: 100%; height: 100%; background-color: transparent; }
   ```
2. **Pengaturan Kuas (Pen):**
   - `minWidth`: 1.5
   - `maxWidth`: 3.5
   - `dotSize`: 2.0
   - `penColor`: `'#1a1a1a'`
3. **Format Output:**
   - Bersihkan prefix URI: `signature.replace('data:image/png;base64,', '')`.
   - Teruskan data ke callback `onChange(base64, hasContent)`.

---

### Tahap 4: Penyesuaian `SignSheet.tsx`
1. Pastikan status `hasContent` terdeteksi saat goresan pertama dimulai (`onBegin`).
2. Hubungkan tombol "Hapus" dengan memanggil metode `clearSignature()`.
3. Saat tombol "Tanda Tangani" ditekan:
   - Ambil Base64 PNG.
   - Pastikan ukurannya $\le 50\text{ KB}$ (standar `cosign.ts`).
   - Teruskan ke fungsi `onSubmit(b64)`.

---

### Tahap 5: Verifikasi & Pengujian Kualitas

1. **Uji Validasi TypeScript:**
   ```bash
   cd apps/mobile
   npm run typecheck
   ```
   *Target: 0 error.*

2. **Uji Otomatis Unit Test:**
   ```bash
   cd apps/mobile
   npm test -- SignSheet.test.tsx
   npm test
   ```
   *Target: 100% Passed.*

3. **Uji Verifikasi Manual (Device / Emulator):**
   - **Kelenturan Gerakan:** Coret tanda tangan cepat dan lambat; pastikan garis mulus dan bebas lag.
   - **Uji Mode Offline:** Aktifkan **Mode Pesawat (Airplane Mode)** pada HP. Kanvas wajib tetap muncul dan dapat digoreskan.
   - **Uji Kepatuhan Server:** Kirim tanda tangan, pastikan status berhasil tersimpan menjadi `FINAL` dan diunggah ke R2 tanpa error `VALIDATION_ERROR`.
   - **Uji Cetak PDF:** Unduh Berita Acara PDF, pastikan gambar tanda tangan tajam dan bersih.

---

## 5. Rencana Rollback (Mitigasi Risiko)

Jika terjadi kendala pada lingkungan build tertentu:
- File lama `signaturePng.ts` tetap dipertahankan sebagai modul cadangan.
- Pembalikan (*revert*) dapat dilakukan cepat pada commit `SignaturePad.tsx` tanpa mempengaruhi skema database backend maupun berkas R2.
