import { create } from 'zustand';
import { collectionStorage, syncManager } from '../services/offlineStorage';

interface SyncState {
  pendingCount: number;
  isSyncing: boolean;
  progress: number; // 0 to 100
  lastSyncAt: string | null;
  oldestPending: string | null;
  error: string | null;

  checkStatus: () => Promise<void>;
  triggerSync: () => Promise<{ success: number; failed: number }>;
  setProgress: (progress: number) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingCount: 0,
  isSyncing: false,
  progress: 0,
  lastSyncAt: null,
  oldestPending: null,
  error: null,

  checkStatus: async () => {
    try {
      const count = await collectionStorage.getUnsyncedCount();
      const status = await syncManager.getStatus();

      set({
        pendingCount: count,
        oldestPending: status.oldestPending,
      });
    } catch (error) {
      console.error('Failed to check sync status:', error);
    }
  },

  triggerSync: async () => {
    set({ isSyncing: true, error: null, progress: 0 });
    try {
      const result = await syncManager.sync();

      set({
        isSyncing: false,
        progress: 100,
        lastSyncAt: new Date().toISOString(),
        pendingCount: 0,
      });

      return result;
    } catch (error: any) {
      set({ isSyncing: false, error: error.message, progress: 0 });
      return { success: 0, failed: 0 };
    }
  },

  setProgress: (progress: number) => set({ progress }),
}));
