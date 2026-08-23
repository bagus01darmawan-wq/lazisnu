# Product Requirements Document (PRD)
# Website Publik — UPZIS-LAZISNU MWCNU Paninggaran

## 0. Informasi Umum

| Item | Detail |
|------|--------|
| **Nama Produk** | Website Publik UPZIS-LAZISNU MWCNU Paninggaran |
| **Branding Tampil** | NUCARE-LAZISNU Kec. Paninggaran |
| **Tipe** | Website publik (identitas organisasi + transparansi + donasi online) |
| **Lembaga** | UPZIS-LAZISNU MWCNU Paninggaran (struktur MWCNU Paninggaran, Kab. Pekalongan) |
| **URL Produksi** | https://upzispng.lazisnu.site |
| **Versi PRD** | 1.1 (draft ulasan) |
| **Tanggal** | 8 Agustus 2026 |
| **Relasi Sistem** | Bagian dari monorepo `lazisnu` (melengkapi mobile app petugas & dashboard.lazisnu.site) |

---

## 1. Kerangka Pegangan: 4 Sisi

Seluruh isi PRD ini — setiap keputusan produk, fitur, dan fase — dievaluasi dan ditulis dari **4 sisi** yang saling menyeimbangkan. Ini adalah pegangan utama pembuatan website.

| Sisi | Pertanyaan Inti | Diatur di Bagian |
|------|-----------------|------------------|
| **1. Sisi Pengguna** (UX / User-Centered Design) | "Apakah pengunjung & donatur mudah, paham, dan percaya?" | §4 |
| **2. Sisi Bisnis** (Product / Business Requirements) | "Apakah website mencapai tujuan organisasi & keberlanjutan dana?" | §5 |
| **3. Sisi Teknologi** (Software Architecture) | "Apakah sistem benar, aman, dan rapi dalam monorepo?" | §6 |
| **4. Sisi Operasional** (DevOps / Site Reliability) | "Apakah website selalu hidup, termonitor, dan mudah dirawat?" | §7 |

**Aturan Penyelesaian Konflik Antar-Sisi:**
1. **Keamanan & keamanahan dana** tidak dapat ditawar (non-negotiable) — ini mewarisi 3 pilar sistem induk.
2. Jika masih ada konflik: **Pengguna > Bisnis > Teknologi > Operasional** (pilih solusi teknis & operasional yang paling sederhana yang memenuhi pengguna dan bisnis).
3. Pengecualian: keandalan tayangnya **Laporan Publik** (Sisi Operasional) setara bobot dengan Sisi Pengguna, karena transparansi adalah janji utama produk ini.

**Matriks pengecekan 4-sisi untuk semua fitur besar ada di §8** — menjadi gate review bersama sebelum implementasi.

---

## 2. Latar Belakang & Tujuan

Sistem digital internal (mobile petugas + dashboard admin) sudah berjalan, namun **belum ada kanal publik**. Masyarakat tidak punya tempat untuk: (1) mengenal lembaga, (2) memverifikasi pelaporan dana ZIS yang amanah, (3) berdonasi tanpa menunggu petugas kaleng.

**Tujuan (dilihat dari 4 sisi):**

| No | Tujuan | Sisi Dominan |
|----|--------|--------------|
| T1 | Identitas & kredibilitas organisasi di domain resmi `lazisnu.site` | Bisnis + Pengguna |
| T2 | Media pelaporan ke khalayak: statistik otomatis + laporan resmi PDF — selalu tersedia, mudah dipahami awam | Pengguna + Operasional |
| T3 | Kanal donasi online yang aman (QRIS/VA/e-wallet) | Bisnis + Teknologi |
| T4 | Donasi online tercatat & dilaporkan sebagai kategori khusus `DONASI_ONLINE` — tanpa mengganggu audit trail koleksi kaleng | Teknologi + Bisnis |

---

## 3. Keputusan Produk (Hasil Konfirmasi)

