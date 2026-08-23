import {useAuthStore} from '../../src/stores/useAuthStore';
import {
  initializeAuthStorage,
  getAuthStorage,
  setToken,
  setRefreshToken,
  getToken,
  getRefreshToken,
} from '../../src/services/api';
import {initializeOfflineStorage, getOfflineStorage} from '../../src/services/offline/mmkv';
import * as biometricService from '../../src/services/biometric';

describe('Auth Store (useAuthStore.ts)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    initializeAuthStorage('test-encryption-key-32-chars-length!');
    getAuthStorage().clearAll();
    initializeOfflineStorage('test-offline-key-32-chars-length!');
    getOfflineStorage().clearAll();

    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      isInitializing: false,
      error: null,
      encryptionWarning: null,
      biometricEnabled: false,
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('initializeAuth (Bootstrap)', () => {
    it('sets unauthenticated when no token exists in storage', async () => {
      await useAuthStore.getState().initializeAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.isInitializing).toBe(false);
    });

    it('authenticates user when valid token exists and /auth/me succeeds', async () => {
      await setToken('valid_stored_token');

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            id: 'usr_collector_1',
            full_name: 'Ahmad Fauzi',
            role: 'COLLECTOR',
            phone: '08123456789',
            is_active: true,
          },
        }),
      });

      await useAuthStore.getState().initializeAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe('usr_collector_1');
      expect(state.user?.full_name).toBe('Ahmad Fauzi');
      expect(state.isInitializing).toBe(false);
    });

    it('clears credentials when /auth/me returns 401 unauthorized', async () => {
      await setToken('stale_token');

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({success: false, error: {code: 'UNAUTHORIZED'}}),
      });

      await useAuthStore.getState().initializeAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(await getToken()).toBeNull();
    });
  });

  describe('Password Login', () => {
    it('authenticates and stores tokens on successful login', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            user: {
              id: 'usr_login_1',
              full_name: 'Budi Collector',
              role: 'COLLECTOR',
              is_active: true,
            },
            access_token: 'jwt_access_token_abc',
            refresh_token: 'jwt_refresh_token_xyz',
          },
        }),
      });

      const success = await useAuthStore.getState().login('08123456789', 'secret123');

      expect(success).toBe(true);
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.full_name).toBe('Budi Collector');
      expect(state.token).toBe('jwt_access_token_abc');
      expect(await getToken()).toBe('jwt_access_token_abc');
      expect(getRefreshToken()).toBe('jwt_refresh_token_xyz');
    });

    it('sets error and remains unauthenticated on invalid credentials', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: {code: 'INVALID_CREDENTIALS', message: 'Nomor telepon atau password salah'},
        }),
      });

      const success = await useAuthStore.getState().login('08123456789', 'wrong_pass');

      expect(success).toBe(false);
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toContain('salah');
    });
  });

  describe('OTP Flow (Request & Verify)', () => {
    it('requests OTP successfully', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({success: true, message: 'Kode OTP telah dikirim'}),
      });

      const success = await useAuthStore.getState().requestOTP('08123456789');
      expect(success).toBe(true);
      expect(useAuthStore.getState().error).toBeNull();
    });

    it('handles request OTP failure', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: {code: 'INVALID_PHONE', message: 'Nomor telepon tidak terdaftar'},
        }),
      });

      const success = await useAuthStore.getState().requestOTP('08000000000');
      expect(success).toBe(false);
      expect(useAuthStore.getState().error).toContain('tidak terdaftar');
    });

    it('verifies OTP and logs in successfully', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            user: {
              id: 'usr_otp_1',
              full_name: 'Doni Collector',
              role: 'COLLECTOR',
              is_active: true,
            },
            access_token: 'access_otp_token',
            refresh_token: 'refresh_otp_token',
          },
        }),
      });

      const success = await useAuthStore.getState().verifyOTP('08123456789', '654321');
      expect(success).toBe(true);
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.id).toBe('usr_otp_1');
    });
  });

  describe('Logout & ForceLogout', () => {
    it('performs full logout, cleans storage and resets Zustand state', async () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: {id: 'usr_1', full_name: 'User', role: 'COLLECTOR', is_active: true} as any,
        token: 'active_token',
      });
      await setToken('active_token');
      setRefreshToken('active_refresh');

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({success: true}),
      });

      await useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(await getToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
    });

    it('performs forceLogout on session expiration', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        user: {id: 'usr_1', full_name: 'User'} as any,
      });

      useAuthStore.getState().forceLogout('Sesi telah berakhir');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.error).toBe('Sesi telah berakhir');
    });
  });

  describe('Biometric Integration', () => {
    it('enables biometric authentication successfully', async () => {
      setRefreshToken('refresh_token_to_secure');

      jest.spyOn(biometricService, 'isBiometricAvailable').mockResolvedValueOnce(true);
      jest.spyOn(biometricService, 'enableBiometric').mockResolvedValueOnce(true);

      const success = await useAuthStore.getState().enableBiometric();
      expect(success).toBe(true);
      expect(useAuthStore.getState().biometricEnabled).toBe(true);
    });

    it('logins with biometric token successfully', async () => {
      jest
        .spyOn(biometricService, 'getTokenWithBiometric')
        .mockResolvedValueOnce('biometric_saved_refresh_token');

      // 1. Refresh endpoint -> returns new access token
      // 2. /auth/me endpoint -> returns user profile
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              access_token: 'new_bio_access_token',
              refresh_token: 'new_bio_refresh_token',
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: 'usr_bio_1',
              full_name: 'Biometric User',
              role: 'COLLECTOR',
              is_active: true,
            },
          }),
        });

      const success = await useAuthStore.getState().loginWithBiometric();
      expect(success).toBe(true);

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.full_name).toBe('Biometric User');
    });

    it('disables biometric authentication and cleans Keystore', async () => {
      useAuthStore.setState({biometricEnabled: true});
      const disableSpy = jest
        .spyOn(biometricService, 'disableBiometric')
        .mockResolvedValueOnce(true);

      await useAuthStore.getState().disableBiometric();

      expect(disableSpy).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().biometricEnabled).toBe(false);
    });
  });
});
