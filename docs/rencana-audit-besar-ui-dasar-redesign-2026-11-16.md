# Rencana Audit Besar UI Web LAZISNU

> **Status:** Rencana audit; belum mengubah kode, UI, atau standar. Redesign bukan hasil yang diasumsikan.

**Tujuan:** Mengumpulkan bukti yang dapat direproduksi tentang kualitas pengalaman dashboard web LAZISNU, menyusun temuan terverifikasi dan backlog, lalu merekomendasikan apakah perbaikannya berupa koreksi terarah, redesign terbatas, atau redesign lebih luas.

**Cakupan awal:** `apps/web/`—dashboard dan alur login yang relevan. Mobile native, backend, dan situs publik tidak otomatis masuk audit/redesign; dependensi lintas platform dapat dicatat.

**Urutan:** Rekonsiliasi standar dan akses uji → inventaris serta baseline → audit alur prioritas → validasi/backlog → keputusan perlu-tidaknya redesign.

---

## 1. Konteks dan batasan

- Titik awal: `docs/audit/audit-ui-21st-review-2026-11-16.md`. `21st review` melaporkan 1.480 pola temuan pada `apps/web/src`, termasuk 21 temuan `focus-outline-none`. Angka itu bukan jumlah bug terverifikasi. Temuan warna mencakup definisi tema yang disengaja; tool tidak memahami intent, tidak menggantikan audit WCAG manual, dan `--fix` tidak memperbaiki temuan.
- Sumber desain yang perlu direkonsiliasi: `.agents/rules/07-pedoman-web.md`, `.agents/rules/12-standar-ui-web.md`, `apps/web/AGENTS.md`, implementasi aktual dan design tokens/theme provider. Konflik yang sudah dilaporkan—misalnya toolbar putih vs teal, role lama vs role aktif, serta react-hot-toast vs Sonner—harus diverifikasi dan diselesaikan statusnya sebelum penilaian kepatuhan.
- Bahan lama untuk ditinjau ulang: `docs/ux-audit/reports/2026-07-20-audit.md`, `docs/ux-audit/data/`, `docs/mobile-first-web-2026-09-05.md`, dan `apps/web/design-plans/2026-09-05-audit-laporan.md`. Temuan lama bukan fakta tentang UI hari ini sebelum diverifikasi.
- Working tree diketahui berisi perubahan lokal, termasuk area web. Bukti staging dan bukti lokal harus dipisahkan jika build/commit berbeda. Jangan menimpa, membersihkan, atau mencampur perubahan yang sudah ada.
- Data analytics, tiket support, dan sesi pengguna mungkin tidak tersedia. Catat data gap; jangan mengarang perilaku atau target.

## 2. Aturan keselamatan

- Gunakan akun, environment, dan fixture data uji yang disetujui. Masking data pribadi pada screenshot/rekaman dan laporan.
- **Dilarang menjalankan aksi hapus, retry/kirim WhatsApp, perubahan finansial, atau aksi produksi yang mengubah data** selama audit tanpa izin khusus tertulis, pemilik aksi, objek uji yang ditentukan, dan prosedur pemulihan.
- Audit statis atau observasi read-only didahulukan. Bila akses uji tidak aman/tersedia, tandai area sebagai `terblokir`; jangan mencoba aksi untuk “melihat hasilnya”.
- Temuan aksesibilitas kritis yang sudah terverifikasi dapat dieskalasi sebagai perbaikan terpisah dengan persetujuan pemilik—tidak harus menunggu keputusan redesign keseluruhan.

## 3. Prinsip kerja

1. Audit mendahului usulan perubahan visual; temuan dan solusi dicatat terpisah.
2. Setiap temuan punya bukti, konteks uji, dampak, tingkat keyakinan, status validasi, dan cara verifikasi.
3. Kelompokkan finding otomatis berdasarkan akar masalah/komponen sebelum memeriksa kemunculan satu per satu; simpan jumlah occurrence sebagai cakupan dampak, bukan sebagai jumlah masalah independen.
4. Bedakan: defect fungsional, usability, aksesibilitas, responsif, konsistensi sistem desain, konten/feedback, performa yang dirasakan, dan preferensi estetika.
5. Standar yang konflik/tidak jelas tidak boleh dijadikan dasar label “melanggar”. Tandai `menunggu keputusan` sampai otoritas dan maksudnya jelas.
6. Audit luas untuk inventaris; audit mendalam hanya pada alur dan komponen prioritas yang disepakati.

## 4. Tahapan kerja dan gerbang keputusan

### Tahap 0 — Rekonsiliasi standar, scope, dan akses uji

**Pemilik:** pemilik produk/operasional menetapkan keputusan; auditor menyusun bukti dan usulan.

