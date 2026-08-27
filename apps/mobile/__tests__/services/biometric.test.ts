// apps/mobile/__tests__/services/biometric.test.ts
//
// Unit test untuk biometric.ts (Sub-bab 05, D-09) — revisi 2026-08-26.
// Arsitektur GERBANG + GUDANG:
// - A (BIOMETRY_ANY) = gerbang: dibaca saat tombol login (prompt);
//   ditulis HANYA saat enable/disable. Isinya TIDAK dipakai sebagai token.
// - B (silent) = gudang token terbaru, ditulis diam-diam di setiap rotasi.

import * as Keychain from 'react-native-keychain';
import {
  isBiometricAvailable,
  getBiometryType,
  enableBiometric,
  getTokenWithBiometric,
  saveRefreshTokenSilent,
  getRefreshTokenSilent,
  disableBiometric,
} from '../../src/services/biometric';

const BIOMETRIC_SERVICE = 'com.lazisnu.biometric.refresh-token';
const SILENT_SERVICE = 'com.lazisnu.biometric.refresh-token.silent';
const REFRESH_TOKEN = 'test-refresh-token-abc123';
const NEW_REFRESH_TOKEN = 'new-refresh-token-xyz789';

const setCallFor = (service: string) =>
  Keychain.__getCalls().find(
    c => c.method === 'setGenericPassword' && (c.args as {options?: {service?: string}}).options?.service === service,
  );