| ID | Topik | Keputusan | Sisi Terkait |
|----|-------|-----------|--------------|
| K-01 | Nama resmi | "UPZIS-LAZISNU MWCNU Paninggaran"; branding "NUCARE-LAZISNU Kec. Paninggaran" | Bisnis |
| K-02 | Sumber data laporan | **Hybrid**: statistik agregat otomatis + laporan PDF diunggah manual | Pengguna + Teknologi |
| K-03 | CTA utama | **Donasi online** via payment gateway | Bisnis |
| K-04 | Metode pembayaran | **Lengkap**: QRIS + VA bank + e-wallet (GoPay/OVO/DANA/ShopeePay) | Bisnis + Pengguna |
| K-05 | Alur data donasi | **Kategori khusus** `DONASI_ONLINE`, terpisah dari koleksi kaleng | Teknologi |
| K-06 | Kelola konten | Lewat **dashboard internal** (menu "Konten Website"), tanpa panel baru | Operasional + Bisnis |
| K-07 | Payment gateway | **Bandingkan dulu** (§5.4) — final oleh pengurus | Bisnis + Operasional |

---

# 4. SISI PENGGUNA — UX / User-Centered Design

> Pertanyaan inti: **apakah pengunjung & donatur mudah, paham, dan percaya?**

## 4.1 Persona & Konteks Penggunaan

| Persona | Kebutuhan | Konteks |
|---------|-----------|---------|
| **Warga NU / umum** | Mengenal lembaga, program, legalitas | Akses dari HP (mobile-first, layar 360px, jaringan 3G/4G tidak stabil) |
| **Donatur** | Memeriksa transparansi; donasi cepat tanpa ribet | Datang dari tautan WA/FB; ingin selesai < 2 menit |
| **Pengawas / khalayak akuntabilitas** (bendahara, PCNU, BAZNAS setempat, tokoh) | Memverifikasi laporan keuangan & penyaluran | Bisa mengunduh PDF resmi kapan pun |
| **Admin internal** | Mengunggah konten laporan/berita | Lewat dashboard yang sudah familiar (K-06) |

## 4.2 Prinsip UX

1. **Mobile-first** — nyaman di 360px; target sentuh ≥ 44px.
2. **Percaya dulu, donasi kemudian** — hierarki konten selalu menampilkan bukti amanah (transparansi, verifikasi WA, legalitas) sebelum/selama CTA donasi.
3. **Bahasa rakyat** — istilah keuangan wajib disertai definisi singkat (gross, periode, dst.).
4. **Satu CTA primer per layar** — "Donasi" selalu menonjol (emerald), sisanya sekunder.
5. **Aksesibilitas AA** — kontras AA, `alt` gambar, navigasi keyboard, teks nyaman dibaca lansia.

## 4.3 Struktur Halaman (Sitemap)

```
upzispng.lazisnu.site
├── /            → Beranda
├── /profil      → Sejarah, Visi-Misi, Struktur Pengurus, Legalitas
├── /laporan     → Laporan Publik (statistik + dokumen PDF)
├── /program     → Program Penyaluran
├── /kegiatan    → Berita & Dokumentasi (+ /kegiatan/[slug])
├── /kontak      → Kontak Pengurus & Peta Lokasi
└── /donasi      → Donasi Online (form + checkout + status)
```

Navigasi global (header sticky): **Beranda · Profil · Laporan · Program · Kegiatan · Kontak** + CTA **"Donasi"**.
Footer: logo NU & Lazisnu, legalitas, tautan cepat, kontak, sosial media, badge "Sistem Amanah — audit trail & verifikasi WhatsApp".

## 4.4 Fitur per Halaman

### Beranda (`/`)
| No | Fitur | Prioritas | Detail |
|----|-------|-----------|--------|
| H1 | Hero | Must Have | Headline besar, CTA ganda "Donasi Sekarang" + "Lihat Laporan", foto/ilustrasi kegiatan |
| H2 | Strip Statistik Live | Must Have | Total periode berjalan, jumlah kaleng, donatur, ranting (API publik, counter animasi) |
| H3 | Highlight Program | Must Have | 3 kartu + tautan /program |
| H4 | Kenapa Berdonasi di Sini | Should Have | Amanah (verifikasi WA anti-fraud) · Transparan (laporan publik) · Dekat (NU Paninggaran) |
| H5 | Kegiatan Terbaru | Must Have | 3 kartu berita + tautan /kegiatan |
| H6 | CTA Banner | Must Have | Ajakan donasi + kontak WA |
| H7 | Testimoni | Nice to Have | Kutipan donatur/tokoh |

