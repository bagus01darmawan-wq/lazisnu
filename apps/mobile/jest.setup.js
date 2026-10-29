// apps/mobile/jest.setup.js
/* global jest */
//
// Setup global untuk semua test. Dipanggil sekali sebelum test modules loaded.

// Mock react-native-gesture-handler (dipakai via react-native-draggable-flatlist)
// — native module RNGestureHandlerModule tidak ada di environment Jest.
require('react-native-gesture-handler/jestSetup');

// Mock react-native-reanimated (ScaleDecorator draggable-flatlist & RNGH
// memakainya) — tanpa ini Jest melempar error versi/native module.
//
// Mock-nya TIDAK lagi didaftarkan di sini, melainkan dipetakan lewat
// `moduleNameMapper` di jest.config.js ke __mocks__/react-native-reanimated.js.
// Sebabnya: react-native-gesture-handler memuat reanimated dari dalam paketnya
// sendiri, dan `jest.mock('react-native-reanimated')` di berkas ini hanya
// menutup jalur resolusi milik aplikasi. Akibatnya GestureDetector membaca
// reanimated asli dan suite gagal dengan
// "createAnimatedComponent is not a function".

// Mock crypto.getRandomValues — Jest node environment tidak punya Web Crypto API.
// react-native-get-random-values polyfill tidak bisa di-require() langsung karena
// konflik Flow syntax dengan Jest runtime. Sebagai gantinya, kita berikan
// implementasi deterministic berbasis Math.random untuk unit test.
//
// CATATAN: nilai random di test TIDAK akan cryptographically secure. Ini OK
// karena unit test tidak menguji entropi — yang diuji adalah behavior
// (generate key, reuse, wipe, fallback path).
global.crypto = {
  getRandomValues: array => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  },
};

// Unit tests have no native Firebase app. Production behavior is covered by
// config/__tests__/crashlytics.test.ts with an explicit default-app fixture.
jest.mock('@react-native-firebase/app', () => ({getApps: jest.fn(() => [])}));

jest.mock('@react-native-firebase/crashlytics', () => {
  const reporter = {
    log: jest.fn(),
    recordError: jest.fn(),
    setAttribute: jest.fn(),
    setAttributes: jest.fn(),
    setCrashlyticsCollectionEnabled: jest.fn(),
    setUserId: jest.fn(),
    crash: jest.fn(),
    isCrashlyticsCollectionEnabled: false,
  };

  return jest.fn(() => reporter);
});

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() =>
    Promise.resolve({
      isConnected: true,
      isInternetReachable: true,
    }),
  ),
  addEventListener: jest.fn(() => jest.fn()),
}));

// Mock react-native-signature-canvas — WebView tidak berjalan di environment
// Jest (tanpa native bridge). SignaturePad/SignSheet diuji lewat perilaku
// callback (onChange/onOK), bukan piksel kanvas.
jest.mock('react-native-signature-canvas', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        clearSignature: jest.fn(),
        readSignature: jest.fn(),
      }));
      return React.createElement(View, {testID: 'mock-signature-canvas', ...props});
    }),
  };
});

// react-test-renderer 19.3 melaporkan error tak tertangkap lewat
// window.dispatchEvent; jest-preset RN 0.88 menyetel window = global, tetapi
// sandbox jest (testEnvironment node) tidak menyediakan EventTarget, sehingga
// tanpa ini pesan error asli tertelan "TypeError: window.dispatchEvent is not
// a function". Cetak event-nya agar error render tetap terlihat.
if (typeof global.window === 'undefined') {
  global.window = global;
}
if (typeof global.window.dispatchEvent !== 'function') {
  global.window.dispatchEvent = event => {
    console.error('[window.dispatchEvent]', event && (event.error || event.message || event));
  };
}