describe('biometric', () => {
  beforeEach(() => {
    Keychain.__resetMock();
  });

  // ── Enable: gerbang A (BIOMETRY_ANY) + seed gudang B ────────────────────

  describe('enableBiometric', () => {
    it('menyimpan di gerbang A dengan accessControl biometrik, lalu seed gudang B tanpa accessControl', async () => {
      const result = await enableBiometric(REFRESH_TOKEN);

      expect(result).toBe(true);

      const aSet = setCallFor(BIOMETRIC_SERVICE);
      expect(aSet).toBeDefined();
      const aArgs = aSet?.args as {username: string; options: {service: string; accessControl: string; accessible: string}};
      expect(aArgs.username).toBe('biometric');
      expect(aArgs.options.accessControl).toBe(Keychain.ACCESS_CONTROL.BIOMETRY_ANY);
      expect(aArgs.options.accessible).toBe(Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY);

      const bSet = setCallFor(SILENT_SERVICE);
      expect(bSet).toBeDefined();
      const bArgs = bSet?.args as {options: {accessControl?: string; authenticationPrompt?: unknown}};
      expect(bArgs.options.accessControl).toBeUndefined();
      expect(bArgs.options.authenticationPrompt).toBeUndefined();

      // Kedua gerbang terbaca
      expect(await getTokenWithBiometric()).toBe(REFRESH_TOKEN);
      expect(await getRefreshTokenSilent()).toBe(REFRESH_TOKEN);
    });

    it('return false jika simpan ke Keychain gagal', async () => {
      Keychain.__setMockError(new Error('Keychain unavailable'));

      const result = await enableBiometric(REFRESH_TOKEN);
      expect(result).toBe(false);
    });
  });

  // ── Rotasi: tulis GUDANG B diam-diam, gerbang A tak tersentuh ────────────

  describe('saveRefreshTokenSilent (rotasi)', () => {
    it('token baru masuk gudang B; gerbang A TIDAK berubah (oracle)', async () => {
      await enableBiometric(REFRESH_TOKEN);

      const updateResult = await saveRefreshTokenSilent(NEW_REFRESH_TOKEN);
      expect(updateResult).toBe(true);

      expect(await getRefreshTokenSilent()).toBe(NEW_REFRESH_TOKEN);
      expect(await getTokenWithBiometric()).toBe(REFRESH_TOKEN); // A tak tersentuh
    });

    it('penulisan TIDAK memakai accessControl biometrik (tidak memicu prompt)', async () => {
      await saveRefreshTokenSilent(NEW_REFRESH_TOKEN);

      const bSet = setCallFor(SILENT_SERVICE);
      expect(bSet).toBeDefined();
      const args = bSet?.args as {options: {accessControl?: string; authenticationPrompt?: unknown}};
      expect(args.options.accessControl).toBeUndefined();
      expect(args.options.authenticationPrompt).toBeUndefined();
    });
  });

  describe('getRefreshTokenSilent', () => {
    it('null bila gudang kosong', async () => {
      expect(await getRefreshTokenSilent()).toBeNull();
    });

    it('null bila Keychain error', async () => {
      Keychain.__setMockError(new Error('Keychain unavailable'));
      expect(await getRefreshTokenSilent()).toBeNull();
    });
  });

  // ── Toggle off: hapus gerbang A DAN gudang B ─────────────────────────────

  describe('disableBiometric', () => {
    it('menghapus refresh token dari gerbang A dan gudang B', async () => {
      await enableBiometric(REFRESH_TOKEN);

      expect(await disableBiometric()).toBe(true);

      expect(await getTokenWithBiometric()).toBeNull();
      expect(await getRefreshTokenSilent()).toBeNull();

      const resets = Keychain.__getCalls().filter(c => c.method === 'resetGenericPassword');
      expect(resets).toHaveLength(2);
      const services = resets.map(
        c => (c.args as {service?: string}).service,
      );
      expect(services).toContain(BIOMETRIC_SERVICE);
      expect(services).toContain(SILENT_SERVICE);
    });

    it('best-effort: tidak throw meski Keychain error', async () => {
      Keychain.__setMockError(new Error('Keychain unavailable'));
      const result = await disableBiometric();
      expect(result).toBe(false);
    });
  });

  // ── Gerbang: baca dengan prompt ──────────────────────────────────────────

  describe('getTokenWithBiometric', () => {
    it('mengembalikan null jika gerbang kosong', async () => {
      Keychain.__setMockValue(null);
      const token = await getTokenWithBiometric();
      expect(token).toBeNull();
    });

    it('mengembalikan null jika user membatalkan biometrik', async () => {
      Keychain.__setMockError(new Error('User canceled'));
      const token = await getTokenWithBiometric();
      expect(token).toBeNull();
    });

    it('menggunakan authentication prompt yang benar', async () => {
      await enableBiometric(REFRESH_TOKEN);

      Keychain.__resetMock();
      Keychain.__setMockValue({
        service: BIOMETRIC_SERVICE,
        username: 'biometric',
        password: REFRESH_TOKEN,
      });

      await getTokenWithBiometric();

      const calls = Keychain.__getCalls();
      const getCall = calls.find(c => c.method === 'getGenericPassword');
      expect(getCall).toBeDefined();
      const args = getCall?.args as {authenticationPrompt: {title: string; cancel: string}};
      expect(args.authenticationPrompt.title).toBe('Login Biometrik');
      expect(args.authenticationPrompt.cancel).toBe('Batal');
    });
  });

  // ── Ketersediaan biometrik ──────────────────────────────────────────────

  describe('isBiometricAvailable', () => {
    it('return true jika perangkat mendukung biometrik', async () => {
      const result = await isBiometricAvailable();
      expect(result).toBe(true);
    });

    it('return false jika perangkat tidak mendukung biometrik', async () => {
      Keychain.__setBiometryType(null);
      const result = await isBiometricAvailable();
      expect(result).toBe(false);
    });
  });

  describe('getBiometryType', () => {
    it('return nama yang sudah dinormalisasi', async () => {
      Keychain.__setBiometryType(Keychain.BIOMETRY_TYPE.FINGERPRINT.toString());
      const type = await getBiometryType();
      expect(type).toBe('Sidik Jari');
    });

    it('return null jika tidak tersedia', async () => {
      Keychain.__setBiometryType(null);
      const type = await getBiometryType();
      expect(type).toBeNull();
    });
  });
});
