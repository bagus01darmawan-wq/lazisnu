# UX Audit Workspace

Folder ini adalah "meja kerja" AI UX Auditor kamu. Cara pakainya seperti mengelola karyawan riset lepas yang bekerja berkala.

## Setup sekali di awal

1. Copy folder `.opencode/` (agent + command) dan `docs/ux-audit/` ini ke root monorepo kamu.
2. Jalankan `opencode auth login` kalau API key belum terpasang di project ini.
3. Jalankan `opencode` lalu ketik `/agents` (atau cek lewat `opencode agent list`) untuk pastikan agent `ux-auditor` terbaca.
4. Isi `docs/ux-audit/data/` dengan data yang sudah ada — lihat `00-DATA-CHECKLIST.md`. Boleh kosong sebagian, tidak masalah.
5. (Opsional, sangat disarankan untuk web) Pasang MCP Playwright di `opencode.json` supaya auditor bisa benar-benar membuka & menjelajah versi web yang live, bukan cuma baca kode:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "@playwright/mcp@latest"],
      "enabled": true
    }
  }
}
```

## Menjalankan siklus audit

Interaktif (kamu duduk dan mengawasi):
```
opencode
/ux-audit-cycle
```
Atau fokus ke satu area saja:
```
/ux-audit-cycle checkout flow
```

Non-interaktif / otomatis (untuk yang "berkelanjutan"):
```
opencode run "/ux-audit-cycle"
```
Baris ini bisa dimasukkan ke cron/CI supaya jalan otomatis tiap periode — lihat bagian di bawah.

## Membuat ini benar-benar "berkelanjutan"

opencode sendiri tidak punya scheduler bawaan, jadi jadwalkan lewat OS atau CI. Contoh cron bulanan (tanggal 1 jam 9 pagi):

```
0 9 1 * * cd /path/ke/monorepo && OPENCODE_PERMISSION=deny opencode run "/ux-audit-cycle" >> docs/ux-audit/cron.log 2>&1
```

`OPENCODE_PERMISSION=deny` penting supaya proses tidak nge-hang menunggu approval saat berjalan tanpa pengawasan (agent memang sudah dibatasi hanya boleh menulis di `docs/ux-audit/`, jadi aman untuk auto-run). Alternatif lebih rapi: plugin `opencode-scheduler` (launchd/systemd) kalau mau dikelola dari dalam opencode sendiri.

Setiap laporan baru otomatis tersimpan di `docs/ux-audit/reports/YYYY-MM-DD-audit.md`, dan `CHANGELOG.md` mencatat ringkasan tiap siklus — jadi kamu bisa lihat progres pain point dari waktu ke waktu tanpa buka semua laporan lama.

## Peran kamu sebagai client (tetap penting!)

AI ini menggantikan pekerjaan riset & penulisan laporan, bukan menggantikan pengawasan kamu:

- **Review tiap laporan baru** sebelum diteruskan ke tim desain — cek klaim yang disertai bukti vs yang ditandai `[DATA TIDAK TERSEDIA]`.
- **Isi data gap** yang tercatat di tiap laporan, supaya siklus berikutnya makin lengkap.
- **Presentasi ke stakeholder tetap perlu manusia** — AI menyiapkan draf ringkasan/materinya, tapi sesi presentasi live ke tim tidak bisa didelegasikan ke AI ini.
- **Usability testing dengan user asli** (moderated/unmoderated) tetap perlu difasilitasi manusia atau tool seperti Maze — AI hanya mendesain protokolnya dan menganalisis hasilnya.

## Struktur folder

```
docs/ux-audit/
├── README.md              (file ini)
├── 00-DATA-CHECKLIST.md   (checklist data yang perlu dikumpulkan)
├── CHANGELOG.md           (dibuat otomatis oleh auditor, ringkasan tiap siklus)
├── data/                  (kamu isi manual — bahan mentah)
│   ├── analytics/
│   ├── usability-testing/
│   ├── feedback/
│   └── screenshots/
└── reports/               (dibuat otomatis oleh auditor)
    └── YYYY-MM-DD-audit.md
```
