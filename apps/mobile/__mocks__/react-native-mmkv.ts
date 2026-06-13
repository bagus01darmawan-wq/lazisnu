// apps/mobile/__mocks__/react-native-mmkv.ts
//
// In-memory fake MMKV untuk unit test. Tidak butuh native module.
//
// API yang di-cover harus sama dengan MMKV asli — termasuk `recrypt()`
// (P4.3) dan `clearAll()`.
//
// Cara kontrol test:
//   const { storage, __setStorage } = require('react-native-mmkv');
//   __setStorage({ key: 'value' });  // seed data
//   storage.getString('key');         // 'value'

interface StorageShape {
  [key: string]: string | number | boolean;
}

let data: StorageShape = {};
let currentKey: string | undefined; // encryption key state

class MMKVMock {
  constructor(config?: { encryptionKey?: string }) {
    currentKey = config?.encryptionKey;
  }

  set(key: string, value: string | number | boolean): void {
    data[key] = value;
  }

  getString(key: string): string | undefined {
    const v = data[key];
    return typeof v === 'string' ? v : undefined;
  }

  getNumber(key: string): number | undefined {
    const v = data[key];
    return typeof v === 'number' ? v : undefined;
  }

  getBoolean(key: string): boolean | undefined {
    const v = data[key];
    return typeof v === 'boolean' ? v : undefined;
  }

  contains(key: string): boolean {
    return key in data;
  }

  delete(key: string): void {
    delete data[key];
  }

  getAllKeys(): string[] {
    return Object.keys(data);
  }

  clearAll(): void {
    data = {};
  }

  recrypt(newKey: string | undefined): void {
    // Simulasi: re-encrypt adalah atomic, tidak throw jika newKey valid
    if (newKey !== undefined && newKey.length > 16) {
      throw new Error('Failed to create MMKV instance! `encryptionKey` cannot be longer than 16 bytes!');
    }
    currentKey = newKey;
  }
}

// Test helpers — bukan API publik MMKV asli, hanya untuk mock
export const __setStorage = (newData: StorageShape) => {
  data = { ...newData };
};

export const __getStorage = () => ({ ...data });

export const __getCurrentKey = () => currentKey;

export const __resetMock = () => {
  data = {};
  currentKey = undefined;
};

export { MMKVMock as MMKV };
