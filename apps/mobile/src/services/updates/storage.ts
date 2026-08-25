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

// version_code rilis yang sudah dipilih "Nanti" oleh petugas — modal update
// tidak muncul lagi untuk versi itu (muncul lagi saat versi lebih baru).
export const DISMISSED_VERSION_CODE_KEY = 'dismissed_version_code';
