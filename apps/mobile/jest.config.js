// apps/mobile/jest.config.js
//
// Konfigurasi Jest untuk project ini. Pakai preset RN agar auto-mock
// semua native module (AsyncStorage, NetInfo, dll). Mock spesifik untuk
// react-native-keychain & react-native-mmkv ada di __mocks__/.

module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  // Mock module manual ada di __mocks__/ — auto-load oleh Jest
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  // Redirect @react-native/js-polyfills/error-guard ke mock karena file
  // tersebut berisi Flow type syntax yang gagal di-transform oleh babel-jest
  // di environment pnpm (symlink path tidak match transformIgnorePatterns).
  moduleNameMapper: {
    '^@react-native/js-polyfills/error-guard$':
      '<rootDir>/__mocks__/error-guard-mock.js',
    // react-native-get-random-values juga Flow syntax — di-mock sebagai no-op
    // karena crypto.getRandomValues sudah di-setup di jest.setup.js
    '^react-native-get-random-values$':
      '<rootDir>/__mocks__/react-native-get-random-values.ts',
    // @sentry/react-native butuh native module — mock kosong untuk unit test
    '^@sentry/react-native$':
      '<rootDir>/__mocks__/sentry-mock.ts',
  },
  // Clear mocks otomatis sebelum tiap test
  clearMocks: true,
};
