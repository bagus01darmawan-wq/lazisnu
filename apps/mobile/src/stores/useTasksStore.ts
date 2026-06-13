import { create } from 'zustand';
import { tasksService } from '../services/api';
import { Task, AssignmentStatus } from '@lazisnu/shared-types';

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
        // result.data bertipe TaskListResponse — akses langsung
        set({
          tasks: result.data.tasks || [],
          page: result.data.pagination.page || 1,
          totalPages: result.data.pagination.total_pages || 1,
          isLoading: false,
        });
      } else {
        set({
          tasks: [],
          error: result.error?.message || 'Gagal memuat daftar tugas',
          isLoading: false,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan jaringan';
      set({
        tasks: [],
        error: message,
        isLoading: false,
      });
    }
  },

  loadMore: async () => {
    const { page, totalPages, tasks } = get();
    if (page >= totalPages) {return;}

    set({ isLoading: true });
    try {
      const result = await tasksService.getTasks({ page: page + 1, limit: 20 });

      if (result.success && result.data) {
        set({
          tasks: [...tasks, ...(result.data.tasks || [])],
          page: result.data.pagination.page || page + 1,
          totalPages: result.data.pagination.total_pages || totalPages,
          isLoading: false,
        });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setCurrentTask: (task: Task | null) => set({ currentTask: task }),

  markTaskComplete: (taskId: string) => {
    const { tasks } = get();
    set({
      tasks: tasks.map((t) => (t.id === taskId ? { ...t, status: AssignmentStatus.COMPLETED } : t)) as Task[],
    });
  },
}));