1. Tetapkan pengguna utama, tugas kritis, pemilik keputusan akhir, cakupan awal, dan batas waktu audit. Konfirmasi apakah native hanya menjadi dependensi atau juga masuk audit terpisah.
2. Buat **daftar sumber kebenaran** dengan kolom: sumber/versi, topik yang diatur, bukti implementasi aktual, status (`berlaku`, `usang`, `konflik—menunggu keputusan`, `proposal`), pemilik keputusan, dan tanggal keputusan.
3. Verifikasi konflik yang sudah dilaporkan, termasuk toolbar putih/teal, role yang aktif, dan library toast. Cari juga konflik desain lain yang berdampak pada audit.
4. Tetapkan environment read-only/akun uji, role yang tersedia, fixture aman, viewport, browser/perangkat, dan akses ke build yang akan diperiksa.
5. Usulkan target aksesibilitas **WCAG 2.2 AA**, lalu minta persetujuan pemilik. Catat bahwa target sentuh internal 44×44px adalah standar produk tambahan—bukan kriteria WCAG yang identik.
6. Jangan menjalankan aksi produksi yang mengubah data (lihat Aturan Keselamatan).

**Gerbang 0:** sumber aturan yang dipakai, konflik yang menunggu keputusan, scope, pemilik, target aksesibilitas, dan akses uji tercatat. Kepatuhan hanya dinilai terhadap aturan yang statusnya disetujui.

### Tahap 1 — Inventaris luas dan baseline yang dapat direproduksi

Buat inventaris seluruh route/halaman, role yang relevan, komponen bersama, serta state penting. Jangan menguji semua kombinasi.

**Status cakupan wajib per item:** `belum diuji`, `diuji`, `terblokir`, atau `tidak relevan` (dengan alasan).

Untuk setiap **paket bukti**, rekam:

- URL/route, commit SHA atau identitas build, branch, dan apakah ada perubahan lokal yang relevan (path/summary; jangan mengubahnya).
- Environment (`staging` atau `local`), role, fixture/data uji, dan state halaman.
- Browser/versi, perangkat/OS bila relevan, viewport/zoom, tema, dan waktu pengambilan.
- Versi tool dan perintah persis untuk scan; simpan output mentah dengan aturan penanganan data yang aman.
- Screenshot/rekaman dan langkah reproduksi. Bila staging dan lokal berbeda, buat paket bukti terpisah—jangan menyatukan screenshot dengan kode yang bukan asalnya.

Jalankan baseline test/lint/typecheck yang relevan hanya bila aman dan tidak mengubah source; catat versi/hasil, jangan mengklaim seluruh repo sehat dari satu command.

**Hasil:** inventaris semua route dengan status, manifest bukti, gap akses/data, serta baseline tool dan build.

### Tahap 2 — Audit terarah dan sampling tema

#### A. Audit mendalam

Pilih bersama pemilik produk sejumlah kecil alur bernilai/berisiko tinggi (usulan awal: 3–5 alur), misalnya alur kerja harian, perubahan data berisiko, pelaporan, dan login/akses. Uji langkah, status, empty/loading/error/success, pemulihan kesalahan, dan keyboard pada tiap alur.

Periksa secara manual:
- usability dan kejelasan langkah/konsekuensi aksi;
- aksesibilitas: keyboard, focus-visible, modal/focus return, label/nama kontrol, struktur, error form, zoom/reflow, kontras, screen reader;
- responsif dan penggunaan sentuh, terutama Android 360px serta breakpoint yang dipakai;
- terminologi, feedback, loading/empty/error/success;
- performa yang dirasakan bila ada bukti masalah.

#### B. Komponen bersama dan halaman pengecualian

Audit komponen bersama yang berulang (navigasi, tombol, form, tabel, dialog, menu/popover, status) sekali secara mendalam, lalu catat halaman yang memakainya. Audit tersendiri untuk halaman/state yang tidak mengikuti pola umum, bukan mengulang semua occurrence.

#### C. Sampling 15 tema

Jangan menguji seluruh kombinasi route × role × state × tema.

- Audit alur mendalam menggunakan tema default yang disepakati.
- Buat matriks 15 tema × sampel komponen representatif: teks/latar, tombol dan focus state, badge/status (termasuk sukses/gagal/peringatan), input, tabel, dialog, dan grafik bila relevan.
- Jalankan pemeriksaan kontras/visibilitas status pada kombinasi representatif di semua tema; catat hasil per komponen/tema dan metode pengukuran.
- Perluas ke route/alur tambahan jika sampling menemukan masalah tema, perbedaan token, atau variasi implementasi yang berisiko.

