import {toMobileHistoryItem} from '../collections';

describe('mobile collection history contract', () => {
  it('mengirim offline_id dan assignment_id untuk rekonsiliasi ACK yang aman', () => {
    const item = toMobileHistoryItem({
      id: 'collection-1',
      offlineId: 'offline-1',
      assignmentId: '00000000-0000-0000-0000-000000000001',
      canId: '00000000-0000-0000-0000-000000000002',
      nominal: '75000',
      collectedAt: new Date('2026-07-15T02:00:00.000Z'),
      syncStatus: 'COMPLETED',
      can: {
        qrCode: 'QR-001',
        ownerName: 'Donatur',
        ownerAddress: 'Alamat',
      },
    });

    expect(item).toMatchObject({
      id: 'collection-1',
      offline_id: 'offline-1',
      assignment_id: '00000000-0000-0000-0000-000000000001',
      can_id: '00000000-0000-0000-0000-000000000002',
      nominal: 75000,
      sync_status: 'COMPLETED',
    });
  });
});
