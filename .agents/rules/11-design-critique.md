---
trigger: manual
---

# 11 - Design Critique & Visual Standards

Panduan untuk memberikan feedback desain yang terstruktur pada aspek usability, hierarki visual, dan konsistensi. Gunakan aturan ini saat mereview mockup, screenshot, atau tautan Figma.

## Critique Framework

### 1. First Impression (2 detik)
- Apa yang pertama kali menarik perhatian? Apakah sudah sesuai prioritas?
- Apa reaksi emosional yang muncul?
- Apakah tujuan layar/halaman langsung jelas?

### 2. Usability
- Apakah user bisa mencapai tujuannya dengan mudah?
- Apakah navigasinya intuitif?
- Apakah elemen interaktif (tombol, link) terlihat jelas?
- Apakah ada langkah-langkah yang tidak perlu?

### 3. Visual Hierarchy
- Apakah ada urutan baca yang jelas?
- Apakah elemen yang tepat sudah diberi penekanan (emphasis)?
- Apakah whitespace digunakan secara efektif untuk memisahkan konten?
- Apakah tipografi membantu membangun hierarki informasi?

### 4. Consistency
- Apakah mengikuti design system "Earthy & Premium"?
  - `#2C473E` (Deep Green)
  - `#F4F1EA` (Warm Beige)
  - `#1F8243` (Emerald)
  - `#EAD19B` (Muted Sand)
  - `#D97A76` (Soft Red)
  - `#6B9E9F` (Muted Sand)
  - `#DE6F4A` (Jelly Slug)
  - `#C959A0` (Llilacquered)
  

- Apakah spacing, warna, dan tipografi konsisten di seluruh halaman?
- Apakah elemen serupa berperilaku secara konsisten?

### 5. Accessibility
- Rasio kontras warna (terutama teks di atas background).
- Ukuran target sentuh (touch target) minimal 44x44px untuk mobile.
- Keterbacaan teks (font size & line height).
- Alternative text untuk elemen visual penting.

## Cara Memberikan Feedback

- **Spesifik**: "CTA bersaing dengan navigasi" lebih baik daripada "layout membingungkan".
- **Jelaskan Alasannya**: Hubungkan feedback dengan prinsip desain atau kebutuhan user.
- **Saran Alternatif**: Jangan hanya mengidentifikasi masalah, tawarkan solusi.
- **Match the Stage**: Feedback untuk eksplorasi awal berbeda dengan polesan akhir (final polish).

## Output Format

Gunakan format berikut saat memberikan review desain:

```markdown
## Design Critique: [Nama Desain/Layar]

### Overall Impression
[1-2 kalimat reaksi pertama — apa yang bekerja, apa peluang terbesarnya]

### Usability
| Finding | Severity | Recommendation |
|---------|----------|----------------|
| [Isu] | 🔴 Critical / 🟡 Moderate / 🟢 Minor | [Fix] |

### Visual Hierarchy
- **Primary Focus**: [Elemen] — [Sudah benar/belum?]
- **Reading Flow**: [Bagaimana mata bergerak menyusuri layout?]
- **Emphasis**: [Apakah elemen penting sudah menonjol?]

### Consistency (Earthy & Premium)
| Element | Issue | Recommendation |
|---------|-------|----------------|
| [Typography/spacing/color] | [Inkonsistensi] | [Fix] |

### Accessibility
- **Color contrast**: [Lulus/Gagal untuk teks kunci]
- **Touch targets**: [Ukuran memadai?]
- **Text readability**: [Font size, line height]

### What Works Well
- [Observasi positif 1]
- [Observasi positif 2]

### Priority Recommendations
1. **[Perubahan paling berdampak]** — [Kenapa dan bagaimana]
2. **[Prioritas kedua]** — [Kenapa dan bagaimana]
3. **[Prioritas ketiga]** — [Kenapa dan bagaimana]
```
