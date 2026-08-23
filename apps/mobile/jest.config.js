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
    '<rootDir>/__tests__/**/*.test.[jt]s?(x)',
    '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/src/**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/types.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 35,
      functions: 45,
      lines: 50,
    },
  },
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|react-native-vector-icons)/',
    '\\.pnpm/(?!(jest-)?react-native|@react-native|react-native-vector-icons)/',
  ],
  // Redirect @react-native/js-polyfills/error-guard ke mock karena file
  // tersebut berisi Flow type syntax yang gagal di-transform oleh babel-jest
  // di environment pnpm (symlink path tidak match transformIgnorePatterns).
  moduleNameMapper: {
    '^@react-native/js-polyfills/error-guard$': '<rootDir>/__mocks__/error-guard-mock.js',
    // react-native-get-random-values juga Flow syntax — di-mock sebagai no-op
    // karena crypto.getRandomValues sudah di-setup di jest.setup.js
    '^react-native-get-random-values$': '<rootDir>/__mocks__/react-native-get-random-values.ts',
  },
  // Clear mocks otomatis sebelum tiap test
  clearMocks: true,
};
