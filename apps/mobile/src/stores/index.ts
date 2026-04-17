// Zustand Store - Global State Management

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Task, Collection, TodayStats, WeekStats } from '../types';

// Auth Store
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (phone: string, password: string) => Promise<boolean>;
  requestOTP: (phone: string) => Promise<boolean>;
  verifyOTP: (phone: string, otp: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (phone: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { authService, setToken: saveToken } = require('../services/api');
      const result = await authService.login(phone, password);

      if (result.success && result.data) {
        await saveToken(result.data.access_token);
        set({
          user: result.data.user,
          token: result.data.access_token,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      } else {
        set({ error: result.error?.message || 'Login gagal', isLoading: false });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message || 'Terjadi kesalahan', isLoading: false });
      return false;
    }
  },

  requestOTP: async (phone: string) => {
    set({ isLoading: true, error: null });
    try {
      const { authService } = require('../services/api');
      const result = await authService.requestOTP(phone);

      if (result.success) {
        set({ isLoading: false });
        return true;
      } else {
        set({ error: result.error?.message || 'Gagal kirim OTP', isLoading: false });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message || 'Terjadi kesalahan', isLoading: false });
      return false;
    }
  },

  verifyOTP: async (phone: string, otp: string) => {
    set({ isLoading: true, error: null });
    try {
      const { authService, setToken: saveToken } = require('../services/api');
      const result = await authService.verifyOTP(phone, otp);

      if (result.success && result.data) {
        await saveToken(result.data.access_token);
        set({
          user: result.data.user,
          token: result.data.access_token,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      } else {
        set({ error: result.error?.message || 'OTP tidak valid', isLoading: false });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message || 'Terjadi kesalahan', isLoading: false });
      return false;
    }
  },

  logout: async () => {
    const { clearToken } = require('../services/api');
    await clearToken();
    await AsyncStorage.removeItem('user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  setUser: (user: User) => set({ user }),

  clearError: () => set({ error: null }),
}));

// Dashboard Store
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
      const { dashboardService } = require('../services/api');
      const result = await dashboardService.getDashboard();

      if (result.success && result.data) {
        set({
          todayStats: result.data.today_stats,
          weekStats: result.data.week_stats,
          pendingTasks: result.data.pending_tasks || [],
          recentCollections: result.data.recent_collections || [],
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
    const { todayStats, pendingTasks } = get();
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

// Tasks Store
interface TasksState {
  tasks: Task[];
  currentTask: Task | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  totalPages: number;

  fetchTasks: (status?: string) => Promise<void>;
  loadMore: () => Promise<void>;
  setCurrentTask: (task: Task | null) => void;
  markTaskComplete: (taskId: string) => void;
}

export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  currentTask: null,
  isLoading: false,
  error: null,
  page: 1,
  totalPages: 1,

  fetchTasks: async (status = 'ACTIVE') => {
    set({ isLoading: true, error: null });
    try {
      const { tasksService } = require('../services/api');
      const result = await tasksService.getTasks({ status, page: 1, limit: 20 });

      if (result.success && result.data) {
        set({
          tasks: result.data.tasks || [],
          page: result.data.pagination?.page || 1,
          totalPages: result.data.pagination?.total_pages || 1,
          isLoading: false,
        });
      } else {
        set({ error: result.error?.message || 'Gagal memuat tugas', isLoading: false });
      }
    } catch (error: any) {
      set({ error: error.message || 'Terjadi kesalahan', isLoading: false });
    }
  },

  loadMore: async () => {
    const { page, totalPages, tasks } = get();
    if (page >= totalPages) return;

    set({ isLoading: true });
    try {
      const { tasksService } = require('../services/api');
      const result = await tasksService.getTasks({ page: page + 1, limit: 20 });

      if (result.success && result.data) {
        set({
          tasks: [...tasks, ...(result.data.tasks || [])],
          page: result.data.pagination?.page || page + 1,
          totalPages: result.data.pagination?.total_pages || totalPages,
          isLoading: false,
        });
      }
    } catch (error: any) {
      set({ isLoading: false });
    }
  },

  setCurrentTask: (task: Task | null) => set({ currentTask: task }),

  markTaskComplete: (taskId: string) => {
    const { tasks } = get();
    set({
      tasks: tasks.map((t) => (t.id === taskId ? { ...t, status: 'COMPLETED' } : t)),
    });
  },
}));

// Collection Store
interface CollectionState {
  isSubmitting: boolean;
  lastSubmitted: Collection | null;
  error: string | null;

  submitCollection: (data: {
    assignment_id: string;
    can_id: string;
    amount: number;
    payment_method: 'CASH' | 'TRANSFER';
    collected_at: string;
    latitude?: number;
    longitude?: number;
    offline_id: string;
  }) => Promise<boolean>;

  reset: () => void;
}

export const useCollectionStore = create<CollectionState>((set) => ({
  isSubmitting: false,
  lastSubmitted: null,
  error: null,

  submitCollection: async (data) => {
    set({ isSubmitting: true, error: null });
    try {
      // First, save locally
      const { collections: storage } = require('./offlineStorage');
      await storage.save({
        ...data,
        device_info: {
          model: require('react-native').Platform.Version,
          os_version: require('react-native').Platform.OS,
          app_version: '1.0.0',
        },
      });

      // Try to sync if online
      const { sync } = require('./offlineStorage');
      const isOnline = await sync.isOnline();

      if (isOnline) {
        const result = await sync.sync();
        if (result.success > 0) {
          set({ isSubmitting: false, lastSubmitted: data as unknown as Collection });
          return true;
        }
      }

      // If offline or sync failed, data is saved locally
      set({ isSubmitting: false, lastSubmitted: data as unknown as Collection });
      return true;
    } catch (error: any) {
      set({ error: error.message || 'Gagal menyimpan data', isSubmitting: false });
      return false;
    }
  },

  reset: () => set({ isSubmitting: false, lastSubmitted: null, error: null }),
}));

// Sync Store
interface SyncState {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: string | null;
  oldestPending: string | null;
  error: string | null;

  checkStatus: () => Promise<void>;
  triggerSync: () => Promise<{ success: number; failed: number }>;
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingCount: 0,
  isSyncing: false,
  lastSyncAt: null,
  oldestPending: null,
  error: null,

  checkStatus: async () => {
    try {
      const { collections, sync } = require('./offlineStorage');
      const count = await collections.getUnsyncedCount();
      const status = await sync.getStatus();

      set({
        pendingCount: count,
        oldestPending: status.oldestPending,
      });
    } catch (error) {
      console.error('Failed to check sync status:', error);
    }
  },

  triggerSync: async () => {
    set({ isSyncing: true, error: null });
    try {
      const { sync } = require('./offlineStorage');
      const result = await sync.sync();

      set({
        isSyncing: false,
        lastSyncAt: new Date().toISOString(),
        pendingCount: 0,
      });

      return result;
    } catch (error: any) {
      set({ isSyncing: false, error: error.message });
      return { success: 0, failed: 0 };
    }
  },
}));

export default {
  useAuthStore,
  useDashboardStore,
  useTasksStore,
  useCollectionStore,
  useSyncStore,
};