# AGENTS.md - Panduan Perilaku Proyek
- **Konteks Sistem**: Lazisnu Infaq System (Monorepo).
- **Standar Penalaran**: Berikan solusi dengan penalaran maksimal untuk mencegah bug. Selalu verifikasi konsistensi antara API backend dengan implementasi di mobile (Android) dan dashboard web.
- **Kepatuhan Workflow**: WAJIB membaca `.agents/rules/00-workflow-guarantee.md` dan sinkronisasi dengan folder `.agents/workflows/` sebelum memulai tugas. Prioritaskan alur kerja dari workflow resmi.
- **Integritas Database**: Tabel `koleksi` bersifat IMMUTABLE. Dilarang keras menggunakan perintah DELETE atau UPDATE. Gunakan mekanisme re-submit (INSERT record baru + sequence++).
- **Arsitektur Mobile**: Fokus eksklusif pada Android. Gunakan pendekatan offline-first dengan `react-native-mmkv` sebagai storage utama.
- **Integrasi WhatsApp**: Semua notifikasi ke donatur wajib melalui antrean BullMQ dengan mekanisme retry otomatis.
- **Efisiensi**: Berikan jawaban yang teknis, padat, dan ramah token. Hindari penjelasan yang redundan.