### Profil (`/profil`)
| No | Fitur | Prioritas |
|----|-------|-----------|
| P1 | Sejarah singkat | Must Have |
| P2 | Visi & Misi | Must Have |
| P3 | Struktur Pengurus (nama/jabatan/foto opsional) | Must Have |
| P4 | Legalitas (SK, status LAZNU, afiliasi NU) | Must Have |
| P5 | Relasi ke LAZISNU tingkat atas | Should Have |

### Laporan Publik (`/laporan`)
| No | Fitur | Prioritas | Detail |
|----|-------|-----------|--------|
| L1 | Ringkasan periode | Must Have | Kartu total penghimpunan; **pisahkan "Koleksi Kaleng" vs "Donasi Online"** (K-05) |
| L2 | Grafik tren | Must Have | 12 bulan, batang/garis |
| L3 | Agregat per ranting | Must Have | Tanpa identitas personil |
| L4 | Filter periode | Must Have | Bulan + tahun |
| L5 | Arsip Dokumen Resmi | Must Have | PDF laporan: judul, periode, ukuran, unduh |
| L6 | Laporan Penyaluran | Should Have | Ringkasan per program |
| L7 | Unduh ringkasan gambar | Nice to Have | Ekspor untuk dibagikan ke WA |

**Batasan publik:** hanya **agregat**. Nama donatur, pemilik kaleng, nominal per nama, dan petugas **tidak** diekspos.

### Program (`/program`)
| No | Fitur | Prioritas |
|----|-------|-----------|
| G1 | Kartu program (judul, deskripsi, foto) | Must Have |
| G2 | Status (berjalan/selesai) | Should Have |
| G3 | CTA donasi per program (`?program=`) | Should Have |

### Kegiatan (`/kegiatan`)
| No | Fitur | Prioritas |
|----|-------|-----------|
| B1 | Daftar artikel (kartu) | Must Have |
| B2 | Detail artikel (rich text + gambar) | Must Have |
| B3 | Pencarian/paginasi | Should Have |

### Kontak (`/kontak`)
| No | Fitur | Prioritas |
|----|-------|-----------|
| K1 | Tombol chat WhatsApp admin | Must Have |
| K2 | Peta Google Maps sekretariat | Must Have |
| K3 | Alamat, email, jam layanan | Must Have |
| K4 | Media sosial | Should Have |

### Donasi (`/donasi`)
| No | Fitur | Prioritas | Detail |
|----|-------|-----------|--------|
| D1 | Form donasi | Must Have | Jenis dana (Infaq Umum/Zakat/Sedekah Program), nominal preset + custom, nama opsional (boleh "Hamba Allah"), no. HP untuk bukti |
| D2 | Pilih metode | Must Have | QRIS, VA (sesuai gateway), e-wallet |
| D3 | Checkout | Must Have | Snap/Direct API — QR / nomor VA / redirect wallet |
| D4 | Status & bukti | Must Have | pending → berhasil/gagal/kedaluwarsa; struk unduh |
| D5 | WA konfirmasi donatur | Should Have | Template baru ucapan terima kasih (bukan template anti-fraud) |
| D6 | Kalkulator zakat | Nice to Have | Zakat maal/profesi → "Tunaikan" |
| D7 | Pendaftaran kaleng | Nice to Have (F3) | Form minta kaleng → antrean admin |

## 4.5 Arah Desain Visual (untuk diulas)

**Kata kunci:** *modern, hangat, amanah, terang, NU namun tidak kaku.*

Dashboard internal memakai "Earthy & Premium" beralas gelap untuk operator lama-bekerja. Website publik memakai DNA warna sama namun **latar terang**, agar segar & mudah dibaca santai.

