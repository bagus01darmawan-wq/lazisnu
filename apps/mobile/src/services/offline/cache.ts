/**
 * cache.ts - Helper MMKV untuk menyimpan dan membaca cache tampilan UI.
 *
 * Data yang disimpan di sini adalah CACHE, bukan data transaksi finansial.
 * - Cache ini bertahan saat app ditutup dan dibuka kembali (offline-first).
 * - Cache ini DIHAPUS saat logout atau ganti akun (resetAllClientState).
 * - Saat online dan fetch server berhasil, cache diperbarui dengan data server.
 */

import { getOfflineStorage } from './mmkv';
import { TodayStats, WeekStats, DashboardTaskItem, RecentCollectionSummary, Collection } from '@lazisnu/shared-types';

// --- Key Prefix --------------------------------------------------------------
const KEY_DASHBOARD_TODAY_STATS   = 'cache:dashboard:todayStats';
const KEY_DASHBOARD_WEEK_STATS    = 'cache:dashboard:weekStats';
const KEY_DASHBOARD_PENDING_TASKS = 'cache:dashboard:pendingTasks';
const KEY_DASHBOARD_RECENT        = 'cache:dashboard:recentCollections';
const KEY_DASHBOARD_SCHEMA_VERSION = 'cache:dashboard:schemaVersion';
const DASHBOARD_SCHEMA_VERSION = 2;
const KEY_TASKS_ACTIVE_COUNT      = 'cache:tasks:activeCount';
const KEY_TASKS_COMPLETED_COUNT   = 'cache:tasks:completedCount';
const KEY_TASKS_COMPLETED_NOMINAL = 'cache:tasks:completedNominal';
const KEY_TASKS_TOTAL_COUNT       = 'cache:tasks:totalCount';
const KEY_COLLECTIONS             = 'cache:collections:list';

// --- Helpers -----------------------------------------------------------------
function safeGet<T>(key: string): T | null {
  try {
    const raw = getOfflineStorage().getString(key);
    if (!raw) { return null; }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    getOfflineStorage().set(key, JSON.stringify(value));
  } catch {
    // Jika storage belum siap (mis. saat boot sebelum init), abaikan saja.
  }
}

function safeDelete(key: string): void {
  try {
    getOfflineStorage().delete(key);
  } catch { /* abaikan */ }
}

function ensureDashboardSchema(): void {
  try {
    const storage = getOfflineStorage();
    if (storage.getNumber(KEY_DASHBOARD_SCHEMA_VERSION) === DASHBOARD_SCHEMA_VERSION) {
      return;
    }

    // Versi lama dapat berisi hasil optimistis yang sudah menghitung queue.
    // Invalidate hanya cache turunan dashboard; queue transaksi tetap utuh.
    storage.delete(KEY_DASHBOARD_TODAY_STATS);
    storage.delete(KEY_DASHBOARD_WEEK_STATS);
    storage.delete(KEY_DASHBOARD_PENDING_TASKS);
    storage.delete(KEY_DASHBOARD_RECENT);
    storage.set(KEY_DASHBOARD_SCHEMA_VERSION, DASHBOARD_SCHEMA_VERSION);
  } catch {
    // Storage yang belum siap akan dicoba lagi pada akses berikutnya.
  }
}

// --- Dashboard Cache ----------------------------------------------------------
export const dashboardCache = {
  getTodayStats: (): TodayStats | null => {
    ensureDashboardSchema();
    return safeGet<TodayStats>(KEY_DASHBOARD_TODAY_STATS);
  },

  setTodayStats: (stats: TodayStats): void => {
    ensureDashboardSchema();
    safeSet(KEY_DASHBOARD_TODAY_STATS, stats);
  },

  getWeekStats: (): WeekStats | null => {
    ensureDashboardSchema();
    return safeGet<WeekStats>(KEY_DASHBOARD_WEEK_STATS);
  },

  setWeekStats: (stats: WeekStats): void => {
    ensureDashboardSchema();
    safeSet(KEY_DASHBOARD_WEEK_STATS, stats);
  },

  getPendingTasks: (): DashboardTaskItem[] => {
    ensureDashboardSchema();
    return safeGet<DashboardTaskItem[]>(KEY_DASHBOARD_PENDING_TASKS) ?? [];
  },

  setPendingTasks: (tasks: DashboardTaskItem[]): void => {
    ensureDashboardSchema();
    safeSet(KEY_DASHBOARD_PENDING_TASKS, tasks);
  },

  getRecentCollections: (): RecentCollectionSummary[] => {
    ensureDashboardSchema();
    return safeGet<RecentCollectionSummary[]>(KEY_DASHBOARD_RECENT) ?? [];
  },

  setRecentCollections: (items: RecentCollectionSummary[]): void => {
    ensureDashboardSchema();
    safeSet(KEY_DASHBOARD_RECENT, items);
  },

  clear: (): void => {
    safeDelete(KEY_DASHBOARD_TODAY_STATS);
    safeDelete(KEY_DASHBOARD_WEEK_STATS);
    safeDelete(KEY_DASHBOARD_PENDING_TASKS);
    safeDelete(KEY_DASHBOARD_RECENT);
    safeDelete(KEY_DASHBOARD_SCHEMA_VERSION);
  },
};

// --- Tasks Stats Cache --------------------------------------------------------
export const tasksStatsCache = {
  get: (): { active: number; completed: number; total: number; completedNominal: number } => ({
    active:           safeGet<number>(KEY_TASKS_ACTIVE_COUNT)      ?? 0,
    completed:        safeGet<number>(KEY_TASKS_COMPLETED_COUNT)   ?? 0,
    total:            safeGet<number>(KEY_TASKS_TOTAL_COUNT)       ?? 0,
    completedNominal: safeGet<number>(KEY_TASKS_COMPLETED_NOMINAL) ?? 0,
  }),

  set: (stats: { active: number; completed: number; total: number; completedNominal: number }): void => {
    safeSet(KEY_TASKS_ACTIVE_COUNT,      stats.active);
    safeSet(KEY_TASKS_COMPLETED_COUNT,   stats.completed);
    safeSet(KEY_TASKS_TOTAL_COUNT,       stats.total);
    safeSet(KEY_TASKS_COMPLETED_NOMINAL, stats.completedNominal);
  },

  clear: (): void => {
    safeDelete(KEY_TASKS_ACTIVE_COUNT);
    safeDelete(KEY_TASKS_COMPLETED_COUNT);
    safeDelete(KEY_TASKS_TOTAL_COUNT);
    safeDelete(KEY_TASKS_COMPLETED_NOMINAL);
  },
};

// --- Collections Cache --------------------------------------------------------
export const collectionsCache = {
  get: (): Collection[] =>
    safeGet<Collection[]>(KEY_COLLECTIONS) ?? [],

  set: (items: Collection[]): void =>
    safeSet(KEY_COLLECTIONS, items),

  clear: (): void =>
    safeDelete(KEY_COLLECTIONS),
};

// --- Clear All (dipanggil saat logout / ganti akun) ---------------------------
export function clearAllCache(): void {
  dashboardCache.clear();
  tasksStatsCache.clear();
  collectionsCache.clear();
}
