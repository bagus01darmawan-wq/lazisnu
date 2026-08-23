import NetInfo from '@react-native-community/netinfo';
import {AssignmentStatus, Collection, SyncStatus, Task} from '@lazisnu/shared-types';
import {getOfflineStorage, initializeOfflineStorage} from '../../src/services/offline/mmkv';
import {offlineQueue, QueuedCollection} from '../../src/services/offline/queue';
import {taskCache} from '../../src/services/offline/tasks';
import {dashboardCache} from '../../src/services/offline/cache';
import {collectionService, dashboardService, tasksService} from '../../src/services/api';
import {syncService} from '../../src/services/offline/sync';
import {useSyncStore, getTotalSyncIssueCount} from '../../src/stores/useSyncStore';
import {mergeCollectionsWithQueues, useCollectionsStore} from '../../src/stores/useCollectionStore';
import {useTasksStore} from '../../src/stores/useTasksStore';
import {useDashboardStore} from '../../src/stores/useDashboardStore';
import {updatePendingCollectionNominal} from '../../src/screens/HistoryScreen';
import api from '../../src/services/api';

const mmkvMock = require('react-native-mmkv');

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });
  return {promise, resolve};
};

const waitForMockCalls = async (mock: jest.Mock, count: number) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (mock.mock.calls.length >= count) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error('Mock hanya dipanggil ' + mock.mock.calls.length + '/' + count + ' kali');
};

const makeTask = (id: string, status: AssignmentStatus = AssignmentStatus.ACTIVE): Task => ({
  id,
  can_id: `can-${id}`,
  qr_code: `QR-${id}`,
  owner_name: `Donatur ${id}`,
  owner_phone: '081234567890',
  owner_address: `Alamat ${id}`,
  status,
  assigned_at: '2026-07-01T00:00:00.000Z',
  period: '2026-07',
});

const makeQueueItem = (
  offlineId: string,
  assignmentId: string,
  canId = `can-${assignmentId}`,
): QueuedCollection => ({
  offline_id: offlineId,
  assignment_id: assignmentId,
  can_id: canId,
  nominal: 50000,
  collected_at: '2026-07-15T02:00:00.000Z',
});

const makeServerCollection = (overrides: Partial<Collection> = {}): Collection => ({
  id: 'server-1',
  offline_id: 'server-offline-1',
  assignment_id: 'assignment-server-1',
  can_id: 'can-server-1',
  officer_id: 'officer-1',
  nominal: 50000,
  collected_at: '2026-07-15T02:00:00.000Z',
  sync_status: SyncStatus.COMPLETED,
  can: {
    qr_code: 'QR-SERVER-1',
    owner_name: 'Donatur Server',
    owner_address: 'Alamat Server',
  },
  ...overrides,
});

