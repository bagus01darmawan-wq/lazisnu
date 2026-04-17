---
description: 
---

# Workflow: /build-qr-scanner
# Trigger: Ketik /build-qr-scanner di chat Antigravity
# Tujuan: Bangun alur inti scan QR → input nominal → submit (FASE 4 & 5)
# Prasyarat: Backend API kaleng + assignment sudah selesai, mobile foundation sudah ada

---

## Instruksi untuk Agent

Bantu user membangun fitur inti aplikasi Lazisnu: alur scan QR → input nominal → konfirmasi → submit.
Ini adalah fitur paling kritis. Baca dulu file berikut sebelum menulis kode:
- `.agents/rules/04-business-rules.md` ← WAJIB, terutama BR-01, BR-02, BR-03, BR-04
- `.agents/rules/06-pedoman-mobile.md`
- `.agents/rules/03-api-conventions.md`

---

### BAGIAN A — Backend: API Kaleng, Assignment & Koleksi

#### A1. Endpoint Kaleng
Buat semua endpoint kaleng sesuai `03-api-conventions.md`:
- `GET /kaleng` dengan filter dan pagination
- `POST /kaleng` (admin only)
- `GET /kaleng/:id`
- `PUT /kaleng/:id` (admin ranting+)
- `POST /kaleng/:id/generate-qr` → generate HMAC-SHA256 token
- `GET /kaleng/scan/:qr_token` → validasi scan (lihat urutan validasi di BR-02)

**Implementasi HMAC QR di `src/utils/hmac-qr.ts`:**
```typescript
import crypto from 'crypto'

export function generateQrToken(kalengId: string, kodeUnik: string): string {
  const timestamp = Date.now().toString()
  const payload   = `${kalengId}:${kodeUnik}:${timestamp}`
  const signature = crypto
    .createHmac('sha256', process.env.APP_SECRET!)
    .update(payload)
    .digest('hex')
  return `${signature}.${Buffer.from(payload).toString('base64url')}`
}

export function validateQrToken(token: string): { valid: boolean; kalengId?: string } {
  try {
    const [signature, encodedPayload] = token.split('.')
    const payload  = Buffer.from(encodedPayload, 'base64url').toString()
    const expected = crypto
      .createHmac('sha256', process.env.APP_SECRET!)
      .update(payload)
      .digest('hex')
    const valid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    )
    if (!valid) return { valid: false }
    const [kalengId] = payload.split(':')
    return { valid: true, kalengId }
  } catch {
    return { valid: false }
  }
}
```

#### A2. Endpoint Assignment & My Tasks
- `GET /assignments/my-tasks` → filter by petugas yang login, periode bulan ini
- `PUT /assignments/:id` → override dengan alasan wajib
- `POST /assignments/generate` → generate bulanan + setup node-cron scheduler

#### A3. Endpoint Koleksi (KRITIS — BACA BR-01 SEBELUM IMPLEMENT)
- `POST /koleksi` → validasi → INSERT (bukan UPDATE) → push WA job ke BullMQ
- `POST /koleksi/batch-sync` → sync offline records, idempotent berdasarkan tempId
- `POST /koleksi/:id/resubmit` → alasan wajib diisi → set is_latest=false pada record lama → INSERT baru

---

### BAGIAN B — Mobile: QR Scanner Screen

**`src/screens/scanner/QRScannerScreen.tsx`:**
- Kamera fullscreen dengan react-native-camera-kit
- Overlay kotak scan di tengah layar
- Setelah QR terbaca → SEGERA disable scanner (cegah double scan)
- Loading indicator saat call `GET /kaleng/scan/:token`
- Handle semua error dengan pesan Bahasa Indonesia:

```typescript
const QR_ERROR_MESSAGES: Record<string, string> = {
  QR_INVALID          : 'Kode QR tidak valid. Pastikan scan kaleng yang benar.',
  QR_ALREADY_SUBMITTED: 'Kaleng ini sudah diambil bulan ini.',
  QR_NOT_ASSIGNED     : 'Kaleng ini bukan tugas Anda bulan ini.',
  NETWORK_ERROR       : 'Tidak ada sinyal. Silakan coba lagi saat ada koneksi.',
}
```

