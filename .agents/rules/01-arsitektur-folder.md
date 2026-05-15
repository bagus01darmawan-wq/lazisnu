---
trigger: manual
---

# Rule: Project Folder Architecture
# Scope: All agents — reference when creating new files or navigating code

---

## Monorepo Structure

Project ini adalah monorepo PNPM. Gunakan struktur aktual berikut sebagai acuan utama saat membuat file baru atau memindahkan kode.

```
lazisnu/                       ← root project
├── apps/
│   ├── mobile/                ← React Native Android-first collector app
│   ├── web/                   ← Next.js Web Dashboard
│   └── backend/               ← Fastify API Server
├── packages/
│   └── shared-types/          ← Shared TypeScript types/API contracts
├── .agents/
│   ├── rules/                 ← Project rules
│   ├── skills/                ← Triggered agent skills
│   └── workflows/             ← Workflow/sprint guidance, jika tersedia
├── pnpm-workspace.yaml        ← Workspace: apps/* dan packages/*
├── package.json               ← Root scripts untuk dev/build
└── AGENTS.md                  ← Summary entry point untuk AI
```

Catatan:
- `packages/shared-utils/` belum dianggap package aktif. Buat hanya jika benar-benar ada util lintas app yang dipakai oleh minimal dua app.
- Jangan membuat package baru hanya untuk satu fungsi kecil. Mulai dari lokasi app terkait, lalu ekstrak ke package bersama jika sudah ada kebutuhan nyata.

---

## apps/mobile/ — React Native Android-first

```
apps/mobile/src/
├── screens/             ← layar aplikasi petugas
├── navigation/          ← navigator dan route typing
├── services/            ← API calls: auth, collections, tasks, sync
├── store/               ← Zustand stores dan MMKV-backed state
├── components/          ← shared UI components mobile
├── hooks/               ← reusable state/data hooks
└── utils/               ← formatRupiah, date helpers, parser, offline helpers
```

Prioritas mobile:
- Android first.
- Offline-first.
- MMKV untuk storage utama.
- Jangan menambahkan iOS-specific code kecuali diminta eksplisit.

---

## apps/web/ — Next.js Dashboard

```
apps/web/src/
├── app/                 ← App Router pages/layouts
├── components/          ← UI dan komponen domain dashboard
├── lib/                 ← API client, auth helpers, utils web
├── hooks/               ← SWR/client-side hooks jika diperlukan
└── types/               ← tipe lokal web jika tidak layak masuk shared-types
```

Gunakan `packages/shared-types` untuk kontrak data yang dipakai lintas backend, web, dan mobile. Jangan menduplikasi tipe lintas app di `apps/web`.

---

## apps/backend/ — Fastify API

```
apps/backend/src/
├── routes/              ← endpoint definitions per domain/module
├── services/            ← business logic
├── database/            ← Drizzle schema, db client, seed/migration utilities
├── middleware/          ← auth, role guard, audit, validation boundary
├── workers/             ← BullMQ workers, terutama WhatsApp
├── queues/              ← queue definitions jika dipisah dari workers
├── utils/               ← helper backend umum
└── config/              ← environment/config loading
```

Backend pattern:
- Route handler tipis.
- Business logic di service.
- Validasi input di boundary API.
- Queue/worker untuk pekerjaan async seperti WhatsApp.

---

## packages/shared-types

Gunakan untuk:
- API request/response yang dipakai lebih dari satu app.
- enum/domain type lintas app.
- kontrak data yang harus konsisten antara backend, web, dan mobile.

Jangan gunakan untuk:
- state UI lokal;
- tipe form yang hanya ada di satu halaman;
- tipe internal database yang tidak keluar dari backend.

---

## Rule Penamaan File Baru

Sebelum membuat file baru, agent harus menjawab:

1. File ini milik app mana?
2. Apakah dipakai lintas app?
3. Apakah ini UI, service, route, hook, type, atau utility?
4. Apakah sudah ada folder sejenis?
5. Apakah perubahan ini perlu update shared types atau dokumentasi?

---

*Lazisnu Infaq Collection System — rules/01-arsitektur-folder.md*
