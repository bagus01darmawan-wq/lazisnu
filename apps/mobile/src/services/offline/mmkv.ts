import {MMKV} from 'react-native-mmkv';

const OFFLINE_STORAGE_ID = '@lazisnu/offline-queue';
let storage: MMKV | null = null;

export function initializeOfflineStorage(
  encryptionKey: string,
  migrateUnencrypted = false,
): MMKV {
  const instance = new MMKV(
    migrateUnencrypted
      ? {id: OFFLINE_STORAGE_ID}
      : {id: OFFLINE_STORAGE_ID, encryptionKey},
  );

  if (migrateUnencrypted) {
    instance.recrypt(encryptionKey);
  }

  storage = instance;
  return instance;
}

export function getOfflineStorage(): MMKV {
  if (!storage) {
    throw new Error('Offline storage belum diinisialisasi');
  }
  return storage;
}
