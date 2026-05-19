/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: {
    '^@lazisnu/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Load .env.test secara otomatis saat test berjalan
  setupFiles: ['<rootDir>/src/test-setup.ts'],
  // Paksa Jest keluar setelah semua test selesai (cegah hang karena open handles)
  forceExit: true,
  // Timeout lebih panjang untuk integration test (koneksi DB bisa lambat)
  testTimeout: 30000,
};
