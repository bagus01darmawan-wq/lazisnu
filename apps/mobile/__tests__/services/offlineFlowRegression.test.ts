import NetInfo from '@react-native-community/netinfo';
import {
  AssignmentStatus,
  Collection,
  SyncStatus,
  Task,
} from '@lazisnu/shared-types';
import {getOfflineStorage, initializeOfflineStorage} from '../../src/services/offline/mmkv';
import {offlineQueue, QueuedCollection} from '../../src/services/offline/queue';
import {taskCache} from '../../src/services/offline/tasks';
import {dashboardCache} from '../../src/services/offline/cache';
import {tasksService} from '../../src/services/api';
import {useSyncStore, getTotalSyncIssueCount} from '../../src/stores/useSyncStore';
import {
  mergeCollectionsWithQueues,
} from '../../src/stores/useCollectionStore';
import {useTasksStore} from '../../src/stores/useTasksStore';
import {useDashboardStore} from '../../src/stores/useDashboardStore';
import {
  updatePendingCollectionNominal,
} from '../../src/screens/HistoryScreen';
import api from '../../src/services/api';

const mmkvMock = require('react-native-mmkv');

const makeTask = (
  id: string,
  status: AssignmentStatus = AssignmentStatus.ACTIVE,
): Task => ({
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

const makeServerCollection = (
  overrides: Partial<Collection> = {},
): Collection => ({
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
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
  });

  it('memisahkan cache ACTIVE/COMPLETED dan memindahkan task secara lokal', () => {
    const activeTasks = Array.from({length: 30}, (_, index) =>
      makeTask(`assignment-${index + 1}`),
    );
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
    expect(taskCache.getTasks('COMPLETED').map(task => task.id)).toContain(
      queuedTask.id,
    );

    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });
    await useTasksStore.getState().fetchTasks('COMPLETED');
    expect(useTasksStore.getState().tasks.map(task => task.id)).toContain(
      queuedTask.id,
    );
  });

  it('tidak menghapus queue dari cache PENDING atau kecocokan can_id/QR', () => {
    const local = makeQueueItem(
      'offline-new',
      'assignment-new',
      'can-reused',
    );
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
    expect(fromCache.find(item => item.id === local.offline_id)?.nominal).toBe(
      local.nominal,
    );

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
    mergeCollectionsWithQueues([
      makeServerCollection({
        offline_id: 'offline-exact',
        assignment_id: 'assignment-server',
      }),
    ], true);
    expect(offlineQueue.getQueue()).toHaveLength(0);

    offlineQueue.enqueue(makeQueueItem('offline-local-2', 'assignment-exact'));
    mergeCollectionsWithQueues([
      makeServerCollection({
        offline_id: 'offline-server-2',
        assignment_id: 'assignment-exact',
      }),
    ], true);
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
    expect(offlineQueue.getQueue()[0].nominal).toBe(75000);
    expect(resubmitSpy).not.toHaveBeenCalled();
    expect(updatePendingCollectionNominal(item.offline_id, 0)).toBe(false);
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
});
