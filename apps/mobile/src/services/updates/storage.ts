import {MMKV} from 'react-native-mmkv';

/**
 * Penyimpanan pengaturan update — NON-SENSITIF (hanya version_code yang
 * pernah dilewati "Nanti"), jadi pakai instance MMKV polos TANPA kunci
 * enkripsi. Aman diakses kapan pun, tanpa menunggu initEncryptedStorage.
 */
const UPDATE_STORAGE_ID = '@lazisnu/update-settings';

let storage: MMKV | null = null;

export function getUpdateStorage(): MMKV {
  if (!storage) {
    storage = new MMKV({id: UPDATE_STORAGE_ID});
  }
  return storage;
}

// version_code rilis yang sudah dipilih "Nanti" oleh petugas.
//
// Catatan sejak v1.2.0: tombol "Nanti" tidak lagi menulis kunci ini — modal
// pembaruan muncul lagi setiap kali aplikasi dibuka, sampai pengguna benar-benar
// memperbarui. Kunci tetap DIBACA agar pengguna yang menunda versi pada aplikasi
// ≤ v1.1.9 langsung mendapat perilaku baru (nilainya diabaikan oleh cek manual,
// dan write path sudah dihapus).
export const DISMISSED_VERSION_CODE_KEY = 'dismissed_version_code';