describe('offline collection regression', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mmkvMock.__resetMock();
    initializeOfflineStorage('test-key');
    useSyncStore.setState({
      pendingCount: 0,
      permanentFailedCount: 0,
      isSyncing: false,
      progress: 0,
      lastSyncAt: null,
      oldestPending: null,
      error: null,
    });
    useTasksStore.setState({
      tasks: [],
      currentTask: null,
      isLoading: false,
      error: null,
      page: 1,
      totalPages: 1,
      activeCount: 0,
      completedCount: 0,
      totalCount: 0,
      completedNominal: 0,
    });
    useDashboardStore.setState({
      todayStats: null,
      weekStats: null,
      pendingTasks: [],
      recentCollections: [],
      isLoading: false,
      error: null,
    });
    useCollectionsStore.setState({
      collections: [],
      isLoading: false,
      error: null,
      page: 1,
      totalPages: 1,
      total: 0,
    });
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
  });

  it('memisahkan cache ACTIVE/COMPLETED dan memindahkan task secara lokal', () => {
    const activeTasks = Array.from({length: 30}, (_, index) => makeTask(`assignment-${index + 1}`));
    const completed = makeTask('completed-1', AssignmentStatus.COMPLETED);

    taskCache.saveTasks(activeTasks, 'ACTIVE');
    taskCache.saveTasks([completed], 'COMPLETED');

    expect(taskCache.getTasks('ACTIVE')).toHaveLength(30);
    expect(taskCache.getTasks('COMPLETED')).toEqual([completed]);
    expect(taskCache.markCompleted('assignment-1')).toBe(true);
    expect(taskCache.getTasks('ACTIVE')).toHaveLength(29);
    expect(taskCache.getTasks('COMPLETED').map(task => task.id)).toEqual(
      expect.arrayContaining(['assignment-1', 'completed-1']),
    );
  });

  it('fetch online menyimpan semua task dan mempertahankan task queue dari overwrite', async () => {
    const queuedTask = makeTask('assignment-queued');
    const remainingTasks = Array.from({length: 29}, (_, index) =>
      makeTask(`assignment-active-${index + 1}`),
    );
    const serverActiveTasks = [queuedTask, ...remainingTasks];
    taskCache.saveTasks([queuedTask], 'ACTIVE');
    offlineQueue.enqueue(makeQueueItem('offline-queued', queuedTask.id));

    jest.spyOn(tasksService, 'getTasks').mockImplementation(async params => {
      if (params?.status === 'ACTIVE') {
        return {
          success: true,
          data: {
            tasks: serverActiveTasks,
            pagination: {page: 1, limit: 1000, total: 30, total_pages: 1},
          },
        };
      }
      return {
        success: true,
        data: {
          tasks: [],
          total_nominal: 0,
          pagination: {page: 1, limit: 1000, total: 0, total_pages: 1},
        },
      };
    });

    await useTasksStore.getState().fetchTasks('ACTIVE');

    expect(taskCache.getTasks('ACTIVE')).toHaveLength(29);
    expect(taskCache.getTasks('ACTIVE').map(task => task.id)).toEqual(
      remainingTasks.map(task => task.id),
    );
    expect(taskCache.getTasks('COMPLETED').map(task => task.id)).toContain(queuedTask.id);

    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });
    await useTasksStore.getState().fetchTasks('COMPLETED');
    expect(useTasksStore.getState().tasks.map(task => task.id)).toContain(queuedTask.id);
  });

  it('tidak menghapus queue dari cache PENDING atau kecocokan can_id/QR', () => {
    const local = makeQueueItem('offline-new', 'assignment-new', 'can-reused');
    offlineQueue.enqueue(local);

    const cachedPending = makeServerCollection({
      id: local.offline_id,
      offline_id: local.offline_id,
      assignment_id: local.assignment_id,
      can_id: local.can_id,
      nominal: 10000,
      sync_status: SyncStatus.PENDING,
    });
    const fromCache = mergeCollectionsWithQueues([cachedPending], false);
    expect(offlineQueue.getQueue()).toHaveLength(1);
    expect(fromCache.find(item => item.id === local.offline_id)?.nominal).toBe(local.nominal);

    const oldTransaction = makeServerCollection({
      id: 'server-old',
      offline_id: 'offline-old',
      assignment_id: 'assignment-old',
      can_id: local.can_id,
      can: {
        qr_code: 'QR-assignment-new',
        owner_name: 'Transaksi Lama',
        owner_address: 'Alamat Lama',
      },
    });
    mergeCollectionsWithQueues([oldTransaction], true);
    expect(offlineQueue.getQueue()).toHaveLength(1);
  });

  it('menghapus queue hanya setelah ACK offline_id atau assignment_id yang sama', () => {
    offlineQueue.enqueue(makeQueueItem('offline-exact', 'assignment-1'));
    mergeCollectionsWithQueues(
      [
        makeServerCollection({
          offline_id: 'offline-exact',
          assignment_id: 'assignment-server',
        }),
      ],
      true,
    );
    expect(offlineQueue.getQueue()).toHaveLength(0);

    offlineQueue.enqueue(makeQueueItem('offline-local-2', 'assignment-exact'));
    mergeCollectionsWithQueues(
      [
        makeServerCollection({
          offline_id: 'offline-server-2',
          assignment_id: 'assignment-exact',
        }),
      ],
      true,
    );
    expect(offlineQueue.getQueue()).toHaveLength(0);
  });

  it('badge selalu menghitung active queue ditambah failed quarantine', () => {
    const first = makeQueueItem('offline-1', 'assignment-1');
    const second = makeQueueItem('offline-2', 'assignment-2');

    offlineQueue.enqueue(first);
    offlineQueue.enqueue(second);
    expect(useSyncStore.getState().pendingCount).toBe(2);

    offlineQueue.moveToFailedPermanent([second]);
    expect(useSyncStore.getState().pendingCount).toBe(1);
    expect(useSyncStore.getState().permanentFailedCount).toBe(1);
    expect(getTotalSyncIssueCount()).toBe(2);

    offlineQueue.dequeue([first.offline_id]);
    expect(useSyncStore.getState().pendingCount).toBe(0);
    expect(getTotalSyncIssueCount()).toBe(1);

    offlineQueue.removeFromFailedPermanent([second.offline_id]);
    expect(useSyncStore.getState().permanentFailedCount).toBe(0);
    expect(getTotalSyncIssueCount()).toBe(0);
  });

  it('koreksi PENDING hanya mengubah nominal queue MMKV tanpa resubmit server', () => {
    const item = makeQueueItem('offline-correction', 'assignment-correction');
    offlineQueue.enqueue(item);
    const resubmitSpy = jest.spyOn(api.collection, 'resubmitCollection');

    expect(updatePendingCollectionNominal(item.offline_id, 75000)).toBe(true);
    expect(offlineQueue.getQueue()[0]!.nominal).toBe(75000);
    expect(resubmitSpy).not.toHaveBeenCalled();
    // Nominal 0 diizinkan (sesuai backend: min(0) + metrik zero_nominal_count)
    expect(updatePendingCollectionNominal(item.offline_id, 0)).toBe(true);
    expect(offlineQueue.getQueue()[0]!.nominal).toBe(0);
    // Nominal negatif tetap ditolak
    expect(updatePendingCollectionNominal(item.offline_id, -1)).toBe(false);
  });

  it('refresh offline tidak menghitung ulang transaksi optimistis yang sama', async () => {
    const baseline = {collected: 0, total_nominal: 0, remaining: 30};
    dashboardCache.setTodayStats(baseline);
    dashboardCache.setWeekStats({collected: 0, total_nominal: 0});
    useDashboardStore.setState({todayStats: baseline});

    const collectedAt = new Date().toISOString();
    offlineQueue.enqueue({
      ...makeQueueItem('offline-dashboard-1', 'assignment-dashboard-1'),
      collected_at: collectedAt,
    });
    useDashboardStore.getState().optimisticUpdateStats(50000);
    offlineQueue.enqueue({
      ...makeQueueItem('offline-dashboard-2', 'assignment-dashboard-2'),
      collected_at: collectedAt,
    });
    useDashboardStore.getState().optimisticUpdateStats(50000);

    expect(useDashboardStore.getState().todayStats?.collected).toBe(2);
    expect(dashboardCache.getTodayStats()).toEqual(baseline);

    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });
    await useDashboardStore.getState().fetchDashboard();

    expect(useDashboardStore.getState().todayStats).toEqual({
      collected: 2,
      total_nominal: 100000,
      remaining: 28,
    });

    useDashboardStore.setState({todayStats: null});
    await useDashboardStore.getState().fetchDashboard();
    expect(useDashboardStore.getState().todayStats?.collected).toBe(2);
  });

  it('mengabaikan cache dashboard lama yang mungkin sudah tercampur queue', async () => {
    const collectedAt = new Date().toISOString();
    getOfflineStorage().set(
      'cache:dashboard:todayStats',
      JSON.stringify({collected: 1, total_nominal: 50000, remaining: 29}),
    );
    offlineQueue.enqueue({
      ...makeQueueItem('offline-legacy-dashboard', 'assignment-legacy-dashboard'),
      collected_at: collectedAt,
    });
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });

    await useDashboardStore.getState().fetchDashboard();

    expect(useDashboardStore.getState().todayStats).toMatchObject({
      collected: 1,
      total_nominal: 50000,
    });
  });

  it('mengabaikan respons dashboard lama yang selesai setelah respons terbaru', async () => {
    const stale = createDeferred<any>();
    const fresh = createDeferred<any>();
    const dashboardSpy = jest
      .spyOn(dashboardService, 'getDashboard')
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => fresh.promise);

    const staleRequest = useDashboardStore.getState().fetchDashboard();
    await waitForMockCalls(dashboardSpy as jest.Mock, 1);
    const freshRequest = useDashboardStore.getState().fetchDashboard();
    await waitForMockCalls(dashboardSpy as jest.Mock, 2);

    fresh.resolve({
      success: true,
      data: {
        today_stats: {collected: 1, total_nominal: 50000, remaining: 29},
        week_stats: {collected: 1, total_nominal: 50000},
        pending_tasks: [],
        recent_collections: [],
      },
    });
    await freshRequest;
    stale.resolve({
      success: true,
      data: {
        today_stats: {collected: 0, total_nominal: 0, remaining: 30},
        week_stats: {collected: 0, total_nominal: 0},
        pending_tasks: [],
        recent_collections: [],
      },
    });
    await staleRequest;

    expect(useDashboardStore.getState().todayStats?.collected).toBe(1);
    expect(dashboardCache.getTodayStats()?.collected).toBe(1);
  });

  it('mengabaikan respons riwayat lama setelah rekonsiliasi server terbaru', async () => {
    const stale = createDeferred<any>();
    const fresh = createDeferred<any>();
    const historySpy = jest
      .spyOn(collectionService, 'getHistory')
      .mockImplementationOnce(() => stale.promise)
      .mockImplementationOnce(() => fresh.promise);

    const staleRequest = useCollectionsStore.getState().fetchCollections();
    await waitForMockCalls(historySpy as jest.Mock, 1);
    const freshRequest = useCollectionsStore.getState().fetchCollections();
    await waitForMockCalls(historySpy as jest.Mock, 2);

    fresh.resolve({
      success: true,
      data: {
        items: [
          {
            id: 'server-fresh',
            offline_id: 'offline-fresh',
            assignment_id: 'assignment-fresh',
            can_id: 'can-fresh',
            qr_code: 'QR-FRESH',
            owner_name: 'Donatur Fresh',
            owner_address: 'Alamat Fresh',
            nominal: 50000,
            collected_at: new Date().toISOString(),
            sync_status: SyncStatus.COMPLETED,
          },
        ],
        pagination: {page: 1, limit: 1000, total: 1, total_pages: 1},
      },
    });
    await freshRequest;
    stale.resolve({
      success: true,
      data: {
        items: [],
        pagination: {page: 1, limit: 1000, total: 0, total_pages: 1},
      },
    });
    await staleRequest;

    expect(useCollectionsStore.getState().collections.map(item => item.id)).toEqual([
      'server-fresh',
    ]);
  });

  it('mengabaikan respons tugas lama yang selesai setelah sync', async () => {
    const staleActive = createDeferred<any>();
    const staleCompleted = createDeferred<any>();
    const freshActive = createDeferred<any>();
    const freshCompleted = createDeferred<any>();
    const tasksSpy = jest
      .spyOn(tasksService, 'getTasks')
      .mockImplementationOnce(() => staleActive.promise)
      .mockImplementationOnce(() => staleCompleted.promise)
      .mockImplementationOnce(() => freshActive.promise)
      .mockImplementationOnce(() => freshCompleted.promise);
    const task = makeTask('assignment-startup-race');
    const response = (tasks: Task[], totalNominal = 0) => ({
      success: true,
      data: {
        tasks,
        total_nominal: totalNominal,
        pagination: {page: 1, limit: 1000, total: tasks.length, total_pages: 1},
      },
    });

    const staleRequest = useTasksStore.getState().fetchTasks('ACTIVE');
    await waitForMockCalls(tasksSpy as jest.Mock, 2);
    const freshRequest = useTasksStore.getState().fetchTasks('ACTIVE');
    await waitForMockCalls(tasksSpy as jest.Mock, 4);

    freshActive.resolve(response([]));
    freshCompleted.resolve(response([{...task, status: AssignmentStatus.COMPLETED}], 50000));
    await freshRequest;
    staleActive.resolve(response([task]));
    staleCompleted.resolve(response([]));
    await staleRequest;

    expect(taskCache.getTasks('ACTIVE')).toEqual([]);
    expect(taskCache.getTasks('COMPLETED').map(item => item.id)).toContain(task.id);
    expect(useTasksStore.getState().tasks).toEqual([]);
  });

  it('triggerSync menunggu seluruh rekonsiliasi sebelum dinyatakan selesai', async () => {
    jest.spyOn(syncService, 'autoSync').mockResolvedValue({
      success: true,
      synced: 1,
      failed: 0,
      remaining: 0,
    });
    const dashboardRefresh = createDeferred<void>();
    const tasksRefresh = createDeferred<void>();
    const statsRefresh = createDeferred<void>();
    const historyRefresh = createDeferred<void>();
    const dashboardSpy = jest
      .spyOn(useDashboardStore.getState(), 'fetchDashboard')
      .mockReturnValue(dashboardRefresh.promise);
    const tasksSpy = jest
      .spyOn(useTasksStore.getState(), 'fetchTasks')
      .mockReturnValue(tasksRefresh.promise);
    const statsSpy = jest
      .spyOn(useTasksStore.getState(), 'fetchStats')
      .mockReturnValue(statsRefresh.promise);
    const historySpy = jest
      .spyOn(useCollectionsStore.getState(), 'fetchCollections')
      .mockReturnValue(historyRefresh.promise);

    let completed = false;
    const syncPromise = useSyncStore
      .getState()
      .triggerSync()
      .then(() => {
        completed = true;
      });
    await waitForMockCalls(dashboardSpy as jest.Mock, 1);
    await waitForMockCalls(tasksSpy as jest.Mock, 1);
    await waitForMockCalls(statsSpy as jest.Mock, 1);
    await waitForMockCalls(historySpy as jest.Mock, 1);

    expect(completed).toBe(false);
    expect(useSyncStore.getState().isSyncing).toBe(true);

    dashboardRefresh.resolve();
    tasksRefresh.resolve();
    statsRefresh.resolve();
    historyRefresh.resolve();
    await syncPromise;

    expect(completed).toBe(true);
    expect(useSyncStore.getState().isSyncing).toBe(false);
  });
});
