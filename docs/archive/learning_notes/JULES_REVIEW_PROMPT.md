# Jules Code Review Mission — Lazisnu Infaq System

> **Catatan Waktu:** Review ini bersifat mendalam dan menyeluruh. Ambil waktu sebanyak yang diperlukan. Kualitas review lebih penting dari kecepatan. Baca setiap file yang relevan sebelum memberikan kesimpulan.

---

## Konteks Proyek

Kamu sedang me-review **Lazisnu Infaq System**, sebuah sistem manajemen pengumpulan infaq berbasis monorepo PNPM. Sistem ini digunakan oleh petugas lapangan (Android), admin ranting/kecamatan (Web Dashboard), dan bendahara untuk mengelola dana infaq umat yang bersifat sensitif secara keuangan dan hukum.

### Struktur Direktori Penting

```
/
├── apps/
│   ├── backend/          # Hono.js + Drizzle ORM + PostgreSQL
│   │   └── src/
│   │       ├── database/schema.ts      # Sumber kebenaran skema DB
│   │       ├── routes/
│   │       │   ├── auth.ts
│   │       │   ├── bendahara.ts
│   │       │   ├── scheduler.ts
│   │       │   ├── admin/              # assignments, cans, collections, dashboard, district, officers, wa
│   │       │   └── mobile/             # sync, tasks
│   │       ├── services/               # assignmentGenerator, collectionSubmission, fcm, otp, queues, r2, reportService, whatsapp
│   │       ├── middleware/
│   │       └── workers/scheduler.worker.ts
│   │
│   ├── web/              # Next.js 15 (App Router) + Zustand + React Query
│   │   └── src/
│   │       ├── app/dashboard/          # assignments, audit-log, cans, master, overview, reports, resubmit, users, wa-monitor
│   │       ├── components/             # Shared UI components
│   │       └── lib/
│   │
│   └── mobile/           # React Native (Expo) + MMKV + Offline-First
│       └── src/
│           ├── screens/                # Login, OTP, Dashboard, Scan, Collection, History, Tasks, Profile
│           ├── services/offline/       # queue.ts, sync.ts
│           └── stores/                 # useSyncStore, useCollectionStore, dll
│
└── packages/
    ├── shared-types/     # Kontrak tipe TypeScript antar app
    └── shared-utils/
```

---

## Prinsip Bisnis Kritis yang WAJIB Kamu Pahami Sebelum Review

### 1. IMMUTABILITY ABSOLUT pada tabel `collections`
- Tabel `collections` adalah **append-only ledger** — tidak boleh ada `UPDATE` atau `DELETE` apapun.
- Koreksi data hanya dilakukan via **re-submit**: `INSERT` baris baru dengan `submit_sequence` yang bertambah (+1) dan kolom `alasanResubmit` yang terisi.
- Penentuan data "terbaru" dilakukan secara dinamis via `MAX(submit_sequence)` per `can_id`, BUKAN via flag status seperti `is_latest`.
- **Pelanggaran terhadap aturan ini adalah bug kritis.**

### 2. Offline-First di Mobile
- Data koleksi di-simpan dulu ke MMKV Queue lokal, kemudian di-sync ke server di background.
- Field `offline_id` (UUID) adalah kunci deduplication — server WAJIB menolak `offline_id` yang sudah pernah diterima (idempotency).
- Sync harus menggunakan Exponential Backoff dengan maksimal 3 kali retry.

### 3. RBAC (Role-Based Access Control)
- `ADMIN_KECAMATAN`: Akses data seluruh ranting dalam kecamatannya.
- `ADMIN_RANTING`: Akses data ranting sendiri saja.
- `BENDAHARA`: Akses laporan dan export saja.
- `PETUGAS`: Hanya boleh akses tugas yang di-assign kepadanya sendiri.
- **Setiap endpoint harus divalidasi apakah scope datanya sudah benar sesuai peran.**

---

## Misi Review

Lakukan review menyeluruh pada codebase ini. Bacalah **semua file** yang disebutkan di bawah ini secara berurutan sebelum membuat kesimpulan. Jangan loncat ke kesimpulan sebelum membaca semua file target.

---

## Tahap 1: Baca Konteks Proyek

Sebelum membaca kode apapun, baca file-file ini untuk memahami konteks penuh:

```
ARCHITECTURE.md
AGENTS.md
```

---

## Tahap 2: Audit Backend (Prioritas Tertinggi)

### 2A. Database Schema & Data Integrity

**File:** `apps/backend/src/database/schema.ts`

**Yang harus dicari:**
- Apakah ada kolom `is_latest` yang masih ada di tabel `collections`? (Harus sudah dihapus, diganti logika `MAX(submit_sequence)`)
- Apakah `submit_sequence` sudah ada dan bertipe `integer`?
- Apakah `offline_id` memiliki constraint `UNIQUE`?
- Apakah foreign key `assignment_id` di `collections` memiliki cascade yang sesuai atau justru berbahaya?
- Apakah ada field duplikat yang tidak konsisten (misalnya kolom `dukuh varchar` dan `dukuhId uuid` di tabel `cans` — ini terlihat redundan)?
- Apakah tabel `collection_summaries` ini benar-benar digunakan, atau data agregat dihitung ulang setiap kali query (bisa menjadi sumber inkonsistensi jika tidak di-update)?