| Token | Hex | Pemakaian |
|---|---|---|
| Deep Green | `#2C473E` | Heading, footer, section gelap bergantian |
| Emerald | `#1F8243` | CTA primer "Donasi", link, angka kunci |
| Muted Sand | `#EAD19B` | Badge, aksen/dekorasi, CTA di latar gelap |
| Warm Beige | `#F4F1EA` | Section hangat, kartu |
| Off-White | `#FBFAF7` | Latar dasar utama |
| Terracotta | `#DE6F4A` | Aksen hover/interaktif ringan |
| Teal | `#6B9E9F` | Elemen chart sekunder |

- **Tipografi:** heading sans modern (mis. "Sora"/"Plus Jakarta Sans"), body sans nyaman (mis. "Inter"/"Plus Jakarta Sans").
- **Bentuk:** radius besar 16–24px, bayangan lembut, glassmorphism tipis di header.
- **Motion halus:** scroll-reveal fade-up, counter statistik, hover lift; ringan untuk perangkat low-end.
- **Elemen khas NU/Lazisnu:** aksen geometri Islami + bintang sembilan sebagai ornamen subtil; logo NU & Lazisnu di header/footer.
- **Foto:** dokumentasi nyata (disediakan pengurus); sementara boleh ilustrasi bernuansa gotong-royong; dilarang stok tak berizin.

**Kerangka layout Beranda (draf):**
```
[Header sticky: logo | menu | tombol Donasi (emerald)]
[Hero: teks kiri, foto/ilustrasi kanan, 2 CTA, badge "Amanah & Transparan"]
[Strip statistik: 4 kartu counter]
[Program unggulan: 3 kartu]
[Nilai "Kenapa di sini": 3 poin ikon]
[Section gelap Deep-Green: kutipan + ringkasan laporan → CTA]
[Kegiatan terbaru: 3 kartu]
[Banner CTA + footer]
```

## 4.6 Kriteria Keberhasilan Sisi Pengguna (KPI-UX)

| Metrik | Target |
|---|---|
| Funnel donasi: kunjungan → mulai checkout → selesai | terukur; konversi checkout→selesai ≥ 80% (setelah stabil) |
| Lighthouse (Perf/A11y/SEO) di perangkat rata-rata | ≥ 90 semua kategori |
| WPM pengunjung (alamat masuk: WA/FB/ig bio) | terukur baseline F1 |
| Umpan balik manual (WA admin) terkait kebingungan | < 5 komplain kebingungan/bulan setelah stabil |

---

# 5. SISI BISNIS — Product / Business Requirements

> Pertanyaan inti: **apakah website mencapai tujuan organisasi & keberlanjutan dana?**

## 5.1 Ruang Lingkup

**Dalam ruang lingkup:** aplikasi ke-4 `apps/landing`; halaman §4.3; endpoint publik read-only; modul Donasi Online kategori `DONASI_ONLINE`; menu "Konten Website" di dashboard internal; deploy subdomain di VPS yang sama.

**Di luar ruang lingkup:** perubahan fungsi mobile petugas & dashboard operasional; integrasi donasi ke tabel `collections`; aplikasi mobile publik; gateway non-Indonesia.

## 5.2 Model Donasi Online (lensa bisnis)

- **Funnel:** iklan/tautan WA → landing → checkout → bayar → bukti + WA terima kasih → masuk laporan publik kategori `DONASI_ONLINE`.
- **Biaya & amanah finansial:** nominal donasi dicatat **gross**; biaya gateway (MDR) dicatat terpisah agar laporan kas akurat; settlement terverifikasi berkala (SOP di §7.5).
- **Kategori khusus (K-05):** donasi online **bukan** bagian dari koleksi kaleng → publik melihat dua lajur dana yang jujur, menghindari salah tafsir angka.
- **Kepemilikan kanal:** donasi digital membentuk basis donatur baru yang bisa disapa ulang secara patut (Fase 3).

## 5.3 KPI Sisi Bisnis

| Metrik | Target Indikatif |
|---|---|
| Donasi online per bulan (nominal & transaksi) | tumbuh dari baseline 3 bulan pertama |
| Biaya gateway per rupiah terhimpun | ≤ 2% rata-rata (dorong penggunaan QRIS) |
| Kunjungan halaman Laporan per bulan | baseline F1, naik bertahap |
| Waktu rilis laporan baru (bulan → tayang) | ≤ 7 hari kerja (dengan CMS §5.4) |