**Hasil:** temuan observasi dengan bukti, tema/komponen yang diuji, serta area yang belum diuji.

### Tahap 3 — Validasi, triase, dan backlog

- Kelompokkan 21st findings menurut rule + akar masalah/file/komponen. Tinjau per kelompok terlebih dulu; verifikasi occurrence representatif dan luaskan hanya saat implementasi berbeda. Tandai `valid`, `false positive/noise`, `disengaja dengan alasan`, `duplikat`, atau `belum diverifikasi`.
- Jangan mengejar angka 1.480 sebagai target penyelesaian. Contoh: warna di file tema bukan otomatis penyimpangan; periksa penggunaan di luar definisi token.
- Validasi temuan terhadap implementasi/build yang tepat dan alur keyboard/perangkat nyata bila memungkinkan. Minta pemilik domain memeriksa alur bisnis dan terminologi.
- Bila tersedia, lakukan sesi task-based dengan perwakilan pengguna. Jika tidak, catat keterbatasan dan hindari klaim tentang perilaku nyata.
- Prioritaskan dengan dampak pada keberhasilan tugas, keparahan/risiko, frekuensi/jangkauan, dan keyakinan bukti. Pisahkan blocker kritis dari polish.
- Catat pemilik/tindak lanjut dan kriteria penerimaan; item yang menunggu keputusan tetap terlihat dan tidak dinilai selesai.

**Format temuan:** ID; route/role/state/viewport/tema; bukti dan konteks build; langkah reproduksi; dampak/frekuensi (atau belum diketahui); kategori/keparahan/keyakinan; status validasi; akar masalah; opsi; dependensi/risiko; kriteria sukses.

**Hasil:** laporan audit, backlog terurut, false positive dan pengecualian terdokumentasi, daftar keputusan tertunda.

### Tahap 4 — Sintesis dan keputusan hasil audit

Buat ringkasan tujuan pengguna, tugas penting, temuan yang tervalidasi, prinsip yang tetap bekerja baik, risiko, data gap, opsi tindak lanjut, biaya/dependensi relatif, serta metrik yang dapat dipakai. Pemilik produk memilih salah satu hasil berikut:

1. **Pertahankan UI; lakukan perbaikan terarah** pada masalah yang terverifikasi.
2. **Redesign terbatas** pada alur/modul tertentu, dengan alasan dan batas yang jelas.
3. **Redesign lebih luas**, hanya bila bukti menunjukkan masalah sistemik dan manfaat/biayanya disetujui.

Tidak ada opsi visual atau implementasi redesign yang otomatis dianggap disetujui. Rekomendasi dapat berupa kombinasi perbaikan kritis dan salah satu opsi di atas.

**Syarat audit selesai:** semua route inventaris berstatus; alur prioritas yang disetujui telah diuji atau ditandai terblokir dengan alasan; paket bukti dapat ditelusuri; finding otomatis telah ditriase per kelompok; isu kritis/keputusan terbuka ditampilkan; laporan dan opsi keputusan diserahkan kepada pemilik.

### Tahap 5 — Rencana lanjutan opsional, setelah keputusan

Tahap ini bukan bagian otomatis dari audit. Setelah opsi 1/2/3 dipilih, buat rencana implementasi terpisah yang menetapkan pilot atau perbaikan terarah, prototipe jika perlu, acceptance criteria, aksesibilitas/responsif, pengujian regresi, rollout/rollback, metrik, pemilik, serta pembaruan standar desain. Untuk hambatan aksesibilitas kritis, buat jalur perbaikan terpisah yang disetujui dan tidak perlu menunggu redesign luas.

## 5. Timebox dan pengendalian cakupan

Usulan timebox awal (sesuaikan ketersediaan orang dan akses; bukan estimasi komitmen):

| Paket | Timebox usulan | Hasil/aturan berhenti |
|---|---:|---|
| Tahap 0: keputusan scope, sumber, akses | 0,5–1 hari kerja | Berhenti saat Gerbang 0 lulus atau blokir/keputusan yang hilang tercatat |
| Tahap 1: inventaris + baseline | 1–2 hari kerja | Semua route tercatat statusnya; tidak perlu semua state difoto |
| Tahap 2: audit sampel prioritas | 2–4 hari kerja | 3–5 alur (atau jumlah yang disepakati), komponen inti, dan sampling tema selesai/terblokir |
| Tahap 3–4: validasi + sintesis | 1–2 hari kerja | Kelompok otomatis ditriase; finding prioritas dan tiga opsi keputusan diserahkan |

Satu penanggung jawab audit mengelola inventaris/evidence; pemilik domain membantu validasi proses; pemilik produk memutuskan konflik/arah. Jika timebox habis, tandai cakupan yang belum diuji dan rekomendasikan fase lanjutan—jangan memperpanjang tanpa keputusan.

