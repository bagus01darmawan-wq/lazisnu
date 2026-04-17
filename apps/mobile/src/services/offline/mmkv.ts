import { MMKV } from 'react-native-mmkv';

// Instance khusus untuk antrean offline Lazisnu
export const storage = new MMKV({
  id: '@lazisnu/offline-queue',
});
