# Checklist Uji Menyeluruh — Mobile LAZISNU Collector (staging)

Tanggal: 18 September 2026
Repo: `bagus01darmawan-wq/lazisnu`
Cakupan: aplikasi petugas (`apps/mobile`) pada lingkungan **staging** — paket
`com.lazisnucollectorapp.staging`, API `staging-api.lazisnu.site`, database staging terpisah dari produksi.
Acuan: skenario B2 (`.hermes/plans/2026-09-18_fix-b2-kaleng-nonaktif.md`), `docs/audit/rencana-implementasi-overview-kaleng/05-pengujian-rilis-dan-rollout.md`, `docs/mobile-standards.md` §4.

Status saat dokumen dibuat: rilis produksi terakhir **v1.2.0 (versionCode 28)**.
Perbaikan kaleng NON_AKTIF sudah terverifikasi di staging (B2-1…B2-8 lulus) tetapi **belum** dirilis ke produksi.
B1 (filter periode pada alur scan) masih ditangguhkan atas keputusan pemilik produk.

---

## Cara pakai

1. Pasang APK staging (artifact job CI `build-staging-apk`, retensi 14 hari — satu file `arm64-v8a`) atau salinan lokal. Paket `.staging` aman dipasang berdampingan dengan aplikasi produksi.
2. Jalankan **Bab 0 (prasyarat)** lebih dulu, lalu Bab 1–8. Setiap baris `- [ ]` = langkah singkat → hasil yang diharapkan.
3. Setelah selesai: Bab 9 (verifikasi backend) → Bab 10 (keputusan lulus/tidak) → pulihkan data staging.
4. Catat temuan pada Lampiran B (tanggal, bab, langkah, hasil aktual, bukti).

---

## Bab 0 — Prasyarat & keselamatan staging

- [ ] **Data uji minimum** disiapkan (acuan `05-pengujian` §1): 1 kecamatan, ≥2 ranting, ≥2 petugas; kaleng kasus: aktif / rusak / hilang / nonaktif / dikembalikan.
  - Catatan: data staging saat dokumen ini dibuat berisi **periode Juli** — siapkan tugas pada periode berjalan agar scan tidak gagal karena filter periode (B1) atau uji dilakukan pada periode yang memang ada datanya.
- [ ] **Seluruh nomor WA pada data staging = nomor penguji** (berlaku saat ini: `082134536151`). Skrip sanitasi: `staging-wa-sanitize.cjs` (tooling Hermes; menolak berjalan bila mendeteksi database produksi).
- [ ] **Login dan broadcast hanya dengan nomor penguji** — OTP dikirim ke nomor yang **diketik** pada form login (bukan dari database), dan broadcast admin menerima nomor manual. Dua celah ini tidak bisa ditutup dari sisi data.
- [ ] Disepakati sejak awal: setiap data staging yang diubah untuk pengujian **dicatat** dan **dipulihkan** setelah selesai.
- [ ] Aplikasi & database produksi tidak tersentuh sepanjang pengujian.

---

## Bab 1 — Auth & sesi

- [ ] Login dengan nomor format salah → pesan validasi jelas, tidak crash.
- [ ] Login nomor benar → OTP (WA) masuk → Beranda.
- [ ] OTP salah / kedaluwarsa / kirim ulang → pesan benar, tidak stuck, bisa kirim ulang.
- [ ] Buka aplikasi keesokan hari / setelah access token kedaluwarsa → **auto-refresh tanpa logout paksa** (refresh single-flight), tidak balik ke layar login.
- [ ] 401 saat aksi "Kirim Ulang" dari Riwayat → token di-refresh lalu aksi sukses (bukan pesan "Token tidak valid" buntu).
- [ ] Logout → kembali ke Login; tidak ada data sisa petugas sebelumnya.
- [ ] Cold start dengan token valid → splash → langsung Beranda (tidak berkedip ke Login).
- [ ] Aplikasi di-force-stop saat login → sesi tetap tersimpan.

