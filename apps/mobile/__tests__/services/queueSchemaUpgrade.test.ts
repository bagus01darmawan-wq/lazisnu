import NetInfo from '@react-native-community/netinfo';
import {CanCondition} from '@lazisnu/shared-types';
import {getOfflineStorage, initializeOfflineStorage} from '../../src/services/offline/mmkv';
import {offlineQueue} from '../../src/services/offline/queue';
import {syncService} from '../../src/services/offline/sync';
import {collectionService} from '../../src/services/api';

/**
 * Skema antrean offline v3 (2026-11-13): kondisi fisik eksplisit.
 * Item lama hanya punya `condition`; migrasi wajib mempertahankan offline_id,
 * metadata retry, periode, dan visit_outcome.
 */
describe('migrasi skema antrean offline v3', () => {
  beforeEach(() => {
    initializeOfflineStorage('test-offline-key-32-chars-length!');
    getOfflineStorage().clearAll();
    jest.clearAllMocks();
  });

  it('mengisi physical_condition dari condition tanpa menghilangkan metadata', () => {
    getOfflineStorage().set('collection_queue', JSON.stringify([{
      offline_id: 'offline-lama-1',
      assignment_id: 'asg-1',
      can_id: 'can-1',
      nominal: 25000,
      collected_at: '2026-10-05T03:00:00.000Z',
      condition: CanCondition.RUSAK,
      period: '2026-10',
      visit_outcome: 'ISI',
      retry_attempts: 2,
      next_retry_at: '2026-10-06T03:00:00.000Z',
    }]));
    getOfflineStorage().set('offline_queue_schema_version', 2);

    offlineQueue.runMigration();

    const [item] = offlineQueue.getQueue();
    expect(item).toMatchObject({
      offline_id: 'offline-lama-1',
      physical_condition: 'RUSAK',
      condition: CanCondition.RUSAK,
      period: '2026-10',
      visit_outcome: 'ISI',
      retry_attempts: 2,
      next_retry_at: '2026-10-06T03:00:00.000Z',
    });

    const persisted = JSON.parse(getOfflineStorage().getString('collection_queue') as string);
    expect(persisted[0].physical_condition).toBe('RUSAK');
  });

  it('memetakan AKTIF legacy menjadi BAIK dan mempertahankan id', () => {
    getOfflineStorage().set('collection_queue', JSON.stringify([{
      offline_id: 'offline-lama-2',
      assignment_id: 'asg-2',
      can_id: 'can-2',
      nominal: 0,
      collected_at: '2026-10-05T03:00:00.000Z',
      condition: CanCondition.AKTIF,
    }]));

    offlineQueue.runMigration();

    expect(offlineQueue.getQueue()[0]).toMatchObject({
      offline_id: 'offline-lama-2',
      physical_condition: 'BAIK',
      condition: CanCondition.AKTIF,
    });
  });

  it('payload batch mengirim physical_condition + alias legacy yang konsisten', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
    offlineQueue.enqueue({
      offline_id: 'offline-payload-1',
      assignment_id: 'asg-3',
      can_id: 'can-3',
      nominal: 10000,
      collected_at: '2026-10-05T03:00:00.000Z',
      physical_condition: 'HILANG',
      condition: CanCondition.HILANG,
    });
    const batchSpy = jest.spyOn(collectionService, 'batchSubmit').mockResolvedValueOnce({
      success: true,
      data: {
        total: 1,
        succeeded: 1,
        failed: 0,
        results: [{offline_id: 'offline-payload-1', status: 'COMPLETED'}],
      },
    });

    await syncService.autoSync();

    expect(batchSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        physical_condition: 'HILANG',
        condition: CanCondition.HILANG,
      }),
    ]);
    expect(offlineQueue.getQueue()).toHaveLength(0);
  });
});
