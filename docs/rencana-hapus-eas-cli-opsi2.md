# Rencana: Hapus `eas-cli` SAJA, Sisanya Biarkan Utuh (Opsi 2)

**Tanggal**: 2026-09-02
**Status**: DISEDIKAN, TIDAK DIJALANKAN — Opsi 1 yang dieksekusi (2026-09-02); dokumen ini disimpan sebagai cadangan jalur fallback
**Pilihan**: Opsi 2 — "Cabut hanya alat itu saja, sisanya biarkan utuh. Lebih rapi, tapi lebih rumit & bisa salah."

---

## 1. Latar Belakang (bahasa awam)

Di Opsi 1, kita biarkan sistem merapikan "daftar bahan" (file `pnpm-lock.yaml`) sendiri, akibatnya banyak komponen lain ikut berubah (sekitar 1.600 baris). Itu gampang, tapi PR jadi besar.

**Opsi 2** kebalikannya: kita cabut **hanya** `eas-cli` dan komponen yang _hanya dipakai olehnya_, sisanya dibiarkan tetap di posisinya yang lama. Hasilnya PR kecil & rapi — cuma menyentuh apa yang memang harus hilang.

**Harganya**: ini dikerjakan dengan **edit manual** ke daftar bahan (bukan biarkan sistem yang kerjakan). Manusia yang pilih mana yang dihapus. Kalau salah pilih — misal menghapus komponen yang masih dipakai bagian lain, atau meninggalkan sisa yang menggantung — daftar bahan jadi rusak.

---

## 2. Rencana Langkah (urutan eksekusi)

| No  | Langkah                                                                                                                                                                        | Apa yang terjadi                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1   | Buat cabang baru `chore/remove-eas-cli`                                                                                                                                        | Pekerjaan dipisah, aman                                                          |
| 2   | **Kembalikan daftar bahan ke versi asli** (`origin/main`)                                                                                                                      | Membatalkan "ledakan" 1.600 baris dari percobaan tadi, mulai dari keadaan bersih |
| 3   | Hapus `eas-cli` dari `apps/mobile/package.json` (sudah dilakukan) + `eas.json` (sudah dihapus) + `pnpm-workspace.yaml` + `docs/audit-cicd-2026-08-31.md` (sudah di meja kerja) | Isi PR EAS Anda utuh                                                             |
| 4   | **Edit manual daftar bahan**: cabut entri `eas-cli` beserta komponen yang HANYA dipakainya (tidak dipakai bagian lain)                                                         | Inilangkah rumit & rawan salah                                                   |
| 5   | Jalankan pemeriksaan `pnpm install --frozen-lockfile`                                                                                                                          | Gerbang validasi — lihat mitigasi no.1                                           |
| 6   | Kirim (push) + buat Pull Request (PR)                                                                                                                                          | Mulai tes otomatis                                                               |
| 7   | Jalankan tes otomatis (CI) penuh                                                                                                                                               | Gerbang keamanan akhir                                                           |

---

## 3. Mitigasi Risiko (bagaimana kita amankan)

**Mitigasi 1 — Pemeriksaan "daftar bahan valid" (paling penting)**

- Setelah edit manual, kita jalankan `pnpm install --frozen-lockfile`.
- Perintah ini **AKAN GAGAL** kalau ada kesalahan (komponen menggantung / ada yang masih dirujuk tapi tidak ada).
- Jika gagal = kita tahu persis ada yang salah, dan **langsung perbaiki** (tidak lanjut ke PR sebelum lulus). Ini jaring pengaman utama Opsi 2.

**Mitigasi 2 — Cadangan sebelum edit**

- Sebelum menyentuh daftar bahan, kita simpan salinannya. Kalau edit manual berantakan, tinggal kembalikan dan kita bisa beralih ke Opsi 1.

**Mitigasi 3 — Tes otomatis (CI) tetap jadi gerbang**

- Sama seperti Opsi 1: CI merah = tidak merge. Anda yang pegang tombol akhir.

**Mitigasi 4 — Bisa dibatalkan**

- Semua di cabang terpisah. Tutup PR = cabang utama (`main`) tidak tersentuh.

**Mitigasi 5 — Jika edit manual gagal berulang**

- Kita punya jalur keluar: kembali ke **Opsi 1** (biarkan sistem yang merapikan). Tidak ada jalan buntu.

---

## 4. Kelemahan yang Perlu Anda Tahu (kejujuran)

- **Lebih rumit**: edit manual ke daftar bahan butuh ketelitian; tidak sekadar "biarkan sistem kerjakan".
- **Bisa salah**: kalau saya salah hapus komponen yang masih dipakai bagian lain, build bisa rusak — TAPI ketahuan lewat Mitigasi 1 (frozen-lockfile) sebelum PR dikirim.
- **Butuh lebih banyak langkah**: ada tahap "kembalikan daftar bahan" + "edit manual" yang tidak ada di Opsi 1.

---

## 5. Yang TERJADI pada cabang utama (`main`)

- Tidak ada perubahan langsung ke `main`.
- Hanya berubah kalau Anda setuju PR dan menekan merge.
- PR ini jauh lebih kecil & rapi daripada Opsi 1 (cuma menyentuh `eas-cli` + sisa-sisanya, bukan 1.600 baris).

---

## 6. Cara Anda Meninjau

1. Baca dokumen ini dan bandingkan dengan `docs/rencana-hapus-eas-cli.md` (Opsi 1).
2. Jika setuju: balas **"setuju opsi 2"** / **"go opsi 2"** → saya jalankan langkah 1–7.
3. Jika ragu: Anda bisa pilih Opsi 1 (lebih gampang & aman) atau minta revisi.
4. Setelah PR jadi, cek badge CI, lalu putuskan merge atau tidak.

---

## 7. Ringkas

- **Tujuan**: cabut `eas-cli` SAJA, sisanya utuh → PR kecil & rapi.
- **Cara**: edit manual daftar bahan + jaring pengaman `frozen-lockfile`.
- **Pengaman**: frozen-lockfile gagal = ketahuan sebelum PR; CI merah = tidak merge; bisa batal; bisa fallback ke Opsi 1.
- **Harga**: lebih rumit & butuh ketelitian, tapi hasilnya paling bersih.
