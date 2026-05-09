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

## 3. Distribusi Aplikasi & Update (EAS)

Sistem menggunakan **Expo EAS Update** untuk pengiriman pembaruan Over-The-Air (OTA).

### Konfigurasi:
- `CHANNEL`: Menentukan target rilis (misal: `staging`, `production`).
- `RUNTIME_VERSION`: Memastikan kecocokan antara kode JavaScript dan kode native aplikasi.
- Migrasi dari App Center/CodePush dilakukan sepenuhnya ke Expo EAS untuk menjamin keberlangsungan rilis aplikasi Android.

## 4. Keamanan API

- **JWT + RBAC:** Semua akses API dilindungi JWT dengan validasi Role-Based Access Control (Admin Kecamatan, Admin Ranting, Petugas, Bendahara).
- **Audit Logs:** Setiap aksi administratif dicatat lengkap dengan `user_id`, `action`, `ip_address`, dan `timestamp`.
