import { create } from 'zustand';
import { tasksService } from '../services/api';
import { Task } from '@lazisnu/shared-types';

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
      const result = await tasksService.getTasks({ status, page: 1, limit: 20 });

      if (result.success && result.data) {
        const data = result.data as any;
        set({
          tasks: data.tasks || [],
          page: data.pagination?.page || 1,
          totalPages: data.pagination?.total_pages || 1,
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
      const result = await tasksService.getTasks({ page: page + 1, limit: 20 });

      if (result.success && result.data) {
        const data = result.data as any;
        set({
          tasks: [...tasks, ...(data.tasks || [])],
          page: data.pagination?.page || page + 1,
          totalPages: data.pagination?.total_pages || totalPages,
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
