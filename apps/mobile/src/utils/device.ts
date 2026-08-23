import {Platform} from 'react-native';

// WAJIB disamakan manual dengan field `version` di apps/mobile/package.json.
// Tidak memakai require('../../package.json') agar seluruh isi package.json —
// termasuk daftar dependensi — tidak ikut ter-bundle ke binary produksi.
const APP_VERSION = '1.0.0';

export function getDeviceInfo() {
  return {
    // Platform.constants.Model: nama device (mis. "Pixel 7", "SM-A525F").
    // Sebelumnya memakai Platform.Version yang menghasilkan API level (string "33").
    // Field Model tidak ada di type definition RN tapi tersedia di runtime Android.
    model: ((Platform.constants as Record<string, unknown>).Model as string) || 'unknown',
    os_version: `${Platform.OS} ${Platform.Version}`,
    app_version: APP_VERSION,
  };
}