**Verdict yang dibutuhkan:** Apakah skema sudah konsisten dan aman untuk data keuangan?

---

### 2B. Immutability & Collection Submission Logic

**File:** `apps/backend/src/services/collectionSubmission.ts`

**Yang harus dicari:**
- Apakah fungsi `getLatestCollectionCondition()` sudah menggunakan subquery `MAX(submit_sequence)` secara benar dan tidak bergantung pada flag `is_latest`?
- Apakah ada potensi race condition jika dua petugas submit koleksi pada kaleng yang sama secara bersamaan?

**File:** `apps/backend/src/routes/admin/collections.ts`

**Yang harus dicari:**
- Apakah endpoint resubmit benar-benar melakukan `INSERT` baru, bukan `UPDATE`?
- Apakah validasi `submit_sequence` sudah mencegah resubmit data yang bukan paling terbaru?
- Apakah ada audit log yang dicatat setiap kali resubmit dilakukan?

---

### 2C. Autentikasi & Otorisasi

**File:** `apps/backend/src/routes/auth.ts`

**Yang harus dicari:**
- Apakah password di-hash dengan bcrypt atau argon2 (bukan MD5/SHA)?
- Apakah JWT secret di-load dari environment variable, bukan hardcoded?
- Apakah ada rate limiting pada endpoint `/login` dan `/otp`?
- Apakah refresh token diimplementasikan atau hanya access token?
- Apakah OTP memiliki expiry time yang tepat (biasanya 5 menit)?

**File:** `apps/backend/src/middleware/`

**Yang harus dicari:**
- Apakah middleware auth mem-validasi role dengan benar sebelum operasi?
- Apakah ada middleware yang mem-verifikasi bahwa `ADMIN_RANTING` tidak bisa mengakses data ranting lain?

---

### 2D. API Route Correctness & Scope Isolation

**File:** `apps/backend/src/routes/admin/cans.ts`  
**File:** `apps/backend/src/routes/admin/assignments.ts`  
**File:** `apps/backend/src/routes/admin/officers.ts`  
**File:** `apps/backend/src/routes/admin/district.ts`

**Yang harus dicari di setiap file:**
- Apakah setiap endpoint memvalidasi bahwa data yang di-request sesuai dengan scope role pengguna (branchId/districtId)?
- Apakah ada endpoint yang mengembalikan data dari ranting/kecamatan lain secara tidak sengaja?
- Apakah input validation menggunakan Zod atau setara, dengan validasi tipe yang ketat?
- Apakah ada endpoint yang melakukan operasi destruktif (`DELETE`) pada tabel yang tidak boleh dihapus?

---

### 2E. Performance & Query Safety

**File:** `apps/backend/src/services/reportService.ts`

**Yang harus dicari (ini adalah area risiko tinggi):**
- Apakah fungsi `getDashboardData()` menarik seluruh baris koleksi ke memori JavaScript terlebih dahulu untuk dihitung? (Anti-pattern — harus menggunakan SQL `SUM/GROUP BY` langsung)
- Apakah fungsi `buildCollectionsQuery()` menggunakan `inArray(canIds)` untuk filter berdasarkan distrik/ranting? PostgreSQL memiliki batas sekitar 65.535 parameter, ini bisa crash jika data sangat banyak.
- Apakah ada query N+1 yang tidak perlu (loop query di dalam loop data)?

**File:** `apps/backend/src/services/assignmentGenerator.ts`

**Yang harus dicari:**
- Apakah algoritma round-robin menggunakan `.filter()` dalam loop `for` utama? (Kompleksitas O(N²) — sangat lambat untuk ribuan kaleng)
- Apakah parameter fungsi masih menggunakan tipe `any[]`?

---

### 2F. WhatsApp & Queue Integration

**File:** `apps/backend/src/services/whatsapp.ts`  
**File:** `apps/backend/src/services/queues.ts`

**Yang harus dicari:**
- Apakah pengiriman pesan WhatsApp selalu melalui BullMQ queue, bukan synchronous direct call?
- Apakah ada mekanisme retry jika WhatsApp API timeout?
- Apakah nomor WhatsApp penerima divalidasi formatnya sebelum dikirim?

**File:** `apps/backend/src/workers/scheduler.worker.ts`

**Yang harus dicari:**
- Apakah scheduler worker menangani unhandled promise rejection dengan benar?
- Apakah ada potensi pengiriman notifikasi duplikat jika scheduler berjalan lebih dari satu instance?

---

## Tahap 3: Audit Mobile (Android Offline-First)

**File:** `apps/mobile/src/services/offline/queue.ts`

**Yang harus dicari:**
- Apakah MMKV digunakan sebagai storage engine (bukan AsyncStorage)?
- Apakah `getQueueCount()` dan `getFailedPermanentCount()` sudah diimplementasikan?
- Apakah queue menyimpan data dengan format yang konsisten dan stabilitasnya terjaga saat upgrade app?

