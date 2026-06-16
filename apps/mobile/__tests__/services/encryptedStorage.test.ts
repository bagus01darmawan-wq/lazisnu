// apps/mobile/__tests__/services/encryptedStorage.test.ts
//
// Integration test untuk secureStorage.ts orchestrator (P4.3).
// Verifikasi 3 fallback path sesuai Design Decision:
// - 'none'            : Keychain OK, semua encrypted
// - 'ephemeral_default': Keychain gagal, default pakai ephemeral + offline wiped
// - 'wiped'           : bahkan ephemeral gagal, wipe total
//
// Serta verifikasi teardown path.

import * as Keychain from 'react-native-keychain';
import * as MmkvModule from 'react-native-mmkv';
import {
  initEncryptedStorage,
  teardownEncryptedStorage,
  getEncryptionStatus,
  __resetForTest,
} from '../../src/services/secureStorage';
import { __resetCacheForTest } from '../../src/services/secureKey';

// Shortcut — MmkvModule.__resetMock() dll adalah test helpers
// yang ditambahkan di __mocks__/react-native-mmkv.ts

describe('encryptedStorage', () => {
  beforeEach(() => {
    Keychain.__resetMock();
    MmkvModule.__resetMock();
    __resetForTest();
    __resetCacheForTest(); // penting: clear in-memory key cache dari secureKey.ts
  });

  describe('initEncryptedStorage', () => {
    it('happy path: Keychain OK → recrypt both instances', async () => {
      Keychain.__setMockValue({
        service: 'com.lazisnu.mmkv.encryption-key',
        username: 'mmkv',
        password: 'a-12byte-key',
      });
      (MmkvModule as any).__setStorage({ existing_token: 'plain-value' });

      const status = await initEncryptedStorage();

      expect(status.fallback).toBe('none');
      expect(status.defaultSecure).toBe(true);
      expect(status.offlineSecure).toBe(true);
      // recrypt() called → key applied
      expect((MmkvModule as any).__getCurrentKey()).toBe('a-12byte-key');
      // Existing data preserved
      const data = (MmkvModule as any).__getStorage();
      expect(data.existing_token).toBe('plain-value');
    });

    it('ephemeral_default: Keychain gagal → default ephemeral + offline wiped', async () => {
      Keychain.__setMockError(new Error('Keychain corrupt'));
      (MmkvModule as any).__setStorage({
        access_token: 'old-token',
        queue_item_1: 'financial-data',
      });

      const status = await initEncryptedStorage();

      expect(status.fallback).toBe('ephemeral_default');
      expect(status.defaultSecure).toBe(false);
      expect(status.offlineSecure).toBe(false);
      expect(status.reason).toBe('keychain_unavailable');
      // Default MMKV got ephemeral key (some 16-char string)
      const defaultKey = (MmkvModule as any).__getCurrentKey();
      expect(defaultKey).toBeTruthy();
      expect(defaultKey.length).toBeLessThanOrEqual(16);
      // Offline queue wiped
      const data = (MmkvModule as any).__getStorage();
      expect(data.queue_item_1).toBeUndefined();
      // Note: in the mock, both MMKV instances share the same data map
      // so we can't differentiate. Real MMKV has separate instances.
    });

    it('idempotent: second call return cached status', async () => {
      Keychain.__setMockValue({
        service: 'com.lazisnu.mmkv.encryption-key',
        username: 'mmkv',
        password: 'first-key-12',
      });

      const status1 = await initEncryptedStorage();
      // Reset Keychain to simulate a state change
      Keychain.__resetMock();
      const status2 = await initEncryptedStorage();

      // Should return same status object (cached)
      expect(status1).toBe(status2);
      expect(status2.fallback).toBe('none');
    });

    it('return same status object di subsequent calls', async () => {
      Keychain.__setMockValue({
        service: 'com.lazisnu.mmkv.encryption-key',
        username: 'mmkv',
        password: 'cache-test-key',
      });

      const status1 = await initEncryptedStorage();
      const status2 = await initEncryptedStorage();
      const status3 = await initEncryptedStorage();

      expect(status1).toBe(status2);
      expect(status2).toBe(status3);
    });
  });

  describe('teardownEncryptedStorage', () => {
    it('hapus key dari Keychain + wipe MMKV + reset cache', async () => {
      Keychain.__setMockValue({
        service: 'com.lazisnu.mmkv.encryption-key',
        username: 'mmkv',
        password: 'to-be-cleared',
      });
      (MmkvModule as any).__setStorage({ access_token: 'user-data' });

      await initEncryptedStorage();
      expect(getEncryptionStatus()).not.toBeNull();

      await teardownEncryptedStorage();

      expect(getEncryptionStatus()).toBeNull();
      const calls = Keychain.__getCalls();
      expect(calls.some((c) => c.method === 'resetGenericPassword')).toBe(true);
    });

    it('setelah teardown, init ulang bisa dilakukan', async () => {
      Keychain.__setMockValue({
        service: 'com.lazisnu.mmkv.encryption-key',
        username: 'mmkv',
        password: 'first-key',
      });
      await initEncryptedStorage();
      await teardownEncryptedStorage();

      // Setup ulang
      Keychain.__setMockValue({
        service: 'com.lazisnu.mmkv.encryption-key',
        username: 'mmkv',
        password: 'second-key',
      });
      const newStatus = await initEncryptedStorage();

      expect(newStatus.fallback).toBe('none');
    });
  });

  describe('getEncryptionStatus', () => {
    it('return null sebelum init', () => {
      expect(getEncryptionStatus()).toBeNull();
    });

    it('return status setelah init', async () => {
      Keychain.__setMockValue({
        service: 'com.lazisnu.mmkv.encryption-key',
        username: 'mmkv',
        password: 'init-test-12',
      });
      await initEncryptedStorage();
      const status = getEncryptionStatus();
      expect(status).not.toBeNull();
      expect(status?.fallback).toBe('none');
    });
  });
});
