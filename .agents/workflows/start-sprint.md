---
description: 
---

# Workflow: /start-sprint
# Trigger: Ketik /start-sprint di chat Antigravity
# Tujuan: Load seluruh konteks project sebelum mulai mengerjakan task apapun
# Gunakan ini di awal setiap sesi coding atau saat berpindah fase

---

## Instruksi untuk Agent

Sebelum mengerjakan task apapun dalam project ini, lakukan langkah berikut secara berurutan:

### Langkah 1 — Baca Konteks Project
Baca file-file berikut untuk memahami konteks penuh project:
- `.agents/rules/00-project-overview.md` → identitas dan pilar utama project
- `.agents/rules/10-sprint-aktif.md` → fase dan sprint yang sedang berjalan
- `.agents/rules/01-arsitektur-folder.md` → struktur folder yang harus diikuti

### Langkah 2 — Identifikasi Fase Aktif
Dari file `10-sprint-aktif.md`, identifikasi:
- Fase berapa yang sedang berjalan
- Sub-task mana yang sudah selesai (ditandai `[x]`)
- Sub-task mana yang belum selesai (masih `[ ]`)
- Ada blocker atau tidak

### Langkah 3 — Laporkan Status ke User
Tampilkan ringkasan berikut sebelum melanjutkan:

```
📍 FASE AKTIF: [nama fase]
✅ Sudah selesai: [list sub-task yang sudah [x]]
🔄 Sedang dikerjakan: [sub-task berikutnya]
⚠️  Blocker (jika ada): [daftar blocker]
```

### Langkah 4 — Konfirmasi Task
Tanyakan ke user:
> "Berdasarkan status di atas, task apa yang ingin dikerjakan sekarang?"

Tunggu jawaban user sebelum mulai mengerjakan apapun.

---

## Aturan Selama Sesi

- Ikuti semua rules di `.agents/rules/` — terutama `04-business-rules.md`
- Jika task menyentuh database → baca `02-arsitektur-database.md` terlebih dahulu
- Jika task menyentuh API → baca `03-api-conventions.md` terlebih dahulu
- Jika task menyentuh mobile → baca `06-pedoman-mobile.md` terlebih dahulu
- Jika task menyentuh web → baca `07-pedoman-web.md` terlebih dahulu
- Jika task menyentuh backend → baca `08-pedoman-backend.md` terlebih dahulu
- Setelah task selesai, update `10-sprint-aktif.md` dengan mencentang sub-task yang baru diselesaikan