## 6. Kriteria keberhasilan dan deliverable

Keberhasilan audit bukan jumlah temuan yang turun, melainkan keputusan yang bisa dibuat dari bukti. Tentukan baseline/target bersama pemilik; jangan mengarang angka. Metrik yang dapat dipilih: tingkat keberhasilan tugas, waktu/langkah, kesalahan/pengulangan, hambatan keyboard/screen reader, masalah reflow, dan feedback setelah perubahan.

Deliverable:
1. Daftar sumber desain/aturan dan status setiap sumber.
2. Inventaris route × role relevan × viewport × state, dengan status cakupan; tema menjadi matriks sampling terpisah.
3. Manifest paket bukti yang mencatat build/environment lengkap.
4. Laporan audit dengan metode, temuan terverifikasi, keterbatasan, false positive, dan data gap.
5. Backlog temuan dengan prioritas, bukti, owner/keputusan, dependensi, dan acceptance criteria.
6. Ringkasan keputusan: perbaikan terarah, redesign terbatas, atau redesign luas.
7. Jika disetujui kemudian: rencana implementasi/pilot terpisah.

Lokasi laporan yang disarankan `docs/ux-audit/reports/`, setelah memastikan struktur ini sesuai dengan alur kerja repo.

## 7. Aksesibilitas dan protokol verifikasi

Target yang diusulkan: **WCAG 2.2 Level AA**, menunggu persetujuan pemilik produk. Checklist setidaknya meliputi keyboard, urutan dan visibilitas fokus, nama/label, struktur, dialog, validasi form, kontras, zoom/reflow, dan status yang tidak hanya dibedakan dengan warna. Catat kriteria WCAG yang relevan pada temuan; jangan menyamakan aturan internal target sentuh 44×44px dengan persyaratan WCAG.

Sebelum sesi manual, sepakati pasangan browser/screen reader dan OS dengan tim (usulan praktis: Chrome + NVDA di Windows; Safari + VoiceOver bila pengguna/perangkat Apple termasuk sasaran). Rekam versi dan langkah uji. Otomasi axe/Playwright membantu menemukan sebagian masalah, tetapi hasil bersih bukan bukti kepatuhan penuh.

## 8. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Konflik aturan menghasilkan penilaian salah | Rekonsiliasi sumber di Tahap 0; jangan menyatakan pelanggaran sebelum keputusan |
| Scan otomatis membengkakkan pekerjaan | Triase berkelompok berdasarkan akar masalah, bukan audit 1.480 item satu per satu |
| Bukti staging tidak cocok dengan source | Manifest build/environment; bukti staging dan lokal dipisah |
| Kombinasi tema/role/state tak terbatas | Sampling tema terencana dan audit mendalam hanya pada alur prioritas; perluas berdasarkan sinyal |
| Audit tak selesai karena scope terbuka | Timebox, status cakupan eksplisit, dan kriteria berhenti |
| Data pribadi/aksi produksi berisiko | Fixture dan akun uji; larangan aksi destruktif/finansial tanpa izin khusus |
| Redesign dipaksakan walau tidak perlu | Tiga opsi hasil audit; Tahap 5 terpisah dan memerlukan keputusan |
| Temuan lama dianggap masih berlaku | Verifikasi terhadap build saat ini; jika belum, tandai belum diuji |

## 9. Keputusan yang perlu diminta

1. Apakah fase ini khusus web `apps/web/`, dengan native hanya sebagai dependensi, atau native juga diaudit terpisah?
2. Siapa auditor/penanggung jawab, pemilik produk, dan narahubung tiap proses bisnis?
3. Apakah WCAG 2.2 AA disetujui sebagai target audit? Pasangan browser/screen reader mana yang relevan?
4. Environment, akun uji, role, fixture, perangkat, dan akses ke tema apa yang tersedia?
5. Alur 3–5 mana yang paling penting dan siapa pengguna yang dapat dilibatkan?
6. Apakah timebox usulan sesuai, atau perlu disesuaikan dengan ketersediaan tim?
7. Siapa yang dapat memberi izin khusus bila ada kebutuhan menguji aksi yang mengubah data? Default-nya tetap dilarang di produksi.

## 10. Langkah pertama

Mulai dari Tahap 0: verifikasi konflik aturan dan implementasi, tetapkan pemilik/target aksesibilitas/scope, lalu amankan akun serta data uji. Setelah Gerbang 0, inventaris semua route dan baseline build; baru pilih alur mendalam serta sampling tema. Jangan mulai dengan memperbaiki semua 21 error atau menurunkan jumlah warning.