## 5.4 Perbandingan Payment Gateway (K-07)

> Angka **indikatif** (biaya umum per 2026) — wajib verifikasi ulang saat registrasi akun.

| Kriteria | Midtrans | Xendit |
|---|---|---|
| QRIS (MDR) | ±0,3% | ±0,3–0,39% |
| VA per transaksi | ±Rp4.000–4.500 | ±Rp4.000–4.500 |
| E-wallet | ±1,7–2% | ±1,5–2% |
| Satu integrasi → QRIS+VA+e-wallet | Ya | Ya |
| Settlement | umumnya 2 hari kerja | 1–2 hari kerja |
| KYC lembaga | dokumen legal + rekening atas nama lembaga | sama |
| Reputasi bagi donatur awam | sangat dikenal | dikenal |

**Rekomendasi draf:** **Midtrans (Snap)** — satu integrasi mencakup semua metode (K-04), biaya QRIS terendah (kunci biaya-rupiah), dokumentasi matang. **Prasyarat bisnis:** dokumen legal, rekening atas nama lembaga, admin keuangan yang memegang akses settlement (dibutuhkan sebelum Fase 2).

## 5.5 Fase & Prioritas (Roadmap)

- **Fase 1 — Identitas & Transparansi (MVP):** semua halaman §4.3 tanpa donasi online; statistik live + arsip PDF via CMS; deploy + SSL + monitor.
- **Fase 2 — Donasi Online:** gateway terpilih, webhook, halaman status, kategori `DONASI_ONLINE` di laporan; (Should) WA konfirmasi.
- **Fase 3 — Pengembangan:** kalkulator zakat, unduh ringkasan gambar, pencarian, pendaftaran kaleng, testimoni.

## 5.6 Deliverables & Kriteria Penerimaan (lensa produk)

| No | Deliverable | Kriteria Ringkas |
|----|--------------|-------------------|
| D1 | Website live | Semua halaman bisa diakses HTTPS, mobile & desktop |
| D2 | Laporan publik | Statistik cocok dengan total internal (uji silang 3 periode) |
| D3 | CMS konten | Admin kecamatan unggah PDF & berita mandiri |
| D4 | Donasi online (F2) | Uji sandbox sukses QRIS/VA/e-wallet; webhook idempoten |
| D5 | Pelaporan donasi | Total `DONASI_ONLINE` terpisah & benar aritmatika |
| D6 | SEO | Metadata + OG + sitemap ter-submit |
| D7 | Dokumentasi | SOP unggah konten + SOP rekonsiliasi donasi |

## 5.7 Risiko Bisnis & Kepatuhan

| Risiko | Mitigasi |
|---|---|
| Gateway butuh legalitas & rekening lembaga | Siapkan sebelum F2 (pemilik: pengurus) |
| Konten awal (foto, struktur, PDF) belum siap | Rilis bertahap; CMS mengunci kualitas ke depan |
| Salah tafsir angka publik vs internal | Definisi ringkas wajib di halaman Laporan |
| Persepsi "meminta-minta" berlebih | Tone konten "mengundang partisipasi", bukan memaksa |

---

# 6. SISI TEKNOLOGI — Software Architecture

> Pertanyaan inti: **apakah sistem benar, aman, dan rapi dalam monorepo?**

## 6.1 Prinsip Arsitektur (mewarisi 3 pilar + 1 baru)

1. **Audit trail immutable** (dari sistem induk) — donasi memakai log status append-only; **tidak menyentuh** `collections`.
2. **WhatsApp sebagai verifikasi eksternal** — konfirmasi donatur memakai infrastruktur antrean WA yang ada (template baru).
3. **Offline-first** — tidak relevan untuk website publik; digantikan **degradasi anggun** (lihat §7).
4. **BARU: Publik hanya membaca agregat** — endpoint publik read-only, tanpa identitas personil, CORS terbatas, rate-limit khusus.

