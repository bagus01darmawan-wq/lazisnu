import { create } from 'zustand';
import { tasksService } from '../services/api';
import { Task, AssignmentStatus } from '@lazisnu/shared-types';
import NetInfo from '@react-native-community/netinfo';
import { tasksStatsCache } from '../services/offline/cache';
import { offlineQueue } from '../services/offline/queue';
import { taskCache } from '../services/offline/tasks';

let latestTasksRequestId = 0;
let latestStatsRequestId = 0;

const dedupeTasksById = (tasks: Task[]): Task[] => Array.from(new Map(tasks.map(task => [task.id, task])).values());

export const reconcileTasks = (serverTasks: Task[], status: 'ACTIVE' | 'COMPLETED'): Task[] => {
  serverTasks = dedupeTasksById(serverTasks);
  const activeQueue = offlineQueue.getQueue();
  const failedQueue = offlineQueue.getFailedPermanent();
  const queuedIds = new Set([
    ...activeQueue.map(item => item.assignment_id),
    ...failedQueue.map(item => item.assignment_id),
  ]);

  if (status === 'ACTIVE') {
    // Hilangkan task yang sudah ada di queue (sudah dijemput offline)
    return serverTasks.filter(task => task.status === AssignmentStatus.ACTIVE && !queuedIds.has(task.id));
  } else {
    // COMPLETED: gabungkan 3 sumber:
    // 1. Task dari queue lokal (belum sync) — tampilkan sebagai COMPLETED
    // 2. Task dari server yang memang COMPLETED
    // 3. Task dari taskCache COMPLETED (termasuk yang dipindahkan via markCompleted offline)
    const allCacheTasks = [
      ...taskCache.getTasks('ACTIVE'),
      ...taskCache.getTasks('COMPLETED'),
    ];
    const allQueueItems = [...activeQueue, ...failedQueue];

    // Kumpulkan task dari queue
    const queuedTasks: Task[] = [];
    const queuedTaskIds = new Set<string>();
    for (const item of allQueueItems) {
      const cached = allCacheTasks.find(t => t.id === item.assignment_id);
      if (cached) {
        queuedTasks.push({
          ...cached,
          status: AssignmentStatus.COMPLETED,
        });
        queuedTaskIds.add(cached.id);
      }
    }

    // Server completed — exclude yang sudah ada di queuedTasks (mencegah duplikat)
    const serverCompleted = serverTasks.filter(
      task => task.status === AssignmentStatus.COMPLETED && !queuedTaskIds.has(task.id),
    );

    return dedupeTasksById([...queuedTasks, ...serverCompleted]);
  }
};

const TASK_PAGE_LIMIT = 1000;

async function fetchAllTasksByStatus(status: 'ACTIVE' | 'COMPLETED'): Promise<Task[]> {
  const firstPage = await tasksService.getTasks({
    status,
    page: 1,
    limit: TASK_PAGE_LIMIT,
  });
  if (!firstPage.success || !firstPage.data) {
    throw new Error(firstPage.error?.message || `Gagal memuat tugas ${status}`);
  }

  let tasks = firstPage.data.tasks || [];
  const totalPages = firstPage.data.pagination.total_pages || 1;
  if (totalPages > 1) {
    const remainingPages = await Promise.all(
      Array.from({length: totalPages - 1}, (_, index) =>
        tasksService.getTasks({
          status,
          page: index + 2,
          limit: TASK_PAGE_LIMIT,
        }),
      ),
    );

    for (const pageResult of remainingPages) {
      if (!pageResult.success || !pageResult.data) {
        throw new Error(pageResult.error?.message || `Cache tugas ${status} tidak lengkap`);
      }
      tasks = [...tasks, ...(pageResult.data.tasks || [])];
    }
  }

  return dedupeTasksById(tasks);
}

