---
description: Audit, lanjutkan, atau perbaiki web dashboard Lazisnu berbasis Next.js 16.
---

# Workflow: /build-web-dashboard

## Tujuan

Membantu membangun atau mengecek web dashboard admin/bendahara. Karena dashboard mungkin sudah ada, mulai dari audit implementasi aktual dan jangan scaffold ulang Next.js.

## Rule yang Wajib Dibaca

- `.agents/rules/07-pedoman-web.md`
- `.agents/rules/12-standar-ui-web.md`
- `.agents/rules/05-konvensi-kode.md`
- `.agents/rules/03-api-conventions.md`

## Langkah Agent

### 1. Audit Status Aktual

Cek:
- route/app structure;
- auth middleware;
- role menu/sidebar;
- API client;
- komponen UI reusable;
- halaman utama: overview, cans/kaleng, users, assignments, reports, resubmit, audit log, WA monitor;
- shared type usage.

Jangan menjalankan `create-next-app` jika `apps/web` sudah ada.

### 2. Fokus Dashboard

Pastikan setiap halaman punya:
- loading state;
- empty state;
- error state;
- success toast;
- role guard;
- responsive layout;
- konsistensi Earthy & Premium.

### 3. Contract Check

Untuk fitur yang mengambil data backend:
- cek endpoint aktual;
- cek request/response shape;
- cek type di `packages/shared-types` jika lintas app;
- cek handling error standar `{ success: false, error }`.

### 4. Prioritas Flow

- Login dan route protection.
- Sidebar role-based.
- CRUD cans/kaleng.
- Users/officers.
- Assignments.
- Reports/export CSV.
- Resubmit tracker.
- WA monitor.

### 5. Verifikasi

```bash
pnpm build:web
pnpm --filter web lint
```

Manual test:
- admin kecamatan melihat menu penuh;
- admin ranting hanya melihat menu sesuai role;
- bendahara read-only;
- export CSV terbuka normal;
- toggle riwayat re-submit benar;
- action destructive memakai toast confirmation.

## Output

```md
## Web Dashboard Plan/Review

**Status aktual:** ...
**File terdampak:** ...
**Masalah prioritas:** ...
**Langkah perbaikan:** ...
**Cara test:** ...

## Learning Checkpoint
- Konsep:
- File penting:
- Latihan kecil:
```
