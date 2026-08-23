jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    Version: 33,
    constants: {Model: 'Pixel 7'},
  },
}));

import {getDeviceInfo} from '../../src/utils/device';

describe('getDeviceInfo (utils/device.ts)', () => {
  it('mengembalikan model, os_version, dan app_version lengkap', () => {
    expect(getDeviceInfo()).toEqual({
      model: 'Pixel 7',
      os_version: 'android 33',
      // WAJIB disamakan dengan APP_VERSION di src/utils/device.ts saat bump versi
      app_version: '1.0.0',
    });
  });

  it('fallback ke "unknown" bila Platform.constants.Model tidak tersedia', () => {
    const {Platform}: any = jest.requireMock('react-native');
    const original = Platform.constants;
    Platform.constants = {};
    expect(getDeviceInfo().model).toBe('unknown');
    Platform.constants = original;
  });
});
