import {
  fetchMobileVersion,
  shouldShowUpdate,
  isForcedUpdate,
  VERSION_CHECK_TIMEOUT_MS,
} from '../versionCheck';

const baseRelease = {
  version: '1.1.1',
  version_code: 18,
  apk_url: 'https://apk.lazisnu.site/lazisnu-1.1.1.apk',
  changelog: '- A\n- B',
  minimum_version_code: 0,
};

const jsonResponse = (body: unknown) => ({
  ok: true,
  json: async () => body,
});

describe('fetchMobileVersion', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('memanggil endpoint /v1/mobile/version dan mengembalikan data', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({success: true, data: baseRelease})) as unknown as typeof fetch;

    const result = await fetchMobileVersion();
    expect(result).toEqual(baseRelease);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/mobile/version'),
      expect.objectContaining({signal: expect.anything()}),
    );
  });

  it('melempar error pada HTTP non-2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    await expect(fetchMobileVersion()).rejects.toThrow('HTTP 500');
  });

  it('melempar error bila bentuk respons tidak sesuai', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({success: true})) as unknown as typeof fetch;
    await expect(fetchMobileVersion()).rejects.toThrow('Bentuk respons tidak sesuai');
  });

  it('membatalkan request setelah batas waktu', async () => {
    jest.useFakeTimers();
    let aborted = false;
    global.fetch = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      // Meniru fetch asli: promise menolak saat sinyal abort menyala.
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('Aborted'));
        });
      });
    }) as unknown as typeof fetch;

    const promise = fetchMobileVersion(100);
    jest.advanceTimersByTime(100);
    await expect(promise).rejects.toBeDefined();
    expect(aborted).toBe(true);
    expect(VERSION_CHECK_TIMEOUT_MS).toBe(5000);
  });
});

describe('shouldShowUpdate', () => {
  it('false bila versi server tidak lebih baru', () => {
    expect(shouldShowUpdate(18, baseRelease, 0)).toBe(false);
    expect(shouldShowUpdate(19, baseRelease, 0)).toBe(false);
  });

  it('true bila versi server lebih baru dan belum pernah di-Nanti', () => {
    expect(shouldShowUpdate(17, baseRelease, 0)).toBe(true);
  });

  it('false bila versi itu sudah pernah di-Nanti', () => {
    expect(shouldShowUpdate(17, baseRelease, 18)).toBe(false);
    expect(shouldShowUpdate(17, baseRelease, 99)).toBe(false);
  });

  it('true untuk versi BARU walau versi lama lain pernah di-Nanti', () => {
    expect(shouldShowUpdate(17, {...baseRelease, version_code: 19}, 18)).toBe(true);
  });
});

describe('isForcedUpdate', () => {
  it('false bila minimum_version_code = 0', () => {
    expect(isForcedUpdate(17, baseRelease)).toBe(false);
  });

  it('true bila versi terpasang di bawah ambang minimum', () => {
    expect(isForcedUpdate(17, {...baseRelease, minimum_version_code: 18})).toBe(true);
  });

  it('false bila versi terpasang memenuhi ambang minimum', () => {
    expect(isForcedUpdate(18, {...baseRelease, minimum_version_code: 18})).toBe(false);
  });
});
