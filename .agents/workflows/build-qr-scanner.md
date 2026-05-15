---
description: Workflow alur QR scan, input nominal, submit collection, offline sync, dan re-submit Lazisnu.
---

# Workflow: /build-qr-scanner

## Tujuan

Membangun, mengecek, atau memperbaiki alur paling kritis: QR scan → input nominal → konfirmasi → submit → offline sync → WhatsApp queue → laporan.

## Rule yang Wajib Dibaca

- `.agents/rules/04-business-rules.md`
- `.agents/rules/02-arsitektur-database.md`
- `.agents/rules/03-api-conventions.md`
- `.agents/rules/06-pedoman-mobile.md`
- `.agents/rules/08-pedoman-backend.md`

## Prinsip Kritis

- `collections` immutable.
- Submit collection harus INSERT baru.
- Re-submit memakai INSERT baru + sequence bertambah.
- WhatsApp async melalui queue.
- Mobile Android harus offline-first.
- Batch sync harus aman terhadap retry dan duplikasi.

## Langkah Agent

### 1. Audit Status Aktual

Cek dulu apakah fitur sudah ada:
- backend route scan/collection/batch sync/resubmit;
- mobile scanner screen;
- input nominal screen;
- offline queue store;
- sync hook/service;
- shared types terkait collection/offline record.

Jangan membuat ulang file jika implementasi sudah ada.

### 2. Map Data Flow

```txt
Mobile scan QR
  -> validate QR endpoint
  -> input nominal
  -> submit online atau queue offline
  -> backend validation
  -> insert collection
  -> enqueue WhatsApp job
  -> response to mobile
  -> dashboard/report reads latest data
```

### 3. Backend Checks

Pastikan:
- QR validation aman;
- role PETUGAS hanya bisa submit assignment miliknya;
- duplicate submit dicegah;
- batch sync idempotent;
- re-submit butuh alasan;
- WhatsApp job dibuat setelah insert berhasil.

### 4. Mobile Checks

Pastikan:
- scanner disable setelah QR terbaca;
- input nominal integer, bukan float;
- error QR punya pesan jelas;
- offline queue disimpan di MMKV;
- sync menghapus hanya record yang berhasil;
- UI punya loading/error/success state.

### 5. Verifikasi

Manual scenarios:
- online submit berhasil;
- offline submit masuk queue lalu sync;
- QR palsu ditolak;
- QR bukan tugas petugas ditolak;
- submit duplikat ditolak;
- re-submit berhasil dengan alasan;
- WA job tercatat.

## Output

```md
## QR Collection Flow Plan/Review

**Status aktual:** ...
**Data flow:** ...
**File terdampak:** ...
**Risiko:** ...
**Langkah implementasi:** ...
**Cara test:** ...

## Learning Checkpoint
- Konsep:
- File penting:
- Latihan kecil:
```
