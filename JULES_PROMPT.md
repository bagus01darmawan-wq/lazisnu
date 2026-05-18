<instruction>
You are an expert software engineer performing a deep code review on a WIP branch. Start by running `git status` and `git diff` to understand the current workspace state, then analyze the codebase and complete the review mission below. Do not guess. Read the actual code before concluding anything.
</instruction>

# Jules Code Review Mission — Lazisnu Infaq System

> **Catatan Waktu:** Review ini harus menyeluruh, sabar, dan berbasis bukti. Kualitas review lebih penting daripada kecepatan.

## Tujuan Review

Lakukan code review mendalam untuk monorepo ini dengan fokus utama pada:
- correctness
- security
- data integrity
- konsistensi kontrak backend → web → mobile
- offline-first reliability di Android
- maintainability untuk developer pemula

Jangan memberi pujian generik tanpa verifikasi. Jika ragu, tandai sebagai `perlu klarifikasi`, bukan mengarang.

## Konteks Proyek

Nama: Lazisnu Infaq System

Tipe: Monorepo PNPM dengan area utama:
- `apps/backend` — Hono/Fastify style backend TypeScript + Drizzle ORM + PostgreSQL + BullMQ/Redis + Zod
- `apps/web` — Next.js App Router + TypeScript + dashboard admin
- `apps/mobile` — React Native Android-first + MMKV + offline-first
- `packages/shared-types` — kontrak data TypeScript lintas app

### Struktur Direktori Penting

```text
/
├── apps/
│   ├── backend/
│   │   └── src/
│   │       ├── database/schema.ts
│   │       ├── routes/
│   │       │   ├── auth.ts
│   │       │   ├── bendahara.ts
│   │       │   ├── scheduler.ts
│   │       │   ├── admin/
│   │       │   └── mobile/
│   │       ├── services/
│   │       ├── middleware/
│   │       └── workers/scheduler.worker.ts
│   ├── web/
│   │   └── src/
│   │       ├── app/dashboard/
│   │       ├── components/
│   │       └── lib/
│   └── mobile/
│       └── src/
│           ├── screens/
│           ├── services/offline/
│           └── stores/
└── packages/
    ├── shared-types/
    └── shared-utils/
```

## Aturan Domain yang Wajib Dipatuhi

### 1. Immutability absolut untuk `collections`
- `collections` adalah append-only ledger.
- Tidak boleh ada `UPDATE` atau `DELETE` untuk mengubah data transaksi finansial.
- Koreksi hanya boleh lewat re-submit: `INSERT` record baru dengan `submit_sequence`/`submitSequence` bertambah.
- Penentuan data terbaru harus berbasis `MAX(submit_sequence)`, bukan flag seperti `is_latest`.
- Pelanggaran aturan ini adalah `CRITICAL`.

### 2. Offline-first mobile
- Data koleksi disimpan lokal dulu, lalu sync di background.
- Storage utama harus MMKV, bukan AsyncStorage untuk jalur utama.
- `offline_id`/`offlineId` adalah kunci deduplikasi dan idempotency.
- Sync harus tahan gangguan jaringan, idealnya dengan exponential backoff dan pembedaan error sementara vs permanen.

### 3. RBAC dan scope data
- `ADMIN_KECAMATAN`: hanya wilayah kecamatannya.
- `ADMIN_RANTING`: hanya rantingnya sendiri.
- `BENDAHARA`: laporan dan export sesuai scope.
- `PETUGAS`: hanya tugas dan data miliknya.
- Kebocoran scope data adalah `SECURITY CRITICAL`.

### 4. Arsitektur backend
- Route harus tipis, service harus menangani logika bisnis utama.
- Validasi input harus ketat, idealnya dengan Zod atau ekuivalen.

### 5. Integrasi WhatsApp
- Semua notifikasi donatur harus lewat BullMQ async queue.
- Direct synchronous send ke provider adalah desain yang harus dipertanyakan.

### 6. Konsistensi kontrak data
- Shared types harus sinkron dengan schema database, response API backend, konsumsi web, dan konsumsi mobile.
- Ketidaksesuaian field lintas layer adalah bug potensial walaupun belum crash.

## Protokol Kerja Review

1. Jalankan `git status` dan `git diff`.
2. Baca file konteks lebih dulu.
3. Baca file target per area sampai cukup untuk membuat kesimpulan berbasis bukti.
4. Verifikasi alur end-to-end untuk data penting, terutama collection flow.
5. Fokus pada 3-7 temuan terpenting agar hasil tetap tajam.
6. Sertakan file dan nomor baris spesifik untuk setiap temuan.
7. Jika suatu area aman setelah dibaca, tulis eksplisit: `Area ini terlihat aman.`

