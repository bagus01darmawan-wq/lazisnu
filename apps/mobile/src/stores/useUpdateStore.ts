import {create} from 'zustand';
import DeviceInfo from 'react-native-device-info';
import {MobileVersionInfo} from '@lazisnu/shared-types';
import {
  fetchMobileVersion,
  shouldShowUpdate,
  isForcedUpdate,
} from '../services/updates/versionCheck';
import {downloadApk, installApk} from '../services/updates/apkDownload';
import {getUpdateStorage, DISMISSED_VERSION_CODE_KEY} from '../services/updates/storage';
import {getErrorMessage} from '../utils/error';

export type DownloadState = 'idle' | 'downloading' | 'ready' | 'error';

interface UpdateState {
  releaseInfo: MobileVersionInfo | null;
  modalVisible: boolean;
  forceUpdate: boolean;
  downloadState: DownloadState;
  /** 0–100 */
  downloadProgress: number;
  downloadError: string | null;
  apkPath: string | null;
  /** true setelah tombol "Pasang" ditekan (layar sistem terbuka) */
  installAttempted: boolean;

  /** Cek senyap saat aplikasi dibuka — gagal/offline = diam total. */
  checkOnLaunch: () => Promise<void>;
  /** Cek dari tombol Profil — lempar error bila gagal agar UI bisa memberi tahu. */
  checkManually: () => Promise<'up-to-date' | 'available'>;
  dismiss: () => void;
  startDownload: () => Promise<void>;
  install: () => Promise<void>;
  /** Dipanggil saat aplikasi kembali aktif — menutup modal setelah proses pasang. */
  handleAppActive: () => void;
  closeModal: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => {
  const applyRelease = (release: MobileVersionInfo): 'up-to-date' | 'available' => {
    // getBuildNumber() = versionCode pada Android — nilai asli dari APK yang
    // disuntikkan EAS (appVersionSource: remote), sumber kebenaran pembanding.
    const installedCode = Number(DeviceInfo.getBuildNumber());
    const dismissed = Number(getUpdateStorage().getNumber(DISMISSED_VERSION_CODE_KEY) ?? 0);

    if (!shouldShowUpdate(installedCode, release, dismissed)) {
      return 'up-to-date';
    }

    set({
      releaseInfo: release,
      forceUpdate: isForcedUpdate(installedCode, release),
      modalVisible: true,
      downloadState: 'idle',
      downloadProgress: 0,
      downloadError: null,
      apkPath: null,
      installAttempted: false,
    });
    return 'available';
  };

  return {
    releaseInfo: null,
    modalVisible: false,
    forceUpdate: false,
    downloadState: 'idle',
    downloadProgress: 0,
    downloadError: null,
    apkPath: null,
    installAttempted: false,

    checkOnLaunch: async () => {
      try {
        const release = await fetchMobileVersion();
        applyRelease(release);
      } catch {
        // Offline / endpoint bermasalah: diam total — prinsip offline-first
        // tidak boleh diganggu oleh fitur pembaruan.
      }
    },

    checkManually: async () => {
      const release = await fetchMobileVersion();
      return applyRelease(release);
    },

    dismiss: () => {
      const {releaseInfo} = get();
      if (releaseInfo) {
        getUpdateStorage().set(DISMISSED_VERSION_CODE_KEY, releaseInfo.version_code);
      }
      set({modalVisible: false});
    },

    startDownload: async () => {
      const {releaseInfo} = get();
      if (!releaseInfo) {
        return;
      }
      set({downloadState: 'downloading', downloadProgress: 0, downloadError: null});
      try {
        const fileName = `lazisnu-${releaseInfo.version}.apk`;
        const path = await downloadApk(releaseInfo.apk_url, fileName, ({received, total}) => {
          if (total > 0) {
            set({downloadProgress: Math.min(100, Math.round((received / total) * 100))});
          }
        });
        set({downloadState: 'ready', apkPath: path, downloadProgress: 100});
      } catch (error) {
        set({
          downloadState: 'error',
          downloadError: getErrorMessage(error, 'Gagal mengunduh pembaruan'),
        });
      }
    },

    install: async () => {
      const {apkPath} = get();
      if (!apkPath) {
        return;
      }
      set({installAttempted: true});
      await installApk(apkPath);
    },

    handleAppActive: () => {
      const {installAttempted, modalVisible} = get();
      // Setelah petugas kembali dari layar pemasangan sistem (apapun hasilnya:
      // terpasang atau batal), tutup modal dan bersihkan state unduhan.
      if (installAttempted && modalVisible) {
        set({
          modalVisible: false,
          downloadState: 'idle',
          downloadProgress: 0,
          apkPath: null,
          installAttempted: false,
        });
      }
    },

    closeModal: () => {
      set({modalVisible: false});
    },
  };
});
