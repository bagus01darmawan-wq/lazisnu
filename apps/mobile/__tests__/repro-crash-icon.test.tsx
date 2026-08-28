import React from 'react';
import renderer from 'react-test-renderer';
import {AppTextInput, AppButton} from '../src/components/ui';

describe('REPRO crash Icon — uji komponen dengan icon props seperti LoginScreen', () => {
  it('AppTextInput icon=fingerprint', () => {
    const tree = renderer.create(<AppTextInput placeholder="x" icon={'fingerprint'} />);
    expect(tree.toJSON()).not.toBeNull();
  });

  it('AppTextInput icon=phone-outline + eye-outline', () => {
    const tree = renderer.create(<AppTextInput placeholder="x" icon={'phone-outline'} />);
    expect(tree.toJSON()).not.toBeNull();
    const tree2 = renderer.create(<AppTextInput placeholder="x" icon={'eye-outline'} />);
    expect(tree2.toJSON()).not.toBeNull();
  });

  it('AppButton icon=fingerprint/login/whatsapp', () => {
    const tree = renderer.create(<AppButton label="Masuk" icon={'fingerprint'} onPress={jest.fn()} />);
    expect(tree.toJSON()).not.toBeNull();
    const tree2 = renderer.create(<AppButton label="Masuk" icon={'whatsapp'} onPress={jest.fn()} />);
    expect(tree2.toJSON()).not.toBeNull();
  });

  it('LoginScreen penuh dengan mock env', () => {
    // Mock global yang dipakai LoginScreen
    jest.doMock('@react-navigation/native', () => ({
      useNavigation: () => ({navigate: jest.fn(), replace: jest.fn(), reset: jest.fn()}),
    }));
    jest.doMock('react-native-safe-area-context', () => ({
      useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
    }));
    jest.doMock('../src/stores', () => ({
      useAuthStore: (selector?: (s: unknown) => unknown) => {
        const state = {
          login: jest.fn(),
          requestOTP: jest.fn(),
          error: null,
          isLoading: false,
          clearError: jest.fn(),
          biometricEnabled: false,
          sessionRecoveryAvailable: false,
          loginWithBiometric: jest.fn(),
        };
        return selector ? selector(state) : state;
      },
    }));


    const LoginScreen = require('../src/screens/LoginScreen').default;
    const tree = renderer.create(<LoginScreen />);
    expect(tree.toJSON()).not.toBeNull();
  });
});
