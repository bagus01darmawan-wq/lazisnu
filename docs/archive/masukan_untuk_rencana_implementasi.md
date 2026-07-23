# Fix 5 Bug Offline Collection & Sync Badge

Laporan bug testing offline penjemputan kaleng mengungkap 5 masalah terkait sinkronisasi data offline, filter task, dan akurasi badge sync.

---

## Ringkasan Bug

| # | Bug | Akar Masalah | Severity |
|---|-----|-------------|----------|
| 1 | Filter "Belum Dijemput" hanya 20 kartu, bukan 30 | `fetchCollections` memakai `limit: 20` — cache hanya menyimpan 20 riwayat, bukan semua data tasks | **High** |
| 2 | Filter "Selesai" tidak menampilkan kartu selesai | `fetchTasks` cache sudah benar (`limit: 1000`), **TAPI** saat offline, `reconcileTasks('COMPLETED')` menambahkan item dari queue ke list tapi filter `COMPLETED` **hanya menampilkan task dari queue lokal + server completed** — masalahnya task yang di-`markTaskComplete` dipindahkan dari cache ACTIVE ke COMPLETED dan dihapus dari state `tasks` — saat re-fetch offline, `taskCache.getTasks('COMPLETED')` seharusnya membaca ini. Perlu investigasi lebih lanjut apakah cache COMPLETED benar-benar ditulis | **High** |
| 3 | Kartu dijemput offline tidak naik status ke "Belum Terkirim" | Setelah `markTaskComplete`, task dihapus dari array `tasks` (filter ACTIVE). Tapi saat offline re-fetch, `reconcileTasks('ACTIVE')` membaca `taskCache.getTasks('ACTIVE')` yang BELUM diperbarui — karena `markTaskComplete` di store memanggil `taskCache.markCompleted(taskId)` yang memindahkan task dari cache ACTIVE ke COMPLETED, namun task TETAP muncul di offline filter karena cache ACTIVE yang lama masih ter-save dari saat online fetch | **High** |
| 4 | Riwayat: tidak ada fitur Koreksi untuk kartu "Belum Terkirim" | Kode saat ini: `sync_status === 'PENDING'` → tampilkan teks statis "Menunggu sync..." tanpa tombol aksi | **Medium** |
| 5 | Badge ikon awan sinkronisasi angka tidak akurat | `useSyncStore.checkStatus()` membaca `offlineQueue.getQueueCount()` saja — tapi queue bisa berubah setelah submit tanpa memanggil `checkStatus()` ulang, atau ada race condition antara enqueue dan pengecekan | **Medium** |

---

## Analisis Mendalam

### Bug 1: Limit 20 di `fetchCollections`

