import {getOfflineStorage} from './mmkv';

const TASK_ORDER_KEY = 'task_order_v1';

/**
 * Cache urutan tugas pribadi per perangkat (MMKV terenkripsi).
 * Menyimpan array id tugas dalam urutan yang disusun petugas via drag.
 * Tugas baru dari server (id tak dikenal) tetap muncul di bawah saat
 * order ini diterapkan — lihat applyCustomOrder di useTasksStore.
 */
export const taskOrderCache = {
  get: (): string[] => {
    const storage = getOfflineStorage();
    const data = storage.getString(TASK_ORDER_KEY);
    if (!data) {
      return [];
    }
    try {
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((id): id is string => typeof id === 'string');
    } catch {
      return [];
    }
  },

  set: (ids: string[]): void => {
    getOfflineStorage().set(TASK_ORDER_KEY, JSON.stringify(ids));
  },
};
