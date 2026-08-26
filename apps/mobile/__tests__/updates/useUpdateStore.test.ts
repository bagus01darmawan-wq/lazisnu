import {useUpdateStore} from '../../src/stores/useUpdateStore';
import {getUpdateStorage} from '../../src/services/updates/storage';
import DeviceInfo from 'react-native-device-info';
import BlobUtil from 'react-native-blob-util';
import {Platform} from 'react-native';

type MockedBlobUtil = {
  config: jest.Mock;
  fs: {
    dirs: {DocumentDir: string};
    exists: jest.Mock;
    unlink: jest.Mock;
  };
  android: {actionViewIntent: jest.Mock};
  __test: {reset: () => void};
};

const blobMock = BlobUtil as unknown as MockedBlobUtil;

const baseRelease = {
  version: '1.1.1',
  version_code: 18,
  apk_url: 'https://apk.lazisnu.site/lazisnu-1.1.1.apk',
  changelog: '- A\n- B',
  minimum_version_code: 0,
};

const initial = {
  releaseInfo: null,
  modalVisible: false,
  forceUpdate: false,
  downloadState: 'idle' as const,
  downloadProgress: 0,
  downloadError: null,
  apkPath: null,
  installAttempted: false,
};

const mockFetchOk = (data: unknown) => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({success: true, data}),
  }) as unknown as typeof fetch;
};

