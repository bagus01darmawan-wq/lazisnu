const mockGetApps = jest.fn(() => [] as {name: string}[]);
const mockLoadSdk = jest.fn();
const mockReporter = {};
const mockSdk = {
  getCrashlytics: jest.fn(() => mockReporter),
  log: jest.fn(),
  setAttribute: jest.fn(() => Promise.resolve()),
  setCrashlyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
  setUserId: jest.fn(() => Promise.resolve()),
};

jest.mock('@react-native-firebase/app', () => ({getApps: mockGetApps}));
jest.mock('@react-native-firebase/crashlytics', () => {
  mockLoadSdk();
  if (!mockGetApps().some(app => app.name === '[DEFAULT]')) {
    throw new Error("No Firebase App '[DEFAULT]' has been created");
  }
  return mockSdk;
});

describe('Crashlytics availability', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockGetApps.mockReturnValue([]);
  });

  it('boots and keeps every helper a no-op without loading the SDK when Firebase is absent', () => {
    const helper = require('../crashlytics');
    helper.initCrashlytics();
    helper.setAuthTag('state', 'test');
    helper.captureAuthEvent('test', {attempt: 1});
    helper.setAuthenticatedUser('test-officer');
    helper.clearAuthenticatedUser();
    expect(helper.isCrashlyticsInitialized()).toBe(false);
    expect(mockLoadSdk).not.toHaveBeenCalled();
  });

  it('preserves initialization and reporting with the default Firebase app', () => {
    mockGetApps.mockReturnValue([{name: '[DEFAULT]'}]);
    const helper = require('../crashlytics');
    helper.initCrashlytics();
    helper.initCrashlytics();
    helper.setAuthTag('state', 'test');
    helper.captureAuthEvent('test', {attempt: 1});
    helper.setAuthenticatedUser('test-officer');
    helper.clearAuthenticatedUser();
    expect(helper.isCrashlyticsInitialized()).toBe(true);
    expect(mockSdk.setCrashlyticsCollectionEnabled).toHaveBeenCalledTimes(1);
    expect(mockSdk.setCrashlyticsCollectionEnabled).toHaveBeenCalledWith(mockReporter, !__DEV__);
    expect(mockSdk.setAttribute).toHaveBeenCalledWith(mockReporter, 'auth.state', 'test');
    expect(mockSdk.log).toHaveBeenCalledWith(mockReporter, 'Auth: test');
    expect(mockSdk.setUserId).toHaveBeenCalledWith(mockReporter, 'test-officer');
    expect(mockSdk.setUserId).toHaveBeenLastCalledWith(mockReporter, '');
  });
});
