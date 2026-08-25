// Mock manual react-native-blob-util — dipakai otomatis oleh Jest.
// Meniru rantai config().fetch().progress() dan android.actionViewIntent.

let lastPath: string | null = null;
let lastProgressCallback: ((received: number, total: number) => void) | null = null;

const mock = {
  config: jest.fn(({path}: {path: string}) => {
    lastPath = path;
    return {
      fetch: jest.fn((_method: string, _url: string) => {
        const promise = Promise.resolve({path: () => lastPath}) as any;
        promise.progress = (cb: (received: number, total: number) => void) => {
          lastProgressCallback = cb;
          // Meniru lib asli: callback progress dipanggil berkala saat unduh.
          cb(50, 100);
          return promise;
        };
        return promise;
      }),
    };
  }),
  fs: {
    dirs: {DocumentDir: '/mock/DocumentDir'},
    exists: jest.fn(async () => false),
    unlink: jest.fn(async () => {}),
  },
  android: {
    actionViewIntent: jest.fn(async () => {}),
  },
  __test: {
    getLastPath: () => lastPath,
    getLastProgressCallback: () => lastProgressCallback,
    reset: () => {
      lastPath = null;
      lastProgressCallback = null;
      mock.config.mockClear();
      mock.fs.exists.mockClear();
      mock.fs.unlink.mockClear();
      mock.android.actionViewIntent.mockClear();
    },
  },
};

export default mock;
