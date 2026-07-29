import NetInfo from '@react-native-community/netinfo';
import { offlineQueue, QueuedCollection } from './queue';
import { collectionService } from '../api';
import { BatchCollectionRequestItem } from '@lazisnu/shared-types';

function toBatchPayload(item: QueuedCollection): BatchCollectionRequestItem {
  return {
    offline_id: item.offline_id,
    assignment_id: item.assignment_id,
    can_id: item.can_id,
    nominal: item.nominal,
    collected_at: item.collected_at,
    latitude: item.latitude,
    longitude: item.longitude,
    device_info: item.device_info as any,
  };
}

// Console.log hanya aktif di dev — mencegah log detail transaksi
// bocor ke logcat di production build.
const devLog = (message: string) => {
  if (__DEV__) { console.log(message); }
};

// Module-level lock — accessible to all callers (network listener, submitCollection, triggerSync).
// Without this, multiple concurrent autoSync() calls could race and send duplicate requests.
let syncInProgress = false;

// Per-item retry cap. Item yang sudah melebihi ini akan dipindahkan ke failedPermanent.
// Counter persisten di `retry_attempts` field pada QueuedCollection — bertahan antar
// panggilan autoSync. (P2: Poison pill fix)
const MAX_RETRIES = 3;

export const syncService = {
  autoSync: async (): Promise<{ success: boolean; synced: number; failed: number; remaining: number; error?: any }> => {
    // Guard: kalau sudah ada sync berjalan, tolak pemanggilan baru.
    // Data tetap ada di queue MMKV — akan tertangani di sync berikutnya.
    if (syncInProgress) {
      return { success: false, synced: 0, failed: 0, remaining: offlineQueue.getRetryableQueue().length, error: 'SYNC_IN_PROGRESS' };
    }

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected || !netInfo.isInternetReachable) {
      return { success: false, synced: 0, failed: 0, remaining: offlineQueue.getRetryableQueue().length, error: 'NO_NETWORK' };
    }

    syncInProgress = true;
    try {
      let totalSynced = 0;
      let totalFailed = 0;
      // Batch-level iteration cap — mencegah infinite loop jika ada item yg selalu gagal 5xx
      // tanpa melebihi retry_attempts per-item.
      // Batch-level retry dinonaktifkan (MAX_BATCH_ITERATIONS=1). Per-item backoff via next_retry_at sudah cukup.
      const MAX_BATCH_ITERATIONS = 1;
      let batchIteration = 0;

      while (batchIteration < MAX_BATCH_ITERATIONS) {
        batchIteration++;

        // P2: Sebelum kirim batch, pindahkan item yang retry_attempts-nya sudah habis.
        const queue = offlineQueue.getRetryableQueue();
        const expiredItems = queue.filter((item) => (item.retry_attempts || 0) >= MAX_RETRIES);
        if (expiredItems.length > 0) {
          offlineQueue.moveToFailedPermanent(
            expiredItems.map((item) => ({
              ...item,
              error_type: 'SERVER',
              can_retry: false,
              error_message: `Melebihi batas retry (${MAX_RETRIES}x)`,
            }))
          );
          totalFailed += expiredItems.length;
          devLog(`[Sync] ${expiredItems.length} item expired → failedPermanent.`);
        }

        // Ambil queue fresh setelah moveToFailedPermanent
        const remaining = offlineQueue.getRetryableQueue();
        if (remaining.length === 0) {
          const queuedCount = offlineQueue.getQueueCount();
          return { success: queuedCount === 0, synced: totalSynced, failed: totalFailed, remaining: queuedCount };
        }

        try {
          const payload = remaining.map(toBatchPayload);
          const response = await collectionService.batchSubmit(payload);

          if (response.success && response.data) {
            // response.data bertipe BatchSyncResponse — akses langsung
            const results = response.data.results || [];

            const syncedIds: string[] = [];
            const permanentFailures: QueuedCollection[] = [];
            const retryableFailures: QueuedCollection[] = [];

            for (const item of remaining) {
              const result = results.find((r) => r.offline_id === item.offline_id);
              if (!result) {continue;}

              if (result.status === 'COMPLETED' || result.status === 'ALREADY_SYNCED') {
                syncedIds.push(item.offline_id);
              } else if (result.can_retry === false) {
                permanentFailures.push({
                  ...item,
                  error_type: 'VALIDATION',
                  can_retry: false,
                  error_message: result.error,
                });
              } else {
                retryableFailures.push(item);
              }
              // item yg tidak masuk kedua kategori = server error (5xx) —
              // tetap di queue, retry_attempts sudah di-increment oleh caller
              // (incrementRetryAttempts dipanggil di catch handler)
            }

            if (syncedIds.length > 0) {
              offlineQueue.dequeue(syncedIds);
            }

            if (permanentFailures.length > 0) {
              offlineQueue.moveToFailedPermanent(permanentFailures);
            }
            if (retryableFailures.length > 0) {
              offlineQueue.incrementRetryAttempts(retryableFailures);
            }

            totalSynced += syncedIds.length;
            totalFailed += permanentFailures.length;
            devLog(`[Sync] Sukses: ${syncedIds.length} data disinkronkan.`);

            // Jika batch ini sukses dan tidak ada item yg gagal-5xx (semua clear),
            // kita bisa langsung return — tidak perlu loop lagi.
            const stillQueued = offlineQueue.getRetryableQueue();
            if (stillQueued.length === 0) {
              const queuedCount = offlineQueue.getQueueCount();
              return { success: queuedCount === 0, synced: totalSynced, failed: totalFailed, remaining: queuedCount };
            }

            // Masih ada item di queue (kemungkinan 5xx dari batch ini) —
            // lanjut iterasi berikutnya.
          } else {
            // Batch gagal total (response.success = false)
            // P2: Increment retry_attempts pada SEMUA item di batch ini.
            offlineQueue.incrementRetryAttempts(remaining);
            devLog(`[Sync] Batch gagal, retry_attempts di-increment untuk ${remaining.length} item.`);
          }
        } catch (error) {
          // Network error (5xx, timeout, dll)
          // P2: Increment retry_attempts pada semua item di batch.
          offlineQueue.incrementRetryAttempts(remaining);
          devLog(`[Sync] Network error, retry_attempts di-increment untuk ${remaining.length} item.`);
        }
      }

      // Batch-level cap tercapai — ada item yang belum terselesaikan.
      const finalRemaining = offlineQueue.getQueueCount();
      return {
        success: finalRemaining === 0,
        synced: totalSynced,
        failed: totalFailed,
        remaining: finalRemaining,
        error: finalRemaining > 0 ? 'BATCH_ITERATION_CAP_REACHED' : undefined,
      };
    } finally {
      syncInProgress = false;
    }
  },

  startNetworkListener: () => {
    // Tidak perlu syncInProgress lokal — guard ada di autoSync().
    return NetInfo.addEventListener(async (state) => {
      if (state.isConnected && state.isInternetReachable) {
        try {
          // Dynamic import useSyncStore to prevent circular dependency
          const { useSyncStore } = require('../../stores/useSyncStore');
          await useSyncStore.getState().triggerSync();
        } catch {
          await syncService.autoSync();
        }
      }
    });
  },
};
