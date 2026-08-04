/**
 * biometric.ts — Layanan biometrik (sidik jari / face ID) untuk login cepat.
 *
 * Prinsip keamanan:
 * - Sidik jari hanya membuka akses ke refresh token di Android Keystore / iOS Keychain
 * - Server tetap otoritas penuh — revoke di server = jalur biometrik ikut mati
 * - Password tidak pernah disimpan
 * - Saat rotasi refresh, token baru disimpan kembali ke Keychain
 * - Saat REFRESH_REVOKED, biometrik dinonaktifkan otomatis
 *
 * Ref: Bab 20.3, D-09 (opsional toggle On/Off)
 */

import * as Keychain from 'react-native-keychain';

const BIOMETRIC_SERVICE = 'com.lazisnu.biometric.refresh-token';
const BIOMETRIC_USERNAME = 'biometric';

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const type = await Keychain.getSupportedBiometryType();
    return type !== null;
  } catch {
    return false;
  }
}

export async function getBiometryType(): Promise<string | null> {
  try {
    const type = await Keychain.getSupportedBiometryType();
    if (!type) return null;

    // Normalisasi nama untuk UI
    switch (type) {
      case Keychain.BIOMETRY_TYPE.TOUCH_ID:
        return 'Touch ID';
      case Keychain.BIOMETRY_TYPE.FACE_ID:
        return 'Face ID';
      case Keychain.BIOMETRY_TYPE.FINGERPRINT:
        return 'Sidik Jari';
      case Keychain.BIOMETRY_TYPE.FACE:
        return 'Wajah';
      case Keychain.BIOMETRY_TYPE.IRIS:
        return 'Iris';
      case Keychain.BIOMETRY_TYPE.OPTIC_ID:
        return 'Optic ID';
      default:
        return 'Biometrik';
    }
  } catch {
    return null;
  }
}

/**
 * Aktifkan login biometrik: simpan refresh token di Keystore/Keychain
 * yang hanya bisa dibuka dengan sidik jari / face ID.
 */
export async function enableBiometric(refreshToken: string): Promise<boolean> {
  try {
    const result = await Keychain.setGenericPassword(
      BIOMETRIC_USERNAME,
      refreshToken,
      {
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        service: BIOMETRIC_SERVICE,
        authenticationPrompt: {
          title: 'Aktifkan Login Biometrik',
          subtitle: 'Konfirmasi dengan sidik jari atau face ID',
          cancel: 'Batal',
        },
      },
    );
    return result !== false;
  } catch (error) {
    // Diagnosa: error native (mis. E_CRYPTO_FAILED, KeyStoreException) —
    // tampil di logcat / console, tidak membocorkan refresh token.
    console.warn('[biometric] enableBiometric gagal:', error);
    return false;
  }
}

/**
 * Buka refresh token dengan biometrik.
 * Memunculkan prompt sidik jari / face ID sistem.
 *
 * @returns refresh token atau null jika gagal / user membatalkan
 */
export async function getTokenWithBiometric(): Promise<string | null> {
  try {
    const credentials = await Keychain.getGenericPassword({
      authenticationPrompt: {
        title: 'Login Biometrik',
        subtitle: 'Gunakan sidik jari atau face ID',
        cancel: 'Batal',
      },
      service: BIOMETRIC_SERVICE,
    });

    if (!credentials || typeof credentials === 'boolean') {
      return null;
    }

    return credentials.password;
  } catch {
    return null;
  }
}

/**
 * Simpan refresh token baru setelah rotasi (refresh berhasil via biometrik).
 * Token lama sudah tidak valid — token baru harus ditulis ulang ke Keystore.
 */
export async function updateBiometricToken(refreshToken: string): Promise<boolean> {
  // Sama dengan enableBiometric — overwrite entry yang sudah ada
  return enableBiometric(refreshToken);
}

/**
 * Nonaktifkan login biometrik: hapus refresh token dari Keystore.
 */
export async function disableBiometric(): Promise<boolean> {
  try {
    await Keychain.resetGenericPassword({ service: BIOMETRIC_SERVICE });
    return true;
  } catch {
    return false;
  }
}