## Bab 2 — Alur inti: Tugas → Scan → Penjemputan

- [ ] Daftar tugas tampil (nominal, alamat, penanda status); pencarian tugas berfungsi; filter tanggal/periode sesuai.
- [ ] Detail tugas → "Catat Penjemputan" → isi nominal → submit **online** → toast sukses, tugas berubah status, Beranda "Menunggu sinkron" kembali 0.
- [ ] Format nominal: angka besar, desimal, dan **nol** tampil benar di semua layar (standar `mobile-standards.md` §4.3).
- [ ] Scan QR valid → kartu info kaleng → lanjut penjemputan berhasil.
- [ ] Input manual kode kaleng (tanpa kamera) juga berhasil.
- [ ] Scan QR milik petugas lain / bukan tugas → pesan jelas, bukan crash/bukan diam.
- [ ] Scan kaleng yang bukan tugas pada periode berjalan → catat perilaku saat ini (terkait B1 yang ditangguhkan); pastikan pesannya tidak menyesatkan.
- [ ] Izin kamera ditolak → muncul panduan izin → setelah izin diberikan, scan berjalan normal.
- [ ] Penjemputan dengan kondisi khusus / alasan skip → tersimpan & tampil di riwayat.

## Bab 3 — Kaleng NON_AKTIF / "Perlu Dikunjungi" (fitur baru, skenario resmi B2-1…B2-8)

- [ ] Kaleng NON_AKTIF muncul di filter **"Perlu Dikunjungi"** dan **tidak** muncul di "Perlu Dijemput".
- [ ] Ketuk kartu kaleng nonaktif → langsung ke **Detail Kaleng** (tanpa dialog error).
- [ ] Detail Kaleng menampilkan 3 aksi: **Sudah Dikunjungi** (kunjungan tercatat, kondisi tetap nonaktif), **Cabut Kaleng** (kondisi → DIKEMBALIKAN, hilang dari daftar), **Kaleng Terisi** (penjemputan biasa; kondisi otomatis kembali AKTIF).
- [ ] Scan QR kaleng NON_AKTIF → langsung halaman Detail Kaleng (bukan dialog "bukan tugas Anda").
- [ ] **Auto NON_AKTIF**: 6 penjemputan kosong berturut-turut pada 1 kaleng → kaleng menjadi NON_AKTIF otomatis (tanpa persetujuan admin; jejak audit `APPROVED` dengan `approved_by` kosong).
- [ ] **Kaleng Terisi** pada kaleng NON_AKTIF → otomatis AKTIF kembali, keluar dari "Perlu Dikunjungi", riwayat kosong direset.
- [ ] Metrik: kartu "Perlu Dikunjungi" dan statistik kunjungan menghitung **kaleng** (1 kaleng 3× dikunjungi = 1 tugas selesai, bukan 3).
- [ ] Riwayat menampilkan kartu tipis berlabel **Verifikasi / Pencabutan / Penggantian unit** + tanggal.

## Bab 4 — Offline & sinkronisasi (paling rawan duplikat/uang)

- [ ] Mode pesawat → submit penjemputan: masuk antrean (Beranda "Menunggu sinkron" bertambah; Riwayat menandai "menunggu").
- [ ] Kembali online → antrean tersinkron otomatis → **tidak ada duplikat** (1 submit = 1 collection di server).
- [ ] Submit offline dua kali untuk tugas yang sama → tetap 1 collection.
- [ ] Item yang ditolak permanen server (mis. salah periode) → **tetap di antrean** sebagai gagal, tidak spam request, tidak hilang; tersedia aksi "Kirim Ulang" dari "Detail Gagal".
- [ ] Sinkron sebagian: dari 5 item antrean, 2 gagal → 3 sukses, 2 tetap menunggu (tidak menyeret yang lain).
- [ ] Aplikasi di-force-stop / HP restart saat offline → antrean tetap utuh dan tetap bisa disinkronkan.
- [ ] (Batas yang disadari) Uninstall aplikasi = antrean offline ikut terhapus.

