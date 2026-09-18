import NetInfo from '@react-native-community/netinfo';
import {syncService} from '../../src/services/offline/sync';
import {offlineQueue, QueuedCollection} from '../../src/services/offline/queue';
import {collectionService} from '../../src/services/api';
import {initializeOfflineStorage, getOfflineStorage} from '../../src/services/offline/mmkv';

/**
 * B2 — kaleng NON_AKTIF berisi ("Kaleng Terisi").
 *
 * Kaleng NON_AKTIF tidak diberi assignment oleh aturan (ASSIGNABLE_CONDITIONS),
 * sehingga visit-task memakai id sintetis "visit-<can_id>". Id itu BUKAN UUID —
 * server menolaknya (Zod /.uuid/ dan Postgres "invalid input syntax for type
 * uuid" → HTTP 400). Penjemputan berisi butuh assignment asli, jadi:
 *   - online  : app memanggil ensure-assignment lalu mengirim id asli;
 *   - offline : item diantri dengan id sintetis dan DILENGKAPI saat sync.
 * Tes ini mengunci kedua jalur itu.
 */
describe('B2 — visit-task assignment resolution (sync.ts)', () => {
  beforeEach(() => {
    initializeOfflineStorage('test-offline-key-32-chars-length!');
    getOfflineStorage().clearAll();
    jest.clearAllMocks();
  });

  const REAL_ASSIGNMENT_ID = '3f2c1a44-5b6e-4c2f-9a1d-8e7f6c5b4a39';
  const CAN_ID = '5d040743-77a3-4523-858a-5c207c634a1a';

  /** Item dari visit-task: assignment_id masih sintetis "visit-<can_id>". */
  const createVisitItem = (): QueuedCollection => ({
    offline_id: 'visit_off_1',
    assignment_id: `visit-${CAN_ID}`,
    can_id: CAN_ID,
    nominal: 50000,
    collected_at: new Date().toISOString(),
    retry_attempts: 0,
  });

  const goOnline = () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({isConnected: true, isInternetReachable: true});
  };

  describe('offlineQueue.patchAssignmentId', () => {
    it('menolak id sintetis (tidak menimpa dengan nilai bukan-UUID)', () => {
      offlineQueue.enqueue(createVisitItem());

      expect(offlineQueue.patchAssignmentId('visit_off_1', `visit-${CAN_ID}`)).toBe(false);
      expect(offlineQueue.getQueue()[0]?.assignment_id).toBe(`visit-${CAN_ID}`);
    });

    it('mengganti id sintetis dengan assignment UUID asli dan menyimpannya', () => {
      offlineQueue.enqueue(createVisitItem());

      expect(offlineQueue.patchAssignmentId('visit_off_1', REAL_ASSIGNMENT_ID)).toBe(true);
      // Persist: baca ulang langsung dari storage (bukan hanya state memori).
      const raw = getOfflineStorage().getString('collection_queue');
      expect(raw).toBeTruthy();
      const persisted = JSON.parse(raw as string) as QueuedCollection[];
      expect(persisted[0]?.assignment_id).toBe(REAL_ASSIGNMENT_ID);
      expect(offlineQueue.getQueue()[0]?.assignment_id).toBe(REAL_ASSIGNMENT_ID);
    });

    it('mengembalikan false bila offline_id tidak ada di antrean', () => {
      offlineQueue.enqueue(createVisitItem());
      expect(offlineQueue.patchAssignmentId('tidak_ada', REAL_ASSIGNMENT_ID)).toBe(false);
    });
  });

  describe('autoSync — item visit-task', () => {
    it('melengkapi assignment_id sintetis lalu mengirim batch dengan UUID asli', async () => {
      goOnline();
      offlineQueue.enqueue(createVisitItem());

      const ensureSpy = jest
        .spyOn(collectionService, 'ensureAssignment')
        .mockResolvedValueOnce({success: true, data: {assignment_id: REAL_ASSIGNMENT_ID, status: 'ACTIVE'}});

      const batchSubmitSpy = jest.spyOn(collectionService, 'batchSubmit').mockResolvedValueOnce({
        success: true,
        data: {
          total: 1,
          succeeded: 1,
          failed: 0,
          results: [{offline_id: 'visit_off_1', status: 'COMPLETED'}],
        },
      });

      const result = await syncService.autoSync();

      expect(ensureSpy).toHaveBeenCalledWith(CAN_ID);
      expect(batchSubmitSpy).toHaveBeenCalledTimes(1);
      expect(batchSubmitSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({offline_id: 'visit_off_1', assignment_id: REAL_ASSIGNMENT_ID}),
        ]),
      );
      expect(result.synced).toBe(1);
      expect(offlineQueue.getRetryableQueue().length).toBe(0);
    });

    it('menahan item (tidak mengirim) saat assignment belum bisa disiapkan — bukan spam 400', async () => {
      goOnline();
      offlineQueue.enqueue(createVisitItem());

      jest
        .spyOn(collectionService, 'ensureAssignment')
        .mockResolvedValueOnce({success: false, error: {code: 'NETWORK_ERROR', message: 'Tidak ada koneksi'}});

      const batchSubmitSpy = jest.spyOn(collectionService, 'batchSubmit');

      const result = await syncService.autoSync();

      // Batch TIDAK dikirim — id sintetis pasti ditolak server.
      expect(batchSubmitSpy).not.toHaveBeenCalled();
      expect(result.synced).toBe(0);
      // Item tetap di antrean untuk dicoba lagi (bukan dihukum sebagai poison pill).
      expect(offlineQueue.getRetryableQueue().length).toBe(1);
      expect(offlineQueue.getFailedPermanent().length).toBe(0);
    });

    it('memindahkan item ke gagal permanen saat server menolak tegas — antrean tidak menggantung', async () => {
      goOnline();
      offlineQueue.enqueue(createVisitItem());

      jest.spyOn(collectionService, 'ensureAssignment').mockResolvedValueOnce({
        success: false,
        error: {code: 'ASSIGNMENT_NOT_ACTIVE', message: 'Kaleng ini sudah dijemput pada periode 9/2026'},
      });
      const batchSubmitSpy = jest.spyOn(collectionService, 'batchSubmit');

      const result = await syncService.autoSync();

      expect(batchSubmitSpy).not.toHaveBeenCalled();
      // Tidak lagi menunggu sinkron (bukan zombi) dan alasannya tersimpan.
      expect(offlineQueue.getRetryableQueue().length).toBe(0);
      const failed = offlineQueue.getFailedPermanent();
      expect(failed.length).toBe(1);
      expect(failed[0]?.error_message).toContain('sudah dijemput');
      expect(result.failed).toBe(1);
    });
  });
});
