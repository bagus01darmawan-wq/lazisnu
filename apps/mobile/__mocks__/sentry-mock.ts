// apps/mobile/__mocks__/sentry-mock.ts
//
// Mock kosong untuk @sentry/react-native. Library ini butuh native module
// (Android/iOS) yang tidak tersedia di Jest. Export hanya function stub
// yang cukup untuk unit test tanpa side-effect.

const noop = () => {};
const noopAsync = async () => {};

export const init = noop;
export const setTag = noop;
export const setUser = noop;
export const setContext = noop;
export const captureMessage = noop;
export const captureException = noop;
export const withScope = (fn: (scope: { setTag: typeof noop; setContext: typeof noop }) => void) => {
  // Simulate scope callback — panggil dengan mock scope
  try { fn({ setTag: noop, setContext: noop }); } catch { /* ignore */ }
};
export const addBreadcrumb = noop;

// Re-export agar sembarang import '.' tetap jalan
export default {
  init: noop,
  setTag: noop,
  setUser: noop,
  setContext: noop,
  captureMessage: noop,
  captureException: noop,
  withScope,
  addBreadcrumb: noop,
};
