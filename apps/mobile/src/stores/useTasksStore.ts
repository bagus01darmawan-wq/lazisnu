import {create} from 'zustand';
import {tasksService} from '../services/api';
import {collectionService} from '../services/api';
import {Task, AssignmentStatus} from '@lazisnu/shared-types';
import NetInfo from '@react-native-community/netinfo';
import {tasksStatsCache} from '../services/offline/cache';
import {offlineQueue} from '../services/offline/queue';
import {taskCache} from '../services/offline/tasks';
import {taskOrderCache} from '../services/offline/taskOrderCache';
import {getErrorMessage} from '../utils/error';

let latestTasksRequestId = 0;
let latestStatsRequestId = 0;

const dedupeTasksById = (tasks: Task[]): Task[] =>
  Array.from(new Map(tasks.map(task => [task.id, task])).values());

export const reconcileTasks = (serverTasks: Task[], status: 'ACTIVE' | 'COMPLETED'): Task[] => {
  serverTasks = dedupeTasksById(serverTasks);
  const activeQueue = offlineQueue.getQueue();
  const failedQueue = offlineQueue.getFailedPermanent();
  const queuedIds = new Set([
    ...activeQueue.map(item => item.assignment_id),
    ...failedQueue.map(item => item.assignment_id),
  ]);

  if (status === 'ACTIVE') {
    return serverTasks.filter(
      task => task.status === AssignmentStatus.ACTIVE && !queuedIds.has(task.id),
    );
  } else {
    const allCacheTasks = [...taskCache.getTasks('ACTIVE'), ...taskCache.getTasks('COMPLETED')];
    const allQueueItems = [...activeQueue, ...failedQueue];

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

    const serverCompleted = serverTasks.filter(
      task =>
        (task.status === AssignmentStatus.COMPLETED ||
          task.status === AssignmentStatus.UNCOLLECTED) &&
        !queuedTaskIds.has(task.id),
    );

    return dedupeTasksById([...queuedTasks, ...serverCompleted]);
  }
};

/**
 * Terapkan urutan pribadi (hasil drag petugas) di atas urutan server.
 * Tugas dengan id yang dikenal cache → ikut urutan pribadi; tugas baru
 * dari server (id tak dikenal) → tetap di bawah sesuai urutan aslinya.
 */
