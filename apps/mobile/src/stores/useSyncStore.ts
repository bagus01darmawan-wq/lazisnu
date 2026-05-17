import { create } from 'zustand';
import { offlineQueue } from '../services/offline/queue';
import { syncService } from '../services/offline/sync';

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
      await syncService.autoSync();

      set({
        isSyncing: false,
        progress: 100,
        lastSyncAt: new Date().toISOString(),
        pendingCount: offlineQueue.getQueueCount(),
        permanentFailedCount: offlineQueue.getFailedPermanentCount(),
      });

      return { success: 1, failed: 0 };
    } catch (error: any) {
      set({ isSyncing: false, error: error.message, progress: 0 });
      return { success: 0, failed: 0 };
    }
  },

  setProgress: (progress: number) => set({ progress }),
}));
