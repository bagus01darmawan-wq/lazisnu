import {create} from 'zustand';
import {offlineQueue} from '../services/offline/queue';
import {correctionQueue} from '../services/offline/corrections';
import {syncService} from '../services/offline/sync';
import {getErrorMessage} from '../utils/error';
import {useDashboardStore} from './useDashboardStore';
import {useTasksStore} from './useTasksStore';
import {useCollectionsStore} from './useCollectionStore';

export function getTotalSyncIssueCount(): number {
  return (
    offlineQueue.getQueueCount() +
    offlineQueue.getFailedPermanentCount() +
    correctionQueue.getQueueCount() +
    correctionQueue.getFailedPermanentCount()
  );
}

interface SyncState {
  pendingCount: number;
  permanentFailedCount: number;
  pendingCorrectionsCount: number;
  failedCorrectionsCount: number;
  isSyncing: boolean;
  progress: number;
  lastSyncAt: string | null;
  oldestPending: string | null;
  error: string | null;

  checkStatus: () => void;
  triggerSync: () => Promise<{success: number; failed: number}>;
  setProgress: (progress: number) => void;
}

/**
 * Baca count terbaru dari MMKV (synchronous) dan update state.
 * Dipanggil secara defensif dari modul lain (submitCollection, sync listener, dll.)
 * agar badge selalu akurat tanpa perlu menunggu checkStatus() di useEffect.
 */
export function refreshSyncCounts(): void {
  try {
    const count = offlineQueue.getQueueCount();
    const permanentCount = offlineQueue.getFailedPermanentCount();
    const queue = offlineQueue.getQueue();

    useSyncStore.setState({
      pendingCount: count,
      permanentFailedCount: permanentCount,
      oldestPending: queue[0]?.collected_at ?? null,
      pendingCorrectionsCount: correctionQueue.getQueueCount(),
      failedCorrectionsCount: correctionQueue.getFailedPermanentCount(),
    });
  } catch (error) {
    console.error('Failed to refresh sync counts:', error);
  }
}

// Progres sinkronisasi bersifat dua tahap (batch terkirim → refresh store).
// Angka ini BUKAN persentase nyata item yang tersinkron — hanya penanda tahap
// untuk UI progress; jangan menambah angka tahap baru tanpa menamainya di sini.
const PROGRESS_BATCH_SENT = 50;
const PROGRESS_FINALIZING = 90;

export const useSyncStore = create<SyncState>(set => ({
  pendingCount: 0,
  permanentFailedCount: 0,
  pendingCorrectionsCount: 0,
  failedCorrectionsCount: 0,
  isSyncing: false,
  progress: 0,
  lastSyncAt: null,
  oldestPending: null,
  error: null,

  checkStatus: () => {
    refreshSyncCounts();
  },

  triggerSync: async () => {
    set({isSyncing: true, error: null, progress: 0});
    try {
      const result = await syncService.autoSync();

      // SYNC_IN_PROGRESS: jangan anggap gagal � sync lain sedang berjalan.
      // Update counts dari MMKV (yang mungkin sudah berubah oleh sync lain).
      if (result.error === 'SYNC_IN_PROGRESS') {
        set({
          isSyncing: false,
          progress: PROGRESS_BATCH_SENT,
          pendingCount: offlineQueue.getQueueCount(),
          permanentFailedCount: offlineQueue.getFailedPermanentCount(),
          pendingCorrectionsCount: correctionQueue.getQueueCount(),
          failedCorrectionsCount: correctionQueue.getFailedPermanentCount(),
        });
        return {success: 0, failed: 0};
      }

      if (result.synced > 0 || result.corrections_synced) {
        // ACK sudah aman, tetapi status sync UI baru selesai setelah semua store
        // melihat snapshot server terbaru. allSettled mencegah satu layar gagal
        // membatalkan keberhasilan transaksi yang sudah committed.
        set({progress: PROGRESS_FINALIZING});
        await Promise.allSettled([
          useDashboardStore.getState().fetchDashboard(),
          useTasksStore.getState().fetchTasks('ACTIVE'),
          useTasksStore.getState().fetchStats(),
          useCollectionsStore.getState().fetchCollections(),
        ]);
      }

      set({
        isSyncing: false,
        progress: result.success ? 100 : 0,
        lastSyncAt: new Date().toISOString(),
        pendingCount: offlineQueue.getQueueCount(),
        permanentFailedCount: offlineQueue.getFailedPermanentCount(),
        pendingCorrectionsCount: correctionQueue.getQueueCount(),
        failedCorrectionsCount: correctionQueue.getFailedPermanentCount(),
      });

      return {success: result.synced, failed: result.failed};
    } catch (error: unknown) {
      // Tetap refresh counts dari MMKV meskipun sync gagal
      const currentPending = offlineQueue.getQueueCount();
      const currentFailed = offlineQueue.getFailedPermanentCount();
      set({
        isSyncing: false,
        error: getErrorMessage(error, 'Sinkronisasi gagal'),
        progress: 0,
        pendingCount: currentPending,
        permanentFailedCount: currentFailed,
        pendingCorrectionsCount: correctionQueue.getQueueCount(),
        failedCorrectionsCount: correctionQueue.getFailedPermanentCount(),
      });
      return {success: 0, failed: 0};
    }
  },
  setProgress: progress => set({progress}),
}));

// Queue adalah source of truth. Setiap mutasi queue/quarantine langsung
// menyegarkan state badge, termasuk mutasi dari auto-sync dan layar Riwayat.
offlineQueue.subscribe(refreshSyncCounts);
correctionQueue.subscribe(refreshSyncCounts);
