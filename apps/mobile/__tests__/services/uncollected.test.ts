import {Task} from '@lazisnu/shared-types';
import {composeUncollectedOffline} from '../../src/services/offline/uncollected';
import {QueuedAction} from '../../src/services/offline/actionQueue';

const serverTask = (id: string, owner: string): Task =>
  ({
    id,
    can_id: `can_${id}`,
    qr_code: `QR-${id}`,
    owner_name: owner,
    owner_phone: '',
    owner_address: 'Jl. Uji 1',
    status: 'UNCOLLECTED',
    assigned_at: '2026-10-01T00:00:00.000Z',
    period: '2026-10',
    skip_reason_code: 'OWNER_ABSENT',
  }) as Task;

const skipAction = (assignmentId: string, overrides: Partial<Record<string, unknown>> = {}) =>
  ({
    kind: 'SKIP',
    offline_id: `off_${assignmentId}`,
    assignment_id: assignmentId,
    can_id: `can_${assignmentId}`,
    qr_code: `QR-${assignmentId}`,
    owner_name: 'Bpk Offline',
    reason_code: 'OWNER_REFUSED',
    created_at: '2026-10-28T01:00:00.000Z',
    ...overrides,
  }) as QueuedAction;

describe('composeUncollectedOffline', () => {
  it('menambahkan aksi skip menunggu replay sebagai kartu baru', () => {
    const result = composeUncollectedOffline([serverTask('t1', 'Bpk Lama')], [skipAction('t2')]);

    expect(result.length).toBe(2);
    const added = result[1]!;
    expect(added.id).toBe('t2');
    expect(added.owner_name).toBe('Bpk Offline');
    expect(added.qr_code).toBe('QR-t2');
    expect(added.skip_reason_code).toBe('OWNER_REFUSED');
    expect(added.status).toBe('UNCOLLECTED');
  });

  it('tidak menduplikasi tugas yang sudah ada di daftar', () => {
    const prev = [serverTask('t2', 'Sudah ada')];
    const result = composeUncollectedOffline(prev, [skipAction('t2')]);

    expect(result.length).toBe(1);
    expect(result[0]!.owner_name).toBe('Sudah ada');
  });

  it('mengembalikan daftar yang sama saat tidak ada aksi SKIP', () => {
    const prev = [serverTask('t1', 'Bpk Lama')];
    const visit = {
      kind: 'VISIT',
      offline_id: 'off_v',
      can_id: 'can_v',
      outcome: 'DIKEMBALIKAN',
      created_at: '2026-10-28T01:00:00.000Z',
    } as QueuedAction;

    expect(composeUncollectedOffline(prev, [visit])).toBe(prev);
    expect(composeUncollectedOffline(prev, [])).toBe(prev);
  });

  it('memakai qr_code sebagai judul saat owner_name kosong', () => {
    const result = composeUncollectedOffline([], [skipAction('t3', {owner_name: undefined})]);

    expect(result[0]!.owner_name).toBe('QR-t3');
  });
});
