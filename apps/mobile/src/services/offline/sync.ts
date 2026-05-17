import NetInfo from '@react-native-community/netinfo';
import { offlineQueue, QueuedCollection } from './queue';
import { collectionService } from '../api';

export const syncService = {
  autoSync: async (retryCount = 0): Promise<{ success: boolean; count?: number; error?: any }> => {
    const MAX_RETRIES = 3;
    const netInfo = await NetInfo.fetch();

    if (!netInfo.isConnected || !netInfo.isInternetReachable) {
      return { success: false, error: 'NO_NETWORK' };
    }

    const queue = offlineQueue.getRetryableQueue();
    if (queue.length === 0) {
      return { success: true, count: 0 };
    }

    try {
      const response = await collectionService.batchSubmit(queue);

      if (response.success && response.data) {
        const data = response.data as any;
        const results = data.results || [];

        const syncedIds: string[] = [];
        const permanentFailures: QueuedCollection[] = [];

        for (const item of queue) {
          const result = results.find((r: any) => r.offline_id === item.offline_id);
          if (!result) continue;

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
            // Tetap di queue untuk retry berikutnya (can_retry: true atau undefined)
            // Jangan tambahkan ke syncedIds, jangan ke permanent
          }
        }

        if (syncedIds.length > 0) {
          offlineQueue.dequeue(syncedIds);
        }

        if (permanentFailures.length > 0) {
          offlineQueue.moveToFailedPermanent(permanentFailures);
        }

        console.log(`[Sync] Sukses: ${syncedIds.length} data disinkronkan.`);
        return { success: true, count: syncedIds.length };
      } else {
        if (retryCount < MAX_RETRIES) {
          const delay = Math.pow(2, retryCount) * 1000;
          console.log(`[Sync] Gagal, mencoba ulang dalam ${delay}ms... (Percobaan ${retryCount + 1})`);
          await new Promise(res => setTimeout(res, delay));
          return syncService.autoSync(retryCount + 1);
        }
        return { success: false, error: response.error };
      }
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(res => setTimeout(res, delay));
        return syncService.autoSync(retryCount + 1);
      }
      return { success: false, error };
    }
  },

  startNetworkListener: () => {
    let syncInProgress = false;
    return NetInfo.addEventListener(async (state) => {
      if (state.isConnected && state.isInternetReachable && !syncInProgress) {
        syncInProgress = true;
        try {
          await syncService.autoSync();
        } finally {
          syncInProgress = false;
        }
      }
    });
  },
};