## 6.2 Stack & Posisi di Monorepo

| Komponen | Pilihan |
|---|---|
| App baru | `apps/landing` — Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4 |
| Shared types | reuse `@lazisnu/shared-types` |
| Data | fetch endpoint publik `/v1/public/*` (ISR/SSG + SWR) |
| Container | service `landing` (port 3100) di VPS yang sama |
| Reverse proxy | nginx server block `upzispng.lazisnu.site` + SSL Let's Encrypt |

Catatan: Next.js 16 punya breaking changes — saat eksekusi rujuk `node_modules/next/dist/docs/` (lihat `apps/web/AGENTS.md`).

## 6.3 API Publik (baru, prefix `/v1/public/`)

| Endpoint | Metode | Deskripsi |
|---|---|---|
| `/v1/public/stats/summary?period=` | GET | Agregat periode: `collection_total`, `donation_total`, `can_count`, `donor_count`, `ranting_count` |
| `/v1/public/stats/trends` | GET | Total per periode (≤ 24 bulan), pisah kaleng vs donasi |
| `/v1/public/stats/by-ranting?period=` | GET | Agregat per ranting (tanpa identitas personil) |
| `/v1/public/reports` | GET | Daftar PDF laporan resmi |
| `/v1/public/programs` | GET | Program tampil |
| `/v1/public/articles`, `/:slug` | GET | Berita |
| `/v1/public/donations` | POST | Buat transaksi donasi (§6.5) |
| `/v1/webhooks/payment` | POST | Webhook gateway (signature-verified, idempotent) |

Aturan: response tetap `{ success, data?, error? }`; tanpa auth (publik); rate-limit lebih ketat dari nginx; CORS hanya domain website.

## 6.4 Model Data Baru

- `donations(order_id, jenis_dana, nominal_gross, fee_gateway?, metode, status, gateway_payload_json, nama_donatur?, hp?, created_at, settled_at, ...)` — log status **append-only**; indeks unik `order_id`.
- `public_reports`, `articles`, `programs`, `profile_content` untuk CMS.
- File (PDF/gambar) di Cloudflare R2 (bucket konten terpisah).

## 6.5 Alur Donasi Online

```
Pengunjung /donasi → POST /v1/public/donations (status PENDING, order_id: DPN-<tgl>-<seq>)
  → Gateway (Snap/Direct) → QRIS QR | nomor VA | redirect wallet → donatur membayar
  → POST /v1/webhooks/payment (signature valid? idempotent by order_id?)
    → SETTLED → (a) agregat DONASI_ONLINE, (b) kategori khusus di dashboard internal, (c) (Should) WA terima kasih
```

Aturan wajib: verifikasi signature; idempotensi; nominal gross + fee tercatat; **tidak** memicu WA anti-fraud koleksi; pembayaran kedaluwarsa otomatis EXPIRED.

## 6.6 Keamanan

- TLS penuh, HSTS, `X-Content-Type-Options`, `X-Frame-Options`/`CSP` terarah (embed Maps).
- Secret gateway **hanya di backend**; webhook path khusus; replay diblokir oleh idempotensi.
- Nomor HP donatur = data pribadi: disimpan terbatas, tidak tampil publik.
- Tidak ada token internal yang dikirim ke client website.

---

# 7. SISI OPERASIONAL — DevOps / Site Reliability

> Pertanyaan inti: **apakah website selalu hidup, termonitor, dan mudah dirawat?**

## 7.1 Deploy & Infrastruktur

| Item | Rencana |
|---|---|
| Environment | Production: service `landing` (3100). Staging: `landing-staging` (4100) + subdomain staging `staging-upzispng.lazisnu.site` (pola sama dengan staging yang ada) |
| Pipeline | Mengikuti pola repo: auto-deploy staging dari `main`; produksi via tag `v*` (koordinasi dengan `deploy-blue-green.sh` bila memungkinkan, atau systemd/restart sederhana) |
| SSL | Sertifikat baru via certbot; tambahkan ke crontab renew yang ada |
| Degradasi anggun | Jika API internal down: halaman tetap tayang dari cache/ISR; kartu statistik menampilkan "menyusul" |

