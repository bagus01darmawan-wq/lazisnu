/**
 * biometric.ts — Layanan biometrik (sidik jari / face ID) untuk login cepat.
 *
 * Prinsip keamanan:
 * - Sidik jari hanya membuka akses ke refresh token di Android Keystore / iOS Keychain
 * - Server tetap otoritas penuh — revoke di server = jalur biometrik ikut mati
 * - Password tidak pernah disimpan
 * - Saat REFRESH_REVOKED, biometrik dinonaktifkan otomatis
 *
 * Arsitektur GERBANG + GUDANG (revisi 2026-08-26 — perbaikan prompt nakal):
 * - Service A (BIOMETRY_ANY) = GERBANG: dibaca HANYA saat tombol login biometrik
 *   ditekan (prompt muncul di sana). Ditulis HANYA saat enable/disable di Profil.
 *   Isinya TIDAK dipakai sebagai token (bisa stale — jti dirotasi server).
 * - Service B (tanpa accessControl, AFTER_FIRST_UNLOCK, device-bound) = GUDANG:
 *   selalu berisi refresh token terbaru — ditulis diam-diam setiap rotasi.
 *   Tidak pernah memunculkan prompt.
 * - loginWithBiometric: prompt lewat A (bukti autentikasi) → token fresh dari B
 *   → refresh → rotasi → tulis ulang B diam-diam.
 *
 * Alasan teknis: react-native-keychain v10 di Android memakai BiometricPrompt
 * juga pada jalur ENCRYPT (KeychainModule.kt → encryptToResult → interactive
 * handler) — menulis ke service ber-accessControl BIOMETRY_ANY memunculkan
 * prompt di waktu arbitrer (mis. saat background refresh setelah access token
 * kedaluwarsa 15 menit).
 *
 * Ref: Bab 20.3, D-09 (opsional toggle On/Off)
 */

import * as Keychain from 'react-native-keychain';

const BIOMETRIC_SERVICE = 'com.lazisnu.biometric.refresh-token'; // A — gerbang
const BIOMETRIC_USERNAME = 'biometric';
const SILENT_SERVICE = 'com.lazisnu.biometric.refresh-token.silent'; // B — gudang
const SILENT_USERNAME = 'biometric-silent';

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
    if (!type) {
      return null;
    }

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
 * yang hanya bisa dibuka dengan sidik jari / face ID (service A — gerbang),
 * lalu seed gudang silent (B) dengan token saat ini.
 * Dipanggil HANYA saat toggle di Profil (prompt di sini = eksplisit).
 */
export async function enableBiometric(refreshToken: string): Promise<boolean> {
  try {
    const result = await Keychain.setGenericPassword(BIOMETRIC_USERNAME, refreshToken, {
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      service: BIOMETRIC_SERVICE,
      authenticationPrompt: {
        title: 'Aktifkan Login Biometrik',
        subtitle: 'Konfirmasi dengan sidik jari atau face ID',
        cancel: 'Batal',
      },
    });
    if (result !== false) {
      // Best-effort: gudang B mulai berisi token terbaru yang dimiliki app.
      await saveRefreshTokenSilent(refreshToken);
    }
    return result !== false;
  } catch (error) {
    // Diagnosa: error native (mis. E_CRYPTO_FAILED, KeyStoreException) —
    // tampil di logcat / console, tidak membocorkan refresh token.
    console.warn('[biometric] enableBiometric gagal:', error);
    return false;
  }
}

/**
 * Buka GERBANG (service A) dengan biometrik.
 * Memunculkan prompt sidik jari / face ID sistem.
 *
 * @returns token dari A, atau null jika gagal / user membatalkan.
 *          CATATAN: token ini bisa STALE (server merotasi jti single-use) —
 *          gunakan getRefreshTokenSilent() untuk isi token yang masih valid.
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
 * Simpan refresh token terbaru ke GUDANG silent (service B) — TANPA prompt.
 * Dipanggil setiap rotasi refresh (background, diam-diam).
 */
export async function saveRefreshTokenSilent(refreshToken: string): Promise<boolean> {
  try {
    const result = await Keychain.setGenericPassword(SILENT_USERNAME, refreshToken, {
      accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
      service: SILENT_SERVICE,
    });
    return result !== false;
  } catch (error) {
    console.warn('[biometric] saveRefreshTokenSilent gagal:', error);
    return false;
  }
}

/**
 * Baca refresh token terbaru dari GUDANG silent (service B) — tanpa prompt.
 * null bila belum pernah ditulis (mis. instalasi lama) → caller fallback.
 */
export async function getRefreshTokenSilent(): Promise<string | null> {
  try {
    const credentials = await Keychain.getGenericPassword({service: SILENT_SERVICE});
    if (!credentials || typeof credentials === 'boolean') {
      return null;
    }
    return credentials.password;
  } catch {
    return null;
  }
}

/**
 * Nonaktifkan login biometrik: hapus GERBANG (A) + GUDANG (B) dari Keystore.
 */
export async function disableBiometric(): Promise<boolean> {
  try {
    await Keychain.resetGenericPassword({service: BIOMETRIC_SERVICE});
    await Keychain.resetGenericPassword({service: SILENT_SERVICE});
    return true;
  } catch {
    return false;
  }
}
