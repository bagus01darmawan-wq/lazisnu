# Rencana: Hapus `eas-cli` dari Aplikasi Mobile (dan Rapikan Daftar Bahan)

**Tanggal**: 2026-09-02
**Status**: DISETUJUI & DIJALANKAN 2026-09-02 — cabang `chore/remove-eas-cli` (Opsi 1)
**Pilihan yang Anda pilih**: Opsi 1 — "Commit daftar bahan apa adanya + biarkan tes otomatis (CI) memeriksa"

---

## 1. Latar Belakang (apa masalahnya, bahasa awam)

Aplikasi mobile kita punya satu alat bantu bernama `eas-cli` yang sudah tidak dipakai.
Kita mau mencabutnya supaya proyek lebih bersih.

Masalahnya: "daftar bahan" (file `pnpm-lock.yaml` — semacam resep lengkap semua komponen aplikasi) sudah **tua**. Saat kita cabut satu alat itu, sistem otomatis ikut menyegarkan banyak komponen lain ke versi terbaru. Hasilnya: perubahan jadi besar (sekitar 1.600 baris berubah), padahal yang kita mau cuma cabut satu alat.

Risiko: versi komponen lain yang naik bisa (jarang, tapi mungkin) membuat aplikasi error.

---

## 2. Rencana Langkah (urutan eksekusi)

| No  | Langkah                                                                            | Apa yang terjadi                          |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Buat cabang (branch) baru bernama `chore/remove-eas-cli`                           | Pekerjaan dipisah dari cabang utama, aman |
| 2   | Ambal (pop) perubahan EAS Anda dari "kotak simpan" (stash)                         | 4 file EAS kembali ke meja kerja          |
| 3   | Catat perubahan ke git: 4 file EAS + daftar bahan (lockfile) yang sudah diperbarui | Siap dikirim                              |
| 4   | Kirim (push) ke GitHub, buat Pull Request (PR)                                     | Mulai minta tinjauan & tes otomatis       |
| 5   | Jalankan tes otomatis (CI) penuh                                                   | Gerbang keamanan — lihat bagian 3         |

> Catatan: langkah 2 & 3 & sebagian sudah dilakukan saat menyusun rencana ini (perubahan sudah di meja kerja). Yang belum: commit, push, PR, dan tes CI.

---

## 3. Mitigasi Risiko (bagaimana kita amankan)

Ini inti Opsi 1: **CI = gerbang pengaman**.

- **Tes otomatis wajib lulus sebelum merge.** CI akan menjalankan:
  - Pengecekan kode (lint)
  - Tes backend, mobile, web
  - Pemeriksaan keamanan (audit)
  - Pembuatan APK (build)
- **Jika CI MERAH** (ada yang gagal): kita **TIDAK merge**. Saya laporkan apa yang rusak, lalu kita pilih:
  - Perbaiki kecil yang error, atau
  - Batalkan Opsi 1, pindah ke Opsi 2 (cabut hanya `eas-cli`, sisanya dibiarkan utuh).
- **Anda tetap pegang kendali**: PR tidak otomatis digabung. Anda yang menekan "merge" setelah melihat CI hijau.
- **Dapat dibatalkan**: karena ini cabang terpisah, kalau Anda berubah pikiran, cukup tutup PR — cabang utama (`main`) tidak tersentuh.

---

## 4. Yang TERJADI pada cabang utama (`main`)

- Tidak ada perubahan langsung ke `main`.
- Hanya berubah kalau Anda menyetujui PR dan menekan merge.
- Perubahan EAS Anda (hapus `eas.json`, ubah `pnpm-workspace.yaml`, tambah `docs/audit-cicd-2026-08-31.md`) akan terekam bersih di PR tersendiri, tidak bercampur dengan pekerjaan uuid/keamanan sebelumnya.

---

## 5. Cara Anda Meninjau

1. Baca dokumen ini.
2. Jika setuju: balas **"setuju"** / **"go"** → saya jalankan langkah 1–5.
3. Jika ingin ubah: beri tahu bagian mana (misal "jangan kirim PR, cukup commit lokal" atau "pakai Opsi 2 instead").
4. Setelah PR jadi, Anda cek badge CI (hijau/merah) di tautan PR, lalu putuskan merge atau tidak.

---

## 6. Ringkas

- **Tujuan**: cabut `eas-cli` + rapikan daftar bahan.
- **Cara**: commit apa adanya, kirim PR, biarkan tes otomatis jadi penjaga.
- **Pengaman**: CI merah = tidak merge; Anda yang pegang tombol akhir.
- **Aman dibatalkan**: semua di cabang terpisah.
