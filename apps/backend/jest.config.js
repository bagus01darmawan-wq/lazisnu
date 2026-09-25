/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: {
    '^@lazisnu/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
    // Impor relatif berakhiran .js (wajib di moduleResolution NodeNext,
    // karena "compile"-nya tetap .ts) harus ditemukan kembali ke sumbernya.
    '^(\\.{1,2}/.*)\\.js$': '$1',
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
  // Paksa Jest keluar setelah semua test selesai.
  //
  // ALASAN ( diverifikasi 2026-09-25, bukan tebakan ):
  //   1. `--detectOpenHandles` atas 68 suite / 568 test melaporkan NOL open
  //      handle → tidak ada kebocoran test (koneksi DB, timer, atau server
  //      yang tertinggal). Suite memang lulus bersih tanpa forceExit.
  //   2. Tanpa forceExit, proses tetap menggantung setelah "Ran all test
  //      suites." Penyebabnya ioredis/BullMQ yang terus mencoba koneksi
  //      ulang ke Redis. Log: "Jest did not exit one second after the test
  //      run has completed." + "connect ECONNREFUSED 127.0.0.1:6379" via
  //      bullmq queue-base.js → redis-connection.js handleClientError.
  //   3. Jadi yang di-mask adalah proses yang tidak keluar, BUKAN kelulusan
  //      palsu. Ini berbeda dari mobile act(...) warning yang sebelumnya kita
  //      perbaiki di root cause-nya.
  //
  // Jika suatu saat forceExit dilepas, tutup Redis client di afterAll setiap
  // suite yang meng-instantiate Queue/Worker — bukan sekadar mematikan test.
  forceExit: true,
  // Timeout lebih panjang untuk integration test (koneksi DB bisa lambat)
  testTimeout: 30000,
};
