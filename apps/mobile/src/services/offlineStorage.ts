// Offline Storage Service - Bridged to MMKV (Deprecated Monolithic File)
// TODO: Secara bertahap hapus file ini dan gunakan langsung dari './offline'

import { offlineQueue } from './offline/queue';
import { taskCache } from './offline/tasks';
import { syncService } from './offline/sync';
import NetInfo from '@react-native-community/netinfo';

export const initDatabase = async (): Promise<void> => {
  console.log('MMKV Storage initialized (Sync)');
  syncService.startNetworkListener();
  return Promise.resolve();
};

export const collectionStorage = {
  save: async (collection: any): Promise<void> => {
    offlineQueue.enqueue(collection);
  },
  getUnsynced: async (): Promise<any[]> => {
    return offlineQueue.getQueue();
  },
  getUnsyncedCount: async (): Promise<number> => {
    return offlineQueue.getQueueCount();
  },
  markSynced: async (offlineId: string, serverId: string): Promise<void> => {
    offlineQueue.dequeue([offlineId]);
  },
  markFailed: async (offlineId: string, error: string): Promise<void> => {
    console.log(`Sync failed for ${offlineId}: ${error}`);
  },
  getAll: async (limit = 50): Promise<any[]> => {
    return offlineQueue.getQueue();
  },
  deleteSynced: async (): Promise<void> => {
    return Promise.resolve();
  },
};

export const taskStorage = {
  saveTasks: async (tasks: any[]): Promise<void> => {
    taskCache.saveTasks(tasks);
  },
  getTasks: async (): Promise<any[]> => {
    return taskCache.getTasks();
  },
  getActiveTasks: async (): Promise<any[]> => {
    const tasks = taskCache.getTasks();
    return tasks.filter((t: any) => t.status === 'ACTIVE');
  },
  markCompleted: async (taskId: string): Promise<void> => {
    const tasks = taskCache.getTasks();
    const updated = tasks.map((t: any) => t.id === taskId ? { ...t, status: 'COMPLETED' } : t);
    taskCache.saveTasks(updated);
  },
  getByQR: async (qrCode: string): Promise<any | null> => {
    const tasks = taskCache.getTasks();
    const task = tasks.find((t: any) => t.qr_code === qrCode && t.status === 'ACTIVE');
    return task || null;
  },
};

export const syncManager = {
  isOnline: async (): Promise<boolean> => {
    try {
      const state = await NetInfo.fetch();
      return !!(state.isConnected && state.isInternetReachable);
    } catch {
      return false;
    }
  },
  sync: async (): Promise<{ success: number; failed: number }> => {
    await syncService.autoSync();
    return { success: 1, failed: 0 }; 
  },
  getStatus: async (): Promise<{ pending: number; oldestPending: string | null }> => {
    const queue = offlineQueue.getQueue();
    return {
      pending: queue.length,
      oldestPending: queue.length > 0 ? queue[0].collected_at : null,
    };
  },
};

export const closeDatabase = async (): Promise<void> => {
  return Promise.resolve();
};

export default {
  initDatabase,
  closeDatabase,
  collections: collectionStorage,
  tasks: taskStorage,
  sync: syncManager,
};
