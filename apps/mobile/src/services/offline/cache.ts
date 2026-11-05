/**
 * cache.ts - Helper MMKV untuk menyimpan dan membaca cache tampilan UI.
 *
 * Data yang disimpan di sini adalah CACHE, bukan data transaksi finansial.
 * - Cache ini bertahan saat app ditutup dan dibuka kembali (offline-first).
 * - Cache ini DIHAPUS saat logout atau ganti akun (resetAllClientState).
 * - Saat online dan fetch server berhasil, cache diperbarui dengan data server.
 */

import {getOfflineStorage} from './mmkv';
import {
  TodayStats,
  WeekStats,
  MonthStats,
  DashboardTaskItem,
  RecentCollectionSummary,
  Collection,
} from '@lazisnu/shared-types';

// --- Key Prefix --------------------------------------------------------------
const KEY_DASHBOARD_TODAY_STATS = 'cache:dashboard:todayStats';
const KEY_DASHBOARD_WEEK_STATS = 'cache:dashboard:weekStats';
const KEY_DASHBOARD_MONTH_STATS = 'cache:dashboard:monthStats';
const KEY_DASHBOARD_MONTH_PERIOD = 'cache:dashboard:monthStatsPeriod';
const KEY_DASHBOARD_PENDING_TASKS = 'cache:dashboard:pendingTasks';
const KEY_DASHBOARD_RECENT = 'cache:dashboard:recentCollections';
const KEY_DASHBOARD_SCHEMA_VERSION = 'cache:dashboard:schemaVersion';
const DASHBOARD_SCHEMA_VERSION = 4;
const KEY_TASKS_ACTIVE_COUNT = 'cache:tasks:activeCount';
const KEY_TASKS_COMPLETED_COUNT = 'cache:tasks:completedCount';
const KEY_TASKS_COMPLETED_NOMINAL = 'cache:tasks:completedNominal';
const KEY_TASKS_TOTAL_COUNT = 'cache:tasks:totalCount';
const KEY_TASKS_STATS_PERIOD = 'cache:tasks:statsPeriod';
const KEY_COLLECTIONS = 'cache:collections:list';
const KEY_PERIOD_CONTEXT = 'cache:period:context';

// --- Helpers -----------------------------------------------------------------
function safeGet<T>(key: string): T | null {
  try {
    const raw = getOfflineStorage().getString(key);
    if (!raw) {
      return null;
    }
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
    getOfflineStorage().remove(key);
  } catch {
    /* abaikan */
  }
}

function ensureDashboardSchema(): void {
  try {
    const storage = getOfflineStorage();
    if (storage.getNumber(KEY_DASHBOARD_SCHEMA_VERSION) === DASHBOARD_SCHEMA_VERSION) {
      return;
    }

    // Versi lama dapat berisi hasil optimistis yang sudah menghitung queue.
    // Invalidate hanya cache turunan dashboard; queue transaksi tetap utuh.
    storage.remove(KEY_DASHBOARD_TODAY_STATS);
    storage.remove(KEY_DASHBOARD_WEEK_STATS);
    storage.remove(KEY_DASHBOARD_MONTH_STATS);
    storage.remove(KEY_DASHBOARD_MONTH_PERIOD);
    storage.remove(KEY_DASHBOARD_PENDING_TASKS);
    storage.remove(KEY_DASHBOARD_RECENT);
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

  getMonthStats: (period?: string): MonthStats | null => {
    ensureDashboardSchema();
    if (period && safeGet<string>(KEY_DASHBOARD_MONTH_PERIOD) !== period) {
      return null;
    }
    return safeGet<MonthStats>(KEY_DASHBOARD_MONTH_STATS);
  },

  setMonthStats: (stats: MonthStats, period?: string): void => {
    ensureDashboardSchema();
    safeSet(KEY_DASHBOARD_MONTH_STATS, stats);
    if (period) safeSet(KEY_DASHBOARD_MONTH_PERIOD, period);
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
    safeDelete(KEY_DASHBOARD_MONTH_STATS);
    safeDelete(KEY_DASHBOARD_MONTH_PERIOD);
    safeDelete(KEY_DASHBOARD_PENDING_TASKS);
    safeDelete(KEY_DASHBOARD_RECENT);
    safeDelete(KEY_DASHBOARD_SCHEMA_VERSION);
  },
};

// --- Tasks Stats Cache --------------------------------------------------------
export const tasksStatsCache = {
  get: (
    period?: string,
  ): {active: number; completed: number; total: number; completedNominal: number} => {
    if (period && safeGet<string>(KEY_TASKS_STATS_PERIOD) !== period) {
      return {active: 0, completed: 0, total: 0, completedNominal: 0};
    }
    return {
      active: safeGet<number>(KEY_TASKS_ACTIVE_COUNT) ?? 0,
      completed: safeGet<number>(KEY_TASKS_COMPLETED_COUNT) ?? 0,
      total: safeGet<number>(KEY_TASKS_TOTAL_COUNT) ?? 0,
      completedNominal: safeGet<number>(KEY_TASKS_COMPLETED_NOMINAL) ?? 0,
    };
  },

  set: (
    stats: {
      active: number;
      completed: number;
      total: number;
      completedNominal: number;
    },
    period?: string,
  ): void => {
    safeSet(KEY_TASKS_ACTIVE_COUNT, stats.active);
    safeSet(KEY_TASKS_COMPLETED_COUNT, stats.completed);
    safeSet(KEY_TASKS_TOTAL_COUNT, stats.total);
    safeSet(KEY_TASKS_COMPLETED_NOMINAL, stats.completedNominal);
    if (period) safeSet(KEY_TASKS_STATS_PERIOD, period);
  },

  clear: (): void => {
    safeDelete(KEY_TASKS_ACTIVE_COUNT);
    safeDelete(KEY_TASKS_COMPLETED_COUNT);
    safeDelete(KEY_TASKS_TOTAL_COUNT);
    safeDelete(KEY_TASKS_COMPLETED_NOMINAL);
    safeDelete(KEY_TASKS_STATS_PERIOD);
  },
};

// --- Collections Cache --------------------------------------------------------
export const collectionsCache = {
  get: (): Collection[] => safeGet<Collection[]>(KEY_COLLECTIONS) ?? [],

  set: (items: Collection[]): void => safeSet(KEY_COLLECTIONS, items),

  clear: (): void => safeDelete(KEY_COLLECTIONS),
};

// --- Period Context Cache -----------------------------------------------------
export const periodContextCache = {
  get: <T>(): T | null => safeGet<T>(KEY_PERIOD_CONTEXT),
  set: (context: unknown): void => safeSet(KEY_PERIOD_CONTEXT, context),
  clear: (): void => safeDelete(KEY_PERIOD_CONTEXT),
};

// --- Clear All (dipanggil saat logout / ganti akun) ---------------------------
export function clearAllCache(): void {
  dashboardCache.clear();
  tasksStatsCache.clear();
  collectionsCache.clear();
  periodContextCache.clear();
}
