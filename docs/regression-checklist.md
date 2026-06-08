# Lazisnu Infaq System - Regression Test Checklist

Dokumen ini berisi daftar lengkap *test case* yang harus diuji (*Regression Test*) sebelum melakukan perilisan (deploy) ke *production*. Pengujian dibagi berdasarkan alur kritis (*critical flows*) dan lapisan aplikasi (Backend, Web, Mobile).

## 1. Authentication & Authorization (Keamanan & Akses)

**Fokus:** Memastikan akses data aman dan *role-based access control* (RBAC) berjalan sempurna.

- [x] **TC-AUTH-01:** Login berhasil dengan kredensial yang valid (Web & Mobile).
- [x] **TC-AUTH-02:** Login gagal dan mengembalikan pesan error yang ramah pengguna jika kredensial salah.
- [x] **TC-AUTH-03:** *Refresh Token* berhasil men-generate *Access Token* baru jika token sebelumnya kedaluwarsa.
- [x] **TC-AUTH-04:** *Refresh Token* **gagal** (401/403) jika status akun pengguna telah di-nonaktifkan oleh Admin.
- [x] **TC-AUTH-05:** *Role-based filtering:* Admin Ranting/MWC hanya bisa melihat data kaleng dan tugas di wilayahnya saja (tidak bocor ke wilayah lain). *(✅ 5 test case PASS di `p0-regression.test.ts`)*
- [x] **TC-AUTH-06:** Upaya mengakses endpoint admin (contoh: `/admin/users`) oleh *role* Petugas ditolak (403 Forbidden). *(✅ 4 test case PASS di `p0-regression.test.ts`)*

## 2. Integritas Data & Aturan Finansial (Database Core)

**Fokus:** Menguji konsep *Append-only Ledger* (Immutability) pada tabel transaksi.

- [x] **TC-DB-01:** Membuat rekaman koleksi baru (Submit) tidak gagal dan meng-increment `totalCollected` pada tabel kaleng (`cans`). *(✅ 4 test case PASS di `p0-regression.test.ts`)*
- [x] **TC-DB-02:** **Koreksi/Resubmit:** Melakukan revisi nominal kaleng menciptakan *row* (baris) baru di tabel `collections` dengan `submit_sequence` yang meningkat, **bukan** melakukan perintah `UPDATE` pada *row* lama. *(✅ 5 test case PASS di `p0-regression.test.ts`)*
- [x] **TC-DB-03:** Sistem berhasil mencatat `alasan_resubmit` dan siapa petugas/admin yang melakukan revisi pada baris data baru. *(✅ 2 test case PASS di `p1-regression.test.ts`)*
- [x] **TC-DB-04:** Total nominal pada dashboard (Agregasi SQL) menghitung nilai yang benar dari *sequence* tertinggi, tanpa menggandakan nilai dari riwayat sebelumnya. *(✅ 4 test case PASS di `p1-regression.test.ts`)*
- [x] **TC-DB-05:** Menghapus permanen kaleng yang **sudah** memiliki riwayat transaksi ditolak (dilindungi sistem). *(✅ 3 test case PASS di `p1-regression.test.ts`)*

## 3. Mobile App & Offline-First Sync

**Fokus:** Menguji fungsionalitas Android, kapabilitas MMKV (Offline Storage), dan Sinkronisasi Latar Belakang.

