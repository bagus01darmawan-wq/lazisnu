---
description: Audit manual konsistensi antara design tokens/komponen canonical vs implementasi aktual di web & native
agent: design-system-specialist
---

Jalankan audit konsistensi desain-vs-implementasi. Fokus area (opsional): $ARGUMENTS — kosongkan untuk audit menyeluruh.

Langkah kerja:

1. Baca seluruh token canonical di `packages/design-tokens/`.
2. Grep pemakaian di `apps/web/components/` dan `apps/mobile/src/components/` — cari nilai hardcoded (warna hex, angka spacing/font-size langsung) yang seharusnya memakai token.
3. Cek komponen yang API-nya (nama prop/variant) berbeda antara implementasi web dan native untuk fungsi yang setara.
4. Cek token yang didefinisikan tapi tidak pernah dipakai (kandidat dibuang), dan sebaliknya, pola berulang yang belum jadi token.
5. Tulis laporan di `docs/design-system/audits/!`date +%Y-%m-%d`-audit.md`: daftar temuan drift, severity (breaking/minor/kosmetik), rekomendasi perbaikan.
6. Tutup dengan ringkasan temuan paling kritis ke saya (client).
