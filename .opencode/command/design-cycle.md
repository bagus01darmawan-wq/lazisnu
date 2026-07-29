---
description: Jalankan satu siklus desain dari brief manual (user flow → wireframe → hi-fi UI → update design system)
agent: product-designer
---

Brief untuk siklus desain kali ini: $ARGUMENTS

Langkah kerja:

1. Kalau brief menyebut hasil audit UX tertentu, cek dan baca laporan relevan di `docs/ux-audit/reports/` kalau folder itu ada. Kalau tidak ada (belum pernah pakai auditor), lanjut tanpa itu.
2. Tulis rencana token desain singkat di `docs/design/plans/!`date +%Y-%m-%d`-plan.md` sebelum coding (warna, tipografi, konsep layout, elemen signature) — ikuti aturan kualitas di system prompt kamu.
3. Buat/perbarui user flow (mermaid/diagram teks) dan wireframe skeleton untuk fitur ini.
4. Implementasikan high-fidelity UI sebagai komponen React (web) dan/atau React Native (mobile) sesuai cakupan brief.
5. Kalau butuh token baru yang belum ada di `packages/design-tokens/` (canonical, read-only buat kamu): jangan tambahkan langsung — tulis usulan di `packages/design-tokens/proposals/` dan pakai nilai sementara di komponen sambil jalan terus (lihat "Relasi dengan Design System Specialist" di system prompt kamu).
6. Jalankan type-check/lint terkait, perbaiki kalau ada error sebelum lanjut.
7. Tulis catatan handoff singkat di `docs/design/handoff/!`date +%Y-%m-%d`-handoff.md`: apa yang dibuat, keputusan desain penting & alasannya, state yang di-cover (loading/empty/error), dan hal yang masih perlu didiskusikan dengan client.
8. Tutup dengan ringkasan ke saya (client): apa yang selesai, dan pertanyaan/keputusan brand yang masih perlu saya jawab.
