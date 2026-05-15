---
description: Update status sprint dan catatan progress project Lazisnu.
---

# Workflow: /update-sprint

## Tujuan

Menjaga `.agents/rules/10-sprint-aktif.md` tetap akurat setelah task selesai, ada blocker baru, atau arah sprint berubah.

## Kapan Dipakai

- Setelah menyelesaikan task penting.
- Setelah bug besar selesai.
- Setelah testing/deploy milestone.
- Saat status project berubah.

## Langkah Agent

### 1. Baca Status Saat Ini

Baca `.agents/rules/10-sprint-aktif.md`, lalu tampilkan:
- fase aktif;
- fokus saat ini;
- risiko utama;
- catatan blocker jika ada.

### 2. Tanya Perubahan

Tanyakan hanya yang belum jelas:

> Task apa yang sudah selesai, apa yang masih pending, dan apakah ada blocker baru?

Jika user sudah menjelaskan progress, jangan tanya ulang.

### 3. Update Sprint File

Update `.agents/rules/10-sprint-aktif.md` dengan:
- progress baru;
- blocker baru;
- prioritas berikutnya;
- tanggal update;
- catatan penting untuk agent berikutnya.

Jangan mengklaim fitur selesai tanpa bukti dari user, test, commit, atau hasil build.

### 4. Summary

```md
## Sprint Update

**Baru selesai:**
- ...

**Masih pending:**
- ...

**Blocker:**
- ...

**Fokus berikutnya:**
- ...

## Learning Checkpoint

**Konsep:** progress tracking mencegah agent bekerja dari konteks lama.
**Latihan kecil:** tulis 3 task berikutnya dalam urutan prioritas.
```
