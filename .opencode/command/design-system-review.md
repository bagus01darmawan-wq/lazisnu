---
description: Review usulan token/komponen baru dari Product Designer di packages/design-tokens/proposals/
agent: design-system-specialist
---

Review semua usulan yang belum diproses di `packages/design-tokens/proposals/`. Untuk tiap usulan:

1. Cek apakah kebutuhan sudah terpenuhi token/komponen existing — kalau iya, reject dengan alasan & rujukan token yang harus dipakai sebagai gantinya.
2. Kalau memang baru: cek konsistensi penamaan & skala dengan token existing (spacing/type scale kelipatan konsisten, penamaan warna semantik bukan literal, dst).
3. Approve → merge ke `packages/design-tokens/` canonical, update `packages/design-tokens/CHANGELOG.md`, update dokumentasi terkait di `docs/design-system/`.
4. Reject/revisi → tulis alasan singkat langsung di file proposal yang sama.
5. Tutup dengan ringkasan ke saya (client): berapa disetujui, berapa ditolak & kenapa, dan apakah ada breaking change yang perlu saya tahu.
