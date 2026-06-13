// apps/mobile/__tests__/services/secureKey.test.ts
//
// Unit test untuk secureKey.ts (P4.2). Verifikasi behavior:
// - generate key baru saat Keychain kosong
// - reuse key dari Keychain (cache vs re-read)
// - clearEncryptionKey hapus dari Keychain + cache
// - generateEphemeralKey selalu return key baru (random)
// - fallback ke ok=false saat Keychain error
// - max key length 16 chars (MMKV limit)

import * as Keychain from 'react-native-keychain';
import {
  getOrCreateEncryptionKey,
  generateEphemeralKey,
  clearEncryptionKey,
  getCachedEncryptionKey,
  __resetCacheForTest,
  __TEST__,
} from '../../src/services/secureKey';

describe('secureKey', () => {
  beforeEach(() => {
    Keychain.__resetMock();
    __resetCacheForTest();
  });

  describe('getOrCreateEncryptionKey', () => {
    it('generate key baru saat Keychain kosong', async () => {
      Keychain.__setMockValue(null); // Keychain empty

      const result = await getOrCreateEncryptionKey();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.source).toBe('keychain');
        expect(result.key).toBeTruthy();
        // 12 bytes → base64 = 16 chars (MMKV limit)
        expect(result.key.length).toBe(16);
      }
    });

    it('reuse key dari Keychain pada second call', async () => {
      Keychain.__setMockValue({
        service: __TEST__.KEYCHAIN_SERVICE,
        username: __TEST__.KEYCHAIN_USERNAME,
        password: 'existing-key-12',
      });

      const result1 = await getOrCreateEncryptionKey();
      const result2 = await getOrCreateEncryptionKey();

      expect(result1.ok && result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.key).toBe('existing-key-12');
        expect(result2.key).toBe('existing-key-12');
        // First call from keychain, second from cache
        expect(result2.source).toBe('cache');
      }
    });

    it('cache hit tidak query Keychain (performance)', async () => {
      Keychain.__setMockValue({
        service: __TEST__.KEYCHAIN_SERVICE,
        username: 'mmkv',
        password: 'cached-key-1234',
      });

      await getOrCreateEncryptionKey(); // populates cache
      Keychain.__resetMock(); // reset call history
      const result = await getOrCreateEncryptionKey(); // should hit cache

      expect(result.ok && result.source).toBe('cache');
      const calls = Keychain.__getCalls();
      expect(calls.filter((c) => c.method === 'getGenericPassword')).toHaveLength(0);
    });

    it('return ok=false saat Keychain throw error', async () => {
      Keychain.__setMockError(new Error('Keychain corrupt'));

      const result = await getOrCreateEncryptionKey();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('keychain_unavailable');
      }
    });

    it('simpan key dengan service name yang benar', async () => {
      Keychain.__setMockValue(null);

      await getOrCreateEncryptionKey();

      const calls = Keychain.__getCalls();
      const setCall = calls.find((c) => c.method === 'setGenericPassword');
      expect(setCall).toBeDefined();
      if (setCall) {
        const args = setCall.args as { username: string; options: { service: string; accessible: string; storage: string } };
        expect(args.options.service).toBe(__TEST__.KEYCHAIN_SERVICE);
        expect(args.options.accessible).toBe(Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK);
        expect(args.options.storage).toBe(Keychain.STORAGE_TYPE.AES);
      }
    });
  });

  describe('generateEphemeralKey', () => {
    it('return key dengan length 16 (MMKV limit)', () => {
      const key = generateEphemeralKey();
      expect(key.length).toBe(16);
    });

    it('return key BERBEDA tiap call (random)', () => {
      const key1 = generateEphemeralKey();
      const key2 = generateEphemeralKey();
      const key3 = generateEphemeralKey();
      expect(key1).not.toBe(key2);
      expect(key2).not.toBe(key3);
      expect(key1).not.toBe(key3);
    });
  });

  describe('clearEncryptionKey', () => {
    it('hapus key dari Keychain dan clear cache', async () => {
      Keychain.__setMockValue({
        service: __TEST__.KEYCHAIN_SERVICE,
        username: 'mmkv',
        password: 'key-to-clear',
      });

      await getOrCreateEncryptionKey();
      expect(getCachedEncryptionKey()).toBe('key-to-clear');

      await clearEncryptionKey();

      expect(getCachedEncryptionKey()).toBeNull();
      const calls = Keychain.__getCalls();
      expect(calls.some((c) => c.method === 'resetGenericPassword')).toBe(true);
    });

    it('best-effort: tetap clear cache meski Keychain error', async () => {
      Keychain.__setMockValue({
        service: __TEST__.KEYCHAIN_SERVICE,
        username: 'mmkv',
        password: 'test-key',
      });
      await getOrCreateEncryptionKey();
      expect(getCachedEncryptionKey()).toBe('test-key');

      Keychain.__setMockError(new Error('Keychain unavailable'));
      await clearEncryptionKey(); // should not throw

      expect(getCachedEncryptionKey()).toBeNull();
    });
  });

  describe('integration: getOrCreateEncryptionKey after clear', () => {
    it('bisa generate key baru setelah clear', async () => {
      Keychain.__setMockValue({
        service: __TEST__.KEYCHAIN_SERVICE,
        username: 'mmkv',
        password: 'first-key-123',
      });
      const first = await getOrCreateEncryptionKey();
      expect(first.ok && first.key).toBe('first-key-123');

      await clearEncryptionKey();
      Keychain.__setMockValue(null); // simulate Keychain now empty
      const second = await getOrCreateEncryptionKey();

      expect(second.ok).toBe(true);
      if (second.ok && first.ok) {
        expect(second.key).not.toBe(first.key); // new key generated
      }
    });
  });
});
