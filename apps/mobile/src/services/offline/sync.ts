import NetInfo from '@react-native-community/netinfo';
import { offlineQueue } from './queue';
import { collectionService } from '../api';

export const syncService = {
  autoSync: async (): Promise<void> => {
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {return;}

    const queue = offlineQueue.getQueue();
    if (queue.length === 0) {return;}

    try {
      // Panggil API batch-sync
      const response = await collectionService.batchSubmit(queue);

      if (response.success) {
        // Jika berhasil, hapus item dari queue lokal
        const syncedIds = queue.map(q => q.offline_id);
        offlineQueue.dequeue(syncedIds);
        console.log(`Batch sync sukses: ${syncedIds.length} data. Queue dibersihkan.`);
      } else {
        console.error('Batch sync gagal dari server:', response.error);
      }
    } catch (error) {
      console.error('Batch sync gagal karena network/sistem:', error);
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

