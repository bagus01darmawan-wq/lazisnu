import {actionQueue} from '../../src/services/offline/actionQueue';
import {initializeOfflineStorage, getOfflineStorage} from '../../src/services/offline/mmkv';

describe('actionQueue kunjungan offline', () => {
  beforeEach(() => {
    initializeOfflineStorage('test-offline-key-32-chars-length!');
    getOfflineStorage().clearAll();
  });

  const visit = (outcome: 'KOSONG' | 'DIKEMBALIKAN', period = '2026-11') => ({
    can_id: 'can-1',
    qr_code: 'QR-1',
    owner_name: 'Donatur 1',
    assignment_id: '11111111-1111-4111-8111-111111111111',
    period,
    outcome,
    created_at: '2026-11-17T06:30:00.000Z',
  });

  it('menyimpan satu tindakan dan menolak pengulangan serta outcome yang bertentangan', () => {
    const first = actionQueue.enqueueVisit(visit('KOSONG'));
    expect(first.status).toBe('queued');

    expect(actionQueue.enqueueVisit(visit('KOSONG')).status).toBe('already-pending');
    expect(actionQueue.enqueueVisit(visit('DIKEMBALIKAN')).status).toBe('conflict');
    expect(actionQueue.getQueue()).toHaveLength(1);
  });

  it('menyimpan hasil yang diakui sebelum menghapus antrean', () => {
    const queued = actionQueue.enqueueVisit(visit('KOSONG'));
    if (queued.status !== 'queued') throw new Error('Kunjungan awal tidak tersimpan');
    expect(actionQueue.acknowledgeVisit(queued.offline_id)).toBe(true);
    expect(actionQueue.getQueue()).toHaveLength(0);
    expect(actionQueue.getAcknowledgedVisits()).toEqual([
      expect.objectContaining({offline_id: queued.offline_id, outcome: 'KOSONG'}),
    ]);
  });

  it('tidak mencampur tugas dengan periode yang berbeda', () => {
    expect(actionQueue.enqueueVisit(visit('KOSONG', '2026-10')).status).toBe('queued');
    expect(actionQueue.enqueueVisit(visit('DIKEMBALIKAN', '2026-11')).status).toBe('queued');
    expect(actionQueue.getQueue()).toHaveLength(2);
  });

  it('mempertahankan identitas tindakan yang perlu diperiksa saat mencegah duplikasi', () => {
    const first = actionQueue.enqueueVisit(visit('KOSONG'));
    if (first.status !== 'queued') throw new Error('Kunjungan awal tidak tersimpan');
    const stored = actionQueue.getQueue()[0]!;
    actionQueue.moveToFailedPermanent([{...stored, error_message: 'ditolak server'}]);

    expect(actionQueue.enqueueVisit(visit('KOSONG')).status).toBe('already-pending');
    expect(actionQueue.getQueue()).toHaveLength(0);
    expect(actionQueue.getFailedPermanent()).toHaveLength(1);
  });
});
