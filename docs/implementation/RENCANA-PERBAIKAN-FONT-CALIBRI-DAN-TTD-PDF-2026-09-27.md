# Rencana Implementasi: Modernisasi Font Calibri Size 12, Template Kop Resmi & Presisi Tanda Tangan PDF BAST (baPdfService)

**Tanggal:** 27 September 2026  
**Dokumen Terkait:**  
- `apps/backend/src/services/baPdfService.ts`  
- `apps/backend/src/services/beritaAcara.ts`  
- `apps/backend/src/services/__tests__/baPdfRender.unit.test.ts`  
- `apps/backend/src/services/__tests__/beritaAcara.test.ts`  
- `docs/implementation/RENCANA-PERBAIKAN-TANDA-TANGAN-WEBVIEW-2026-09-27.md`  

---

## 1. Latar Belakang & Tujuan

Berdasarkan keputusan organisasi LAZISNU dan evaluasi mendalam atas kode generator PDF saat ini:
1. **Penetapan Font Resmi Calibri Size 12:**
   - Standar dokumen resmi BAST LAZISNU mewajibkan font **Calibri ukuran 12 pt**.
   - Saat ini `baPdfService.ts` masih menggunakan `StandardFonts.Helvetica` (bawaan PDF) dengan ukuran default `10 pt` dan font-level sanitasi WinAnsi (`asciiSafe()`) yang berisiko mengubah karakter nama/alamat menjadi tanda tanya (`?`).
   - `pdf-lib` secara native memerlukan modul pembaca font (`@pdf-lib/fontkit`) dan pendaftaran `doc.registerFontkit(fontkit)` agar dapat membaca serta menyematkan berkas custom font TrueType (`.ttf`).
2. **Pemanfaatan Template Kop Resmi BAST (Official Letterhead Background):**
   - Menggunakan berkas template PDF kosong resmi (`contoh BA kosong mwc.pdf` / `ba-template-mwc.pdf`) yang telah memuat logo resmi UPZIS LAZISNU MWCNU Kecamatan Paninggaran di kiri atas, ornamen grafis hijau di pojok kanan bawah, dan garis aksen hijau di kiri bawah.
   - Menggantikan pembangkitan kop manual secara sintetis (`drawKop()`), sehingga tampilan visual PDF 100% identik dengan standar cetak naskah resmi MWC Paninggaran dan tetap berformat vektor tajam.
3. **Penyelarasan Struktur Konten BAST Format Resmi MWC:**
   - Menghilangkan tabel ringkasan atas yang redundan.
   - Mengadopsi narasi resmi:
     - Judul: **BERITA ACARA SERAH TERIMA (BAST)**
     - Nomor Surat: Rata tengah di bawah judul (`Nomor: ...`)
     - Paragraf Pembuka: Hari, Tanggal, Bulan, Tahun bertempat di Kantor UPZIS MWCNU Kec. Paninggaran.
     - Blok Para Pihak (PIHAK PERTAMA dan PIHAK KEDUA) dengan titik dua (`:`) rata vertikal yang rapi.
     - Klausul penyerahan donasi koin/kaleng dan rincian tabel perolehan.
4. **Sinkronisasi Rasio Kotak Tanda Tangan:**
   - Sejalan dengan migrasi Signature Pad mobile ke kanvas WebView resolusi tinggi (Bézier smooth), gambar PNG tanda tangan yang dikirimkan memiliki resolusi lebih tajam namun tetap dalam batas `50 KB` dan format PNG sah (`0x89 50 4E 47`).
   - Di `baPdfService.ts`, kalkulasi penempatan gambar tanda tangan (`drawImage`) saat ini:
     ```typescript
     const w = 130;
     const h = Math.min((img.height / img.width) * w, 60);
     ```
     Formula ini hanya membatasi tinggi maksimal 60 pt, namun tidak membatasi jika rasio gambar tanda tangan terlalu tinggi (vertikal/kotak) atau terlalu melebar, sehingga berpotensi keluar dari batas vertikal blok atau menabrak teks nama penandatangan di bawahnya. Perlu pembatasan *bounding box* dua dimensi (*contain aspect ratio*) yang matematis dan presisi.

---

## 2. Hasil Audit Teknis & Temuan Mendalam

### 2.1 Integrasi Template PDF Resmi (`ba-template-mwc.pdf`)
- **Sumber Berkas Template:**
  - File sumber: `E:\NU RANTING PANTIM\UPZIS\contoh BA kosong mwc.pdf` (Ukuran A4: 595.32 pt × 841.92 pt).
  - Target aset backend: `apps/backend/src/assets/templates/ba-template-mwc.pdf`.
