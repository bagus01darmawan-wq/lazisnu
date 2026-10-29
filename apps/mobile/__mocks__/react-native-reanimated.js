// Mock react-native-reanimated untuk Jest.
//
// Dipasang lewat `moduleNameMapper` di jest.config.js, BUKAN lewat
// `jest.mock(...)` di jest.setup.js. Alasannya konkret: react-native-gesture-handler
// memuat reanimated dari dalam paketnya sendiri lewat
// `require('react-native-reanimated')`, dan pemetaan nama modul memastikan
// SEMUA jalur resolusi berakhir di berkas yang sama. Sebelumnya mock hanya
// didaftarkan untuk satu jalur, sehingga GestureDetector membaca reanimated
// asli (v4 tidak mengekspor createAnimatedComponent di `default`) dan suite
// gagal dengan "createAnimatedComponent is not a function".
//
// Proxy fallback: API reanimated apa pun yang belum terdaftar → noop,
// sehingga mock tidak perlu di-update tiap reanimated menambah simbol.
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

module.exports = new Proxy(mock, {
  get(target, key) {
    if (key in target) return target[key];
    return () => undefined;
  },
});
