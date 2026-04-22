import { create } from 'zustand';
import { dashboardService } from '../services/api';
import { Task, Collection, TodayStats, WeekStats } from '@lazisnu/shared-types';

interface DashboardState {
  todayStats: TodayStats | null;
  weekStats: WeekStats | null;
  pendingTasks: Task[];
  recentCollections: Collection[];
  isLoading: boolean;
  error: string | null;

  fetchDashboard: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  todayStats: null,
  weekStats: null,
  pendingTasks: [],
  recentCollections: [],
  isLoading: false,
  error: null,

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await dashboardService.getDashboard();

      if (result.success && result.data) {
        const data = result.data as any;
        set({
          todayStats: data.today_stats,
          weekStats: data.week_stats,
          pendingTasks: data.pending_tasks || [],
          recentCollections: data.recent_collections || [],
          isLoading: false,
        });
      } else {
        set({ error: result.error?.message || 'Gagal memuat dashboard', isLoading: false });
      }
    } catch (error: any) {
      set({ error: error.message || 'Terjadi kesalahan', isLoading: false });
    }
  },

  refreshStats: async () => {
    const { todayStats } = get();
    if (todayStats) {
      set({
        todayStats: {
          ...todayStats,
          collected: todayStats.collected + 1,
          remaining: Math.max(0, todayStats.remaining - 1),
        },
      });
    }
  },
}));