function saveServerTasksPreservingLocal(
  serverTasks: Task[],
  status: 'ACTIVE' | 'COMPLETED',
  localSnapshot: Task[],
): void {
  const localQueue = [
    ...offlineQueue.getQueue(),
    ...offlineQueue.getFailedPermanent(),
  ];
  const queuedAssignmentIds = new Set(localQueue.map(item => item.assignment_id));

  if (status === 'ACTIVE') {
    taskCache.saveTasks(
      serverTasks.filter(task => !queuedAssignmentIds.has(task.id)),
      'ACTIVE',
    );
    return;
  }

  const queuedLocalTasks = localSnapshot
    .filter(task => queuedAssignmentIds.has(task.id))
    .map(task => ({...task, status: AssignmentStatus.COMPLETED}));

  taskCache.saveTasks(
    dedupeTasksById([...serverTasks, ...queuedLocalTasks]),
    'COMPLETED',
  );
}
interface TasksState {
  tasks: Task[];
  currentTask: Task | null;
  isLoading: boolean;
  error: string | null;
  page: number;
  totalPages: number;

  activeCount: number;
  completedCount: number;
  totalCount: number;
  completedNominal: number;
  setStats: (stats: { active: number; completed: number; total: number; completedNominal: number }) => void;
  hydrateFromCache: () => void;
  fetchStats: () => Promise<void>;

  fetchTasks: (status?: 'ACTIVE' | 'COMPLETED') => Promise<void>;
  loadMore: (status?: 'ACTIVE' | 'COMPLETED') => Promise<void>;
  setCurrentTask: (task: Task | null) => void;
  markTaskComplete: (taskId: string, nominal?: number) => void;
  adjustCompletedNominal: (delta: number) => void;
}


