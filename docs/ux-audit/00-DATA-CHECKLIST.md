# Data Checklist — Siklus Audit UX Pertama

AI auditor bisa langsung membaca **source code** monorepo ini. Tapi untuk poin "Tanggung Jawab Utama" nomor 3 & 4 di job desc (analisis data kuantitatif & feedback pengguna), dia butuh file — dia tidak bisa login ke Google Analytics/Hotjar/App Store sendiri.

Taruh semua file di `docs/ux-audit/data/`, di subfolder berikut. Belum punya semua? Tidak masalah — mulai dari yang paling gampang diambil, sisanya biarkan tercatat sebagai "data gap" di laporan pertama.

## 1. `data/analytics/`
- Export funnel & drop-off rate (CSV) dari GA/Mixpanel/Amplitude — per platform (web & native terpisah)
- Screenshot atau export heatmap dari Hotjar/Clarity (untuk halaman/flow utama)
- Angka retensi & churn kalau ada

## 2. `data/usability-testing/`
- Transkrip atau ringkasan hasil moderated/unmoderated testing (Maze, UserTesting, atau sesi manual)
- Kalau belum pernah ada testing formal: catatan observasi internal apa pun (bug report tim QA, keluhan berulang dari tim support) juga membantu

## 3. `data/feedback/`
- Hasil survey pengguna (raw response atau ringkasan)
- Transkrip user interview
- Export review App Store / Play Store (terutama rating 1–3 bintang)
- Sample tiket support yang berkaitan dengan kebingungan/kesulitan pakai produk (bukan bug teknis murni)

## 4. `data/screenshots/` (opsional tapi sangat membantu)
- Screenshot alur utama di web & native (kalau AI belum punya akses browser otomatis ke versi live)
- Rekaman layar (deskripsikan dalam file .md kalau tidak bisa upload video) untuk flow yang sering bermasalah

## Prioritas kalau semua kosong

Kalau saat ini benar-benar belum ada satupun, urutan termudah untuk mulai:
1. Screenshot alur utama (web & native) — bisa disiapkan dalam hitungan jam
2. Export review store 3 bulan terakhir — biasanya tinggal download
3. Sample tiket support terkait UX — minta tim CS filter
4. Baru setelah itu: setup tracking/analytics kalau belum ada, dan jadwalkan usability testing formal

Tidak perlu lengkap dulu sebelum menjalankan `/ux-audit-cycle` — auditor akan tetap jalan dengan apa yang ada, dan mendaftar sisanya sebagai data gap di laporan.