- **Mekanisme Pemuatan pada `pdf-lib`:**
  - Template dimuat ke memori sekali (*cached in-memory buffer*):
    ```typescript
    const templateDoc = await PDFDocument.load(templateBuffer);
    const [templatePage] = await doc.copyPages(templateDoc, [0]);
    doc.addPage(templatePage);
    ```
  - Halaman dokumen BAST langsung mewarisi seluruh vektor logo, ornamen garis, dan lengkungan hijau resmi tanpa perlu direkonstruksi manual lewat kode.
  - **Graceful Fallback:** Jika berkas template tidak ditemukan di lingkungan tertentu (misalnya pengujian terisolasi), generator otomatis membuat halaman kosong A4 standar dan menggambar kop darurat agar build/test tidak terhenti.

### 2.2 Mekanisme Font pada `pdf-lib`
- **Fakta:** Menjalankan `doc.embedFont(calibriBytes)` langsung pada `pdf-lib` tanpa registrasi `fontkit` akan memicu eksepsi fatal:
  > `Input to PDFDocument.embedFont was a custom font, but no fontkit instance was found. You must register a fontkit instance with PDFDocument.registerFontkit(...) before embedding custom fonts.`
- **Solusi Bersih:** 
  1. Pasang dependensi `@pdf-lib/fontkit` di `apps/backend/package.json`.
  2. Letakkan file font resmi `calibri.ttf` (Regular) dan `calibrib.ttf` (Bold) pada direktori aset backend: `apps/backend/src/assets/fonts/`.
  3. Baca buffer font sekali saat modul dimuat (*cached in-memory buffer*), bukan membaca ulang disk I/O setiap kali fungsi render dipanggil.
  4. Panggil `doc.registerFontkit(fontkit)` saat inisialisasi dokumen di `newBaDoc()`, lalu `doc.embedFont(calibriBuffer)` dan `doc.embedFont(calibriBoldBuffer)`.

### 2.2 Penyesuaian Tipografi & Spasi Tata Letak (Size 12)
- Saat font dinaikkan dari `10 pt` ke `12 pt`:
  - **Tinggi Garis Teks (*Line Height*):** Spasi antar baris tabel dan paragraf harus proporsional agar teks tidak bertumpuk.
  - **Tabel BAST:** Jarak vertikal per baris tabel disesuaikan dari `18 pt` menjadi `20 pt` agar baris nominal dan label tetap lega pada font 12 pt.
  - **Kop Dokumen:** Tetap proporsional (Judul BAST: 13 pt bold, Kode Form: 10 pt regular).
  - **Paragraf Pernyataan BAST:** Diatur `size: 12`, `gap: 6`.
  - **Nomor BAST:** Diatur `size: 12`, `bold: true`.
  - **Fallback Aman:** Jika berkas font TTF gagal dibaca dari disk pada lingkungan tertentu, sistem memiliki *graceful fallback* ke `StandardFonts.Helvetica` agar unit test dan CI pipeline tidak terputus.

### 2.3 Presisi Kotak Tanda Tangan (*Bounding Box Contain*)
- **Dimensi Alokasi Kolom TTD:**
  - Lebar kolom penandatangan: `colW = CONTENT_WIDTH / 2` ($\approx 249.64\text{ pt}$).
  - Area maksimal tanda tangan (*bounding box*): Lebar maksimal $W_{max} = 130\text{ pt}$, Tinggi maksimal $H_{max} = 60\text{ pt}$.
- **Rumus Skala Presisi (*Aspect Fit*):**
  Untuk mencegah gambar gepeng atau meluap:
  $$\text{scale} = \min\left(\frac{W_{max}}{\text{img.width}},\, \frac{H_{max}}{\text{img.height}}\right)$$
  $$w = \text{img.width} \times \text{scale}$$
  $$h = \text{img.height} \times \text{scale}$$
  $$x_{pos} = x + \frac{colW - w}{2}$$
  $$y_{pos} = y - \frac{H_{max} + h}{2}$$ (rata tengah vertikal di slot $60\text{ pt}$).
- **Hasil:**
  - Tanda tangan dari rasio apa pun (persegi, memanjang, maupun standar 2:1) akan selalu berada di tengah kolom penandatangan tanpa distorsi aspek rasio dan tanpa menabrak teks nama di bawahnya.

