# AI Team — Index

Tiga "karyawan AI" tetap untuk monorepo ini, dikondisikan dari job desc masing-masing. Semua saling terhubung lewat file di `docs/` dan `packages/design-tokens/` — bukan lewat chat/memory bersama (opencode tidak punya shared memory antar-agent).

## Peta Tim

| Peran | Job Desc Asli | Agent | Command | Workspace | Cadence |
|---|---|---|---|---|---|
| UX Researcher / Auditor | Audit UX produk berjalan | `.opencode/agent/ux-auditor.md` | `/ux-audit-cycle` | `docs/ux-audit/` | Berkelanjutan (manual atau cron) |
| Product Designer | Redesign berdasar hasil audit | `.opencode/agent/product-designer.md` | `/design-cycle` | `docs/design/` | Manual, per brief |
| Design System Specialist | Jaga konsistensi & shared design system | `.opencode/agent/design-system-specialist.md` | `/design-system-review`, `/design-system-audit` | `docs/design-system/` | Manual, dipicu client |

## Alur Data Antar-Agent

```
Client (kamu)
   │
   ├──► ux-auditor ──► docs/ux-audit/reports/
   │                         │
   │                         │ (dibaca kalau kamu sebut di brief — opt-in, bukan otomatis)
   │                         ▼
   ├──► product-designer ◄───┘
   │         │
   │         │ token/pola baru? tulis usulan, jangan tunggu approval
   │         ▼
   │    packages/design-tokens/proposals/
   │         │
   └──► design-system-specialist ──► packages/design-tokens/ (canonical, review manual lewat /design-system-review)
```

Tidak ada koneksi otomatis antar-agent selain lewat file di atas — kamu (client) yang jadi "manajer" yang memicu tiap langkah dan menjembatani kalau perlu.

## Setup Awal (sekali saja)

1. Copy seluruh isi `.opencode/` dan `docs/` dari paket ini ke root monorepo kamu (gabungkan kalau sudah ada `.opencode/` sebelumnya, jangan ditimpa).
2. `opencode auth login` kalau API key belum terpasang di project ini.
3. Cek ketiga agent terbaca: `opencode agent list` harus menampilkan `ux-auditor`, `product-designer`, `design-system-specialist`.
4. Isi `docs/ux-audit/data/` — lihat `docs/ux-audit/00-DATA-CHECKLIST.md`. Boleh kosong sebagian.
5. Mulai dari `/ux-audit-cycle` (paling masuk akal jalan duluan, karena hasilnya jadi bahan brief buat Product Designer) — tapi tidak wajib urut, kamu bisa langsung `/design-cycle` kalau sudah punya brief sendiri.

## Detail per Peran

Baca `README.md` di masing-masing folder workspace untuk instruksi lengkap, batasan kerja, dan penjelasan keputusan desain (kenapa Figma bukan tempat kerja utama, kenapa dokumentasi cuma Markdown, dll):
- `docs/ux-audit/README.md`
- `docs/design/README.md`
- `docs/design-system/README.md`

## Peran Kamu sebagai Client (ringkas)

- Isi & lengkapi data yang masih `[DATA TIDAK TERSEDIA]` di laporan auditor
- Kasih brief jelas ke Product Designer, jawab pertanyaan soal brand yang sengaja tidak ditebak
- Picu `/design-system-review` berkala supaya usulan token tidak menumpuk
- Presentasi ke stakeholder & sesi usability testing dengan user asli tetap perlu manusia — ketiga agent ini menyiapkan bahannya, bukan menggantikan sesi itu sendiri
