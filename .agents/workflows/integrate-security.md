---
description: Audit dan integrasi security/monitoring mobile/backend Lazisnu.
---

# Workflow: /integrate-security

## Tujuan

Membantu merencanakan, mengintegrasikan, atau mengecek keamanan dan monitoring: mobile integrity, token security, crash/error monitoring, dan deploy safety.

## Rule yang Wajib Dibaca

- `.agents/rules/06-pedoman-mobile.md`
- `.agents/rules/08-pedoman-backend.md`
- `.agents/rules/09-environment-variables.md`
- skill `lazisnu-deploy-checklist` jika terkait release.

## Prinsip Aman

- Jangan commit secret, private key, token, atau service account JSON.
- Jangan menambah dependency security tanpa cek kompatibilitas React Native/Android.
- Security feature boleh dimulai dari audit dan guard sederhana sebelum integrasi penuh.
- Untuk pemula, jelaskan trade-off: security tinggi vs kompleksitas dan waktu implementasi.

## Langkah Agent

### 1. Tentukan Scope

Pilih area:
- mobile integrity;
- secure token storage;
- backend auth hardening;
- Sentry/Crashlytics;
- deploy monitoring;
- environment secret hygiene.

### 2. Audit Aktual

Cek:
- token storage di mobile;
- API auth middleware;
- env handling;
- logging secret;
- error monitoring package;
- crash reporting package;
- network/API error handling.

### 3. Rencana Implementasi Bertahap

Mulai dari yang paling aman:
1. secret hygiene;
2. token storage dan logout cleanup;
3. error monitoring backend/web/mobile;
4. mobile integrity jika Play Console dan device policy siap;
5. rollback/deploy checklist.

### 4. Verifikasi

- login/logout aman;
- token tidak muncul di log;
- error test muncul di monitoring;
- app tidak crash saat offline;
- environment file tidak ikut git status.

## Output

```md
## Security Plan/Review

**Scope:** ...
**Risiko utama:** ...
**File terdampak:** ...
**Langkah aman:** ...
**Cara test:** ...

## Learning Checkpoint
- Konsep:
- File penting:
- Latihan kecil:
```
