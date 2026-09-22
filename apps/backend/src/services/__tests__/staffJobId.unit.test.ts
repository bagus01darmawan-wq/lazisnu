/**
 * M1 (backlog T11): jobId antrean teks staf ikut hash ISI pesan.
 * - Kirim ulang identik → jobId sama → tetap dedup (tidak spam).
 * - Revisi alasan (isi berubah) → jobId beda → pesan baru tidak ditelan.
 * Murni (tanpa Redis/DB): bullmq di-mock pola whatsapp-worker.test.ts.
 */

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
}));

import { buildStaffJobId } from '../queues';

const BASE = { template: 'REOPEN', entityId: 'ent-1', userId: 'usr-1' } as const;

describe('M1 buildStaffJobId', () => {
  test('isi identik → jobId identik (retry tetap dedup)', () => {
    const a = buildStaffJobId({ ...BASE, body: 'Reopen: kaleng tertinggal' });
    const b = buildStaffJobId({ ...BASE, body: 'Reopen: kaleng tertinggal' });
    expect(a).toBe(b);
    expect(a).toMatch(/^staff-REOPEN-ent-1-usr-1-[0-9a-f]{8}$/);
  });

  test('isi direvisi → jobId beda (pesan baru tidak ditelan)', () => {
    const a = buildStaffJobId({ ...BASE, body: 'Reopen: kaleng tertinggal' });
    const b = buildStaffJobId({ ...BASE, body: 'Reopen: kaleng tertinggal, plus koreksi' });
    expect(a).not.toBe(b);
  });

  test('template/entity/user beda → jobId beda', () => {
    const a = buildStaffJobId({ ...BASE, body: 'sama' });
    const b = buildStaffJobId({ ...BASE, template: 'BA_SIAP', body: 'sama' });
    expect(a).not.toBe(b);
  });
});