## 7.2 Monitoring & Alerting

- Tambahkan monitor **Uptime Kuma**: (1) `upzispng.lazisnu.site`, (2) health endpoint publik.
- Dashboard Grafana (yang ada): panel request publik + error rate + latensi agregat publik (bila relevan).
- Alert minimal: situs down > 2 menit → notifikasi admin (ikuti kanal existing).

## 7.3 Backup & Ketahanan Data

- Tabel `donations` + konten CMS **wajib masuk** backup PostgreSQL existing (`scripts/backup.sh`); verifikasi dengan uji restore berkala.
- Objek R2 (PDF/gambar) mengikuti kebijakan retensi bucket.
- Runbook kegagalan webhook: cara replay aman / koreksi status manual oleh admin (dengan jejak audit).

## 7.4 SOP Konten (Operasional Harian)

1. Admin kecamatan login dashboard internal → menu **"Konten Website"**.
2. Unggah PDF laporan / tulis berita / perbarui program → tampil di situs dalam < 5 menit (ISR).
3. Target waktu unggah satu konten: < 15 menit.

## 7.5 SOP Rekonsiliasi Donasi (F2)

- **Harian:** cek jumlah transaksi & total di dashboard gateway vs tabel `donations`.
- **Bulanan:** cocokkan settlement rekening vs gross − fee; catat selisih; lampirkan ke laporan resmi sebelum diunggah.
- Dokumentasi: SOP dinasihatkan disimpan di `docs/` (mengikuti pola SOP yang ada).

## 7.6 Target Keandalan (SLO)

| Aspek | Target |
|---|---|
| Ketersediaan halaman publik | ≥ 99,9%/bulan |
| Keberhasilan pemrosesan webhook valid | 100% (idempotent + retry aman) |
| Latensi query agregat publik | p95 < 300ms |
| MTTR insiden publik | < 30 menit (runbook tersedia) |

---

# 8. Matriks Pengecekan 4 Sisi (Gate Review)

Setiap fitur besar harus "lulus" semua kolom sebelum dianggap selesai. Ini jadi pegangan bersama saat review.

| Fitur | Pengguna | Bisnis | Teknologi | Operasional |
|---|:---:|:---:|:---:|:---:|
| Beranda + Statistik Live | CTA jelas, angka mudah dipahami | Mendorong kredibilitas → donasi | Agregat saja, CORS dibatasi | ISR cache tetap tayang saat API down |
| Laporan Publik | Bahasa awam, unduh PDF mudah | Janji transparansi terbukti | Angka cocok internal; read-only | Monitor uptime + rilis laporan ≤7 hari |
| Program & Berita | Kartu mobile nyaman, detail terbaca | Membangun citra & narasi program | Konten dari CMS, bukan hardcode | SOP unggah <15 mnt |
| Donasi Online (F2) | Checkout ≤2 menit, status jelas | Konversi & biaya terkendali | Webhook idempotent, secret aman | Rekonsiliasi harian & runbook gagal |
| CMS Konten (dashboard internal) | Admin familiar, tanpa pelatihan panjang | Konten segar tanpa developer | Satu login; validasi file | Retensi R2 + backup konten |
| SEO/Berbagi | Tautan WA/FB tampil rapi | Jangkauan organik tumbuh | Metadata/OG/sitemap benar | Tidak membebani VPS |

---

## 9. Pertanyaan Terbuka

1. Konfirmasi tulisan header: "NUCARE-LAZISNU Kec. Paninggaran" + sub "UPZIS-LAZISNU MWCNU Paninggaran"?
2. Rekening penampungan donasi sudah atas nama lembaga? (menentukan K-07)
3. Apakah laporan penyaluran wajib tampil numerik di Fase 1, atau cukup PDF?
4. Logo final (lazisnu.svg vs NUCARE) + aset high-res?
5. Media sosial resmi yang akan ditautkan?

---

*Document Version: 1.1 (direstrukturisasi mengikuti Kerangka 4 Sisi)*
*Tanggal: 8 Agustus 2026 — Penyusun: Asisten TraeCode bersama pemilik proyek*
