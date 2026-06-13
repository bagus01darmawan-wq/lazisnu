// apps/mobile/__mocks__/react-native-get-random-values.ts
//
// No-op mock untuk react-native-get-random-values polyfill.
// Modul ini di-import sebagai side-effect oleh secureKey.ts, tapi
// Jest runtime tidak bisa men-transform Flow syntax-nya.
//
// crypto.getRandomValues sudah di-mock secara global di jest.setup.js,
// jadi polyfill ini tidak diperlukan untuk unit test.
export {};