## Tahap 1: Baca Konteks Proyek

Baca file berikut sebelum audit detail:

```text
ARCHITECTURE.md
AGENTS.md
```

Jika ada artifact, implementation plan, atau brief WIP di workspace context, gunakan itu sebagai konteks tambahan, bukan sebagai pengganti pembacaan kode aktual.

## Tahap 2: Audit Backend

### 2A. Database Schema & Data Integrity

**File target:** `apps/backend/src/database/schema.ts`

Periksa:
- apakah `collections` masih memiliki `is_latest`/`isLatest`
- apakah `submit_sequence`/`submitSequence` ada dan tipenya benar
- apakah `offline_id` unik
- apakah foreign key pada `collections` aman dan tidak berbahaya untuk ledger
- apakah ada field redundan atau inkonsisten
- apakah tabel agregat seperti `collection_summaries` benar-benar dipakai dengan aman

Verdict yang dibutuhkan:
- apakah skema aman untuk data finansial
- apakah ada inkonsistensi yang bisa menyebabkan data ganda, salah baca versi, atau kehilangan histori

### 2B. Immutability & Submission Logic

**File target:**
- `apps/backend/src/services/collectionSubmission.ts`
- `apps/backend/src/routes/admin/collections.ts`

Periksa:
- apakah penentuan latest memakai `MAX(submit_sequence)`
- apakah resubmit melakukan `INSERT` baru, bukan `UPDATE`
- apakah validasi mencegah resubmit record lama
- apakah ada audit log
- apakah ada race condition saat submit paralel pada can yang sama

### 2C. Auth & Authorization

**File target:**
- `apps/backend/src/routes/auth.ts`
- `apps/backend/src/middleware/`

Periksa:
- hashing password aman atau tidak
- JWT secret dari env atau hardcoded
- rate limiting login/OTP
- expiry OTP masuk akal
- refresh token ada atau tidak
- middleware role dan scope filtering benar atau tidak

Hardcoded secret/credential harus ditandai `SECURITY CRITICAL`.

### 2D. Route Correctness & Scope Isolation

**File target:**
- `apps/backend/src/routes/admin/cans.ts`
- `apps/backend/src/routes/admin/assignments.ts`
- `apps/backend/src/routes/admin/officers.ts`
- `apps/backend/src/routes/admin/district.ts`
- route lain yang relevan jika ditemukan ketergantungan penting

Periksa:
- validasi scope branch/district
- potensi data leak lintas ranting/kecamatan
- validasi input
- operasi destruktif yang tidak semestinya

### 2E. Performance & Query Safety

**File target:**
- `apps/backend/src/services/reportService.ts`
- `apps/backend/src/services/assignmentGenerator.ts`

Periksa:
- agregasi besar dilakukan di SQL atau di memori JavaScript
- potensi `inArray(canIds)` berukuran sangat besar
- query N+1
- kompleksitas algoritma round-robin
- penggunaan `any`

### 2F. WhatsApp & Queue Integration

**File target:**
- `apps/backend/src/services/whatsapp.ts`
- `apps/backend/src/services/queues.ts`
- `apps/backend/src/workers/scheduler.worker.ts`

Periksa:
- semua kirim WA lewat queue
- retry timeout/provider failure
- validasi nomor tujuan
- unhandled promise rejection
- potensi notifikasi duplikat jika multi-instance

## Tahap 3: Audit Mobile

### 3A. Offline Queue

**File target:** `apps/mobile/src/services/offline/queue.ts`

Periksa:
- MMKV benar-benar dipakai
- `getQueueCount()` dan `getFailedPermanentCount()` ada dan benar
- format data queue stabil

### 3B. Sync Reliability

**File target:** `apps/mobile/src/services/offline/sync.ts`

Periksa:
- exponential backoff
- `offline_id`/`offlineId` ikut terkirim
- deduplication
- pembeda permanent vs transient error

### 3C. Sync State & UX

**File target:** `apps/mobile/src/stores/useSyncStore.ts`

Periksa:
- state untuk permanent failure
- feedback visual status sync

### 3D. Input Collection Flow

**File target:**
- `apps/mobile/src/screens/CollectionScreen.tsx`
- `apps/mobile/src/screens/ScanScreen.tsx`

Periksa:
- validasi format QR
- validasi nominal > 0
- pencegahan double submit
- kejelasan feedback tersimpan offline vs sukses sync server

## Tahap 4: Audit Web Dashboard

### 4A. Resubmit Flow

**File target:** semua file relevan di `apps/web/src/app/dashboard/resubmit/`

