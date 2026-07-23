---
description: Jalankan satu siklus audit UX (heuristic + data + laporan baru)
agent: ux-auditor
---

Jalankan satu siklus audit UX baru. Fokus area kali ini: $ARGUMENTS (kosongkan argumen untuk audit menyeluruh).

Langkah kerja:

1. Cek isi folder `docs/ux-audit/data/` — identifikasi data baru yang belum pernah dianalisis di laporan sebelumnya.
2. Baca laporan terakhir di `docs/ux-audit/reports/` (jika ada) untuk konteks pain point sebelumnya (mana yang masih open).
3. Lakukan heuristic evaluation pada bagian aplikasi (web & native) yang relevan dengan fokus area di atas.
4. Analisis semua data baru di folder data (kuantitatif + kualitatif) sesuai aturan anti-halusinasi di system prompt kamu.
5. Susun laporan baru di `docs/ux-audit/reports/!`date +%Y-%m-%d`-audit.md` mengikuti struktur wajib.
6. Update `docs/ux-audit/CHANGELOG.md` — tambahkan satu baris ringkasan: tanggal, jumlah pain point baru, jumlah yang closed, fokus area.
7. Tutup dengan ringkasan singkat ke saya (client): temuan paling kritis, dan data apa yang masih perlu saya kumpulkan untuk siklus berikutnya.
