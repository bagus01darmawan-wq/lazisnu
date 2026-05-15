---
description: Integrasi, audit, dan verifikasi WhatsApp Business API async queue untuk Lazisnu.
---

# Workflow: /integrate-whatsapp

## Tujuan

Membantu mengintegrasikan atau mengecek WhatsApp notification flow. Workflow ini harus aman: jangan mengirim WA nyata jika template/token belum siap.

## Rule yang Wajib Dibaca

- `.agents/rules/04-business-rules.md`
- `.agents/rules/08-pedoman-backend.md`
- `.agents/rules/09-environment-variables.md`
- `.agents/rules/03-api-conventions.md`

## Prinsip Kritis

- WhatsApp tidak boleh blocking response submit collection.
- WA job dibuat setelah collection insert berhasil.
- Worker punya retry dan failure logging.
- Secret/token WA tidak boleh di-log atau di-commit.
- Jika template Meta belum approved, gunakan mock atau dry-run mode.

## Langkah Agent

### 1. Verifikasi Prasyarat

Cek bersama user:
- template submit approved;
- template revisi approved;
- `WA_PHONE_NUMBER_ID` tersedia di env lokal;
- `WA_ACCESS_TOKEN` tersedia di env lokal;
- Redis/BullMQ berjalan;
- worker WA berjalan.

### 2. Audit Implementasi Aktual

Cek:
- WA service;
- queue definition;
- worker;
- collection submit/resubmit service;
- notification/WA log table;
- web WA monitor jika ada.

Jangan membuat service baru jika implementasi sudah ada. Review dulu.

### 3. Flow Wajib

```txt
collection insert success
  -> enqueue WhatsApp job
  -> API return success
  -> worker send template message
  -> log result
  -> dashboard can monitor failed/pending/sent
```

### 4. Error Handling

Pastikan:
- token invalid tidak merusak collection;
- job retry otomatis;
- failed job tercatat;
- admin bisa retry manual jika fitur tersedia;
- nomor HP divalidasi format 628xxx.

### 5. Verifikasi

Test bertahap:
- dry-run/mock send;
- submit online;
- re-submit;
- WA token invalid -> retry/fail logged;
- batch sync offline -> WA job dibuat setelah sync berhasil.

## Output

```md
## WhatsApp Integration Plan/Review

**Status aktual:** ...
**File terdampak:** ...
**Risiko:** ...
**Langkah:** ...
**Cara test:** ...

## Learning Checkpoint
- Konsep:
- File penting:
- Latihan kecil:
```
