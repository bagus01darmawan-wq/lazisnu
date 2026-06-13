import { create } from 'zustand';
import { dashboardService } from '../services/api';
import { TodayStats, WeekStats, DashboardTaskItem, RecentCollectionSummary } from '@lazisnu/shared-types';

interface DashboardState {
  todayStats: TodayStats | null;
  weekStats: WeekStats | null;
  pendingTasks: DashboardTaskItem[];
  recentCollections: RecentCollectionSummary[];
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
        // result.data bertipe DashboardResponse — akses snake_case langsung
        const { today_stats, week_stats, pending_tasks, recent_collections } = result.data;
        set({
          todayStats: today_stats,
          weekStats: week_stats,
          pendingTasks: pending_tasks || [],
          recentCollections: recent_collections || [],
          isLoading: false,
        });
      } else {
        set({ error: result.error?.message || 'Gagal memuat dashboard', isLoading: false });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan';
      set({ error: message, isLoading: false });
    }
  },

  refreshStats: async () => {
    // Re-fetch dari server agar data pasti sinkron.
    // Optimistic update sebelumnya (collected+1, remaining-1) rentan drift
    // karena tidak ada reconciliation dengan angka server.
    const { fetchDashboard } = get();
    await fetchDashboard();
  },
}));
