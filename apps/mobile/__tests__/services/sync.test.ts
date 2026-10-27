import NetInfo from '@react-native-community/netinfo';
import {CanCondition} from '@lazisnu/shared-types';
import {syncService} from '../../src/services/offline/sync';
import {offlineQueue, QueuedCollection} from '../../src/services/offline/queue';
import {actionQueue} from '../../src/services/offline/actionQueue';
import {collectionService} from '../../src/services/api';
import {initializeOfflineStorage, getOfflineStorage} from '../../src/services/offline/mmkv';

describe('Sync Service (sync.ts)', () => {
  beforeEach(() => {
    initializeOfflineStorage('test-offline-key-32-chars-length!');
    getOfflineStorage().clearAll();
    jest.clearAllMocks();
  });

  const createDummyItem = (id: string, nominal = 50000, retries = 0): QueuedCollection => ({
    offline_id: id,
    assignment_id: `asg_${id}`,
    can_id: `can_${id}`,
    nominal,
    condition: CanCondition.AKTIF,
    collected_at: new Date().toISOString(),
    retry_attempts: retries,
  });

  describe('Offline & Concurrency Guards', () => {
    it('aborts and returns NO_NETWORK when device is offline', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: false,
        isInternetReachable: false,
      });

      offlineQueue.enqueue(createDummyItem('off_1'));

      const result = await syncService.autoSync();
      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_NETWORK');
      expect(result.remaining).toBe(1);
    });

    it('returns empty success when queue is already empty', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({
        isConnected: true,
        isInternetReachable: true,
      });

      const result = await syncService.autoSync();
      expect(result.success).toBe(true);
      expect(result.synced).toBe(0);
      expect(result.remaining).toBe(0);
    });
  });

  describe('Retry Cap & Poison-Pill Quarantine', () => {
    it('quarantines items that exceeded MAX_RETRIES (>= 3) before sending batch', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
      });

      // Item 1: retries = 3 (expired)
      // Item 2: retries = 0 (valid)
      offlineQueue.enqueue(createDummyItem('expired_1', 25000, 3));
      offlineQueue.enqueue(createDummyItem('valid_1', 50000, 0));

      const batchSubmitSpy = jest.spyOn(collectionService, 'batchSubmit').mockResolvedValueOnce({
        success: true,
        data: {
          total: 1,
          succeeded: 1,
          failed: 0,
          results: [{offline_id: 'valid_1', status: 'COMPLETED'}],
        },
      });

      const result = await syncService.autoSync();

      expect(batchSubmitSpy).toHaveBeenCalledTimes(1);
      // Batch payload should only contain valid_1, NOT expired_1
      expect(batchSubmitSpy).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({offline_id: 'valid_1'})]),
      );

      // expired_1 should be quarantined in failedPermanent
      const failed = offlineQueue.getFailedPermanent();
      expect(failed.some(item => item.offline_id === 'expired_1')).toBe(true);

      // valid_1 should be synced and dequeued
      expect(offlineQueue.getRetryableQueue().length).toBe(0);
      expect(result.synced).toBe(1);
      expect(result.failed).toBe(1); // 1 expired item
    });
  });

  describe('Batch Synchronization & Result Dispatching', () => {
    it('dequeues COMPLETED and ALREADY_SYNCED items successfully', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
      });

      offlineQueue.enqueue(createDummyItem('item_1', 10000));
      offlineQueue.enqueue(createDummyItem('item_2', 20000));

      jest.spyOn(collectionService, 'batchSubmit').mockResolvedValueOnce({
        success: true,
        data: {
          total: 2,
          succeeded: 2,
          failed: 0,
          results: [
            {offline_id: 'item_1', status: 'COMPLETED'},
            {offline_id: 'item_2', status: 'ALREADY_SYNCED'},
          ],
        },
      });

      const result = await syncService.autoSync();
      expect(result.success).toBe(true);
      expect(result.synced).toBe(2);
      expect(offlineQueue.getRetryableQueue().length).toBe(0);
    });

    it('quarantines permanent validation failures from backend (can_retry: false)', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
      });

      offlineQueue.enqueue(createDummyItem('item_invalid', 50000));

      jest.spyOn(collectionService, 'batchSubmit').mockResolvedValueOnce({
        success: true,
        data: {
          total: 1,
          succeeded: 0,
          failed: 1,
          results: [
            {
              offline_id: 'item_invalid',
              status: 'FAILED',
              can_retry: false,
              error: 'QR Code tidak terdaftar',
            },
          ],
        },
      });

      const result = await syncService.autoSync();
      expect(result.failed).toBe(1);
      expect(offlineQueue.getRetryableQueue().length).toBe(0);

      const failedList = offlineQueue.getFailedPermanent();
      expect(failedList.length).toBe(1);
      expect(failedList[0]!.offline_id).toBe('item_invalid');
      expect(failedList[0]!.error_message).toBe('QR Code tidak terdaftar');
    });

    it('increments retry_attempts on server 500 error and keeps item in queue', async () => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
      });

      offlineQueue.enqueue(createDummyItem('server_err_item', 50000, 0));

      jest.spyOn(collectionService, 'batchSubmit').mockResolvedValueOnce({
        success: false,
        error: {code: 'SERVER_ERROR', message: 'Internal server error 500'},
      });

      const result = await syncService.autoSync();
      expect(result.success).toBe(false);

      const queue = offlineQueue.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0]!.retry_attempts).toBe(1);
    });
  });

  describe('Aksi offline: skip tugas & kunjungan NON_AKTIF', () => {
    const skipAction = (id: string, overrides: Record<string, unknown> = {}) => ({
      kind: 'SKIP' as const,
      assignment_id: `asg_${id}`,
      can_id: `can_${id}`,
      qr_code: `QR-${id}`,
      reason_code: 'OWNER_NOT_HOME',
      created_at: new Date().toISOString(),
      ...overrides,
    });

    beforeEach(() => {
      (NetInfo.fetch as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
      });
    });

    it('mereplay SKIP yang sukses dan mengosongkan antrean aksi', async () => {
      actionQueue.enqueue(skipAction('skip_ok'));
      const skipSpy = jest
        .spyOn(collectionService, 'skipAssignment')
        .mockResolvedValueOnce({
          success: true,
          data: {id: 'asg_skip_ok', status: 'UNCOLLECTED', message: 'Kaleng ditandai tidak dijemput'},
        });

      const result = await syncService.autoSyncActions();

      expect(result.synced).toBe(1);
      expect(result.failed).toBe(0);
      expect(skipSpy).toHaveBeenCalledWith('asg_skip_ok', 'OWNER_NOT_HOME', undefined);
      expect(actionQueue.getQueueCount()).toBe(0);
    });

    it('membuang SKIP yang dijawab ASSIGNMENT_INVALID (sudah diproses server)', async () => {
      actionQueue.enqueue(skipAction('skip_stale'));
      jest.spyOn(collectionService, 'skipAssignment').mockResolvedValueOnce({
        success: false,
        error: {code: 'ASSIGNMENT_INVALID', message: 'Assignment tidak valid'},
      });

      const result = await syncService.autoSyncActions();

      expect(result.synced).toBe(1);
      expect(actionQueue.getQueueCount()).toBe(0);
      expect(actionQueue.getFailedPermanentCount()).toBe(0);
    });

    it('memindahkan SKIP yang ditolak periode FINAL ke gagal permanen', async () => {
      actionQueue.enqueue(skipAction('skip_final'));
      jest.spyOn(collectionService, 'skipAssignment').mockResolvedValueOnce({
        success: false,
        error: {code: 'QR_ALREADY_SUBMITTED', message: 'Setoran periode sudah FINAL'},
      });

      const result = await syncService.autoSyncActions();

      expect(result.failed).toBe(1);
      expect(actionQueue.getQueueCount()).toBe(0);
      const failed = actionQueue.getFailedPermanent();
      expect(failed.length).toBe(1);
      expect(failed[0]!.kind).toBe('SKIP');
      expect(failed[0]!.error_message).toContain('FINAL');
    });

    it('menaikkan retry_attempts saat replay gagal jaringan dan menahan item', async () => {
      actionQueue.enqueue(skipAction('skip_net'));
      jest
        .spyOn(collectionService, 'skipAssignment')
        .mockRejectedValueOnce(new Error('network down'));

      const result = await syncService.autoSyncActions();

      expect(result.synced).toBe(0);
      expect(result.failed).toBe(0);
      const queue = actionQueue.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0]!.retry_attempts).toBe(1);
    });

    it('mereplay VISIT yang sukses ke endpoint kunjungan', async () => {
      actionQueue.enqueue({
        kind: 'VISIT',
        can_id: 'can_visit_1',
        qr_code: 'QR-V1',
        outcome: 'DIKEMBALIKAN',
        created_at: new Date().toISOString(),
      });
      const visitSpy = jest
        .spyOn(collectionService, 'recordCanVisit')
        .mockResolvedValueOnce({
          success: true,
          data: {
            id: 'v1',
            can_id: 'can_visit_1',
            outcome: 'DIKEMBALIKAN',
            condition: 'AKTIF',
            message: 'Tindakan kaleng tersimpan.',
          },
        });

      const result = await syncService.autoSyncActions();

      expect(result.synced).toBe(1);
      expect(visitSpy).toHaveBeenCalledWith('can_visit_1', 'DIKEMBALIKAN', undefined);
      expect(actionQueue.getQueueCount()).toBe(0);
    });

    it('membuang VISIT yang dijawab CAN_NOT_NON_ACTIVE (sudah diproses server)', async () => {
      actionQueue.enqueue({
        kind: 'VISIT',
        can_id: 'can_visit_2',
        outcome: 'KOSONG',
        created_at: new Date().toISOString(),
      });
      jest.spyOn(collectionService, 'recordCanVisit').mockResolvedValueOnce({
        success: false,
        error: {code: 'CAN_NOT_NON_ACTIVE', message: 'Tindakan khusus hanya untuk NON_AKTIF'},
      });

      const result = await syncService.autoSyncActions();

      expect(result.synced).toBe(1);
      expect(actionQueue.getQueueCount()).toBe(0);
      expect(actionQueue.getFailedPermanentCount()).toBe(0);
    });

    it('autoSync menjalankan aksi setelah antrean koleksi (badgenya ikut turun)', async () => {
      actionQueue.enqueue(skipAction('skip_via_autosync'));
      jest
        .spyOn(collectionService, 'skipAssignment')
        .mockResolvedValue({
          success: true,
          data: {
            id: 'asg_skip_via_autosync',
            status: 'UNCOLLECTED',
            message: 'Kaleng ditandai tidak dijemput',
          },
        });

      const result = await syncService.autoSync();

      expect(result.actions_synced).toBe(1);
      expect(actionQueue.getQueueCount()).toBe(0);
    });
  });
});