---

### BAGIAN C — Mobile: Input Nominal Screen

**`src/screens/collection/InputNominalScreen.tsx`:**
- Keyboard angka (`keyboardType="number-pad"`)
- Format rupiah otomatis saat mengetik
- Simpan sebagai integer BIGINT (bukan float)
- Pilih metode: Cash atau Transfer
- Jika Transfer: tampilkan catatan "Bukti fisik ditunjukkan ke bendahara secara manual"
- Preview ringkasan sebelum konfirmasi

---

### BAGIAN D — Mobile: Konfirmasi & Submit

**`src/screens/collection/KonfirmasiScreen.tsx`:**
- Tampilkan ringkasan: nama pemilik, nominal, metode, alamat
- Tombol konfirmasi dengan warning: "Tidak bisa dibatalkan setelah dikonfirmasi"
- Logika submit berdasarkan status koneksi:

```typescript
async function handleSubmit(record: OfflineRecord) {
  const { isConnected } = await NetInfo.fetch()

  if (isConnected) {
    try {
      await koleksiService.submit(record)
      navigate('Sukses', { status: 'online' })
    } catch (err) {
      // Jika gagal saat online → masukkan ke offline queue
      offlineQueueStore.addToQueue(record)
      navigate('Sukses', { status: 'queued' })
    }
  } else {
    offlineQueueStore.addToQueue(record)
    navigate('Sukses', { status: 'queued' })
  }
}
```

---

### BAGIAN E — Mobile: Offline Queue & Auto Sync

**`src/store/offlineQueueStore.ts`:**
```typescript
interface OfflineRecord {
  tempId           : string   // UUID lokal
  kalengId         : string
  assignmentId     : string
  nominal          : number
  metodeBayar      : 'cash' | 'transfer'
  offlineCreatedAt : string
}

// Simpan ke MMKV key: 'offline_queue'
// Auto-sync saat koneksi kembali via NetInfo event listener
```

**`src/hooks/useOfflineSync.ts`:**
- Pasang NetInfo event listener
- Saat `isConnected === true` → call `koleksiService.batchSync(queue)`
- Hapus dari queue hanya record yang berhasil sync
- Tampilkan badge jumlah pending di header Dashboard

---

### BAGIAN F — Mobile: Layar Sukses & Re-Submit

**`src/screens/collection/SuksesScreen.tsx`:**
- Animasi centang (gunakan Animated API)
- Tampilkan: nama pemilik, nominal, metode
- Status WA: "Notifikasi terkirim" / "Menunggu sinkronisasi" / "Gagal terkirim"

**`src/screens/resubmit/ResubmitFormScreen.tsx`:**
- Input nominal baru (keyboard angka)
- Alasan koreksi: TextInput multiline, minimal 10 karakter, WAJIB diisi
- Preview: nominal lama vs baru, selisih
- Submit → call `POST /koleksi/:id/resubmit`

---

### BAGIAN G — Verifikasi End-to-End

Test skenario berikut dan laporkan hasilnya:

```
✅ Test 1 (Online): Login → Dashboard → Tap task → Scan QR valid → Input nominal → Konfirmasi → Submit → WA terkirim
✅ Test 2 (Offline): Airplane mode → Scan QR → Input → Submit → Masuk queue → Nyalakan internet → Auto sync → WA terkirim
✅ Test 3 (QR invalid): Scan QR palsu → Tampil error "Kode QR tidak valid"
✅ Test 4 (Sudah disubmit): Scan kaleng yang sudah diambil → Tampil error "Kaleng ini sudah diambil bulan ini"
✅ Test 5 (Re-submit): Submit pertama → Laporkan Koreksi → Input nominal baru + alasan → Submit ulang → WA ke-2 terkirim
```

Update `.agents/rules/10-sprint-aktif.md` setelah semua test lulus.
