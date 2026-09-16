import {create} from 'zustand';
import DeviceInfo from 'react-native-device-info';
import {MobileVersionInfo} from '@lazisnu/shared-types';
import {
  fetchMobileVersion,
  shouldShowUpdate,
  isForcedUpdate,
} from '../services/updates/versionCheck';
import {downloadApk, installApk} from '../services/updates/apkDownload';
import {getDeviceAbiKey, abiKeyToLabel} from '../services/updates/abi';
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
  /** URL APK terpilih sesuai ABI perangkat (fallback universal). */
  downloadUrl: string | null;
  /** Label ABI untuk tampilan modal: 'arm64' | 'armv7' | 'universal'. */
  abiLabel: string | null;
  /**
   * true setelah tombol "Nanti" ditekan. Hanya in-memory — hilang saat
   * aplikasi ditutup. Modal pembaruan muncul lagi pada sesi berikutnya.
   */
  dismissedThisSession: boolean;

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
  const applyRelease = async (
    release: MobileVersionInfo,
    ignoreDismissed = false,
  ): Promise<'up-to-date' | 'available'> => {
    // getBuildNumber() = versionCode pada Android — nilai asli dari APK yang
    // disuntikkan EAS (appVersionSource: remote), sumber kebenaran pembanding.
    const installedCode = Number(DeviceInfo.getBuildNumber());
    // v1.2.0: penundaan hanya berlaku untuk sesi ini (lihat dismissedThisSession).
    const dismissed = get().dismissedThisSession;

    if (!shouldShowUpdate(installedCode, release, dismissed, ignoreDismissed)) {
      return 'up-to-date';
    }

    // Pilih APK sesuai ABI perangkat; kegagalan deteksi tetap jatuh ke
    // apk_url (fallback terakhir — tidak pernah memblokir pembaruan).
    const abiKey = await getDeviceAbiKey();
    const downloadUrl = release.apk_urls?.[abiKey] ?? release.apk_url;

    set({
      releaseInfo: release,
      forceUpdate: isForcedUpdate(installedCode, release),
      modalVisible: true,
      downloadState: 'idle',
      downloadProgress: 0,
      downloadError: null,
      apkPath: null,
      installAttempted: false,
      downloadUrl,
      abiLabel: abiKeyToLabel(abiKey),
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
    downloadUrl: null,
    abiLabel: null,
    /**
     * true setelah tombol "Nanti" ditekan. Hanya in-memory — hilang saat
     * aplikasi ditutup. Modal pembaruan muncul lagi pada sesi berikutnya.
     */
    dismissedThisSession: false,

    checkOnLaunch: async () => {
      try {
        const release = await fetchMobileVersion();
        await applyRelease(release);
      } catch {
        // Offline / endpoint bermasalah: diam total — prinsip offline-first
        // tidak boleh diganggu oleh fitur pembaruan.
      }
    },

    checkManually: async () => {
      const release = await fetchMobileVersion();
      // Permintaan eksplisit dari tombol "Periksa Pembaruan": abaikan flag
      // tunda — pengguna ingin melihat pembaruan walau sebelumnya menunda.
      // Hanya "sama atau lebih baru dari versi terpasang" yang membatalkan.
      return applyRelease(release, true);
    },

    dismiss: () => {
      // v1.2.0: "Nanti" hanya menunda untuk SESI INI. Sebelumnya dismiss
      // menulis version_code ke MMKV sehingga modal tidak pernah muncul lagi
      // untuk versi itu walau aplikasi dibuka ulang. Sekarang modal muncul
      // kembali setiap kali aplikasi dibuka, sampai pengguna memperbarui.
      set({modalVisible: false, dismissedThisSession: true});
    },

    startDownload: async () => {
      const {releaseInfo, downloadUrl} = get();
      if (!releaseInfo) {
        return;
      }
      set({downloadState: 'downloading', downloadProgress: 0, downloadError: null});
      try {
        const fileName = `lazisnu-${releaseInfo.version}.apk`;
        const path = await downloadApk(
          downloadUrl ?? releaseInfo.apk_url,
          fileName,
          ({received, total}) => {
            if (total > 0) {
              set({downloadProgress: Math.min(100, Math.round((received / total) * 100))});
            }
          },
        );
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
