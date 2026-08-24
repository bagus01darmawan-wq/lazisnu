import NetInfo from '@react-native-community/netinfo';
import {SyncStatus, Collection} from '@lazisnu/shared-types';
import {getOfflineStorage, initializeOfflineStorage} from '../../src/services/offline/mmkv';
import {correctionQueue, QueuedCorrection} from '../../src/services/offline/corrections';
import {collectionsCache} from '../../src/services/offline/cache';
import {syncService} from '../../src/services/offline/sync';
import {collectionService} from '../../src/services/api';
import {mergeCollectionsWithQueues, useCollectionsStore} from '../../src/stores/useCollectionStore';

const mmkvMock = require('react-native-mmkv');

const first = <T>(items: T[]): T => {
  const item = items[0];
  if (!item) {
    throw new Error('Expected minimal satu item');
  }
  return item;
};

const makeCorrection = (
  collectionId: string,
  overrides: Partial<QueuedCorrection> = {},
): QueuedCorrection => ({
  correction_id: `corr-${collectionId}`,
  collection_id: collectionId,
  nominal_lama: 50000,
  nominal_baru: 75000,
  alasan_resubmit: 'salah input nominal sebelumnya',
  created_at: '2026-08-24T02:00:00.000Z',
  ...overrides,
});

const makeServerCollection = (overrides: Partial<Collection> = {}): Collection => ({
  id: 'server-1',
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

describe('correctionQueue (corrections.ts)', () => {
  beforeEach(() => {
    mmkvMock.__resetMock();
    initializeOfflineStorage('test-corrections-key');
    getOfflineStorage().clearAll();
    jest.clearAllMocks();
  });

  describe('enqueue & validasi', () => {
    it('menerima koreksi valid dan menyimpan ke MMKV', () => {
      const result = correctionQueue.enqueue({
        collection_id: 'server-1',
        nominal_lama: 50000,
        nominal_baru: 75000,
        alasan_resubmit: 'salah input nominal sebelumnya',
      });

      expect(result.queued).toBe(true);
      expect(result.collapsed).toBe(false);
      expect(correctionQueue.getQueueCount()).toBe(1);
      expect(first(correctionQueue.getQueue()).correction_id).toBeTruthy();
    });

    it('menolak nominal negatif, alasan pendek, dan collection_id kosong', () => {
      const invalidNominal = correctionQueue.enqueue({
        collection_id: 'server-1',
        nominal_lama: 50000,
        nominal_baru: -1000,
        alasan_resubmit: 'alasan yang cukup panjang',
      });
      const shortReason = correctionQueue.enqueue({
        collection_id: 'server-1',
        nominal_lama: 50000,
        nominal_baru: 75000,
        alasan_resubmit: 'sala',
      });
      const emptyId = correctionQueue.enqueue({
        collection_id: '',
        nominal_lama: 50000,
        nominal_baru: 75000,
        alasan_resubmit: 'alasan yang cukup panjang',
      });

      expect(invalidNominal.queued).toBe(false);
      expect(shortReason.queued).toBe(false);
      expect(emptyId.queued).toBe(false);
      expect(correctionQueue.getQueueCount()).toBe(0);
    });

    it('collapse: koreksi kedua untuk collection_id sama menimpa yang lama', () => {
      correctionQueue.enqueue({
        collection_id: 'server-1',
        nominal_lama: 50000,
        nominal_baru: 60000,
        alasan_resubmit: 'salah input pertama',
      });
      const second = correctionQueue.enqueue({
        collection_id: 'server-1',
        nominal_lama: 50000,
        nominal_baru: 75000,
        alasan_resubmit: 'salah input kedua, dikoreksi lagi',
      });

      expect(second.collapsed).toBe(true);
      expect(correctionQueue.getQueueCount()).toBe(1);
      expect(correctionQueue.getLatestByCollectionId('server-1')?.nominal_baru).toBe(75000);
    });
  });

  describe('retry & backoff', () => {
    it('incrementRetryAttempts menaikkan counter dan mengatur backoff eksponensial', () => {
      correctionQueue.enqueue(makeCorrection('server-1'));
      const id = first(correctionQueue.getQueue()).correction_id;

      correctionQueue.incrementRetryAttempts([id]);
      let item = first(correctionQueue.getQueue());
      expect(item.retry_attempts).toBe(1);

      correctionQueue.incrementRetryAttempts([id]);
      item = first(correctionQueue.getQueue());
      expect(item.retry_attempts).toBe(2);

      const firstDelay = Date.parse(item.next_retry_at || '') - Date.now();
      expect(firstDelay).toBeGreaterThan(0);
    });

    it('getRetryableCorrections mengecualikan item yang menunggu backoff', () => {
      jest.useFakeTimers();
      try {
        correctionQueue.enqueue(makeCorrection('server-1'));
        const id = first(correctionQueue.getQueue()).correction_id;

        correctionQueue.incrementRetryAttempts([id]);
        expect(correctionQueue.getRetryableCorrections()).toHaveLength(0);

        // Lewati window backoff (1s setelah retry pertama)
        jest.advanceTimersByTime(2000);
        expect(correctionQueue.getRetryableCorrections()).toHaveLength(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('hasExceededRetries true pada retry_attempts >= 3', () => {
      expect(correctionQueue.hasExceededRetries(makeCorrection('x', {retry_attempts: 2}))).toBe(
        false,
      );
      expect(correctionQueue.hasExceededRetries(makeCorrection('x', {retry_attempts: 3}))).toBe(
        true,
      );
    });
  });

  describe('quarantine gagal permanen', () => {
    it('moveToFailedPermanent memindahkan antrean aktif ke karantina', () => {
      const item = makeCorrection('server-1');
      correctionQueue.enqueue(item);
      correctionQueue.moveToFailedPermanent([
        {...item, error_type: 'NOT_LATEST', can_retry: false},
      ]);

      expect(correctionQueue.getQueueCount()).toBe(0);
      expect(correctionQueue.getFailedPermanentCount()).toBe(1);
      expect(first(correctionQueue.getFailedPermanent()).error_type).toBe('NOT_LATEST');
    });

    it('removeFromFailedPermanent menghapus entri karantina', () => {
      const item = makeCorrection('server-1');
      correctionQueue.moveToFailedPermanent([{...item, error_type: 'VALIDATION'}]);

      correctionQueue.removeFromFailedPermanent([item.correction_id]);
      expect(correctionQueue.getFailedPermanentCount()).toBe(0);
    });
  });
});

describe('flush koreksi (sync.ts)', () => {
  beforeEach(() => {
    mmkvMock.__resetMock();
    initializeOfflineStorage('test-corrections-key');
    getOfflineStorage().clearAll();
    jest.clearAllMocks();
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });
  });

  it('koreksi sukses didequeue dan dilaporkan di corrections_synced', async () => {
    correctionQueue.enqueue(makeCorrection('server-1'));
    const resubmitSpy = jest
      .spyOn(collectionService, 'resubmitCollection')
      .mockResolvedValueOnce({success: true, data: {id: 'new-row'}} as any);

    const result = await syncService.autoSync();

    expect(resubmitSpy).toHaveBeenCalledWith('server-1', {
      nominal: 75000,
      alasan_resubmit: 'salah input nominal sebelumnya',
    });
    expect(result.corrections_synced).toBe(1);
    expect(correctionQueue.getQueueCount()).toBe(0);
  });

  it('NOT_LATEST dipindah ke gagal permanen tanpa retry', async () => {
    correctionQueue.enqueue(makeCorrection('server-1'));
    jest.spyOn(collectionService, 'resubmitCollection').mockResolvedValueOnce({
      success: false,
      error: {code: 'NOT_LATEST', message: 'Hanya record terbaru yang bisa di-resubmit'},
    } as any);

    const result = await syncService.autoSync();

    expect(result.corrections_failed).toBe(1);
    expect(correctionQueue.getQueueCount()).toBe(0);
    const failed = correctionQueue.getFailedPermanent();
    expect(failed).toHaveLength(1);
    expect(first(failed).error_type).toBe('NOT_LATEST');
    expect(first(failed).error_message).toContain('terbaru');
  });

  it('NETWORK_ERROR tetap di antrean dengan retry_attempts naik', async () => {
    correctionQueue.enqueue(makeCorrection('server-1'));
    jest.spyOn(collectionService, 'resubmitCollection').mockResolvedValueOnce({
      success: false,
      error: {code: 'NETWORK_ERROR', message: 'Tidak ada koneksi internet'},
    } as any);

    await syncService.autoSync();

    expect(correctionQueue.getQueueCount()).toBe(1);
    expect(first(correctionQueue.getQueue()).retry_attempts).toBe(1);
  });

  it('koreksi yang melebihi batas retry dikarantina sebelum dikirim', async () => {
    correctionQueue.enqueue(makeCorrection('server-1', {retry_attempts: 3}));
    const resubmitSpy = jest.spyOn(collectionService, 'resubmitCollection');

    const result = await syncService.autoSync();

    expect(resubmitSpy).not.toHaveBeenCalled();
    expect(result.corrections_failed).toBe(1);
    expect(correctionQueue.getQueueCount()).toBe(0);
    expect(first(correctionQueue.getFailedPermanent()).error_message).toContain('Melebihi batas');
  });
});

describe('integrasi koreksi offline dengan store riwayat', () => {
  beforeEach(() => {
    mmkvMock.__resetMock();
    initializeOfflineStorage('test-corrections-key');
    getOfflineStorage().clearAll();
    jest.clearAllMocks();
    useCollectionsStore.setState({
      collections: [],
      isLoading: false,
      error: null,
      page: 1,
      totalPages: 1,
      total: 0,
    });
  });

  it('resubmit saat offline masuk antrean tanpa panggil API dan tampil optimistis', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });
    const resubmitSpy = jest.spyOn(collectionService, 'resubmitCollection');
    collectionsCache.set([makeServerCollection()]);

    const result = await useCollectionsStore.getState().resubmitCollection('server-1', {
      nominal: 75000,
      alasan_resubmit: 'salah input nominal sebelumnya',
      nominal_lama: 50000,
    });

    expect(result.success).toBe(true);
    expect(result.queued).toBe(true);
    expect(resubmitSpy).not.toHaveBeenCalled();
    expect(correctionQueue.getQueueCount()).toBe(1);

    const item = useCollectionsStore.getState().collections.find(c => c.id === 'server-1');
    expect(item?.nominal).toBe(75000);
    expect(item?.pending_correction).toBe(true);
  });

  it('koreksi beruntun offline mempertahankan nominal_lama server asli', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });
    collectionsCache.set([makeServerCollection()]);

    await useCollectionsStore.getState().resubmitCollection('server-1', {
      nominal: 60000,
      alasan_resubmit: 'salah input pertama',
      nominal_lama: 50000,
    });
    await useCollectionsStore.getState().resubmitCollection('server-1', {
      nominal: 75000,
      alasan_resubmit: 'salah input kedua, koreksi ulang',
      nominal_lama: 60000,
    });

    const queue = correctionQueue.getQueue();
    expect(queue).toHaveLength(1);
    expect(first(queue).nominal_lama).toBe(50000);
    expect(first(queue).nominal_baru).toBe(75000);
  });

  it('merge overlay hanya menerapkan koreksi aktif, bukan yang gagal permanen', () => {
    correctionQueue.enqueue(makeCorrection('server-1'));

    const withPending = mergeCollectionsWithQueues([makeServerCollection()]);
    expect(withPending.find(c => c.id === 'server-1')?.nominal).toBe(75000);
    expect(withPending.find(c => c.id === 'server-1')?.pending_correction).toBe(true);

    const item = makeCorrection('server-2');
    correctionQueue.moveToFailedPermanent([{...item, error_type: 'NOT_LATEST'}]);
    const afterFailure = mergeCollectionsWithQueues([
      makeServerCollection(),
      makeServerCollection({id: 'server-2'}),
    ]);
    const server2 = afterFailure.find(c => c.id === 'server-2');
    expect(server2?.nominal).toBe(50000);
    expect(server2?.pending_correction).toBeUndefined();

    // Overlay tidak boleh menyembunyikan fakta bahwa server-1 sudah tidak
    // tertunda lagi setelah dequeue manual.
    correctionQueue.dequeue([first(correctionQueue.getQueue()).correction_id]);
    const afterDequeue = mergeCollectionsWithQueues([makeServerCollection()]);
    expect(afterDequeue.find(c => c.id === 'server-1')?.pending_correction).toBeUndefined();
  });
});
