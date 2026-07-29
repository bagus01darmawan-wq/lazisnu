# Walkthrough: Fix 5 Bug Offline Collection & Sync Badge

## Ringkasan

Memperbaiki 5 bug yang ditemukan saat testing offline penjemputan kaleng. Semua perubahan sudah diverifikasi TypeScript compile clean.

---

## Perubahan per Bug

### Bug 1: Filter hanya menampilkan 20 kartu (bukan semua)

**Akar masalah**: `fetchCollections` hardcoded `limit: 20` — cache MMKV hanya menyimpan 20 riwayat, sehingga offline mode hanya punya 20 data.

**File**: [useCollectionStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useCollectionStore.ts)

```diff
-const result = await collectionService.getHistory({ page: 1, limit: 20 });
-if (result.success && result.data) {
-  const items = result.data.items || [];
-  const mapped = items.map(mapHistoryToCollection);
-  collectionsCache.set(mapped);
-  const merged = mergeCollectionsWithQueues([...collectionsCache.get(), ...mapped]);
+const PAGE_LIMIT = 1000;
+const firstPage = await collectionService.getHistory({ page: 1, limit: PAGE_LIMIT });
+if (firstPage.success && firstPage.data) {
+  let allItems = firstPage.data.items || [];
+  // Auto-paginate jika ada lebih dari 1 halaman
+  if (totalPages > 1) { ... Promise.allSettled(...) }
+  const mapped = allItems.map(mapHistoryToCollection);
+  collectionsCache.set(mapped);
+  const merged = mergeCollectionsWithQueues(mapped);
```

Juga memperbaiki bug duplikasi data di merge: sebelumnya `[...collectionsCache.get(), ...mapped]` menghasilkan duplikat karena `mapped` sudah disimpan ke cache.

---

### Bug 2 & 3: Filter "Selesai" kosong + kartu dijemput offline tidak hilang dari "Belum"

**Akar masalah**: 
- App hanya fetch & cache **ACTIVE** tasks saat online — COMPLETED tasks tidak pernah di-cache
- `reconcileTasks('COMPLETED')` memfilter task berdasarkan `queuedIds` yang salah — menghapus task yang seharusnya tampil

**File**: [useTasksStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useTasksStore.ts)

**Fix 1 — Pre-cache status lawan**:
```diff
 // Setelah fetch ACTIVE berhasil...
+const otherStatus = status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE';
+tasksService.getTasks({ status: otherStatus, page: 1, limit: 1000 })
+  .then(otherResult => {
+    if (otherResult.success && otherResult.data) {
+      taskCache.saveTasks(dedupeTasksById(otherResult.data.tasks || []), otherStatus);
+    }
+  })
+  .catch(() => { /* silent */ });
```

**Fix 2 — reconcileTasks COMPLETED filter**:
```diff
-const serverCompleted = serverTasks.filter(
-  task => task.status === AssignmentStatus.COMPLETED && !queuedIds.has(task.id),
-);
-return [...queuedTasks, ...serverCompleted];
+// Gunakan queuedTaskIds (bukan queuedIds) agar hanya exclude duplikat
+const serverCompleted = serverTasks.filter(
+  task => task.status === AssignmentStatus.COMPLETED && !queuedTaskIds.has(task.id),
+);
+return dedupeTasksById([...queuedTasks, ...serverCompleted]);
```

---

### Bug 4: Tidak ada fitur Koreksi untuk kartu "Belum Terkirim"

**Akar masalah**: Kartu PENDING hanya menampilkan teks statis "Menunggu sync..." tanpa tombol aksi.

**File**: [HistoryScreen.tsx](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/screens/HistoryScreen.tsx), [queue.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/services/offline/queue.ts)

**Perubahan**:
1. Tambah method `offlineQueue.updateNominal(offline_id, newNominal)` di queue.ts
2. Ganti teks statis "Menunggu sync..." dengan tombol "Koreksi" di HistoryScreen
3. Tambah flag `isPending` di tipe `Correction` — menentukan apakah koreksi dilakukan lokal (queue) atau via API (resubmit)
4. Modal koreksi adaptif: untuk PENDING items, field "Alasan koreksi" disembunyikan karena data belum di-server

---

### Bug 5: Badge ikon awan sinkronisasi angka tidak akurat

**Akar masalah**: `checkStatus()` async dan tidak selalu dipanggil setelah setiap perubahan queue. Ada gap timing antara enqueue dan pembacaan count.

**File**: [useSyncStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useSyncStore.ts), [useCollectionStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useCollectionStore.ts), [index.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/index.ts)

**Perubahan**:
1. Export `refreshSyncCounts()` — fungsi standalone synchronous yang membaca count dari MMKV dan langsung update state via `useSyncStore.setState()`
2. `checkStatus()` diubah dari async ke sync — memanggil `refreshSyncCounts()` internal
3. `submitCollection` menggunakan `refreshSyncCounts()` langsung (bukan `useSyncStore.getState().checkStatus()`)
4. Catch block di `triggerSync` juga refresh counts dari MMKV agar badge tetap akurat meskipun sync gagal

---

## File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| [useCollectionStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useCollectionStore.ts) | Limit 1000 + auto-pagination + refreshSyncCounts |
| [useTasksStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useTasksStore.ts) | Pre-cache COMPLETED + fix reconcileTasks |
| [useSyncStore.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/useSyncStore.ts) | refreshSyncCounts helper + sync checkStatus |
| [index.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/stores/index.ts) | Export refreshSyncCounts |
| [queue.ts](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/services/offline/queue.ts) | Tambah updateNominal method |
| [HistoryScreen.tsx](file:///c:/Users/user/Documents/lazisnu/apps/mobile/src/screens/HistoryScreen.tsx) | Koreksi PENDING + modal adaptif |

## Verifikasi

- ✅ TypeScript compile clean (`pnpm --filter lazisnu-collector-app exec tsc --noEmit`)

## Cara Test Manual

1. **Bug 1**: Buka app online (50 kaleng) → matikan koneksi → halaman Tasks/Riwayat harus tampilkan semua data
2. **Bug 2**: Jemput kaleng online → offline → tap "Selesai" → kartu harus muncul
3. **Bug 3**: Jemput kaleng offline → "Belum" harus berkurang sesuai jumlah jemputan
4. **Bug 4**: Buka Riwayat → kartu "Belum Terkirim" → tap "Koreksi" → edit nominal → simpan
5. **Bug 5**: Jemput offline berturut-turut → badge sync harus naik 1, 2, 3... secara konsisten
