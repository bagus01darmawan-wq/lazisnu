import DeviceInfo from 'react-native-device-info';
import {MobileVersionInfo} from '@lazisnu/shared-types';

/**
 * Pemilihan URL APK per-arsitektur (kontrak app ≥ v1.1.6).
 *
 * Perangkat ARM modern melaporkan ABI pertama = `arm64-v8a` (64-bit) atau
 * `armeabi-v7a` (32-bit). Setiap rilis menyediakan APK khusus per ABI
 * (lebih kecil & cepat) PLUS universal legacy — sehingga:
 * - app lama yang tidak tahu ABI tetap aman lewat apk_url (universal);
 * - ABI tak dikenal (emulator x86, perangkat asing) jatuh ke universal.
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
 * - apk_urls kosong/rusak atau ABI tak dikenal → fallback apk_url (universal).
 * Tidak pernah melempar error: kegagalan deteksi tidak boleh memblokir
 * pembaruan — universal selalu tersedia.
 */
export async function resolveApkUrl(release: MobileVersionInfo): Promise<string> {
  const key = await getDeviceAbiKey();
  const url = release.apk_urls?.[key];
  if (url && url.startsWith('https://')) {
    return url;
  }
  return release.apk_url;
}
