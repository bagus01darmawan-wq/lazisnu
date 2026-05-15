---
description: Mulai sesi development dengan memuat konteks project Lazisnu saat ini.
---

# Workflow: /start-sprint

## Tujuan

Memulai sesi development dengan konteks yang tepat tanpa membebani task kecil. Workflow ini membantu agent memahami posisi sprint, struktur project, dan aturan area sebelum bekerja.

## Kapan Dipakai

Gunakan saat:
- awal sesi coding;
- berpindah modul besar;
- task lintas backend, web, mobile, database, auth, atau deploy;
- agent terlihat kehilangan konteks.

Tidak wajib untuk typo, copywriting kecil, atau perubahan styling satu file.

## Langkah Agent

### 1. Baca Konteks Minimum

Baca:
- `AGENTS.md`
- `.agents/rules/10-sprint-aktif.md`
- `.agents/rules/01-arsitektur-folder.md`

### 2. Laporkan Ringkasan

Tampilkan:

```md
## Sprint Context

**Fase aktif:** ...
**Fokus sekarang:** ...
**Area project:** backend / web / mobile / shared-types / docs
**Risiko utama:** ...
```

### 3. Tentukan Rule Tambahan

Berdasarkan task user:
- database/koleksi/resubmit: baca `02-arsitektur-database.md` dan `04-business-rules.md`
- API/backend: baca `03-api-conventions.md`, `05-konvensi-kode.md`, `08-pedoman-backend.md`
- web/UI: baca `07-pedoman-web.md`, `11-design-critique.md`, `12-standar-ui-web.md`
- mobile/offline/QR: baca `06-pedoman-mobile.md`
- config/deploy: baca `09-environment-variables.md`

### 4. Konfirmasi Task

Tanyakan singkat:

> Task apa yang ingin dikerjakan sekarang, dan area mana yang paling terdampak?

Jika user sudah memberi task dengan jelas, jangan bertanya ulang. Langsung lanjut dengan rencana kecil.

## Output Wajib

- tujuan task;
- file/folder terdampak;
- langkah kecil;
- Learning Checkpoint setelah perubahan penting.
