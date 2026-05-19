import NetInfo from '@react-native-community/netinfo';
import { offlineQueue, QueuedCollection } from './queue';
import { collectionService } from '../api';

export const syncService = {
  autoSync: async (): Promise<{ success: boolean; synced: number; failed: number; remaining: number; error?: any }> => {
    const MAX_RETRIES = 3;
    let retryCount = 0;

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected || !netInfo.isInternetReachable) {
      return { success: false, synced: 0, failed: 0, remaining: offlineQueue.getRetryableQueue().length, error: 'NO_NETWORK' };
    }

    while (retryCount < MAX_RETRIES) {
      const queue = offlineQueue.getRetryableQueue();
      if (queue.length === 0) {
        return { success: true, synced: 0, failed: 0, remaining: 0 };
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
            }
          }

          if (syncedIds.length > 0) {
            offlineQueue.dequeue(syncedIds);
          }

          if (permanentFailures.length > 0) {
            offlineQueue.moveToFailedPermanent(permanentFailures);
          }

          console.log(`[Sync] Sukses: ${syncedIds.length} data disinkronkan.`);
          return { success: true, synced: syncedIds.length, failed: permanentFailures.length, remaining: offlineQueue.getRetryableQueue().length };
        } else {
          retryCount++;
          if (retryCount < MAX_RETRIES) {
            const delay = Math.pow(2, retryCount - 1) * 1000;
            console.log(`[Sync] Gagal, mencoba ulang dalam ${delay}ms... (Percobaan ${retryCount})`);
            await new Promise(res => setTimeout(res, delay));
          } else {
            return { success: false, synced: 0, failed: 0, remaining: offlineQueue.getRetryableQueue().length, error: response.error };
          }
        }
      } catch (error) {
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          const delay = Math.pow(2, retryCount - 1) * 1000;
          await new Promise(res => setTimeout(res, delay));
        } else {
          return { success: false, synced: 0, failed: 0, remaining: offlineQueue.getRetryableQueue().length, error };
        }
      }
    }

    return { success: false, synced: 0, failed: 0, remaining: offlineQueue.getRetryableQueue().length, error: 'MAX_RETRIES_EXCEEDED' };
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
