# Ringkasan Project LAZISNU

## Gambaran Besar

Project `lazisnu` adalah monorepo pnpm yang sangat besar dan canggih dengan 3 aplikasi + 1 shared package:

| Area | Detail |
|------|--------|
| **Mobile** | React Native (Android-first, offline-first dengan MMKV) |
| **Backend** | Fastify + Drizzle ORM + PostgreSQL + Redis/BullMQ |
| **Web** | Next.js App Router + Tailwind CSS |
| **Shared Types** | Kontrak data TypeScript lintas semua app |

## Fitur Keren

| Fitur | Lokasi |
|-------|--------|
| **Scan QR Code** real-time + manual + dari gambar | `mobile/src/screens/ScanScreen.tsx` (590 baris!) |
| **Generate QR PDF** untuk stiker kaleng | `backend/src/services/qrPdfService.ts` |
| **Notifikasi WhatsApp** otomatis + antrean BullMQ | `backend/src/services/whatsapp.ts` (297 baris) |
| **Resubmit Collection** — data finansial IMMUTABLE | `backend/src/services/collectionSubmission.ts` |
| **Design System lengkap** palet "Earthy & Premium" | `mobile/src/theme/` (7 file) |
| **Cloudflare R2** penyimpanan file | `backend/src/services/r2.ts` |
| **Sentry + Firebase** monitoring | `backend/src/config/sentry.ts` |
| **Google Play Integrity** keamanan | tech stack |
| **15 rules AI** guidance development | `.agents/rules/` |

## Database

Geographic hierarchy: Kecamatan → Ranting → Kaleng
- Enum roles: ADMIN_KECAMATAN, ADMIN_RANTING, BENDAHARA, PETUGAS
- Payment methods: CASH, TRANSFER
- Collection status: PENDING, COMPLETED, FAILED, CANCELLED

## Arsitektur Backend

- Fastify + JWT auth + rate limiting + correlation ID
- BullMQ workers untuk WhatsApp async
- Pola route tipis, service gemuk
- Semua response API format `{ success, data?, error? }`

## Design System

Palet warna "Earthy & Premium":
- Deep Green `#2C473E`
- Warm Beige `#F4F1EA`
- Emerald `#1F8243`
- Muted Sand `#EAD19B`
