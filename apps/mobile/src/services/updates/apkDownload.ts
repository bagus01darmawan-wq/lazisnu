import ReactNativeBlobUtil from 'react-native-blob-util';
import {Platform} from 'react-native';

export interface DownloadProgress {
  received: number;
  total: number;
}

/**
 * Unduh APK ke folder privat aplikasi (DocumentDir) — TIDAK butuh izin
 * penyimpanan, dan petugas tidak pernah meninggalkan aplikasi.
 * File lama dengan nama sama dihapus dulu agar tidak ada residu.
 */
export async function downloadApk(
  apkUrl: string,
  fileName: string,
  onProgress: (progress: DownloadProgress) => void,
): Promise<string> {
  const path = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/${fileName}`;

  const exists = await ReactNativeBlobUtil.fs.exists(path);
  if (exists) {
    await ReactNativeBlobUtil.fs.unlink(path);
  }

  const result = await ReactNativeBlobUtil.config({path})
    .fetch('GET', apkUrl)
    .progress((received: string, total: string) => {
      onProgress({received: Number(received), total: Number(total)});
    });

  return result.path();
}

/**
 * Buka layar pemasangan SISTEM Android untuk APK yang sudah diunduh.
 * Layar konfirmasi ini milik OS (gerbang keamanan instalasi) dan tidak
 * dapat digantikan tampilan aplikasi — sudah termasuk ijin sekali-tap
 * "Izinkan aplikasi ini memasang aplikasi lain" saat pertama kali.
 */
export async function installApk(apkPath: string): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await ReactNativeBlobUtil.android.actionViewIntent(
    apkPath,
    'application/vnd.android.package-archive',
  );
}