describe('useUpdateStore — fitur update-in-app', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useUpdateStore.setState({...initial});
    require('react-native-mmkv').__setStorage({});
    blobMock.__test.reset();
    (DeviceInfo.getBuildNumber as jest.Mock).mockReturnValue('18');
    // Preset Jest RN memakai iOS — installApk hanya berlaku di Android.
    Platform.OS = 'android';
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('checkOnLaunch: versi lebih baru → modal tampil, bukan paksa', async () => {
    (DeviceInfo.getBuildNumber as jest.Mock).mockReturnValue('17');
    mockFetchOk(baseRelease);

    await useUpdateStore.getState().checkOnLaunch();

    const s = useUpdateStore.getState();
    expect(s.modalVisible).toBe(true);
    expect(s.forceUpdate).toBe(false);
    expect(s.releaseInfo?.version).toBe('1.1.1');
  });

  it('checkOnLaunch: sudah versi terbaru → tidak tampil apa pun', async () => {
    mockFetchOk(baseRelease);

    await useUpdateStore.getState().checkOnLaunch();

    expect(useUpdateStore.getState().modalVisible).toBe(false);
  });

  it('checkOnLaunch: jaringan gagal → diam total (tanpa lempar)', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('Network down')) as unknown as typeof fetch;

    await expect(useUpdateStore.getState().checkOnLaunch()).resolves.toBeUndefined();
    expect(useUpdateStore.getState().modalVisible).toBe(false);
  });

  it('dismiss: menyimpan version_code di MMKV dan menutup modal', async () => {
    (DeviceInfo.getBuildNumber as jest.Mock).mockReturnValue('17');
    mockFetchOk(baseRelease);
    await useUpdateStore.getState().checkOnLaunch();
    expect(useUpdateStore.getState().modalVisible).toBe(true);

    useUpdateStore.getState().dismiss();

    expect(useUpdateStore.getState().modalVisible).toBe(false);
    expect(getUpdateStorage().getNumber('dismissed_version_code')).toBe(18);
  });

  it('versi yang sudah di-Nanti tidak memunculkan modal lagi', async () => {
    (DeviceInfo.getBuildNumber as jest.Mock).mockReturnValue('17');
    getUpdateStorage().set('dismissed_version_code', 18);
    mockFetchOk(baseRelease);

    await useUpdateStore.getState().checkOnLaunch();

    expect(useUpdateStore.getState().modalVisible).toBe(false);
  });

  it('checkManually: up-to-date vs available', async () => {
    mockFetchOk(baseRelease);
    await expect(useUpdateStore.getState().checkManually()).resolves.toBe('up-to-date');

    (DeviceInfo.getBuildNumber as jest.Mock).mockReturnValue('17');
    await expect(useUpdateStore.getState().checkManually()).resolves.toBe('available');
    expect(useUpdateStore.getState().modalVisible).toBe(true);
  });

  it('paksa-update bila terpasang < minimum_version_code', async () => {
    (DeviceInfo.getBuildNumber as jest.Mock).mockReturnValue('17');
    mockFetchOk({...baseRelease, minimum_version_code: 18});

    await useUpdateStore.getState().checkOnLaunch();

    expect(useUpdateStore.getState().modalVisible).toBe(true);
    expect(useUpdateStore.getState().forceUpdate).toBe(true);
  });

  it('startDownload: progress jalan lalu state ready + apkPath tersimpan', async () => {
    (DeviceInfo.getBuildNumber as jest.Mock).mockReturnValue('17');
    mockFetchOk(baseRelease);
    await useUpdateStore.getState().checkOnLaunch();

    const promise = useUpdateStore.getState().startDownload();
    // Progress 50% dipanggil sinkron oleh mock saat startDownload berjalan.
    expect(useUpdateStore.getState().downloadState).toBe('downloading');
    await promise;

    const s = useUpdateStore.getState();
    expect(s.downloadState).toBe('ready');
    expect(s.downloadProgress).toBe(100);
    expect(s.apkPath).toContain('lazisnu-1.1.1.apk');
  });

  it('startDownload: unduhan gagal (penyebab dikenal) → pesan jujur terpetakan', async () => {
    (DeviceInfo.getBuildNumber as jest.Mock).mockReturnValue('17');
    mockFetchOk(baseRelease);
    await useUpdateStore.getState().checkOnLaunch();

    blobMock.fs.exists.mockRejectedValueOnce(new Error('Download interrupted.'));

    await useUpdateStore.getState().startDownload();

    const s = useUpdateStore.getState();
    expect(s.downloadState).toBe('error');
    expect(s.downloadError).toBe('Unduhan terputus sebelum selesai — file tidak utuh.');
  });

  it('startDownload: error tidak dikenal ditampilkan apa adanya (jujur, tanpa fitnah)', async () => {
    (DeviceInfo.getBuildNumber as jest.Mock).mockReturnValue('17');
    mockFetchOk(baseRelease);
    await useUpdateStore.getState().checkOnLaunch();

    blobMock.fs.exists.mockRejectedValueOnce(new Error('disk full'));

    await useUpdateStore.getState().startDownload();

    const s = useUpdateStore.getState();
    expect(s.downloadState).toBe('error');
    expect(s.downloadError).toBe('disk full');
  });

  it('install: membuka pemasangan sistem Android untuk APK yang diunduh', async () => {
    (DeviceInfo.getBuildNumber as jest.Mock).mockReturnValue('17');
    mockFetchOk(baseRelease);
    await useUpdateStore.getState().checkOnLaunch();
    await useUpdateStore.getState().startDownload();

    await useUpdateStore.getState().install();

    expect(blobMock.android.actionViewIntent).toHaveBeenCalledWith(
      expect.stringContaining('lazisnu-1.1.1.apk'),
      'application/vnd.android.package-archive',
    );
    expect(useUpdateStore.getState().installAttempted).toBe(true);
  });

  it('handleAppActive: menutup modal & mereset state setelah proses pasang', async () => {
    useUpdateStore.setState({
      ...initial,
      releaseInfo: baseRelease,
      modalVisible: true,
      installAttempted: true,
    });

    useUpdateStore.getState().handleAppActive();

    const s = useUpdateStore.getState();
    expect(s.modalVisible).toBe(false);
    expect(s.installAttempted).toBe(false);
    expect(s.downloadState).toBe('idle');
  });
});
