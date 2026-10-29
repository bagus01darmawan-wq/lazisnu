// apps/mobile/jest.config.js
//
// Konfigurasi Jest untuk project ini. Pakai preset RN agar auto-mock
// semua native module (AsyncStorage, NetInfo, dll). Mock spesifik untuk
// react-native-keychain & react-native-mmkv ada di __mocks__/.

module.exports = {
  // RN 0.88: preset tidak lagi diekspor dari paket `react-native` —
  // gunakan @react-native/jest-preset (devDep eksplisit).
  preset: '@react-native/jest-preset',
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
  // Redirect react-native-get-random-values ke mock — file aslinya Flow syntax
  // dan butuh native module; crypto.getRandomValues di-setup di jest.setup.js.
  // CATATAN upgrade RN 0.88: mock error-guard era 0.74 DIHAPUS — polyfill itu
  // wajib utuh di 0.88 (pipeline error handling renderer bergantung padanya;
  // mock blank membuat error render menjadi "uncaught" dan root ter-unmount).
  moduleNameMapper: {
    '^react-native-get-random-values$': '<rootDir>/__mocks__/react-native-get-random-values.ts',
  },
  // Clear mocks otomatis sebelum tiap test
  clearMocks: true,
};
