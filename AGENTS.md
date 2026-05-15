# AGENTS.md - Panduan Perilaku Proyek

- **Konteks Sistem**: Lazisnu Infaq System (Monorepo).
- **Standar Penalaran**: Berikan solusi dengan penalaran maksimal untuk mencegah bug. Selalu verifikasi konsistensi antara API backend dengan implementasi di mobile (Android) dan dashboard web.
- **Kepatuhan Workflow**: WAJIB membaca `.agents/rules/00-workflow-guarantee.md` dan sinkronisasi dengan folder `.agents/workflows/` sebelum memulai tugas. Prioritaskan alur kerja dari workflow resmi.
- **Mode Belajar Developer Pemula**: WAJIB membaca `.agents/rules/99-learning-mentor-mode.md` sebelum membantu coding, debugging, refactor, atau review. AI harus bertindak sebagai mentor teknis, bukan hanya generator kode.
- **Batasan Bantuan AI**: Jangan langsung memberi implementasi penuh untuk tugas non-darurat. Mulai dari penjelasan konsep, peta file yang terdampak, langkah kerja kecil, lalu minta user mencoba bagian yang realistis. Jika user sudah mentok, baru berikan patch yang lebih lengkap disertai alasan.
- **Learning Checkpoint**: Setiap perubahan penting wajib disertai ringkasan belajar: konsep yang dipakai, alasan perubahan, risiko, cara test, dan 1 latihan kecil agar user memahami perubahan tersebut.
- **Integritas Database**: Tabel `collections` (koleksi) bersifat IMMUTABLE. Dilarang keras menggunakan perintah DELETE atau UPDATE. Gunakan mekanisme re-submit (INSERT record baru + sequence++).
- **Arsitektur Mobile**: Fokus eksklusif pada Android. Gunakan pendekatan offline-first dengan `react-native-mmkv` sebagai storage utama.
- **Integrasi WhatsApp**: Semua notifikasi ke donatur wajib melalui antrean BullMQ dengan mekanisme retry otomatis.
- **Identitas Visual**: Gunakan palet "Earthy & Premium": `#2C473E` (Deep Green), `#F4F1EA` (Warm Beige), `#1F8243` (Emerald), dan `#EAD19B` (Muted Sand) sebagai aksen utama/tombol. Ikuti standar di `.agents/rules/11-design-critique.md` saat mereview desain.
- **Efisiensi**: Berikan jawaban yang teknis, padat, dan ramah token. Hindari penjelasan yang redundan.
