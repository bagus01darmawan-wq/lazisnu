import { createSystemBreaker } from '../systemBreaker';

function buatReply(): any {
  const reply: any = {};
  reply.code = jest.fn().mockReturnValue(reply);
  reply.header = jest.fn().mockReturnValue(reply);
  reply.send = jest.fn().mockResolvedValue(undefined);
  return reply;
}

describe('systemBreaker — pemutus arus sistem (D3)', () => {
  it('mengizinkan permintaan sampai batas jendela', async () => {
    let t = 1_000_000;
    const breaker = createSystemBreaker({ max: 3, windowMs: 60_000, now: () => t });

    for (let i = 0; i < 3; i++) {
      const reply = buatReply();
      await breaker({} as any, reply);
      expect(reply.send).not.toHaveBeenCalled();
    }
  });

  it('menolak 429 + retry-after + payload TOO_MANY_REQUESTS di atas batas', async () => {
    let t = 1_000_000;
    const breaker = createSystemBreaker({ max: 3, windowMs: 60_000, now: () => t });

    for (let i = 0; i < 3; i++) await breaker({} as any, buatReply());

    const reply = buatReply();
    await breaker({} as any, reply);

    expect(reply.code).toHaveBeenCalledWith(429);
    expect(reply.header).toHaveBeenCalledWith('retry-after', '60');
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'TOO_MANY_REQUESTS' }),
      })
    );
  });

  it('menghitung ulang setelah jendela lewat (fixed window)', async () => {
    let t = 1_000_000;
    const breaker = createSystemBreaker({ max: 2, windowMs: 60_000, now: () => t });

    for (let i = 0; i < 2; i++) await breaker({} as any, buatReply());
    const replyDitolak = buatReply();
    await breaker({} as any, replyDitolak); // permintaan ke-3 → 429
    expect(replyDitolak.send).toHaveBeenCalled();

    t += 60_000; // jendela baru dimulai
    const reply = buatReply();
    await breaker({} as any, reply);
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('retry-after mencerminkan sisa jendela, bukan lebar penuh', async () => {
    let t = 1_000_000;
    const breaker = createSystemBreaker({ max: 1, windowMs: 60_000, now: () => t });

    await breaker({} as any, buatReply());

    t += 25_000; // 35 detik tersisa di jendela
    const reply = buatReply();
    await breaker({} as any, reply);

    expect(reply.header).toHaveBeenCalledWith('retry-after', '35');
  });
});
