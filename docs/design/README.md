# Design Workspace

AI Product Designer kamu bekerja langsung sebagai kode di `apps/web` & `apps/mobile`, bukan lewat Figma dulu. Alasan dan strateginya dijelaskan di bawah.

## Soal akun Figma gratis kamu

**Ya, itu jadi kendala nyata** kalau kamu mau AI kerja di Figma sebagai tempat kerja utama sehari-hari.

Per pertengahan 2026: Figma MCP server resmi jalan di semua paket termasuk Starter (gratis) — tapi dibatasi sekitar **6 tool call/bulan** untuk paket Starter atau seat View/Collab, dibanding **200/hari** untuk seat Dev/Full di paket Professional ke atas. Enam kali sebulan cukup untuk tes koneksi sekali, tidak cukup untuk siklus desain iteratif harian.

Karena itu setup ini sengaja **tidak bergantung ke Figma** untuk kerja hariannya. AI kerja langsung di kode React/React Native kamu (terbuka, tanpa limit), dan Figma baru dipakai belakangan kalau kamu perlu dokumen handoff yang enak dibaca stakeholder non-teknis.

Kalau nanti kamu memang mau workflow Figma-first penuh (misal ada desainer manusia lain yang perlu kolaborasi di Figma juga), opsinya: upgrade minimal satu seat Dev/Full di paket Professional (kisaran $15/bulan) khusus untuk akun yang dipakai AI ini. Cek dulu dokumentasi resmi Figma MCP terbaru di figma.com/developers sebelum upgrade — detail kuota dan fitur tulis (create/edit frame) masih terus berubah.

## Kalau nanti mau coba sambungkan Figma juga

Tambahkan ini ke `opencode.json` (perlu Personal Access Token dari Figma, scope `file:read` minimal):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "figma": {
      "type": "remote",
      "url": "https://mcp.figma.com/mcp",
      "enabled": true
    }
  }
}
```

Ingat kuotanya — pakai secukupnya (misal cuma baca referensi desain lama), jangan jadikan cara kerja utama selama masih paket gratis.

## Menjalankan siklus desain

Interaktif:
```
opencode
/design-cycle checkout donasi flow untuk kolektor lapangan
```

Non-interaktif:
```
opencode run "/design-cycle <brief singkat>"
```

Karena agent ini berdiri sendiri (tidak otomatis nyambung ke laporan auditor), selalu kasih brief yang jelas: fitur apa, masalah yang mau diselesaikan, dan kalau relevan, rujukan temuan audit spesifik.

## Soal token desain baru

Product Designer tidak lagi menulis langsung ke `packages/design-tokens/` canonical. Kalau butuh token baru, dia menulis usulan ke `packages/design-tokens/proposals/` dan tetap jalan pakai nilai sementara — ada agent terpisah, **Design System Specialist**, yang jadi gatekeeper untuk review & merge usulan itu. Detail alurnya ada di `docs/design-system/README.md`; kamu yang memicu review-nya lewat `/design-system-review` kapan pun usulan sudah menumpuk.

## Struktur folder

```
docs/design/
├── README.md
├── plans/       (rencana token & konsep tiap fitur — dibuat otomatis)
└── handoff/     (catatan handoff untuk developer — dibuat otomatis)
```

Komponen hasil desain masuk ke `apps/web/components/` dan `apps/mobile/src/components/` (sesuaikan kalau struktur asli beda). Token desain **tidak** ditulis langsung di sini — lihat bagian di atas.

## Peran kamu sebagai client

- Kasih brief yang jelas tiap sesi (fitur, masalah, batasan)
- Jawab pertanyaan soal brand/keputusan bisnis yang sengaja tidak ditebak AI (lihat aturan kerja di file agent)
- **Review di device Android low-end beneran**, bukan cuma simulator — aplikasi mobile ini dipakai kolektor lapangan dengan kondisi jaringan yang tidak selalu bagus
- Usability testing lanjutan dengan user asli tetap perlu difasilitasi manusia — AI bisa bantu desain skenario testing-nya kalau diminta, tapi tidak menjalankan sesinya sendiri
