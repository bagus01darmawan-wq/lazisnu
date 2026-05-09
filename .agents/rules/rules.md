---
trigger: manual
---

# RULES
# Core Tech Stack & Environment
- Struktur: Proyek ini menggunakan arsitektur Monorepo.
  - `apps/mobile`: React Native (Fokus Android saja, abaikan iOS).
  - `apps/web`: Next.js & Tailwind CSS.
  - `apps/backend`: Node.js (Fastify) + Drizzle ORM.
- Gaya Respons: Ringkas, langsung ke intinya, dan selalu verifikasi dampak lintas-modul sebelum menyarankan modifikasi kode.
# Database & Immutable Constraints
- Database: PostgreSQL.
- ATURAN MUTLAK: Tabel `koleksi` bersifat STRICTLY IMMUTABLE. 
- Larangan Keras: Jangan pernah menulis kueri, migrasi, atau logika Drizzle ORM yang menggunakan `DELETE` atau `UPDATE` pada tabel `koleksi`.
- Koreksi Data: Semua koreksi pengumpulan infaq HANYA boleh menggunakan mekanisme re-submit, yaitu melakukan `INSERT` data baru dengan menambahkan nilai `submit_sequence` dan mengisi `alasan_resubmit`.
- Audit Trail: Setiap aksi oleh admin harus mencatat `user_id`, `action`, `timestamp`, dan `ip_address` ke dalam tabel `audit_logs`.
# Mobile Architecture: Offline-First
- Platform: Prioritas mutlak hanya Android. Jangan hasilkan kode spesifik iOS.
- Pendekatan Lapangan: Aplikasi petugas dirancang Offline-First untuk area blindspot.
- Storage & Queue: Wajib menggunakan `react-native-mmkv` untuk penyimpanan token JWT terenkripsi dan antrean lokal (offline queue).
- Network Handling: Gunakan NetInfo. Saat koneksi hilang, simpan submit ke MMKV. Saat koneksi kembali, jalankan auto-sync ke backend di latar belakang tanpa intervensi petugas.
- Pembaruan: Siapkan dukungan Microsoft CodePush untuk pembaruan OTA (Over-The-Air).
# API Security & Integrations
- Otorisasi: Semua endpoint (kecuali login) WAJIB dilindungi oleh validasi JWT dan Role-Based Access Control (RBAC) yang ketat (admin_kecamatan, admin_ranting, petugas, bendahara).
- Background Jobs: Gunakan BullMQ + Redis untuk antrean tugas asinkron.
- Integrasi Eksternal: WhatsApp Business API harus diproses melalui BullMQ worker. Terapkan mekanisme retry 3x dengan exponential backoff jika pengiriman pesan WA gagal.
- Error Handling: Gunakan Global Error Handler yang mengembalikan format JSON konsisten.