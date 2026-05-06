import NetInfo from '@react-native-community/netinfo';
import { offlineQueue } from './queue';
import { collectionService } from '../api';

export const syncService = {
  autoSync: async (): Promise<{ success: boolean; count?: number; error?: any }> => {
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {return { success: false, error: 'NO_NETWORK' };}

    const queue = offlineQueue.getQueue();
    if (queue.length === 0) {return { success: true, count: 0 };}

    try {
      // Panggil API batch-sync
      const response = await collectionService.batchSubmit(queue);

      if (response.success) {
        // Jika berhasil, hapus item dari queue lokal
        const syncedIds = queue.map(q => q.offline_id);
        offlineQueue.dequeue(syncedIds);
        console.log(`Batch sync sukses: ${syncedIds.length} data. Queue dibersihkan.`);
        return { success: true, count: syncedIds.length };
      } else {
        console.error('Batch sync gagal dari server:', response.error);
        return { success: false, error: response.error };
      }
    } catch (error) {
      console.error('Batch sync gagal karena network/sistem:', error);
      return { success: false, error };
    }
  },

  startNetworkListener: () => {
    return NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        syncService.autoSync();
      }
    });
  },
};

