import { create } from 'zustand';
import { dashboardService } from '../services/api';
import { TodayStats, WeekStats, DashboardTaskItem, RecentCollectionSummary } from '@lazisnu/shared-types';
import NetInfo from '@react-native-community/netinfo';
import { dashboardCache } from '../services/offline/cache';
import { offlineQueue } from '../services/offline/queue';

const isToday = (dateStr: string): boolean => {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getDate() === now.getDate() &&
         d.getMonth() === now.getMonth() &&
         d.getFullYear() === now.getFullYear();
};

const isThisWeek = (dateStr: string): boolean => {
  const d = new Date(dateStr);
  const now = new Date();

  // Get start of this week (Sunday)
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  // Get end of this week (Saturday)
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const time = d.getTime();
  return time >= startOfWeek.getTime() && time <= endOfWeek.getTime();
};

function mergeDashboardData(
  today_stats: TodayStats,
  week_stats: WeekStats,
  pending_tasks: DashboardTaskItem[],
  recent_collections: RecentCollectionSummary[]
) {
  const activeQueue = offlineQueue.getQueue();
  const failedQueue = offlineQueue.getFailedPermanent();
  const allLocal = [...activeQueue, ...failedQueue];

  // 1. Merge today stats
  let collectedToday = today_stats.collected;
  let nominalToday = today_stats.total_nominal;
  let remainingToday = today_stats.remaining;

  // 2. Merge week stats
  let collectedWeek = week_stats.collected;
  let nominalWeek = week_stats.total_nominal;

  for (const item of allLocal) {
    if (isToday(item.collected_at)) {
      collectedToday += 1;
      nominalToday += item.nominal;
      remainingToday = Math.max(0, remainingToday - 1);
    }
    if (isThisWeek(item.collected_at)) {
      collectedWeek += 1;
      nominalWeek += item.nominal;
    }
  }

  // 3. Filter pending tasks
  const queuedAssignmentIds = new Set(allLocal.map(item => item.assignment_id));
  const filteredTasks = pending_tasks.filter(task => !queuedAssignmentIds.has(task.id));

  // 4. Merge recent collections
  const localRecent: RecentCollectionSummary[] = [];
  const tasks = require('../services/offline/tasks').taskCache.getTasks();

  for (const item of allLocal) {
    const task = tasks.find((t: any) => t.id === item.assignment_id);
    localRecent.push({
      id: item.offline_id,
      qr_code: task?.qr_code || 'Offline',
      owner_name: task?.owner_name || 'Kaleng Masukan QR',
      nominal: item.nominal,
      collected_at: item.collected_at,
    });
  }

  const mergedRecentMap = new Map<string, RecentCollectionSummary>();
  for (const item of localRecent) {
    mergedRecentMap.set(item.id, item);
  }
  for (const item of recent_collections) {
    if (!mergedRecentMap.has(item.id)) {
      mergedRecentMap.set(item.id, item);
    }
  }

  const mergedRecent = Array.from(mergedRecentMap.values());
  mergedRecent.sort((a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime());

  return {
    todayStats: {
      collected: collectedToday,
      total_nominal: nominalToday,
      remaining: remainingToday,
    },
    weekStats: {
      collected: collectedWeek,
      total_nominal: nominalWeek,
    },
    pendingTasks: filteredTasks,
    recentCollections: mergedRecent.slice(0, 10),
  };
}

interface DashboardState {
  todayStats: TodayStats | null;
  weekStats: WeekStats | null;
  pendingTasks: DashboardTaskItem[];
  recentCollections: RecentCollectionSummary[];
  isLoading: boolean;
  error: string | null;

  fetchDashboard: () => Promise<void>;
  refreshStats: () => Promise<void>;
  hydrateFromCache: () => void;
  optimisticUpdateStats: (nominal: number) => void;
  optimisticRemoveTask: (assignmentId: string) => void;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  todayStats: null,
  weekStats: null,
  pendingTasks: [],
  recentCollections: [],
  isLoading: false,
  error: null,

  fetchDashboard: async () => {
    const netInfo = await NetInfo.fetch();
    const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable);

    if (!isOnline) {
      const cachedToday = dashboardCache.getTodayStats() || {
        collected: 0,
        total_nominal: 0,
        remaining: 0,
      };
      const cachedWeek = dashboardCache.getWeekStats() || { collected: 0, total_nominal: 0 };
      const cachedTasks = dashboardCache.getPendingTasks();
      const cachedRecent = dashboardCache.getRecentCollections();

      const merged = mergeDashboardData(
        cachedToday,
        cachedWeek,
        cachedTasks,
        cachedRecent
      );
      set({
        ...merged,
        isLoading: false,
      });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const result = await dashboardService.getDashboard();

      if (result.success && result.data) {
        const { today_stats, week_stats, pending_tasks, recent_collections } = result.data;

        dashboardCache.setTodayStats(today_stats);
        dashboardCache.setWeekStats(week_stats);
        dashboardCache.setPendingTasks(pending_tasks || []);
        dashboardCache.setRecentCollections(recent_collections || []);

        const merged = mergeDashboardData(
          today_stats,
          week_stats,
          pending_tasks || [],
          recent_collections || []
        );

        set({
          ...merged,
          isLoading: false,
        });
      } else {
        set({
          error: result.error?.message || 'Gagal memuat dashboard',
          isLoading: false,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan jaringan';
      set({ error: message, isLoading: false });
    }
  },

  refreshStats: async () => {
    const { fetchDashboard } = get();
    await fetchDashboard();
  },

  hydrateFromCache: () => {
    const cachedToday = dashboardCache.getTodayStats() || {
      collected: 0,
      total_nominal: 0,
      remaining: 0,
    };
    const cachedWeek = dashboardCache.getWeekStats() || { collected: 0, total_nominal: 0 };
    const cachedTasks = dashboardCache.getPendingTasks();
    const cachedRecent = dashboardCache.getRecentCollections();

    const merged = mergeDashboardData(
      cachedToday,
      cachedWeek,
      cachedTasks,
      cachedRecent
    );
    set(merged);
  },

  optimisticUpdateStats: (nominal: number) => {
    const { todayStats } = get();
    if (!todayStats) { return; }
    const updated: TodayStats = {
      collected: todayStats.collected + 1,
      total_nominal: todayStats.total_nominal + nominal,
      remaining: Math.max(0, todayStats.remaining - 1),
    };
    // Cache tetap baseline server; transaksi lokal hanya digabung saat render/refresh.
    set({ todayStats: updated });
  },

  optimisticRemoveTask: (assignmentId: string) => {
    const { pendingTasks } = get();
    const updated = pendingTasks.filter(t => t.id !== assignmentId);
    set({ pendingTasks: updated });
  },
}));
