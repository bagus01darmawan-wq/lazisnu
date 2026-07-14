import { getSafeWhatsAppQueueStats } from '../wa';

const mockWaitingCount = jest.fn();
const mockActiveCount = jest.fn();
const mockCompletedCount = jest.fn();
const mockFailedCount = jest.fn();
const mockDelayedCount = jest.fn();

jest.mock('../../../services/whatsapp', () => ({
  getWhatsAppQueue: jest.fn().mockImplementation(() => ({
    getWaitingCount: mockWaitingCount,
    getActiveCount: mockActiveCount,
    getCompletedCount: mockCompletedCount,
    getFailedCount: mockFailedCount,
    getDelayedCount: mockDelayedCount,
  })),
}));

describe('wa admin route helper — getSafeWhatsAppQueueStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('harus mengembalikan statistik yang benar saat semua pemanggilan count sukses', async () => {
    mockWaitingCount.mockResolvedValue(2);
    mockActiveCount.mockResolvedValue(1);
    mockCompletedCount.mockResolvedValue(10);
    mockFailedCount.mockResolvedValue(3);
    mockDelayedCount.mockResolvedValue(1);

    const req = {
      log: { warn: jest.fn() }
    } as any;

    const stats = await getSafeWhatsAppQueueStats(req);

    expect(stats).toEqual({
      sent: 10,
      pending: 4, // waiting (2) + active (1) + delayed (1)
      failed: 3
    });
    expect(req.log.warn).not.toHaveBeenCalled();
  });

  it('harus mengembalikan fallback (0,0,0) saat salah satu pemanggilan melempar error', async () => {
    mockWaitingCount.mockRejectedValue(new Error('Redis connection failed'));
    mockActiveCount.mockResolvedValue(1);
    mockCompletedCount.mockResolvedValue(10);
    mockFailedCount.mockResolvedValue(3);
    mockDelayedCount.mockResolvedValue(1);

    const req = {
      log: { warn: jest.fn() }
    } as any;

    const stats = await getSafeWhatsAppQueueStats(req);

    expect(stats).toEqual({
      sent: 0,
      pending: 0,
      failed: 0
    });
    expect(req.log.warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      'Failed to fetch WhatsApp queue stats'
    );
  });
});
