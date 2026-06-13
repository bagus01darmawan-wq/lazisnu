// apps/mobile/jest.setup.js
//
// Setup global untuk semua test. Dipanggil sekali sebelum test modules loaded.

// Mock crypto.getRandomValues — Jest node environment tidak punya Web Crypto API.
// react-native-get-random-values polyfill tidak bisa di-require() langsung karena
// konflik Flow syntax dengan Jest runtime. Sebagai gantinya, kita berikan
// implementasi deterministic berbasis Math.random untuk unit test.
//
// CATATAN: nilai random di test TIDAK akan cryptographically secure. Ini OK
// karena unit test tidak menguji entropi — yang diuji adalah behavior
// (generate key, reuse, wipe, fallback path).
global.crypto = {
  getRandomValues: (array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  },
};