- [ ] **TC-MOB-01:** Aplikasi mobile dapat dibuka dan menampilkan jadwal tugas (*assignments*) meskipun tanpa koneksi internet (mengambil data dari *cache* MMKV).
- [x] **TC-MOB-02:** Fitur **Scan QR Code** menolak QR tidak valid atau QR kaleng yang **bukan** penugasan dari petugas tersebut (melindungi kebocoran privasi *owner*). *(✅ QR invalid test di `qr.test.ts` + QR bukan penugasan di `scan-qr.test.ts` = 6+8 test case PASS)*
- [x] **TC-QR-01:** Scan QR kaleng milik sendiri → response API mengembalikan `assignment_id` + `can_id` yang benar (cocok dengan penugasan petugas). *(✅ 5 test case PASS di `scan-qr.test.ts`)*
- [x] **TC-QR-02:** Scan QR kaleng milik orang lain → **tidak bocor** data pemilik (nama, nomor WA, alamat) — hanya menampilkan pesan "bukan penugasan Anda". *(✅ 8 test case PASS di `scan-qr.test.ts`)*
- [ ] **TC-MOB-03:** Submit data koleksi berhasil disimpan ke dalam *Queue* (antrean) MMKV lokal ketika koneksi internet mati (Mode Pesawat).
- [ ] **TC-MOB-04:** Saat internet kembali menyala, proses *Auto-Sync* mengirim data di *Queue* ke server dengan sukses.
- [x] **TC-MOB-05:** **Idempotensi (Duplicate Test):** Mengirim dua transaksi yang sama persis (dengan `offline_id` yang sama) tidak akan menghasilkan penduplikasian data di database backend. *(✅ 5 test case PASS di `p1-regression.test.ts`)*
- [x] **TC-MOB-06:** Kesalahan validasi API yang bersifat permanen (*Validation Error*) tidak menyebabkan *infinite loop* pada *retry sync* di Android. *(✅ 16 test case PASS di `sync-errors.test.ts`)*

## 4. Web Dashboard & Management

**Fokus:** Antarmuka pengelola, akurasi pelaporan, dan operasi massal (*bulk actions*).

- [ ] **TC-WEB-01:** CRUD (Create, Read, Update, Disable) data *Master* (Users, Branches, Districts) berjalan normal.
- [ ] **TC-WEB-02:** Fitur filter rentang tanggal (*Date Picker*) di halaman Laporan (Reports) menampilkan data secara presisi (tidak terjadi *off-by-one date bug*).
- [ ] **TC-WEB-03:** UI/UX konsisten: Semua tabel menggunakan format *Glassmorphism* dan tidak menampilkan error `any` TypeScript.
- [x] **TC-WEB-04:** *Bulk Assignment* (Penugasan Massal) menggunakan algoritma *Round-Robin* dapat membagikan kaleng ke petugas secara merata tanpa membebani memori server (OOM). *(✅ 10 test case PASS di `assignmentGenerator.test.ts`)*
- [ ] **TC-WEB-05:** Filter tabel berfungsi saat berpindah halaman (Pagination Capsule State tersimpan dengan baik).

## 5. Integrasi Sistem Eksternal (WhatsApp BullMQ)

**Fokus:** Antrean pesan asinkron (*background jobs*).

- [ ] **TC-WA-01:** Pekerja (*Worker*) BullMQ berhasil mengirimkan notifikasi sukses pengambilan donasi ke nomor WA donatur sesaat setelah sinkronisasi koleksi berhasil.
- [x] **TC-WA-02:** Jika API WhatsApp sedang mati/limit, *Worker* tidak menganggapnya sukses, melainkan memasukkannya ke daftar tunggu ulang (*Exponential Backoff Retry*). *(✅ 13 test case PASS di `whatsapp-queue.test.ts`)*
- [x] **TC-WA-03:** Tugas WhatsApp yang gagal terus menerus akan masuk ke *Dead-Letter Queue* (DLQ) untuk dapat diselidiki admin melalui halaman Audit/WA Monitor. *(✅ 13 test case PASS di `whatsapp-queue.test.ts`)*

## 6. Audit & Traceability (Jejak Audit)

**Fokus:** Memastikan setiap perubahan data terekam untuk keperluan investigasi dan kepatuhan.

- [x] **TC-AUDIT-01:** Setiap aksi admin (tambah, edit, hapus, nonaktifkan) pada data master (ranting, dukuh, petugas, kaleng) dan data finansial (resubmit koleksi) tercatat di tabel audit log dengan informasi: operator, waktu, tipe aksi, data lama, dan data baru. *(✅ 20 test case PASS di `audit-logger.test.ts` + seluruh route CREATE sudah set `auditContext.newData`)*

---

> **Tip Pembuatan Test Case:** Setiap checklist di atas dapat dijabarkan menjadi format standar Test Case yang terdiri dari: **Pre-condition** (Prasyarat), **Action/Steps** (Langkah Kerja), dan **Expected Result** (Hasil yang Diharapkan).
