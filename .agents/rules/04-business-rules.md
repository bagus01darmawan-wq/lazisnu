---
trigger: model_decision
---

# Rule: Business Rules Kritis
# Scope: Semua agent — BACA INI sebelum menulis logika apapun yang menyentuh koleksi, QR, WA, atau role

---

## BR-01: Immutable Koleksi

```
DILARANG:
  DELETE FROM koleksi WHERE ...
  UPDATE koleksi SET nominal = ...
  UPDATE koleksi SET metode_bayar = ...
  UPDATE koleksi SET petugas_id = ...

DIIZINKAN (satu-satunya pengecualian):
  UPDATE koleksi SET is_latest = false ...
  (hanya untuk versioning flag saat re-submit)

ALASAN: Data koleksi adalah bukti keuangan yang harus dapat diaudit sepenuhnya.
```

### Alur Re-Submit yang Benar
```typescript
// LANGKAH 1: Temukan record is_latest saat ini
const current = await db.query.koleksi.findFirst({
  where: and(
    eq(koleksi.kalengId, kalengId),
    eq(koleksi.periodeBulan, bulan),
    eq(koleksi.periodeТahun, tahun),
    eq(koleksi.isLatest, true)
  )
})

// LANGKAH 2: Set is_latest = false pada record lama (DIIZINKAN)
await db.update(koleksi)
  .set({ isLatest: false })
  .where(eq(koleksi.id, current.id))

// LANGKAH 3: INSERT record baru
await db.insert(koleksi).values({
  kalengId,
  petugasId,
  assignmentId,
  periodeBulan  : bulan,
  periodeTahun  : tahun,
  nominal       : nominalBaru,
  metodeBayar,
  submitSequence: current.submitSequence + 1,
  isLatest      : true,
  alasanResubmit: alasan,   // WAJIB tidak boleh kosong
  offlineCreatedAt,
})
```

---

## BR-02: QR Token — HMAC-SHA256

```typescript
// GENERATE (hanya di backend, saat admin klik generate QR):
import crypto from 'crypto'

function generateQrToken(kalengId: string, kodeUnik: string): string {
  const timestamp = Date.now().toString()
  const payload   = `${kalengId}:${kodeUnik}:${timestamp}`
  const token     = crypto
    .createHmac('sha256', process.env.APP_SECRET!)
    .update(payload)
    .digest('hex')
  return `${token}.${Buffer.from(payload).toString('base64url')}`
}

// VALIDASI (saat petugas scan QR — endpoint GET /kaleng/scan/:qr_token):
function validateQrToken(token: string, secret: string): boolean {
  const [signature, encodedPayload] = token.split('.')
  const payload = Buffer.from(encodedPayload, 'base64url').toString()
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  )
}
```

### Urutan Validasi Saat Scan
```
1. Verifikasi HMAC signature token → jika gagal: QR_INVALID
2. Cek kaleng.is_active = true     → jika false: QR_INVALID
3. Cek assignment aktif untuk petugas ini periode ini → jika tidak ada: QR_NOT_ASSIGNED
4. Cek belum ada koleksi is_latest=true periode ini  → jika ada: QR_ALREADY_SUBMITTED
5. Semua lolos → return detail kaleng (nama_pemilik, alamat, ranting)
```

---

## BR-03: WhatsApp Notification — Wajib Setelah Submit

```
ATURAN: Setiap INSERT koleksi yang berhasil WAJIB memicu job WA ke BullMQ.
WA tidak boleh blocking — harus async via queue.

ALUR:
  POST /koleksi (atau batch-sync)
    → INSERT ke DB berhasil
    → push job { koleksiId } ke queue 'wa-notifications'
    → return 200 ke client (tidak menunggu WA terkirim)

  Worker wa-sender.ts:
    → ambil job dari queue
    → query detail koleksi + kaleng (nama_pemilik, nomor_hp_pemilik, nominal, tanggal)
    → kirim WA via Meta Graph API dengan template yang sesuai
    → simpan response ke wa_logs
    → update wa_status + wa_sent_at di koleksi
    → jika gagal: retry 3x (delay: 1 menit, 5 menit, 30 menit)
    → jika semua retry gagal: wa_status = 'failed', log ke wa_logs
```

