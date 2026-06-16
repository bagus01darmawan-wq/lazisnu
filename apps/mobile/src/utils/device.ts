import { Platform } from 'react-native';

// Metro bundler mendukung import JSON — ambil versi dari package.json
// agar selalu sinkron tanpa harus di-hardcode manual.
const { version } = require('../../package.json');

export function getDeviceInfo() {
  return {
    // Platform.constants.Model: nama device (mis. "Pixel 7", "SM-A525F").
    // Sebelumnya memakai Platform.Version yang menghasilkan API level (string "33").
    // Field Model tidak ada di type definition RN tapi tersedia di runtime Android.
    model: (Platform.constants as Record<string, unknown>).Model as string || 'unknown',
    os_version: `${Platform.OS} ${Platform.Version}`,
    app_version: version,
  };
}