**File**: [useCollectionStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useCollectionStore.ts#L266)

```typescript
// Line 266 — MASALAH: hardcoded limit 20
const result = await collectionService.getHistory({ page: 1, limit: 20 });
```

Saat online, hanya 20 riwayat yang di-fetch dan disimpan ke `collectionsCache`. Saat offline, cache ini yang dibaca.

> [!IMPORTANT]
> Ini **bukan bug TasksScreen** — `useTasksStore.fetchTasks` sudah pakai `limit: 1000`.
> Bug ini ada di **halaman Riwayat** (`useCollectionsStore`). Tapi karena riwayat collection juga digabung (merged) dengan queue lokal di `mergeCollectionsWithQueues`, efeknya terasa di TasksScreen juga secara tidak langsung melalui stats.

**Fix**: Fetch semua riwayat periode aktif saat online dengan `limit: 1000` (konsisten dengan fetchTasks), dan juga implementasikan auto-pagination untuk memastikan semua data ter-cache.

---

### Bug 2 & 3: Filter "Selesai" dan Status Task Offline

**File**: [useTasksStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useTasksStore.ts#L155-L196)

Alur saat penjemputan offline:
1. User scan QR → submit → `useCollectionStore.submitCollection` dipanggil
2. `markTaskComplete(assignment_id)` → menghapus task dari state `tasks` **dan** memindahkan di `taskCache` dari ACTIVE ke COMPLETED
3. State `tasks` langsung kehilangan item tersebut (karena di-`filter`)

Saat user pindah filter ke "Selesai":
1. `fetchTasks('COMPLETED')` dipanggil
2. Karena offline → baca `taskCache.getTasks('COMPLETED')`
3. `reconcileTasks(cached, 'COMPLETED')` dijalankan

**Akar masalah**: `reconcileTasks` untuk status COMPLETED menambahkan task dari queue (activeQueue + failedQueue), TAPI juga memasukkan `serverCompleted` yang difilter `!queuedIds.has(task.id)`. Masalahnya:
- Task yang baru di-markComplete sudah ada di `taskCache('COMPLETED')` via `taskCache.markCompleted()`  
- Tapi `reconcileTasks` JUGA mengecek `queuedIds` — dan karena `assignment_id` ada di queue, task ini di-**exclude** dari `serverCompleted`
- Lalu task juga ditambahkan sebagai `queuedTasks` — tapi ini mencari dari `cacheTasks.find(t => t.id === item.assignment_id)` — dan di cache COMPLETED, task sudah berubah statusnya

Sebenarnya logika `reconcileTasks` sudah hampir benar, tapi ada edge case:
- **Line 40-41**: `serverCompleted` memfilter `!queuedIds.has(task.id)` — ini menghapus task yang seharusnya tampil karena sudah ada di COMPLETED cache dari `markCompleted`

**Fix**: Perbaiki `reconcileTasks` agar task dari `taskCache('COMPLETED')` yang sudah dipindahkan via `markCompleted` tidak di-exclude oleh filter queue.

Untuk **Bug 3** (kartu dijemput offline tidak naik status):
- Ini terjadi karena saat re-open halaman Tasks dengan filter ACTIVE, `fetchTasks('ACTIVE')` offline membaca `taskCache.getTasks('ACTIVE')` 
- `markTaskComplete` sudah memindahkan task dari ACTIVE cache ke COMPLETED cache
- Tapi `reconcileTasks('ACTIVE')` filter `!queuedIds.has(task.id)` seharusnya sudah menghilangkan task yang ada di queue
- **Kemungkinan**: `taskCache.getTasks('ACTIVE')` masih memuat task lama karena saat online fetch terakhir menyimpan semua ACTIVE tasks, dan `markCompleted` hanya mengubah satu set key. Race condition: apakah save berurutan benar?

Setelah re-check [tasks.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/services/offline/tasks.ts#L42-L51), `markCompleted` bersifat sinkron (MMKV sync) dan benar memindahkan task. Jadi seharusnya ini SUDAH benar.

> [!WARNING]  
> **Dugaan kuat**: Bug terjadi karena `fetchTasks` saat online hanya fetch **satu status** (`ACTIVE` atau `COMPLETED`), dan `taskCache.saveTasks` **menimpa seluruh cache untuk status itu**. Saat user pertama kali buka app (online), hanya `fetchTasks('ACTIVE')` yang dipanggil (lihat `useEffect` di TasksScreen line 159). Cache `COMPLETED` **tidak pernah diisi saat online** karena user belum pernah tap filter "Selesai" dalam kondisi online. Akibatnya saat offline, `taskCache.getTasks('COMPLETED')` kosong, dan `reconcileTasks` tidak punya base data untuk membangun daftar COMPLETED.

**Root cause yang sebenarnya**: **Saat online, app tidak men-cache COMPLETED tasks secara proaktif.** Hanya ACTIVE yang di-cache. Perlu pre-cache kedua status saat online.

---

### Bug 4: Tidak Ada Koreksi untuk Status "Belum Terkirim"

**File**: [HistoryScreen.tsx](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/screens/HistoryScreen.tsx#L116-L119)

```tsx
// Line 116-119
) : item.sync_status === 'PENDING' ? (
  <View style={{ paddingVertical: 7, paddingHorizontal: Spacing.sm }}>
    <Text style={{ ...Typography.caption, color: Colors.text.muted }}>Menunggu sync...</Text>
  </View>
```

Kartu PENDING hanya menampilkan teks statis. Perlu tombol "Koreksi" yang memungkinkan petugas mengoreksi nominal **sebelum data dikirim ke server**. Ini lebih simpel daripada koreksi data yang sudah tersimpan — cukup update item di `offlineQueue`.

---

### Bug 5: Badge Sync Angka Tidak Akurat

**File**: [useSyncStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useSyncStore.ts#L32-L46)

`checkStatus()` hanya dipanggil:
- Saat mount Dashboard/Tasks screen (via `useEffect`)
- Setelah `submitCollection` (line 97 di useCollectionStore)

Tapi **tidak dipanggil**:
- Setelah `triggerSync()` selesai **secara sinkron** (sebelum re-render) — walaupun `triggerSync` update `pendingCount` internal, tapi bisa ada desync jika queue berubah di luar flow ini
- Ada race condition: `enqueue` menambah item → `checkStatus()` membaca count → tapi jika `autoSync` berjalan bersamaan dan menghapus item, count bisa salah

**Fix**: Ubah `pendingCount` agar selalu computed dari queue length terbaru setiap kali dibaca, bukan hanya saat `checkStatus()` dipanggil.

---

## Proposed Changes

### useTasksStore

#### [MODIFY] [useTasksStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useTasksStore.ts)

1. **Pre-cache COMPLETED tasks saat online fetch** — Saat `fetchTasks('ACTIVE')` dipanggil online, juga fetch dan cache COMPLETED tasks di background
2. **Fix `reconcileTasks`** — Pastikan task yang sudah ada di `taskCache('COMPLETED')` via `markCompleted` tidak di-exclude oleh filter queue saat mode COMPLETED

---

### useCollectionStore

#### [MODIFY] [useCollectionStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useCollectionStore.ts)

1. **Ubah `limit: 20` → `limit: 1000`** pada `fetchCollections` (line 266) agar semua riwayat periode aktif ter-cache
2. Pastikan `loadMore` juga menyimpan ke cache agar data paginated tetap available offline

---

### useSyncStore  

#### [MODIFY] [useSyncStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useSyncStore.ts)

1. **Ubah `checkStatus`** agar selalu membaca count terbaru dari MMKV (sudah dilakukan sebenarnya)
2. **Tambah `subscribe` ke offlineQueue** — Panggil `checkStatus()` setiap kali ada perubahan queue
3. Pastikan `triggerSync` → setelah sync selesai, update `pendingCount` dari source of truth MMKV

Pendekatan yang lebih robust: Buat helper `refreshCounts()` yang dipanggil secara defensif di:
- `submitCollection` (sudah ada)
- `triggerSync` (sudah ada via `set({ pendingCount: offlineQueue.getQueueCount() })` — tapi ada gap timing)
- Network listener reconnect

---

### HistoryScreen

#### [MODIFY] [HistoryScreen.tsx](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/screens/HistoryScreen.tsx)

1. **Tambah tombol "Koreksi" untuk kartu PENDING** — Saat di-tap, buka modal koreksi yang mengubah `nominal` di `offlineQueue` (bukan API resubmit karena data belum di server)
2. Logic koreksi PENDING: cari item di `offlineQueue.getQueue()` by `offline_id`, update `nominal`, simpan kembali ke MMKV

---

### TasksScreen

#### [MODIFY] [TasksScreen.tsx](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/screens/TasksScreen.tsx)

1. **Tambah `fetchStats()` pada mount** agar summary card menampilkan data yang konsisten saat filter berubah
2. Pastikan saat ganti filter dan data dari cache, stats tetap sinkron

---

## Open Questions

> [!IMPORTANT]
> **Q1**: Untuk koreksi nominal pada kartu PENDING (belum terkirim), apakah cukup edit `nominal` di queue lokal saja? Atau perlu juga update `collectionsCache` agar riwayat ikut berubah?
> **Rekomendasi**: Update keduanya — queue (sumber kirim) dan collectionsCache (sumber tampilan).

> [!IMPORTANT]
> **Q2**: Backend saat ini mengirim riwayat dengan pagination (`/mobile/history?limit=20`). Apakah backend sudah support `limit=1000`? Jika ada limit server-side, mungkin perlu auto-fetch semua halaman saat online.
> **Rekomendasi**: Cek backend, tapi sebagai safety net, implementasikan auto-pagination di client.

> [!IMPORTANT]
> **Q3**: Saat online, apakah kita perlu fetch COMPLETED tasks secara proaktif (background), atau cukup saat user pertama kali tap filter "Selesai"?
> **Rekomendasi**: Pre-cache secara proaktif di background setelah ACTIVE fetch selesai — agar data COMPLETED selalu available saat offline.

---

## Verification Plan

### Manual Verification
1. **Bug 1**: Buka app online (ada 50 kaleng), buka halaman Tasks/Riwayat → matikan koneksi → buka lagi → harus menampilkan semua 50 kartu
2. **Bug 2**: Online, jemput 5 kaleng → offline → tap filter "Selesai" → harus tampil 5 kartu yang sudah dijemput
3. **Bug 3**: Online, jemput 3 kaleng offline → cek filter "Belum" → 3 kartu harus hilang dari daftar belum
4. **Bug 4**: Buka Riwayat → kartu berstatus "Belum Terkirim" → harus ada tombol "Koreksi" → tap → bisa edit nominal
5. **Bug 5**: Jemput 1 kaleng offline → badge harus naik ke 1 → jemput lagi → harus naik ke 2 → reconnect online → sync → harus turun ke 0

### Automated Tests
- `pnpm --filter @lazisnu/mobile test` (jika ada test suite)

---

## Learning Checkpoint 📘

| Aspek | Penjelasan |
|-------|-----------|
| **Konsep** | Offline-first caching: data harus di-cache **saat online** agar tersedia **saat offline**. Jika cache tidak diisi, offline mode akan punya "lubang" data. |
| **Alasan Perubahan** | Sistem sebelumnya hanya cache data yang di-render (lazy cache), bukan proaktif. Ini menyebabkan filter "Selesai" kosong saat offline karena data COMPLETED belum pernah di-fetch/cache. |
| **Risiko** | Fetch `limit: 1000` bisa lambat jika data sangat banyak — tapi untuk skala Lazisnu (ratusan kaleng per petugas), ini acceptable. |
| **Cara Test** | Ikuti skenario verification di atas — test setiap bug secara terisolasi. |
| **Latihan** | Coba tambahkan logging di `taskCache.markCompleted()` untuk melihat isi cache ACTIVE dan COMPLETED sebelum dan sesudah pemindahan. |
