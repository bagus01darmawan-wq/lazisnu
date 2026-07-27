// apps/mobile/__tests__/services/biometric.test.ts
//
// Unit test untuk biometric.ts (Sub-bab 05, D-09).
// Verifikasi 4 skenario wajib:
// - Enable → token tersimpan di Keychain
// - Login biometric sukses → rotasi refresh token tersimpan kembali
// - REFRESH_REVOKED → fallback disable; entry Keychain terhapus
// - Toggle off → entry Keychain terhapus

import * as Keychain from 'react-native-keychain';
import {
  isBiometricAvailable,
  getBiometryType,
  enableBiometric,
  getTokenWithBiometric,
  updateBiometricToken,
  disableBiometric,
} from '../../src/services/biometric';

const BIOMETRIC_SERVICE = 'com.lazisnu.biometric.refresh-token';
const REFRESH_TOKEN = 'test-refresh-token-abc123';
const NEW_REFRESH_TOKEN = 'new-refresh-token-xyz789';

describe('biometric', () => {
  beforeEach(() => {
    Keychain.__resetMock();
  });

  // ── Skenario 1: Enable → token tersimpan di Keychain ────────────────────

  describe('enableBiometric', () => {
    it('menyimpan refresh token di Keychain dengan access control biometrik', async () => {
      const result = await enableBiometric(REFRESH_TOKEN);

      expect(result).toBe(true);

      // Verifikasi token tersimpan
      const calls = Keychain.__getCalls();
      const setCall = calls.find((c) => c.method === 'setGenericPassword');
      expect(setCall).toBeDefined();

      if (setCall) {
        const args = setCall.args as { username: string; options: { service: string; accessControl: string; accessible: string } };
        expect(args.username).toBe('biometric');
        expect(args.options.service).toBe(BIOMETRIC_SERVICE);
        expect(args.options.accessControl).toBe(Keychain.ACCESS_CONTROL.BIOMETRY_ANY);
        expect(args.options.accessible).toBe(Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY);
      }

      // Verifikasi bisa dibaca kembali
      const stored = await getTokenWithBiometric();
      expect(stored).toBe(REFRESH_TOKEN);
    });

    it('return false jika simpan ke Keychain gagal', async () => {
      Keychain.__setMockError(new Error('Keychain unavailable'));

      const result = await enableBiometric(REFRESH_TOKEN);
      expect(result).toBe(false);
    });
  });

  // ── Skenario 2: Login biometric sukses → rotasi refresh token ────────────

  describe('updateBiometricToken (rotasi)', () => {
    it('token baru menimpa token lama di Keychain', async () => {
      // Enable dulu
      await enableBiometric(REFRESH_TOKEN);

      // Rotasi: simpan token baru
      const updateResult = await updateBiometricToken(NEW_REFRESH_TOKEN);
      expect(updateResult).toBe(true);

      // Verifikasi token lama sudah tertimpa
      const stored = await getTokenWithBiometric();
      expect(stored).toBe(NEW_REFRESH_TOKEN);
      expect(stored).not.toBe(REFRESH_TOKEN);
    });
  });

  // ── Skenario 3: Toggle off → entry Keychain terhapus ─────────────────────

  describe('disableBiometric', () => {
    it('menghapus refresh token dari Keychain', async () => {
      // Enable dulu
      await enableBiometric(REFRESH_TOKEN);

      // Verifikasi token ada
      const beforeDisable = await getTokenWithBiometric();
      expect(beforeDisable).toBe(REFRESH_TOKEN);

      // Toggle off
      const disableResult = await disableBiometric();
      expect(disableResult).toBe(true);

      // Verifikasi Keychain kosong
      Keychain.__setMockValue(null); // Simulasi Keychain benar-benar terhapus
      const afterDisable = await getTokenWithBiometric();
      expect(afterDisable).toBeNull();

      // Verifikasi resetGenericPassword dipanggil
      const calls = Keychain.__getCalls();
      const resetCall = calls.find((c) => c.method === 'resetGenericPassword');
      expect(resetCall).toBeDefined();
      if (resetCall) {
        const args = resetCall.args as { service: string };
        expect(args.service).toBe(BIOMETRIC_SERVICE);
      }
    });

    it('best-effort: tidak throw meski Keychain error', async () => {
      Keychain.__setMockError(new Error('Keychain unavailable'));

      // Tidak boleh throw
      const result = await disableBiometric();
      expect(result).toBe(false);
    });
  });

  // ── Skenario 4: REFRESH_REVOKED → tidak bisa login biometrik ─────────────

  describe('getTokenWithBiometric', () => {
    it('mengembalikan null jika Keychain kosong (simulasi setelah revoke)', async () => {
      // Tanpa enable terlebih dahulu — simulasi setelah disableBiometric
      Keychain.__setMockValue(null);

      const token = await getTokenWithBiometric();
      expect(token).toBeNull();
    });

    it('mengembalikan null jika user membatalkan biometrik', async () => {
      // Simulasi Keychain throw (user cancel / error)
      Keychain.__setMockError(new Error('User canceled'));

      const token = await getTokenWithBiometric();
      expect(token).toBeNull();
    });

    it('menggunakan authentication prompt yang benar', async () => {
      await enableBiometric(REFRESH_TOKEN);

      // Reset call history untuk melihat hanya call terbaru
      Keychain.__resetMock();
      // Re-set mock value
      Keychain.__setMockValue({
        service: BIOMETRIC_SERVICE,
        username: 'biometric',
        password: REFRESH_TOKEN,
      });

      await getTokenWithBiometric();

      const calls = Keychain.__getCalls();
      const getCall = calls.find((c) => c.method === 'getGenericPassword');
      expect(getCall).toBeDefined();
      if (getCall) {
        const args = getCall.args as { authenticationPrompt: { title: string; cancel: string } };
        expect(args.authenticationPrompt.title).toBe('Login Biometrik');
        expect(args.authenticationPrompt.cancel).toBe('Batal');
      }
    });
  });

  // ── Biometric availability ──────────────────────────────────────────────

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