## Bab 5 — Riwayat & koreksi

- [ ] Riwayat menampilkan seluruh collection dari 5 tab dengan data benar (nominal, tanggal, status).
- [ ] Koreksi nominal → masuk antrean koreksi → tampil sebagai menunggu; koreksi yang ditolak server tetap tersimpan rapi (tidak hilang).
- [ ] Setelah koreksi diterima, nominal pada riwayat dan statistik ikut berubah.
- [ ] Detail gagal menampilkan alasan kegagalan yang bisa dipahami petugas.

## Bab 6 — Beranda, statistik, profil

- [ ] Beranda: metrik tugas (total per jenis) dan jumlah "menunggu sinkron" akurat.
- [ ] Statistik rentang (`RangeStats`) konsisten dengan data riwayat.
- [ ] Profil: identitas petugas/ranting benar, versi aplikasi tampil, tombol logout berfungsi.

## Bab 7 — Update & distribusi

- [ ] Versi rilis > versi aplikasi → modal update muncul dengan tombol unduh.
- [ ] Versi rilis = versi aplikasi → modal tidak muncul.
- [ ] Unduh → pasang di atas versi lama → sesi & antrean offline **tidak** hilang.
- [ ] APK staging tidak bentrok dengan aplikasi produksi (paket `.staging`).

## Bab 8 — Non-fungsional & perangkat (minimal 2 perangkat / versi Android berbeda)

- [ ] Layar kecil (360dp): tidak ada kontrol utama terpotong (kriteria no-go repo).
- [ ] Kamera: cahaya redup, QR miring, QR rusak/tergores → masih terbaca atau ada jalur input manual.
- [ ] Tanpa internet saat membuka aplikasi → pesan error manusiawi, tidak crash.
- [ ] Daftar tugas panjang (ratusan item) → scroll mulus, tidak ANR.
- [ ] Aplikasi di latar belakang lama lalu dibuka lagi → state & antrean benar.

## Bab 9 — Verifikasi backend setelah pengujian

- [ ] `collections` = jumlah & nominal persis seperti di perangkat (tidak dobel); `assignments` berstatus benar.
- [ ] Kondisi `cans` akhir sesuai aksi yang dilakukan; `can_visits` bertambah sesuai kunjungan.
- [ ] Notifikasi WA: tujuan **selalu** nomor penguji (tidak ada nomor lain di seluruh kolom nomor), antrean `whatsappQueue` kembali 0.
- [ ] Metrik dashboard (kaleng aktif/nonaktif, tugas) cocok dengan hasil uji.
- [ ] Data uji yang diubah telah dipulihkan (kembali ke kondisi awal sebelum pengujian).

## Bab 10 — Keputusan lulus / tidak (acuan `05-pengujian` §6)

**No-go** bila salah satu terjadi:

- nominal atau jumlah collection valid berubah tanpa penjelasan;
- dashboard kecamatan dan ranting menunjukkan angka berbeda untuk scope yang sama;
- kaleng nonaktif menerima tugas penjemputan;
- kaleng hilang tidak terlihat pada daftar tindakan;
- ada aksi yang menyentuh kaleng di luar wilayah tugas petugas;
- UI memotong kontrol utama pada layar 360dp.

---

## Lampiran A — Riwayat pengujian (konteks)

| Sesi | Cakupan | Hasil |
|---|---|---|
| Sep 2026 (verifikasi H.7) | S1–S5 alur petugas di perangkat nyata | Lulus |
| 2026-09-18 | Skenario B2-1…B2-8 kaleng NON_AKTIF (termasuk submit offline via "Kirim Ulang") | Lulus |
| 2026-09-18 | B1 — filter periode pada scan | Ditangguhkan (keputusan pemilik produk) |

## Lampiran B — Catatan temuan (isi saat pengujian)

| # | Tanggal | Bab | Langkah | Hasil aktual | Bukti (screenshot/log) | Status |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
