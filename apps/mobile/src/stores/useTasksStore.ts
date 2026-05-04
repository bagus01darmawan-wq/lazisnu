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

    // DATA SIMULASI UNTUK DEVELOPMENT
    const mockTasks: Task[] = [
      {
        id: '1',
        qr_code: 'PNG-01-001',
        owner_name: 'Bpk. Haji Ahmad',
        owner_phone: '08123456789',
        owner_address: 'Jl. Melati No. 12, Sawangan',
        status: 'ACTIVE' as any,
        assigned_at: new Date().toISOString(),
        period: 'Mei 2024',
      },
      {
        id: '2',
        qr_code: 'PNG-01-002',
        owner_name: 'Ibu Fatimah',
        owner_phone: '08123456780',
        owner_address: 'Dusun Domiyang RT 02/03',
        status: 'ACTIVE' as any,
        assigned_at: new Date().toISOString(),
        period: 'Mei 2024',
      },
      {
        id: '3',
        qr_code: 'PNG-01-003',
        owner_name: 'Warung Bu Siti',
        owner_phone: '08123456781',
        owner_address: 'Pasar Paninggaran Blok A',
        status: 'COMPLETED' as any,
        assigned_at: new Date().toISOString(),
        period: 'Mei 2024',
      },
      {
        id: '4',
        qr_code: 'PNG-01-004',
        owner_name: 'Mas Agus',
        owner_phone: '08123456782',
        owner_address: 'Jl. Raya Kaliombo Km 5',
        status: 'ACTIVE' as any,
        assigned_at: new Date().toISOString(),
        period: 'Mei 2024',
      },
    ];

    try {
      // Filter mock data based on requested status (if not 'ALL')
      const filteredMock = status === 'ALL'
        ? mockTasks
        : mockTasks.filter(t => t.status === status);

      const result = await tasksService.getTasks({ status, page: 1, limit: 20 });

      if (result.success && result.data) {
        const data = result.data as any;
        const realTasks = data.tasks || [];
        set({
          tasks: realTasks.length > 0 ? realTasks : filteredMock,
          page: data.pagination?.page || 1,
          totalPages: data.pagination?.total_pages || 1,
          isLoading: false,
        });
      } else {
        set({
          tasks: filteredMock,
          isLoading: false,
        });
      }
    } catch (error: any) {
      set({
        tasks: status === 'ALL' ? mockTasks : mockTasks.filter(t => t.status === status),
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
