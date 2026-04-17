---
description: 
---

# Workflow: /integrate-whatsapp
# Trigger: Ketik /integrate-whatsapp di chat Antigravity
# Tujuan: Integrasi WhatsApp Business API (FASE 7 — Sprint 3)
# Prasyarat: Template WA sudah disubmit dan disetujui Meta (proses 1-2 minggu!)

---

## Instruksi untuk Agent

Bantu user mengintegrasikan WhatsApp Business API ke project Lazisnu Infaq System.
Baca dulu `.agents/rules/04-business-rules.md` (BR-03) sebelum implementasi.

⚠️ PERHATIAN: Pastikan template WA sudah disetujui Meta sebelum menjalankan workflow ini.
Jika template masih dalam review, implementasi service-nya dulu tapi jangan test kirim WA nyata.

---

### LANGKAH 1 — Verifikasi Prasyarat

Tanya user:
1. Apakah template `lazisnu_infaq_notif` sudah disetujui Meta?
2. Apakah template `lazisnu_infaq_notif_revisi` sudah disetujui Meta?
3. Apakah `WA_PHONE_NUMBER_ID` dan `WA_ACCESS_TOKEN` sudah ada di `.env`?

Jika belum semua ada → implementasi service tapi gunakan mock/dry-run mode.

---

### LANGKAH 2 — Buat WhatsApp Service

Buat `src/services/wa.service.ts`:

```typescript
interface SendWaParams {
  to          : string   // nomor HP penerima (format: 628xxx)
  templateName: string   // nama template yang sudah disetujui Meta
  params      : string[] // variabel template: [nama_pemilik, nominal, tanggal]
}

async function sendWhatsApp(params: SendWaParams): Promise<void> {
  const response = await axios.post(
    `${process.env.WA_API_URL}/${process.env.WA_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to               : params.to,
      type             : 'template',
      template: {
        name    : params.templateName,
        language: { code: 'id' },
        components: [{
          type      : 'body',
          parameters: params.params.map(p => ({ type: 'text', text: p }))
        }]
      }
    },
    { headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` } }
  )

  // Simpan response ke wa_logs
  await waLogService.save({
    koleksiId  : params.koleksiId,
    nomorHp    : params.to,
    pesan      : JSON.stringify(params),
    status     : 'sent',
    responseApi: response.data,
    sentAt     : new Date(),
  })
}
```

### LANGKAH 3 — Buat BullMQ Worker

Buat `src/workers/wa-sender.ts`:

```typescript
// Queue: 'wa-notifications'
// Retry: 3x dengan exponential backoff (1 menit, 5 menit, 30 menit)

waWorker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= 3) {
    // Update wa_status = 'failed' di tabel koleksi
    // Catat di wa_logs dengan status failed
    // Admin bisa lihat di dashboard /wa-monitor
  }
})
```

### LANGKAH 4 — Integrasi ke Koleksi Service

Di `koleksiService.submit()` dan `koleksiService.resubmit()`, setelah INSERT berhasil:

```typescript
// Push job ke queue — JANGAN blocking response
const templateName = submitSequence === 1
  ? process.env.WA_TEMPLATE_SUBMIT!
  : process.env.WA_TEMPLATE_RESUBMIT!

await waQueue.add('send-wa', {
  koleksiId   : newRecord.id,
  to          : kaleng.nomor_hp_pemilik,
  templateName,
  params      : [
    kaleng.nama_pemilik,
    formatRupiah(nominal),
    formatTanggal(new Date())
  ]
})
// Langsung return response ke client — tidak menunggu WA terkirim
```

### LANGKAH 5 — Dashboard Monitor WA Gagal

Di halaman web `/wa-monitor`:
- Tabel: kaleng, petugas, nominal, nomor HP, waktu submit, jumlah retry, status
- Tombol "Retry Manual" → push job ulang ke queue
- Filter: status (failed/pending), periode, ranting

### LANGKAH 6 — Test End-to-End

```
Test 1 (Submit online):
  → Submit koleksi → cek wa_logs → verifikasi WA diterima di HP pemilik kaleng

Test 2 (Re-submit):
  → Laporkan koreksi → submit ulang → WA ke-2 diterima dengan kalimat tambahan
  → Pastikan template revisi berisi: "Pesan ini menggantikan pesan sebelumnya"

Test 3 (WA gagal):
  → Matikan WA_ACCESS_TOKEN sementara → submit koleksi
  → Verifikasi retry 3x terjadi (cek log BullMQ)
  → Verifikasi wa_status = 'failed' di DB
  → Verifikasi muncul di dashboard /wa-monitor

Test 4 (Batch sync offline):
  → Submit koleksi saat offline → sync → WA terkirim setelah sync berhasil
```

Update `.agents/rules/10-sprint-aktif.md` setelah semua test lulus.
