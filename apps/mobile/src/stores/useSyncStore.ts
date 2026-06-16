import { create } from 'zustand';
import { offlineQueue } from '../services/offline/queue';
import { syncService } from '../services/offline/sync';
import { getErrorMessage } from '../utils/error';

interface SyncState {
  pendingCount: number;
  permanentFailedCount: number;
  isSyncing: boolean;
  progress: number;
  lastSyncAt: string | null;
  oldestPending: string | null;
  error: string | null;

  checkStatus: () => Promise<void>;
  triggerSync: () => Promise<{ success: number; failed: number }>;
  setProgress: (progress: number) => void;
  clearFailed: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingCount: 0,
  permanentFailedCount: 0,
  isSyncing: false,
  progress: 0,
  lastSyncAt: null,
  oldestPending: null,
  error: null,

  checkStatus: async () => {
    try {
      const count = offlineQueue.getQueueCount();
      const permanentCount = offlineQueue.getFailedPermanentCount();
      const queue = offlineQueue.getQueue();

      set({
        pendingCount: count,
        permanentFailedCount: permanentCount,
        oldestPending: queue.length > 0 ? queue[0].collected_at : null,
      });
    } catch (error) {
      console.error('Failed to check sync status:', error);
    }
  },

  triggerSync: async () => {
    set({ isSyncing: true, error: null, progress: 0 });
    try {
      const result = await syncService.autoSync();

      // SYNC_IN_PROGRESS: jangan anggap gagal — sync lain sedang berjalan.
      // Update counts dari MMKV (yang mungkin sudah berubah oleh sync lain).
      if (result.error === 'SYNC_IN_PROGRESS') {
        set({
          isSyncing: false,
          progress: 50,
          pendingCount: offlineQueue.getQueueCount(),
          permanentFailedCount: offlineQueue.getFailedPermanentCount(),
        });
        return { success: 0, failed: 0 };
      }

      set({
        isSyncing: false,
        progress: result.success ? 100 : 0,
        lastSyncAt: new Date().toISOString(),
        pendingCount: offlineQueue.getQueueCount(),
        permanentFailedCount: offlineQueue.getFailedPermanentCount(),
      });

      return { success: result.synced, failed: result.failed };
    } catch (error: unknown) {
      set({ isSyncing: false, error: getErrorMessage(error, 'Sinkronisasi gagal'), progress: 0 });
      return { success: 0, failed: 0 };
    }
  },

  setProgress: (progress: number) => set({ progress }),

  clearFailed: () => {
    offlineQueue.clearFailedPermanent();
    set({ permanentFailedCount: 0 });
  },
}));