### 2.5 Penempatan QR Code Verifikasi
- QR Code verifikasi BAST diletakkan di sisi kiri bawah ($x = 48\text{ pt}, y = 45\text{ pt}$) tepat di atas ornamen garis hijau footer, menjaga keseimbangan estetika dokumen resmi.

---

## 3. Langkah-Langkah Eksekusi Bertahap

### Fase 1: Persiapan Dependensi & Aset Backend
1. **Tambahkan `@pdf-lib/fontkit`:**
   ```bash
   pnpm add -F lazisnu-backend @pdf-lib/fontkit
   ```
2. **Penyediaan Aset Font & Template:**
   - Direktori font: `apps/backend/src/assets/fonts/` (`calibri.ttf`, `calibrib.ttf`)
   - Direktori template: `apps/backend/src/assets/templates/` (`ba-template-mwc.pdf`) disalin dari `E:\NU RANTING PANTIM\UPZIS\contoh BA kosong mwc.pdf`.
   - Pastikan path aset terbaca baik pada saat development (`tsx`) maupun saat build production (`dist/`).

### Fase 2: Implementasi Registrasi Font & Pemuatan Template di `baPdfService.ts`
1. Registrasi fontkit & pembacaan buffer font serta template secara *cached in-memory*.
2. Modifikasi `newBaDoc()` untuk menyalin halaman template kosong (`copyPages`) jika berkas template tersedia, dan menyematkan Calibri (Regular & Bold) dengan fallback ke Helvetica.

### Fase 3: Standardisasi Layout Isi BAST Sesuai Format MWC
1. Hapus tabel ringkasan atas yang redundan.
2. Cetak Judul BAST dan Nomor Dokumen di posisi koordinat yang telah disesuaikan dengan kop template.
3. Rata tengah teks judul/nomor dan rapikan narasi para pihak dengan format titik dua sejajar.
4. Terapkan ukuran font standar 12 pt untuk seluruh paragraf dan tabel rincian nominal.

### Fase 4: Presisi Rumus Kotak Tanda Tangan di `drawSignatures()`
Perbarui kalkulasi ukuran dan letak gambar di `baPdfService.ts`:
```typescript
if (s?.image) {
  try {
    const img = await p.doc.embedPng(s.image);
    const boxW = 130;
    const boxH = 60;
    const scale = Math.min(boxW / img.width, boxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const imgX = x + (colW - w) / 2;
    const imgY = y - (boxH + h) / 2;
    p.page.drawImage(img, { x: imgX, y: imgY, width: w, height: h });
  } catch {
    p.page.drawText(asciiSafe('(arsip coretan tidak terbaca)'), { x, y: y - 12, size: 9, font: p.font, color: rgb(0.4, 0.4, 0.4) });
  }
  y -= 68;
}
```

### Fase 5: Pengujian & Validasi Mutu (Quality Assurance)
1. **Validasi Unit Test Renderer:**
   Jalankan:
   ```bash
   pnpm --filter lazisnu-backend test baPdfRender.unit.test.ts
   ```
   Pastikan seluruh skenario BAST PPK dan BAST Ranting tetap lulus (`PASS`).
2. **Validasi Visual PDF:**
   Generate contoh berkas PDF BAST dan periksa keutuhan logo template MWC, ketajaman ornamen, kerapian font Calibri 12 pt, serta proporsi tanda tangan digital.

---

## 4. Matriks Risiko & Mitigasi

| Risiko Potensial | Mitigasi |
|---|---|
| Berkas font `.ttf` atau template `.pdf` tidak terbawa saat build `dist/` | Gunakan pengecekan keberadaan berkas secara dinamis dengan *graceful fallback* ke `StandardFonts.Helvetica` dan kop sintetis darurat jika aset disk tidak ditemukan. Salin aset pada build script. |
| Ukuran berkas PDF membengkak karena *embedded font & template* | Template PDF vektor hanya berukuran ~150 KB dan font subsetting oleh `pdf-lib` menjaga ukuran output akhir tetap sangat efisien (~180–220 KB), sangat cepat diunduh di aplikasi mobile. |
| Benturan baris jika teks nama pejabat sangat panjang | Fungsi `wrapText()` dan pemusatan teks `(colW - w) / 2` menjaga teks tetap berada di koridor kolom masing-masing tanpa menabrak kolom pihak sebelahnya. |

---

## 5. Status Dokumen
- **Status:** *Ready for Implementation* (Siap Dieksekusi)

