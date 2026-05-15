---
description: Setup environment development Lazisnu di mesin baru tanpa menimpa repo yang sudah ada.
---

# Workflow: /setup-environment

## Tujuan

Membantu setup environment development untuk project Lazisnu. Workflow ini untuk mesin baru atau saat environment rusak, bukan untuk scaffold ulang project yang sudah ada.

## Prinsip Aman

- Jangan menjalankan `git init` jika repo sudah ada.
- Jangan membuat ulang `apps/backend`, `apps/web`, atau `apps/mobile` jika folder sudah ada.
- Jangan commit `.env`, `.env.local`, `.env.production`, atau secret asli.
- Ikuti versi aktual dari `package.json` dan rule environment.

## Langkah Agent

### 1. Deteksi Kondisi

Cek:
```bash
pwd
git status
git remote -v
node --version
pnpm --version
```

Pastikan user berada di repo `lazisnu`.

### 2. Tools Minimum

Rekomendasi:
- Git
- Node.js 20 LTS recommended atau minimal sesuai root `package.json`
- PNPM 8+
- PostgreSQL 14+
- Redis 7+
- Android Studio untuk mobile Android

### 3. Install Dependency

```bash
pnpm install
pnpm build:shared
```

### 4. Environment Files

Baca `.agents/rules/09-environment-variables.md`.

Bantu user membuat file env lokal berdasarkan contoh, tapi jangan pernah mengisi secret asli ke chat publik atau commit.

### 5. Verifikasi Area

Backend:
```bash
pnpm dev:backend
```

Web:
```bash
pnpm dev:web
```

Mobile:
```bash
pnpm start:mobile
```

### 6. Summary

Laporkan tools yang sudah siap, yang belum siap, dan command berikutnya.

## Learning Checkpoint

Jelaskan perbedaan:
- repo remote vs local;
- dependency install vs build;
- `.env` lokal vs file yang boleh di-commit.
