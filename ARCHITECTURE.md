# Lazisnu System Architecture

Dokumen ini merinci arsitektur teknis sistem Lazisnu Infaq, mencakup desain database, alur sinkronisasi mobile, dan prinsip integritas data.

## 1. Integritas Data: Append-only Ledger (Immutability)

Tabel `collections` (koleksi) dirancang dengan prinsip **IMMUTABLE** (tidak dapat diubah). Hal ini untuk menjamin transparansi dan audit trail yang sempurna bagi dana umat.

### Aturan Bisnis:
- Dilarang keras menggunakan perintah `UPDATE` atau `DELETE` pada tabel `collections`.
- Segala bentuk koreksi atau perubahan nominal harus dilakukan melalui mekanisme **Re-submit**.
- Setiap kali data dikoreksi, sistem akan melakukan `INSERT` baris baru dengan:
  - `submit_sequence` yang bertambah (sequence++).
  - Alasan perubahan disimpan di kolom `alasan_resubmit`.
- Penentuan data "Terbaru" (Latest) dilakukan secara dinamis melalui kueri SQL menggunakan `max(submit_sequence)` per penugasan/kaleng, bukan menggunakan flag status.

```sql
-- Contoh kueri untuk mengambil data terbaru secara dinamis
SELECT * FROM collections c1
WHERE submit_sequence = (
    SELECT MAX(submit_sequence) 
    FROM collections c2 
    WHERE c2.assignment_id = c1.assignment_id 
    AND c2.can_id = c1.can_id
);
```

## 2. Strategi Offline-First (Mobile)

Aplikasi petugas dirancang untuk bekerja di area dengan koneksi internet yang tidak stabil (blindspot).

### Alur Kerja:
1. **Local Enqueue:** Data koleksi disimpan terlebih dahulu ke dalam antrean lokal (MMKV Storage) dengan `offline_id` unik (UUID).
2. **Background Sync:** Aplikasi akan mencoba mengirimkan data ke server jika mendeteksi koneksi internet.
3. **Exponential Backoff:** Jika gagal (server down atau sinyal lemah), sistem akan mencoba kembali dengan jeda waktu yang meningkat secara eksponensial (1s, 2s, 4s, dst) hingga maksimal 3 kali percobaan per sesi.
4. **Deduplication:** Server menggunakan `offline_id` untuk memastikan tidak ada data ganda jika terjadi kegagalan koneksi di tengah proses pengiriman.

## 3. Distribusi Aplikasi & Update

Pembaruan aplikasi disebarkan lewat mekanisme **update-in-app**: aplikasi membandingkan
`versionCode` APK-nya dengan endpoint publik `GET /v1/mobile/version`, lalu menampilkan
modal pembaruan dan mengunduh APK per-ABI dari `apk.lazisnu.site` (Cloudflare R2).

### Konfigurasi:
- `versionName`/`versionCode` ditulis literal di `apps/mobile/android/app/build.gradle` (deterministik, tanpa auto-increment).
- Rilis: push tag `v*` → `.github/workflows/release.yml` (Gradle di runner GitHub, matriks 3 APK: arm64-v8a, armeabi-v7a, universal) → unggah R2 → dispatch `ci.yml` untuk deploy blue-green.
- EAS/OTA (Expo EAS Update) sudah tidak dipakai — dibongkar 2026-09-02.

## 4. Keamanan API

- **JWT + RBAC:** Semua akses API dilindungi JWT dengan validasi Role-Based Access Control (Admin Kecamatan, Admin Ranting, Petugas, Bendahara).
- **Audit Logs:** Setiap aksi administratif dicatat lengkap dengan `user_id`, `action`, `ip_address`, dan `timestamp`.
