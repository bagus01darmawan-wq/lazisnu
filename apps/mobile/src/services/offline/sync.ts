import NetInfo from '@react-native-community/netinfo';
import { offlineQueue } from './queue';
import { collectionService } from '../api';

export const syncService = {
  autoSync: async (retryCount = 0): Promise<{ success: boolean; count?: number; error?: any }> => {
    const MAX_RETRIES = 3;
    const netInfo = await NetInfo.fetch();
    
    if (!netInfo.isConnected || !netInfo.isInternetReachable) {
      return { success: false, error: 'NO_NETWORK' };
    }

    const queue = offlineQueue.getQueue();
    if (queue.length === 0) {
      return { success: true, count: 0 };
    }

    try {
      // Panggil API batch-sync
      const response = await collectionService.batchSubmit(queue);

      if (response.success) {
        const syncedIds = queue.map(q => q.offline_id);
        offlineQueue.dequeue(syncedIds);
        console.log(`[Sync] Sukses: ${syncedIds.length} data disinkronkan.`);
        return { success: true, count: syncedIds.length };
      } else {
        // Jika gagal karena server (bukan validasi), coba lagi dengan backoff
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

