import {abiToKey, abiKeyToLabel, getDeviceAbiKey, resolveApkUrl} from '../abi';
import {MobileVersionInfo} from '@lazisnu/shared-types';

jest.mock('react-native-device-info', () => ({
  supportedAbis: jest.fn(),
}));

const deviceInfo = require('react-native-device-info');

const release: MobileVersionInfo = {
  version: '1.1.6',
  version_code: 24,
  apk_url: 'https://apk.lazisnu.site/lazisnu-1.1.6.apk',
  apk_urls: {
    arm64_v8a: 'https://apk.lazisnu.site/lazisnu-1.1.6-arm64-v8a.apk',
    armeabi_v7a: 'https://apk.lazisnu.site/lazisnu-1.1.6-armeabi-v7a.apk',
    universal: 'https://apk.lazisnu.site/lazisnu-1.1.6.apk',
  },
  changelog: '- A',
  minimum_version_code: 0,
};

describe('abiToKey', () => {
  it('memetakan ABI daftar ke kunci kontrak', () => {
    expect(abiToKey('arm64-v8a')).toBe('arm64_v8a');
    expect(abiToKey('armeabi-v7a')).toBe('armeabi_v7a');
  });

  it('mengembalikan universal untuk ABI tak dikenal (x86, emulator, dsb.)', () => {
    expect(abiToKey('x86_64')).toBe('universal');
    expect(abiToKey('armeabi')).toBe('universal');
    expect(abiToKey('')).toBe('universal');
  });
});

describe('abiKeyToLabel', () => {
  it('memetakan kunci ke label tampilan', () => {
    expect(abiKeyToLabel('arm64_v8a')).toBe('arm64');
    expect(abiKeyToLabel('armeabi_v7a')).toBe('armv7');
    expect(abiKeyToLabel('universal')).toBe('universal');
    expect(abiKeyToLabel('aneh')).toBe('universal');
  });
});

describe('getDeviceAbiKey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('mengambil ABI pertama perangkat', async () => {
    deviceInfo.supportedAbis.mockResolvedValue(['arm64-v8a', 'armeabi-v7a']);
    await expect(getDeviceAbiKey()).resolves.toBe('arm64_v8a');
  });

  it('fallback universal bila daftar ABI kosong', async () => {
    deviceInfo.supportedAbis.mockResolvedValue([]);
    await expect(getDeviceAbiKey()).resolves.toBe('universal');
  });

  it('fallback universal bila deteksi melempar error', async () => {
    deviceInfo.supportedAbis.mockRejectedValue(new Error('native module missing'));
    await expect(getDeviceAbiKey()).resolves.toBe('universal');
  });
});

describe('resolveApkUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('memilih URL ABI spesifik bila perangkat arm64', async () => {
    deviceInfo.supportedAbis.mockResolvedValue(['arm64-v8a']);
    await expect(resolveApkUrl(release)).resolves.toBe(release.apk_urls.arm64_v8a);
  });

  it('memilih URL ABI spesifik bila perangkat armv7', async () => {
    deviceInfo.supportedAbis.mockResolvedValue(['armeabi-v7a']);
    await expect(resolveApkUrl(release)).resolves.toBe(release.apk_urls.armeabi_v7a);
  });

  it('fallback universal untuk ABI tak dikenal', async () => {
    deviceInfo.supportedAbis.mockResolvedValue(['x86_64']);
    await expect(resolveApkUrl(release)).resolves.toBe(release.apk_url);
  });

  it('fallback apk_url bila apk_urls hilang/entri hilang (kontrak lama)', async () => {
    deviceInfo.supportedAbis.mockResolvedValue(['arm64-v8a']);
    const legacy = {...release, apk_urls: undefined} as unknown as MobileVersionInfo;
    await expect(resolveApkUrl(legacy)).resolves.toBe(release.apk_url);
    const partial = {
      ...release,
      apk_urls: {universal: release.apk_urls.universal ?? release.apk_url},
    };
    await expect(resolveApkUrl(partial)).resolves.toBe(release.apk_url);
  });
});