Periksa:
- `alasanResubmit` wajib
- preview before/after jika ada
- response sukses menunjukkan sequence terbaru jika relevan

### 4B. Reporting & Export

**File target:** semua file relevan di `apps/web/src/app/dashboard/reports/`

Periksa:
- validasi `start_date <= end_date`
- penggunaan komponen tanggal yang konsisten
- laporan hanya membaca versi latest

## Tahap 5: Audit Shared Types & API Contract

**Direktori target:** `packages/shared-types/`

Periksa:
- tipe `Collection`, `Assignment`, `Can`, `Officer` dan tipe inti lain
- konsistensi tipe dengan backend, web, dan mobile
- mismatch field response API
- konsistensi bentuk response, misalnya `{ success, data?, error? }`

## Prioritas Penilaian

Urutan prioritas saat menilai temuan:
1. Correctness
2. Security
3. Financial data integrity
4. Scope isolation / RBAC
5. Offline-first reliability
6. API contract consistency
7. Performance
8. Maintainability

## Aturan Penulisan Temuan

- Fokus pada 3-7 masalah paling penting.
- Jangan tulis masalah spekulatif tanpa bukti kode.
- Setiap temuan harus menjelaskan kenapa berbahaya.
- Gunakan bahasa yang bisa dipahami developer pemula.
- Jika sebuah masalah hanya dugaan karena konteks belum cukup, beri label `perlu klarifikasi`.

Gunakan severity berikut:
- `CRITICAL`
- `HIGH`
- `MEDIUM`
- `LOW`

Gunakan label khusus bila relevan:
- `SECURITY CRITICAL`
- `DATA INTEGRITY`
- `OFFLINE-FIRST`
- `API CONTRACT`

## Format Output Wajib

Tulis hasil review dengan struktur ini:

```markdown
# Laporan Code Review — Lazisnu Infaq System

## 1. Ringkasan Keseluruhan
- Ringkasan 1-2 paragraf tentang kondisi umum project
- Skor kasar per area: Backend, Web, Mobile, Shared Types, Database
- Jawaban singkat: apakah cukup aman untuk production saat ini?

## 2. Must Fix
| Severity | Area | File:Line | Masalah | Kenapa Berbahaya | Saran Perbaikan |
|---|---|---|---|---|---|

Aturan:
- Minimal 3 issue jika memang ada.
- Maksimal 7 issue agar tetap fokus.
- Urutkan dari paling berbahaya.

## 3. Should Improve
| Area | File:Line | Saran | Manfaat |
|---|---|---|---|

## 4. What Looks Good
- Sebutkan minimal 5 hal yang memang sudah diverifikasi benar.
- Jangan isi dengan pujian generik.

## 5. Analisis Per File Penting

Pilih 3-5 file paling kritis. Untuk setiap file jelaskan:
- fungsi file
- alur data utama
- dependency penting
- edge case / potensi bug
- saran konkret

## 6. Konsistensi Kontrak Data
- Bandingkan schema / service / response API / shared types / konsumsi frontend
- Jelaskan field yang hilang, berlebih, atau beda nama jika ada
- Jelaskan apakah format response API konsisten

## 7. Security Checklist
- auth protection
- role-based scope filtering
- input validation
- hardcoded secret / credential

## 8. Arsitektur & Tech Debt
- duplikasi logika
- file terlalu besar
- dependency tidak terpakai bila terlihat jelas
- penggunaan `any`

## 9. Mobile Offline-first Assessment
- robustness sync
- deduplikasi
- retry/backoff
- transient vs permanent error

## 10. Rekomendasi Prioritas

Urutkan 5 hal yang paling penting dikerjakan dulu. Untuk setiap item sebutkan:
- effort: kecil / sedang / besar
- risiko jika ditunda
- file yang terdampak

## 11. Learning Checkpoint
- 3 konsep engineering yang bisa dipelajari developer pemula
- 2 file yang paling penting untuk dipahami
- 1 latihan kecil lanjutan
```

## Guardrails Tambahan

- Jangan berhenti di backend saja; cek konsistensi ke web dan mobile.
- Jangan menyimpulkan area aman bila belum membaca file kuncinya.
- Jika menemukan potensi pelanggaran immutability, tandai eksplisit sebagai `CRITICAL`.
- Jika menemukan scope leak lintas role/wilayah, tandai eksplisit sebagai `SECURITY CRITICAL`.
- Jika tidak ada masalah di suatu area setelah verifikasi, tulis `Area ini terlihat aman.`

## Mission Brief

Gunakan brief kerja aktif yang ada di workspace sebagai konteks tambahan bila tersedia, tetapi tetap prioritaskan kode aktual sebagai sumber kebenaran utama.
