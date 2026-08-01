/**
 * TC-WA-FAIL (P2-C3): job gagal berulang → HANYA 1 baris FAILED di tabel
 * notifications. Retry BullMQ memicu event 'failed' tiap attempt, tapi
 * pencatatan FAILED hanya terjadi pada attempt terakhir (attemptsMade >=
 * opts.attempts) — lihat handleJobFailure di whatsapp.worker.ts.
 */

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn() })),
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn() })),
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../config/database', () => {
  const values = jest.fn().mockResolvedValue(undefined);
  return {
    db: { insert: jest.fn().mockReturnValue({ values }) },
    closeDbConnection: jest.fn().mockResolvedValue(undefined),
    testConnection: jest.fn().mockResolvedValue(true),
    __values: values,
  };
});

import { handleJobFailure } from '../../workers/whatsapp.worker';

const { db: mockedDb, __values } = require('../../config/database');

const jobData = {
  phone: '081234567890',
  ownerName: 'Budi',
  nominal: '50000',
  officerName: 'Petugas A',
  collectionId: 'col-1',
};

function makeJob(attemptsMade: number, attempts = 3) {
  return { attemptsMade, opts: { attempts }, data: jobData } as any;
}

describe('whatsapp.worker — handleJobFailure (P2-C3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('attempt sebelum attempts habis → TIDAK insert', async () => {
    await handleJobFailure(makeJob(2));
    expect(mockedDb.insert).not.toHaveBeenCalled();
  });

  it('attempt terakhir → insert 1 baris FAILED', async () => {
    await handleJobFailure(makeJob(3));
    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
    expect(__values).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FAILED',
        messageTemplate: 'collection_receipt',
        recipientPhone: '081234567890',
        collectionId: 'col-1',
      })
    );
  });

  it('3 attempt gagal → total insert hanya 1 (bukan 3)', async () => {
    await handleJobFailure(makeJob(1));
    await handleJobFailure(makeJob(2));
    await handleJobFailure(makeJob(3));
    expect(mockedDb.insert).toHaveBeenCalledTimes(1);
  });
});
