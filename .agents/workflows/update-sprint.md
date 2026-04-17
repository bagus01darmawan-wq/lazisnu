---
description: 
---

# Workflow: /update-sprint
# Trigger: Ketik /update-sprint di chat Antigravity
# Tujuan: Update status sprint setelah menyelesaikan task atau berganti fase
# Gunakan ini di akhir setiap sesi atau setelah menyelesaikan sub-task penting

---

## Instruksi untuk Agent

Bantu user memperbarui file `10-sprint-aktif.md` agar tetap akurat dan up-to-date.

---

### LANGKAH 1 — Baca Status Saat Ini

Baca file `.agents/rules/10-sprint-aktif.md` dan tampilkan:
- Fase yang sedang aktif
- Sub-task yang sudah `[x]` (selesai)
- Sub-task yang masih `[ ]` (belum selesai)

### LANGKAH 2 — Tanya User

Tanyakan ke user:
> "Task apa yang sudah diselesaikan sejak update terakhir?"

Tunggu jawaban user. Jangan asumsikan apa yang sudah selesai.

### LANGKAH 3 — Update File

Berdasarkan jawaban user:
1. Centang `[ ]` menjadi `[x]` untuk task yang sudah selesai
2. Jika semua sub-task dalam satu fase sudah `[x]`:
   - Update bagian "Status Saat Ini" ke fase berikutnya
   - Update bagian "Konteks untuk Agent"
   - Pindahkan "Fase Berikutnya" menjadi "Fase Aktif"

### LANGKAH 4 — Cek Blocker

Tanyakan:
> "Ada kendala atau blocker yang perlu dicatat? Misalnya: template WA masih dalam review, SDK belum kompatibel, dll."

Jika ada, tambahkan seksi `## Blocker Saat Ini` di file `10-sprint-aktif.md`.

### LANGKAH 5 — Tampilkan Summary

Tampilkan ringkasan update yang dilakukan:
```
📝 SPRINT UPDATE — [Tanggal]

✅ Baru selesai:
  - [task 1]
  - [task 2]

🔄 Fase aktif sekarang: [nama fase]
⏭️  Task berikutnya: [sub-task pertama yang belum selesai]
⚠️  Blocker: [jika ada]
```

---

## Kapan Workflow Ini Harus Dijalankan

- Setelah menyelesaikan satu atau lebih sub-task
- Setelah berganti dari satu fase ke fase berikutnya
- Setiap akhir sesi development (agar konteks tidak hilang)
- Setelah UAT dan ada perubahan status signifikan
- Saat ada blocker baru yang perlu dicatat
