---
trigger: manual
---

# Rule: Konvensi Kode
# Scope: Semua agent — berlaku di seluruh codebase

---

## TypeScript — Aturan Umum

```typescript
// 1. STRICT MODE wajib di semua tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}

// 2. NAMING CONVENTION
// Variables & functions  → camelCase
// Types & Interfaces     → PascalCase
// Constants              → UPPER_SNAKE_CASE
// File names             → kebab-case.ts
// Database columns       → snake_case (Drizzle mapping)
// React components       → PascalCase.tsx

// 3. SELALU definisikan return type untuk fungsi async
async function getKaleng(id: string): Promise<Kaleng | null> { ... }
async function submitKoleksi(dto: SubmitDto, user: JwtPayload): Promise<Koleksi> { ... }

// 4. GUNAKAN Zod untuk semua validasi input
const submitKoleksiSchema = z.object({
  kalengId     : z.string().uuid(),
  assignmentId : z.string().uuid(),
  nominal      : z.number().int().positive(),
  metodeBayar  : z.enum(['cash', 'transfer']),
  offlineCreatedAt: z.string().datetime().optional(),
})

// 5. HINDARI any — gunakan unknown dan type guard jika perlu
// ❌ function process(data: any) {}
// ✅ function process(data: unknown) { if (isKoleksi(data)) { ... } }

// 6. Gunakan type dari packages/shared-types/ jika tersedia
import type { Koleksi, OfflineRecord } from '@lazisnu/shared-types'
```

---

## Backend Pattern — Fastify

### Handler: Tipis
```typescript
// Handler HANYA bertugas:
// 1. Parse dan validasi input (via Zod)
// 2. Call service
// 3. Return response

// ✅ BENAR:
export async function submitKoleksiHandler(
  req: FastifyRequest<{ Body: SubmitKoleksiDto }>,
  reply: FastifyReply
) {
  const body   = submitKoleksiSchema.parse(req.body)
  const result = await koleksiService.submit(body, req.user)
  return reply.code(201).send({ success: true, data: result })
}

// ❌ SALAH — jangan taruh business logic di handler:
export async function submitKoleksiHandler(req, reply) {
  const existing = await db.query.koleksi.findFirst(...)   // ← ini harusnya di service
  if (existing) throw new Error('...')                      // ← ini harusnya di service
  ...
}
```

### Service: Tebal
```typescript
// Service berisi SEMUA business logic:
// - Validasi aturan bisnis (cek assignment, cek duplikat, dll)
// - Query database
// - Push job ke queue
// - Return domain object

export async function submit(
  dto: SubmitKoleksiDto,
  user: JwtPayload
): Promise<Koleksi> {
  // 1. Validasi assignment aktif
  const assignment = await validateAssignment(dto.assignmentId, user.id)

  // 2. Cek belum disubmit periode ini
  await checkNotSubmittedThisPeriod(dto.kalengId, assignment)

  // 3. INSERT koleksi (bukan UPDATE)
  const koleksi = await db.insert(koleksiTable).values({ ... }).returning()

  // 4. Push WA job ke queue (async, tidak blocking)
  await waQueue.add('send-wa', { koleksiId: koleksi.id })

  return koleksi
}
```

### Error Handling
```typescript
// Gunakan custom error class — jangan throw Error biasa:
throw new AppError('QR_ALREADY_SUBMITTED', 'Kaleng sudah disubmit periode ini', 400)
throw new AppError('FORBIDDEN', 'Akses ditolak', 403)

// Global error handler di Fastify akan menangkap dan format sesuai response standard
```

### Response Helper
```typescript
// Selalu gunakan helper — jangan return raw object:
return reply.send(success(data))
return reply.code(201).send(success(data))
return reply.code(200).send(successList(items, { page, limit, total }))
```

---

## Mobile Pattern — React Native

### Layering yang Wajib Diikuti
```
Screen
  ↓ panggil hook
Custom Hook (useMyTasks, useSubmitKoleksi)
  ↓ panggil service
Service Layer (koleksiService.ts)
  ↓ call API atau queue
Store Layer (offlineQueueStore.ts) / HTTP Client (axios instance)
```

```typescript
// ✅ Screen hanya render UI + call hook:
export default function DashboardScreen() {
  const { tasks, isLoading, error } = useMyTasks()
  if (isLoading) return <LoadingOverlay />
  return <TaskList tasks={tasks} />
}

// ✅ Hook berisi state management:
export function useMyTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [isLoading, setLoading] = useState(true)
  useEffect(() => {
    taskService.getMyTasks().then(setTasks).finally(() => setLoading(false))
  }, [])
  return { tasks, isLoading }
}

// ✅ Service berisi API call:
export const taskService = {
  getMyTasks: () => apiClient.get<Task[]>('/assignments/my-tasks'),
}

// ✅ Store berisi akses MMKV:
export const offlineQueueStore = {
  getQueue : (): OfflineRecord[] => JSON.parse(mmkv.getString('offline_queue') ?? '[]'),
  addToQueue: (record: OfflineRecord) => { ... },
  clearQueue: () => mmkv.delete('offline_queue'),
}
```

### Aturan MMKV
```
MMKV Key yang sudah digunakan — jangan pakai key yang sama untuk hal lain:
  'auth_token_access'    → JWT access token
  'auth_token_refresh'   → JWT refresh token
  'offline_queue'        → JSON array OfflineRecord[]
  'user_profile'         → JSON profil user yang sedang login
```

---

## Web Pattern — Next.js

### Server vs Client Component
```typescript
// Server Component (default) — untuk data display:
// ✅ Gunakan untuk: halaman laporan, list kaleng, tabel koleksi
async function LaporanPage() {
  const data = await getLaporanSummary()  // fetch langsung di server
  return <LaporanView data={data} />
}

// Client Component — hanya untuk interaksi:
// ✅ Gunakan untuk: form, tombol konfirmasi, modal, chart interaktif
'use client'
export function KalengFormModal({ onSubmit }: Props) {
  const form = useForm<KalengDto>({ resolver: zodResolver(kalengSchema) })
  ...
}

// Data fetching di Client Component pakai SWR:
const { data, error, isLoading, mutate } = useSWR(
  '/kaleng',
  (url) => apiClient.get(url)
)
```

### Sidebar Role-Based
```typescript
// Jangan hardcode menu — generate dari konfigurasi:
const MENU_CONFIG: Record<UserRole, MenuItem[]> = {
  admin_kecamatan : [overview, kaleng, users, assignments, laporan, resubmit, auditLog, waMonitor],
  admin_ranting   : [overview, kaleng, assignments, laporan],
  petugas         : [],            // tidak ada akses web
  bendahara       : [laporan, resubmit, dataOperasional],
}
```

---

## Penamaan yang Konsisten Lintas Platform

| Konsep | Database | TypeScript (camelCase) | Tampilan UI |
|---|---|---|---|
| Kotak/kaleng infaq | `kaleng` | `kaleng` | "Kaleng" |
| Pengambilan uang | `koleksi` | `koleksi` | "Koleksi" / "Pengambilan" |
| Penugasan | `assignments` | `assignment` | "Penugasan" |
| Petugas lapangan | `users` (role=petugas) | `petugas` | "Petugas" |
| Kirim ulang | - | `resubmit` | "Laporkan Koreksi" |
| Periode | `periode_bulan`+`periode_tahun` | `periode` | "Periode Bulan/Tahun" |

---

*Lazisnu Infaq Collection System — rules/05-konvensi-kode.md*