export const useTasksStore = create<TasksState>((set, get) => ({
  tasks: [],
  currentTask: null,
  isLoading: false,
  error: null,
  page: 1,
  totalPages: 1,
  // Cache MMKV baru dibaca setelah initEncryptedStorage() selesai.
  activeCount: 0,
  completedCount: 0,
  totalCount: 0,
  completedNominal: 0,

  setStats: (stats) => {
    // Simpan ke MMKV + update RAM
    tasksStatsCache.set(stats);
    set({
      activeCount: stats.active,
      completedCount: stats.completed,
      totalCount: stats.total,
      completedNominal: stats.completedNominal,
    });
  },

  hydrateFromCache: () => {
    const cachedStats = tasksStatsCache.get();
    set({
      activeCount: cachedStats.active,
      completedCount: cachedStats.completed,
      totalCount: cachedStats.total,
      completedNominal: cachedStats.completedNominal,
    });
  },

  fetchStats: async () => {
    const requestId = ++latestStatsRequestId;
    const isLatestRequest = () => requestId === latestStatsRequestId;
    const netInfo = await NetInfo.fetch();
    if (!isLatestRequest()) {return;}

    const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable);
    if (!isOnline) {
      get().hydrateFromCache();
      return;
    }

    try {
      const [activeRes, completedRes] = await Promise.all([
        tasksService.getTasks({ status: 'ACTIVE', page: 1, limit: 1 }),
        tasksService.getTasks({ status: 'COMPLETED', page: 1, limit: 1 }),
      ]);
      if (!isLatestRequest()) {return;}

      if (activeRes.success && completedRes.success) {
        const activeTotal = activeRes.data?.pagination?.total || 0;
        const completedTotal = completedRes.data?.pagination?.total || 0;
        const allTotal = activeTotal + completedTotal;
        const completedNom = completedRes.data?.total_nominal || 0;

        // Active queue dan quarantine sama-sama merepresentasikan tugas yang
        // sudah dijemput lokal tetapi belum mendapat ACK server.
        const queue = [
          ...offlineQueue.getQueue(),
          ...offlineQueue.getFailedPermanent(),
        ];

        const uniqueMap = new Map<string, (typeof queue)[number]>();
        for (const item of queue) {
          uniqueMap.set(item.assignment_id, item);
        }
        const uniqueItems = Array.from(uniqueMap.values());
        const pendingCount = uniqueItems.length;
        const pendingNominal = uniqueItems.reduce((sum, item) => sum + item.nominal, 0);

        // Rekonsiliasi data server dengan antrean lokal
        const reconciledActive = Math.max(0, activeTotal - pendingCount);
        const reconciledCompleted = completedTotal + pendingCount;
        const reconciledCompletedNominal = completedNom + pendingNominal;

        get().setStats({
          active: reconciledActive,
          completed: reconciledCompleted,
          total: allTotal,
          completedNominal: reconciledCompletedNominal,
        });
      }
    } catch (e) {
      if (isLatestRequest()) {
        console.warn('Gagal memuat statistik tugas online', e);
      }
    }
  },
  fetchTasks: async (status: 'ACTIVE' | 'COMPLETED' = 'ACTIVE') => {
    const requestId = ++latestTasksRequestId;
    const isLatestRequest = () => requestId === latestTasksRequestId;
    const netInfo = await NetInfo.fetch();
    if (!isLatestRequest()) {return;}

    const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable);

    if (!isOnline) {
      const cached = taskCache.getTasks(status);
      const reconciled = reconcileTasks(cached, status);
      set({
        tasks: reconciled,
        page: 1,
        totalPages: 1,
        isLoading: false,
        error: null,
      });
      return;
    }

    set({isLoading: true, error: null});
    const otherStatus = status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE';
    const localSnapshot = [
      ...taskCache.getTasks('ACTIVE'),
      ...taskCache.getTasks('COMPLETED'),
    ];

    const [selectedResult, otherResult] = await Promise.allSettled([
      fetchAllTasksByStatus(status),
      fetchAllTasksByStatus(otherStatus),
    ]);
    if (!isLatestRequest()) {return;}

    if (selectedResult.status === 'rejected') {
      const message = selectedResult.reason instanceof Error
        ? selectedResult.reason.message
        : 'Terjadi kesalahan jaringan';
      set({error: message, isLoading: false});
      return;
    }

    // Simpan status terpilih dan status lawan tanpa menimpa metadata task
    // yang sudah dipindahkan lokal selama request masih berjalan.
    saveServerTasksPreservingLocal(selectedResult.value, status, localSnapshot);
    if (otherResult.status === 'fulfilled') {
      saveServerTasksPreservingLocal(otherResult.value, otherStatus, localSnapshot);
    }

    set({
      tasks: reconcileTasks(taskCache.getTasks(status), status),
      page: 1,
      totalPages: 1,
      isLoading: false,
    });
  },
  loadMore: async (status?: 'ACTIVE' | 'COMPLETED') => {
    const { page, totalPages, tasks } = get();
    if (page >= totalPages) { return; }

    set({ isLoading: true });
    try {
      const result = await tasksService.getTasks({ status, page: page + 1, limit: 20 });

      if (result.success && result.data) {
        const newTasks = result.data.tasks || [];
        taskCache.saveTasks(dedupeTasksById([...taskCache.getTasks(status || 'ACTIVE'), ...newTasks]), status || 'ACTIVE');
        const combined = dedupeTasksById([...tasks, ...newTasks]);
        const reconciled = reconcileTasks(combined, status || 'ACTIVE');
        set({
          tasks: reconciled,
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

  markTaskComplete: (taskId: string, nominal = 0) => {
    const {tasks, activeCount, completedCount, totalCount, completedNominal} = get();
    const moved = taskCache.markCompleted(taskId);

    set({tasks: tasks.filter(task => task.id !== taskId)});
    if (!moved) { return; }

    const stats = {
      active: Math.max(0, activeCount - 1),
      completed: completedCount + 1,
      total: totalCount,
      completedNominal: completedNominal + nominal,
    };
    tasksStatsCache.set(stats);
    set({
      activeCount: stats.active,
      completedCount: stats.completed,
      completedNominal: stats.completedNominal,
    });
  },

  adjustCompletedNominal: (delta: number) => {
    if (!Number.isFinite(delta) || delta === 0) { return; }
    const {activeCount, completedCount, totalCount, completedNominal} = get();
    const nextNominal = Math.max(0, completedNominal + delta);
    tasksStatsCache.set({
      active: activeCount,
      completed: completedCount,
      total: totalCount,
      completedNominal: nextNominal,
    });
    set({completedNominal: nextNominal});
  },
}));
