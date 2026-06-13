// apps/mobile/__tests__/types.d.ts
//
// Ambient type augmentations untuk test helpers yang ditambahkan via __mocks__/.
// AUGMENT (tambah), bukan REPLACE. Kuncinya: import module dulu, baru
// `declare module` — supaya TypeScript tahu kita menambah ke type yang sudah ada.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type * as _Keychain from 'react-native-keychain';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type * as _Mmkv from 'react-native-mmkv';

declare module 'react-native-keychain' {
  export function __setMockValue(
    value: { service: string; username: string; password: string } | null,
  ): void;
  export function __setMockError(error: Error | null): void;
  export function __resetMock(): void;
  export function __getCalls(): { method: string; args: unknown }[];
}

declare module 'react-native-mmkv' {
  export function __setStorage(data: Record<string, string | number | boolean>): void;
  export function __getStorage(): Record<string, string | number | boolean>;
  export function __getCurrentKey(): string | undefined;
  export function __resetMock(): void;
}