const applyCustomOrder = (tasks: Task[]): Task[] => {
  const order = taskOrderCache.get();
  if (order.length === 0) {
    return tasks;
  }
  const byId = new Map(tasks.map(task => [task.id, task]));
  const ordered: Task[] = [];
  for (const id of order) {
    const task = byId.get(id);
    if (task) {
      ordered.push(task);
      byId.delete(id);
    }
  }
  for (const task of tasks) {
    if (byId.has(task.id)) {
      ordered.push(task);
    }
  }
  return ordered;
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
  const localQueue = [...offlineQueue.getQueue(), ...offlineQueue.getFailedPermanent()];
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

  taskCache.saveTasks(dedupeTasksById([...serverTasks, ...queuedLocalTasks]), 'COMPLETED');
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
  setStats: (stats: {
    active: number;
    completed: number;
    total: number;
    completedNominal: number;
  }) => void;
  hydrateFromCache: () => void;
  fetchStats: () => Promise<void>;

  fetchTasks: (status?: 'ACTIVE' | 'COMPLETED') => Promise<void>;
  loadMore: (status?: 'ACTIVE' | 'COMPLETED') => Promise<void>;
  setCurrentTask: (task: Task | null) => void;
  markTaskComplete: (taskId: string, nominal?: number) => void;
  adjustCompletedNominal: (delta: number) => void;
  reorderTasks: (ids: string[]) => void;
  skipAssignment: (taskId: string) => Promise<{
    success: boolean;
    code?: string;
    error?: string;
  }>;
  completePeriod: () => Promise<{skipped: number; error?: string}>;
  resolveTaskByQRCode: (qrCode: string) => Promise<{
    success: boolean;
    task?: Task;
    error?: {
      code?: string;
      message: string;
    };
  }>;
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

  setStats: stats => {
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
    if (!isLatestRequest()) {
      return;
    }

    const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable);
    if (!isOnline) {
      get().hydrateFromCache();
      return;
    }

    try {
      const [activeRes, completedRes] = await Promise.all([
        tasksService.getTasks({status: 'ACTIVE', page: 1, limit: 1}),
        tasksService.getTasks({status: 'COMPLETED', page: 1, limit: 1}),
      ]);
      if (!isLatestRequest()) {
        return;
      }

      if (activeRes.success && completedRes.success) {
        const activeTotal = activeRes.data?.pagination?.total || 0;
        const completedTotal = completedRes.data?.pagination?.total || 0;
        const allTotal = activeTotal + completedTotal;
        const completedNom = completedRes.data?.total_nominal || 0;

        // Active queue dan quarantine sama-sama merepresentasikan tugas yang
        // sudah dijemput lokal tetapi belum mendapat ACK server.
        const queue = [...offlineQueue.getQueue(), ...offlineQueue.getFailedPermanent()];

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
    if (!isLatestRequest()) {
      return;
    }

    const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable);

    if (!isOnline) {
      const cached = taskCache.getTasks(status);
      const reconciled = reconcileTasks(cached, status);
      set({
        tasks: applyCustomOrder(reconciled),
        page: 1,
        totalPages: 1,
        isLoading: false,
        error: null,
      });
      return;
    }

    set({isLoading: true, error: null});
    const otherStatus = status === 'ACTIVE' ? 'COMPLETED' : 'ACTIVE';
    const localSnapshot = [...taskCache.getTasks('ACTIVE'), ...taskCache.getTasks('COMPLETED')];

    const [selectedResult, otherResult] = await Promise.allSettled([
      fetchAllTasksByStatus(status),
      fetchAllTasksByStatus(otherStatus),
    ]);
    if (!isLatestRequest()) {
      return;
    }

    if (selectedResult.status === 'rejected') {
      const message =
        selectedResult.reason instanceof Error
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
      tasks: applyCustomOrder(reconcileTasks(taskCache.getTasks(status), status)),
      page: 1,
      totalPages: 1,
      isLoading: false,
    });
  },
  loadMore: async (status?: 'ACTIVE' | 'COMPLETED') => {
    const {page, totalPages, tasks} = get();
    if (page >= totalPages) {
      return;
    }

    set({isLoading: true});
    try {
      const result = await tasksService.getTasks({status, page: page + 1, limit: 20});

      if (result.success && result.data) {
        const newTasks = result.data.tasks || [];
        taskCache.saveTasks(
          dedupeTasksById([...taskCache.getTasks(status || 'ACTIVE'), ...newTasks]),
          status || 'ACTIVE',
        );
        const combined = dedupeTasksById([...tasks, ...newTasks]);
        const reconciled = reconcileTasks(combined, status || 'ACTIVE');
        set({
          tasks: applyCustomOrder(reconciled),
          page: result.data.pagination.page || page + 1,
          totalPages: result.data.pagination.total_pages || totalPages,
          isLoading: false,
        });
      }
    } catch {
      set({isLoading: false});
    }
  },

  setCurrentTask: (task: Task | null) => set({currentTask: task}),

  markTaskComplete: (taskId: string, nominal = 0) => {
    const {tasks, activeCount, completedCount, totalCount, completedNominal} = get();
    const moved = taskCache.markCompleted(taskId);

    set({tasks: applyCustomOrder(tasks.filter(task => task.id !== taskId))});
    if (!moved) {
      return;
    }

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

  reorderTasks: ids => {
    const {tasks} = get();
    taskOrderCache.set(ids);
    const byId = new Map(tasks.map(task => [task.id, task]));
    const next: Task[] = [];
    for (const id of ids) {
      const task = byId.get(id);
      if (task) {
        next.push(task);
        byId.delete(id);
      }
    }
    for (const task of tasks) {
      if (byId.has(task.id)) {
        next.push(task);
      }
    }
    set({tasks: next});
  },

  adjustCompletedNominal: (delta: number) => {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }
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

  skipAssignment: async (taskId: string) => {
    try {
      const result = await collectionService.skipAssignment(taskId);
      if (result.success) {
        const {tasks, activeCount, completedCount, totalCount} = get();
        set({
          tasks: applyCustomOrder(tasks.filter(task => task.id !== taskId)),
        });
        taskCache.markCompleted(taskId);
        tasksStatsCache.set({
          active: Math.max(0, activeCount - 1),
          completed: completedCount + 1,
          total: totalCount,
          completedNominal: get().completedNominal,
        });
        set({
          activeCount: Math.max(0, activeCount - 1),
          completedCount: completedCount + 1,
        });
        return {success: true};
      }
      // G3: teruskan alasan asli dari server (mis. kaleng sudah dijemput /
      // ditolak bisnis) — UI bukan menuduh "koneksi internet" lagi.
      return {
        success: false,
        code: result.error?.code,
        error: result.error?.message || 'Gagal menandai kaleng',
      };
    } catch (error) {
      // G1: pesan jujur dari akar kesalahan (timeout, putus, dsb.)
      return {
        success: false,
        error: getErrorMessage(error, 'Gagal menandai kaleng'),
      };
    }
  },

  completePeriod: async () => {
    try {
      const result = await collectionService.completePeriod();
      if (result.success && result.data) {
        const skipped = result.data.skipped_count;
        if (skipped > 0) {
          const {completedCount, totalCount, completedNominal} = get();
          tasksStatsCache.set({
            active: 0,
            completed: completedCount + skipped,
            total: totalCount,
            completedNominal,
          });
          set({
            activeCount: 0,
            completedCount: completedCount + skipped,
          });
          get().fetchTasks('ACTIVE');
          get().fetchTasks('COMPLETED');
        }
        return {skipped};
      }
      return {skipped: 0, error: result.error?.message || 'Gagal menyelesaikan periode'};
    } catch {
      return {skipped: 0, error: 'Gagal menyelesaikan periode'};
    }
  },

  resolveTaskByQRCode: async (qrCode: string) => {
    if (!qrCode || typeof qrCode !== 'string') {
      return {
        success: false,
        error: {
          code: 'QR_INVALID',
          message: 'Format kode QR tidak valid.',
        },
      };
    }

    try {
      const netInfo = await NetInfo.fetch();
      const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable);

      if (!isOnline) {
        const cachedTask = taskCache.findByQRCode(qrCode);
        if (cachedTask) {
          return {
            success: true,
            task: cachedTask,
          };
        }
        return {
          success: false,
          error: {
            code: 'NOT_IN_CACHE',
            message:
              'Kode QR ini belum tersimpan di perangkat. Hubungkan internet sekali untuk memuat detail kaleng.',
          },
        };
      }

      const result = await tasksService.getTaskByQR(qrCode);
      if (result.success && result.data) {
        const task = result.data as Task;
        const currentActive = taskCache.getTasks('ACTIVE');
        taskCache.saveTasks([task, ...currentActive], 'ACTIVE');
        return {
          success: true,
          task,
        };
      }

      return {
        success: false,
        error: {
          code: result.error?.code || 'QR_INVALID',
          message: result.error?.message || 'Kode QR tidak valid.',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal memproses QR code';
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message,
        },
      };
    }
  },
}));
