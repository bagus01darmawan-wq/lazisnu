// Mock manual react-native-device-info — dipakai otomatis oleh Jest
// (preset react-native). Nilai default mengikuti rilis v1.1.1 (vc 18).

export default {
  getVersionCode: jest.fn(() => 18),
  getVersion: jest.fn(() => '1.1.1'),
  getBuildNumber: jest.fn(() => '18'),
  getModel: jest.fn(() => 'TestDevice'),
  getSystemName: jest.fn(() => 'Android'),
  getSystemVersion: jest.fn(() => '14'),
  isTablet: jest.fn(() => false),
};
