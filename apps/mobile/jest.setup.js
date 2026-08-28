// apps/mobile/jest.setup.js
/* global jest */
//
// Setup global untuk semua test. Dipanggil sekali sebelum test modules loaded.

// Mock react-native-gesture-handler (dipakai via react-native-draggable-flatlist)
// — native module RNGestureHandlerModule tidak ada di environment Jest.
require('react-native-gesture-handler/jestSetup');

// Mock react-native-reanimated (ScaleDecorator draggable-flatlist & RNGH
// memakainya) — tanpa ini Jest melempar error versi/native module.
// Proxy fallback: API reanimated apa pun yang belum terdaftar → noop,
// sehingga mock tidak perlu di-update tiap reanimated menambah simbol.
jest.mock('react-native-reanimated', () => {
  const {View} = require('react-native');
  const mock = {
    __esModule: true,
    default: {
      View,
      Version: '3.12.0',
      createAnimatedComponent: C => C,
    },
    // draggable-flatlist constants.ts memeriksa isReanimatedV2 = !!useSharedValue
    useSharedValue: v => ({value: v}),
    useAnimatedStyle: () => ({}),
    useAnimatedGestureHandler: () => ({}),
    useAnimatedRef: () => ({current: null}),
    useDerivedValue: v => ({value: typeof v === 'function' ? v() : v}),
    withSpring: v => v,
    withTiming: v => v,
    withDelay: (_, v) => v,
    withRepeat: v => v,
    runOnUI: f => f,
    runOnJS: f => f,
    cancelAnimation: () => undefined,
    interpolate: v => v,
    Extrapolate: {CLAMP: 'clamp', EXTEND: 'extend'},
    FadeInUp: {delay: () => ({duration: () => undefined})},
    Layout: {springify: () => undefined},
  };
  return new Proxy(mock, {
    get(target, key) {
      if (key in target) return target[key];
      return () => undefined;
    },
  });
});

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