### Template WA
```
Submit pertama (sequence = 1):
  Template: lazisnu_infaq_notif
  Variabel: {{nama_pemilik}}, {{nominal}}, {{tanggal}}

Re-submit (sequence > 1):
  Template: lazisnu_infaq_notif_revisi
  Variabel: {{nama_pemilik}}, {{nominal}}, {{tanggal}}
  (template ini berisi kalimat tambahan: "Pesan ini menggantikan pesan sebelumnya")
```

---

## BR-04: Offline Queue di Mobile

```typescript
// Struktur satu record dalam offline queue (simpan di MMKV):
interface OfflineRecord {
  tempId           : string   // UUID lokal — untuk tracking & dedup di server
  kalengId         : string
  assignmentId     : string
  nominal          : number
  metodeBayar      : 'cash' | 'transfer'
  offlineCreatedAt : string   // ISO 8601 timestamp saat dibuat di device
}

// MMKV key: 'offline_queue'
// Value: JSON.stringify(OfflineRecord[])

// Saat sync (POST /koleksi/batch-sync):
// Backend WAJIB skip/idempotent jika record dengan tempId yang sama sudah ada
// Jangan return error untuk duplikat — cukup skip dan laporkan di response
```

### Lifecycle Offline Queue
```
Petugas scan kaleng (offline)
  → OfflineRecord dibuat di MMKV, ditambahkan ke array queue
  → Tampilkan indikator "Menunggu Sinkronisasi" di task

Koneksi kembali (NetInfo event)
  → Ambil semua pending dari MMKV
  → POST /koleksi/batch-sync dengan array records
  → Jika server return sukses: hapus dari MMKV queue
  → Jika gagal: tetap di queue, coba lagi saat koneksi stabil

App di-restart saat ada queue:
  → Queue tetap ada di MMKV (persistent storage)
  → Sync dilanjutkan otomatis saat app dibuka dan ada koneksi
```

---

## BR-05: Role Filter — Wajib Diterapkan

```typescript
// Setiap query yang mengembalikan data kaleng, koleksi, atau users
// WAJIB difilter berdasarkan role user yang sedang login:

// Admin Ranting → filter by wilayah:
if (user.role === 'admin_ranting') {
  query = query.where(eq(table.wilayahId, user.wilayahId))
}

// Petugas → hanya data miliknya:
if (user.role === 'petugas') {
  query = query.where(eq(table.petugasId, user.id))
  // Untuk /koleksi: juga validasi assignment aktif
}

// Bendahara → hanya boleh GET, semua mutation return 403:
if (user.role === 'bendahara' && request.method !== 'GET') {
  throw new ForbiddenError('Bendahara hanya dapat melihat data')
}
```

---

## BR-06: Audit Trail — Otomatis via Middleware

```typescript
// File: src/middleware/audit-logger.ts
// Dipasang SETELAH semua handler berhasil (onResponse hook di Fastify)

// CATAT jika:
// - Method: POST atau PUT
// - Response: sukses (2xx)
// - User: sudah terautentikasi (ada di req.user)

// TIDAK CATAT:
// - GET request (tidak ada perubahan data)
// - Request yang gagal (4xx / 5xx)
// - Endpoint /auth/* (kecuali logout)

// Payload yang dicatat ke tabel audit_logs:
{
  user_id   : req.user.id,
  action    : `${method} ${routePath}`,   // contoh: "UPDATE /kaleng/:id"
  entity    : inferEntity(routePath),     // contoh: "kaleng"
  entity_id : req.params.id ?? null,
  old_value : req.context.oldValue ?? null,  // diset di service sebelum update
  new_value : req.context.newValue ?? null,  // diset di service setelah update
  ip_address: req.headers['x-forwarded-for'] ?? req.ip
}
```

---

## BR-07: Auto-Generate Assignment Tiap Tanggal 1

```typescript
// File: src/jobs/assignment-generator.ts
// Cron: '0 0 1 * *'  (tengah malam tanggal 1 setiap bulan)

// Logika:
// 1. Ambil semua assignment is_active=true dari bulan lalu
// 2. Duplikasi ke bulan baru dengan petugas yang sama
// 3. Set is_active=true pada semua record baru
// 4. Kirim FCM notification ke semua petugas: "Assignment bulan baru sudah tersedia"

// PENTING:
// Jika ada kaleng yang tidak punya assignment bulan lalu
// (kaleng baru ditambahkan setelah tanggal 1),
// admin ranting harus assign secara manual via dashboard.
```

---

*Lazisnu Infaq Collection System — rules/04-business-rules.md*