**File:** `apps/mobile/src/services/offline/sync.ts`

**Yang harus dicari:**
- Apakah ada implementasi Exponential Backoff?
- Apakah `offline_id` dikirim bersama payload ke server?
- Apakah ada pengecekan deduplication sebelum batch submit?
- Apakah error handling sudah membedakan error "permanent" (data invalid) vs "transient" (network timeout)?

**File:** `apps/mobile/src/stores/useSyncStore.ts`

**Yang harus dicari:**
- Apakah `permanentFailedCount` sudah ada di state?
- Apakah ada feedback visual yang membedakan antara "sync sedang berjalan", "sync berhasil", "ada yang gagal sementara", dan "ada yang gagal permanen"?

**File:** `apps/mobile/src/screens/CollectionScreen.tsx`  
**File:** `apps/mobile/src/screens/ScanScreen.tsx`

**Yang harus dicari:**
- Apakah QR scanner memvalidasi format QR code sebelum melanjutkan ke CollectionScreen?
- Apakah form koleksi memvalidasi nominal (harus positif, tidak boleh 0 atau negatif)?
- Apakah ada konfirmasi sebelum submit untuk mencegah accidental double-submit?
- Apakah ada feedback yang jelas bagi petugas ketika submit berhasil tersimpan offline vs berhasil sync ke server?

---

## Tahap 4: Audit Web Dashboard

**File:** `apps/web/src/app/dashboard/resubmit/` (semua file di folder ini)

**Yang harus dicari:**
- Apakah form resubmit memvalidasi bahwa `alasanResubmit` wajib diisi?
- Apakah ada preview "data sebelum" vs "data sesudah" sebelum user konfirmasi resubmit?
- Apakah response success menunjukkan `submit_sequence` yang baru?

**File:** `apps/web/src/app/dashboard/reports/` (semua file di folder ini)

**Yang harus dicari:**
- Apakah ExportButton memvalidasi bahwa `start_date` tidak lebih besar dari `end_date`?
- Apakah filter tanggal menggunakan komponen `PeriodPicker` yang sudah distandarkan?
- Apakah data laporan sudah menggunakan endpoint yang mem-filter hanya record dengan `MAX(submit_sequence)` (bukan semua versi resubmit)?

---

## Tahap 5: Audit Shared Types & Kontrak API

**Direktori:** `packages/shared-types/`

**Yang harus dicari:**
- Apakah tipe `Collection`, `Assignment`, `Can`, dan `Officer` sudah didefinisikan di sini?
- Apakah tipe yang digunakan di `apps/web` dan `apps/mobile` konsisten dengan definisi di `shared-types`?
- Apakah ada field yang berbeda antara respons API backend dengan tipe yang dikonsumsi frontend (bisa menjadi silent bug)?

---

## Format Output Review yang Diinginkan

Tulis laporan review dengan format berikut:

```markdown
# Laporan Code Review — Lazisnu Infaq System

## Executive Summary
[Ringkasan 1-2 paragraf: apakah sistem ini production-ready? Apa risiko utamanya?]

## Temuan Kritis (WAJIB FIX sebelum production)
| # | Area | File | Masalah | Dampak | Rekomendasi |
|---|------|------|---------|--------|-------------|
| 1 | ...  | ...  | ...     | ...    | ...         |

## Temuan Medium (Harus diperbaiki dalam sprint berikutnya)
| # | Area | File | Masalah | Rekomendasi |
|---|------|------|---------|-------------|

## Temuan Minor (Nice-to-have improvements)
| # | Area | File | Saran |
|---|------|------|-------|

## Hal yang Sudah Baik
[Daftar poin-poin implementasi yang sudah benar dan patut dipertahankan]

## Analisis Risiko Per Modul
### Backend
### Web Dashboard  
### Mobile (Android)
### Database & Data Integrity

## Rekomendasi Prioritas Perbaikan
[Urutan perbaikan yang disarankan, dari yang paling kritis]
```

---

## Aturan Penting untuk Jules

1. **Baca setiap file target sebelum membuat kesimpulan** — jangan menebak.
2. **Jika menemukan potensi pelanggaran immutability** pada tabel `collections`, tandai sebagai **CRITICAL** dengan komentar eksplisit.
3. **Jika menemukan hardcoded secret atau credential** dalam kode, tandai sebagai **SECURITY CRITICAL**.
4. **Jika menemukan kemungkinan data scope leak** (ADMIN_RANTING bisa akses data ranting lain), tandai sebagai **SECURITY CRITICAL**.
5. **Verifikasi konsistensi end-to-end**: Field yang dikirim mobile harus sama dengan yang diterima backend, dan yang ditampilkan web harus sama dengan yang disimpan di database.
6. Sertakan **nomor baris dan nama file spesifik** untuk setiap temuan.
7. Jika kamu tidak menemukan masalah pada sebuah area setelah membaca kodenya, nyatakan secara eksplisit: "Area ini terlihat aman."
