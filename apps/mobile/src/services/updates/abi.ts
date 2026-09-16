import DeviceInfo from 'react-native-device-info';
import {MobileVersionInfo} from '@lazisnu/shared-types';

/**
 * Pemilihan URL APK per-arsitektur (kontrak app ≥ v1.1.6).
 *
 * Perangkat ARM modern melaporkan ABI pertama = `arm64-v8a` (64-bit) atau
 * `armeabi-v7a` (32-bit). Tiap rilis menyediakan APK khusus per ABI (lebih
 * kecil & cepat). Sejak v1.2.0 hanya 2 APK per-ABI (universal dihapus);
 * APK `universal` hanya muncul pada rilis lama (≤ v1.1.9), yang tetap
 * didukung: app lama maupun ABI tak dikenal jatuh ke apk_url (menunjuk
 * arm64), dan app ≥ v1.1.6 pada rilis lama masih bisa pakai kunci universal.
 */

/** 'arm64-v8a' → 'arm64_v8a', 'armeabi-v7a' → 'armeabi_v7a', lainnya → 'universal'. */
export function abiToKey(rawAbi: string): string {
  const norm = rawAbi.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (norm === 'arm64_v8a' || norm === 'armeabi_v7a') {
    return norm;
  }
  return 'universal';
}

/** Label ringkas untuk tampilan modal: 'arm64' | 'armv7' | 'universal'. */
export function abiKeyToLabel(key: string): string {
  if (key === 'arm64_v8a') {
    return 'arm64';
  }
  if (key === 'armeabi_v7a') {
    return 'armv7';
  }
  return 'universal';
}

/** ABI perangkat dalam bentuk kunci kontrak ('arm64_v8a' | 'armeabi_v7a' | 'universal'). */
export async function getDeviceAbiKey(): Promise<string> {
  try {
    const supported = await DeviceInfo.supportedAbis();
    const [first] = supported;
    return first ? abiToKey(first) : 'universal';
  } catch {
    return 'universal';
  }
}

/**
 * Resolusi URL unduhan sesuai ABI perangkat.
 * - ABI dikenal → URL khusus (apk_urls[kunci]);
 * - apk_urls kosong/rusak atau ABI tak dikenal → fallback apk_url.
 *   Catatan sejak v1.2.0: rilis hanya membangun 2 APK per-ABI (tidak ada
 *   universal). apk_url sendiri tetap diisi (menunjuk arm64), jadi app lama
 *   maupun ABI tak dikenal tetap mendapat APK yang dapat dipasang.
 * Tidak pernah melempar error: kegagalan deteksi tidak boleh memblokir
 * pembaruan.
 */
export async function resolveApkUrl(release: MobileVersionInfo): Promise<string> {
  const key = await getDeviceAbiKey();
  const url = release.apk_urls?.[key];
  if (url && url.startsWith('https://')) {
    return url;
  }
  return release.apk_url;
}
