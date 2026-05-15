---
trigger: manual
---

# Rule: Konvensi Kode
# Scope: Semua agent — berlaku di seluruh codebase

---

## Prinsip Utama

- Kode, database, API contract, dan TypeScript mengikuti nama aktual implementasi berbahasa Inggris.
- Label UI boleh memakai bahasa Indonesia agar sesuai pengguna lapangan/admin.
- Jangan membuat field, endpoint, atau type baru hanya karena beda istilah bahasa.
- Gunakan `packages/shared-types` untuk kontrak lintas backend, web, dan mobile.

---

## TypeScript — Aturan Umum

```typescript
// 1. STRICT MODE disarankan di semua tsconfig.json.
// Jika strict mode belum aktif, jangan mematikan safety yang sudah ada.
{
  "compilerOptions": {
    "strict": true
  }
}

// 2. NAMING CONVENTION
// Variables & functions  → camelCase
// Types & Interfaces     → PascalCase
// Constants              → UPPER_SNAKE_CASE
// File names             → kebab-case.ts atau sesuai konvensi framework yang sudah ada
// Database columns       → snake_case (Drizzle mapping)
// React components       → PascalCase.tsx

// 3. Definisikan return type untuk fungsi async penting/service/public API.
async function getCan(id: string): Promise<Can | null> { ... }
async function submitCollection(dto: SubmitCollectionDto, user: JwtPayload): Promise<Collection> { ... }

// 4. Gunakan Zod untuk validasi input di boundary API/form penting.
const submitCollectionSchema = z.object({
  canId        : z.string().uuid(),
  assignmentId : z.string().uuid(),
  nominal      : z.number().int().positive(),
  paymentMethod: z.enum(['CASH', 'TRANSFER']),
  collectedAt  : z.string().datetime().optional(),
})

// 5. Hindari any. Gunakan unknown + type guard jika perlu.
function process(data: unknown) {
  // validate before use
}

// 6. Gunakan type dari packages/shared-types jika tersedia.
import type { Collection, OfflineRecord } from '@lazisnu/shared-types'
```

---

## Backend Pattern — Fastify

### Handler: Tipis
```typescript
// Handler hanya bertugas:
// 1. Parse dan validasi input (via Zod atau validation boundary lain)
// 2. Call service
// 3. Return response sesuai API convention

export async function submitCollectionHandler(
  req: FastifyRequest<{ Body: SubmitCollectionDto }>,
  reply: FastifyReply
) {
  const body = submitCollectionSchema.parse(req.body)
  const result = await collectionService.submit(body, req.user)
  return reply.code(201).send({ success: true, data: result })
}
```

### Service: Berisi Business Logic
```typescript
// Service berisi aturan bisnis:
// - validasi assignment aktif;
// - cek duplikasi submit periode;
// - query database;
// - push job ke queue;
// - return domain object.

export async function submit(
  dto: SubmitCollectionDto,
  user: JwtPayload
): Promise<Collection> {
  const assignment = await validateAssignment(dto.assignmentId, user.id)
  await checkNotSubmittedThisPeriod(dto.canId, assignment)

  // INSERT collection baru. Jangan UPDATE nominal/paymentMethod record lama.
  const collection = await db.insert(collections).values({ ... }).returning()

  await whatsappQueue.add('send-whatsapp-notification', { collectionId: collection.id })

  return collection
}
```

### Error Handling
```typescript
throw new AppError('QR_ALREADY_SUBMITTED', 'Kaleng sudah disubmit periode ini', 400)
throw new AppError('FORBIDDEN', 'Akses ditolak', 403)
```

Error harus dikembalikan sesuai format standar API:

```typescript
{
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Pesan yang bisa dipahami manusia'
  }
}
```

---

## Mobile Pattern — React Native

### Layering yang Wajib Diikuti
```
Screen
  ↓ panggil hook
Custom Hook (useMyTasks, useSubmitCollection)
  ↓ panggil service
Service Layer (collectionService.ts)
  ↓ call API atau queue
Store Layer (offlineQueueStore.ts) / HTTP Client
```

```typescript
export default function DashboardScreen() {
  const { tasks, isLoading, error } = useMyTasks()
  if (isLoading) return <LoadingOverlay />
  return <TaskList tasks={tasks} />
}

export const taskService = {
  getMyTasks: () => apiClient.get<Task[]>('/v1/mobile/tasks'),
}
```

### Aturan MMKV
```
MMKV key sensitif harus konsisten dan tidak dipakai ulang untuk makna berbeda.
Contoh umum:
  auth token
  refresh token
  offline queue
  user profile
```

Jangan gunakan AsyncStorage untuk data sensitif jika MMKV encrypted sudah tersedia.

---

## Web Pattern — Next.js

Gunakan App Router modern sesuai versi aktual project.

```typescript
// Server Component: cocok untuk data display yang tidak perlu interaksi client.
async function ReportsPage() {
  const data = await getReportSummary()
  return <ReportsView data={data} />
}

// Client Component: cocok untuk form, modal, tombol, chart, state interaktif.
'use client'
export function CanFormModal({ onSubmit }: Props) {
  const form = useForm<CanFormDto>({ resolver: zodResolver(canSchema) })
  // ...
}
```

Data fetching client-side boleh memakai SWR jika memang perlu revalidation/interaksi.

---

## Penamaan yang Konsisten Lintas Platform

| Konsep | Database/API/Code | TypeScript | Tampilan UI |
|---|---|---|---|
| Kotak/kaleng infaq | `cans` | `can`, `canId` | “Kaleng” |
| Pengambilan uang | `collections` | `collection`, `collectionId` | “Koleksi” / “Pengambilan” |
| Penugasan | `assignments` | `assignment`, `assignmentId` | “Penugasan” |
| Petugas lapangan | `officers` / user role | `officer`, `officerId` | “Petugas” |
| Metode bayar | `payment_method` | `paymentMethod` | “Metode Bayar” |
| Re-submit/koreksi | `submit_sequence`, `is_latest`, `alasan_resubmit` | `submitSequence`, `isLatest`, `reason` | “Laporkan Koreksi” / “Revisi” |
| Periode | `period_month`, `period_year` atau schema aktual | `periodMonth`, `periodYear` | “Periode Bulan/Tahun” |

Jika schema aktual berbeda, ikuti implementasi aktual dan jangan melakukan rename besar tanpa migrasi yang jelas.

---

## Learning Requirement

Saat memberi kode, agent wajib menjelaskan:

- kenapa file tersebut yang diubah;
- konsep TypeScript/React/Fastify yang dipakai;
- risiko jika tipe/API contract tidak konsisten;
- cara build/lint/test yang relevan;
- satu latihan kecil agar user ikut memahami perubahan.

---

*Lazisnu Infaq Collection System — rules/05-konvensi-kode.md*
