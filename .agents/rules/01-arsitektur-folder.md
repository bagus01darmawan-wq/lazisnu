---
trigger: manual
---

# Rule: Project Folder Architecture
# Scope: All agents — reference when creating new files or navigating code

---

## Monorepo Structure

```
lazisnu-infaq-system/           ← root project
├── apps/
│   ├── mobile/                 ← React Native (Android)
│   ├── web/                    ← Next.js Web Dashboard
│   └── backend/                ← Fastify API Server
├── packages/
│   ├── shared-types/           ← Shared TypeScript types
│   └── shared-utils/           ← Shared utility functions
├── .agents/
│   └── rules/                  ← These rule files
├── docker-compose.yml          ← Local dev (PostgreSQL + Redis)
└── AGENTS.md                   ← Summary entry point for AI
```

---

## apps/mobile/ — React Native

```
apps/mobile/src/
├── screens/
│   ├── auth/           ← SplashScreen, LoginScreen
│   ├── dashboard/      ← DashboardScreen (task list + progress)
│   ├── scanner/        ← ScanScreen
│   ├── collection/     ← CollectionScreen (InputNominal, Confirmation)
├── navigation/         ← AuthStack, MainStack, RootNavigator
├── services/           ← API calls: authService, collectionService, tasksService
├── store/              ← Zustand stores & MMKV: authStore, syncStore
├── components/         ← Shared UI components
└── utils/              ← formatRupiah, dateHelpers
```

---

## apps/web/ — Next.js Dashboard

```
apps/web/src/app/
├── (auth)/
│   └── login/              ← Login page
├── dashboard/              ← Protected routes
│   ├── overview/           ← Main statistics
│   ├── cans/               ← Can management + QR generation
│   ├── users/              ← User management
│   ├── assignments/        ← Assignment management
│   ├── reports/            ← Financial reports + CSV export
│   ├── resubmit/           ← Re-submit tracker
│   └── audit-log/          ← Admin activity log
```

---

## apps/backend/ — Fastify API

```
apps/backend/src/
├── routes/             ← Endpoint definitions per domain
│   ├── auth.ts
│   ├── admin.ts        ← Cans, Users, Assignments management
│   ├── mobile.ts       ← Tasks, Collection submission
│   ├── bendahara.ts    ← Reports, Export
│   └── scheduler.ts    ← Internal/Cron tasks
├── database/
│   ├── schema.ts       ← Drizzle schema definitions
│   └── migrations/     ← SQL migration files
├── middleware/
│   ├── auth.ts         ← JWT validation & Role guard
│   └── audit-logger.ts ← Automatic audit log middleware
├── services/           ← Reusable logic (WhatsApp, Queues)
├── workers/
│   └── whatsapp.worker.ts ← BullMQ worker for WA sending
```

---

*Lazisnu Infaq Collection System — rules/01-arsitektur-folder.md*