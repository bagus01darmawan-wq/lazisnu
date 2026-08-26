import {
  initializeAuthStorage,
  getAuthStorage,
  getToken,
  setToken,
  getRefreshToken,
  setRefreshToken,
  clearToken,
  getOrCreateDeviceId,
  getDeviceLabel,
  setSessionExpiredHandler,
  authService,
  tasksService,
  collectionService,
  dashboardService,
} from '../../src/services/api';

describe('API Service (api.ts)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    initializeAuthStorage('test-encryption-key-32-chars-length!');
    getAuthStorage().clearAll();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Storage & Token Management', () => {
    it('initializes and returns auth storage instance', () => {
      const storage = getAuthStorage();
      expect(storage).toBeDefined();
    });

    it('sets, gets, and clears access token properly', async () => {
      expect(await getToken()).toBeNull();

      await setToken('sample_access_token_123');
      expect(await getToken()).toBe('sample_access_token_123');

      await clearToken();
      expect(await getToken()).toBeNull();
    });

    it('sets, gets, and clears refresh token properly', async () => {
      expect(getRefreshToken()).toBeNull();

      setRefreshToken('sample_refresh_token_456');
      expect(getRefreshToken()).toBe('sample_refresh_token_456');

      await clearToken();
      expect(getRefreshToken()).toBeNull();
    });

    it('generates and persists device ID across calls', () => {
      const id1 = getOrCreateDeviceId();
      expect(id1).toBeTruthy();
      expect(typeof id1).toBe('string');

      // Panggilan kedua harus mengembalikan ID yang sama persis
      const id2 = getOrCreateDeviceId();
      expect(id2).toBe(id1);
    });

    it('returns valid device label', () => {
      const label = getDeviceLabel();
      expect(label).toBeTruthy();
    });
  });

  describe('Auth Services & API Calls', () => {
    it('calls login endpoint and returns success response', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            user: {id: 'usr_1', full_name: 'Ahmad Collector', role: 'COLLECTOR', is_active: true},
            access_token: 'access_tok_1',
            refresh_token: 'refresh_tok_1',
          },
        }),
      });

      const response = await authService.login('08123456789', 'password123');
      expect(response.success).toBe(true);
      expect(response.data?.access_token).toBe('access_tok_1');
    });

    it('handles login failure with error message', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: {code: 'INVALID_CREDENTIALS', message: 'Nomor HP atau password salah'},
        }),
      });

      const response = await authService.login('08123456789', 'wrong_pass');
      expect(response.success).toBe(false);
      expect(response.error?.message).toContain('salah');
    });

    it('calls request-otp endpoint successfully', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({success: true, message: 'OTP terkirim'}),
      });

      const response = await authService.requestOTP('08123456789');
      expect(response.success).toBe(true);
    });

    it('calls verify-otp endpoint and receives tokens', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            user: {id: 'usr_1', full_name: 'Ahmad', role: 'COLLECTOR', is_active: true},
            access_token: 'jwt_access',
            refresh_token: 'jwt_refresh',
          },
        }),
      });

      const response = await authService.verifyOTP('08123456789', '123456');
      expect(response.success).toBe(true);
      expect(response.data?.user.id).toBe('usr_1');
    });

    it('calls me endpoint with Authorization header', async () => {
      await setToken('valid_token_xyz');

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {id: 'usr_1', full_name: 'Ahmad', role: 'COLLECTOR', is_active: true},
        }),
      });

      const response = await authService.me();
      expect(response.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/me'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer valid_token_xyz',
          }),
        }),
      );
    });

    it('calls logout endpoint and clears local tokens', async () => {
      await setToken('token_to_clear');
      setRefreshToken('refresh_to_clear');

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({success: true}),
      });

      await authService.logout();
      expect(await getToken()).toBeNull();
      expect(getRefreshToken()).toBeNull();
    });
  });

  describe('Single-Flight Token Refresh Interceptor & Session Expiry', () => {
    it('automatically refreshes token on 401 and replays the original request', async () => {
      await setToken('expired_access_token');
      setRefreshToken('valid_refresh_token');

      // 1st call: /tasks returns 401
      // 2nd call: /auth/refresh returns new token
      // 3rd call: /tasks (retried) returns 200 OK
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({success: false, error: 'TOKEN_EXPIRED'}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {access_token: 'new_access_token_789'},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {tasks: [{id: 'task_1', owner_name: 'Donatur A'}], pagination: {total: 1}},
          }),
        });

      const response = await tasksService.getTasks({status: 'ACTIVE'});
      expect(response.success).toBe(true);
      expect(await getToken()).toBe('new_access_token_789');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('handles concurrent 401s with single-flight refresh queue', async () => {
      await setToken('expired_token');
      setRefreshToken('valid_refresh_token');

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async (url: string) => {
        callCount++;
        if (url.includes('/auth/refresh')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: {access_token: 'shared_new_token'},
            }),
          };
        }
        if (callCount <= 2) {
          // initial calls return 401
          return {
            ok: false,
            status: 401,
            json: async () => ({success: false, error: 'TOKEN_EXPIRED'}),
          };
        }
        // retried calls return 200
        return {
          ok: true,
          status: 200,
          json: async () => ({success: true, data: {status: 'ok'}}),
        };
      });

      const [res1, res2] = await Promise.all([
        tasksService.getTasks({status: 'ACTIVE'}),
        dashboardService.getDashboard(),
      ]);

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
      expect(await getToken()).toBe('shared_new_token');
    });

    it('triggers sessionExpiredHandler when refresh is denied by business rule (REFRESH_REVOKED)', async () => {
      await setToken('expired_token');
      setRefreshToken('revoked_refresh_token');

      const sessionExpiredMock = jest.fn();
      setSessionExpiredHandler(sessionExpiredMock);

      // Request -> 401
      // Refresh -> 401 dengan kode penolakan BISNIS eksplisit
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({success: false, error: 'TOKEN_EXPIRED'}),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: {code: 'REFRESH_REVOKED', message: 'dicabut'},
          }),
        });

      const response = await collectionService.getHistory();
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('SESSION_EXPIRED');
      expect(sessionExpiredMock).toHaveBeenCalledWith('REFRESH_REVOKED');
      expect(sessionExpiredMock).toHaveBeenCalledTimes(1);

      setSessionExpiredHandler(null);
    });

    it('KEEPS the local session when refresh fails with technical INVALID_TOKEN (sliding policy)', async () => {
      await setToken('expired_token');
      setRefreshToken('still_hopeful_refresh_token');

      const sessionExpiredMock = jest.fn();
      setSessionExpiredHandler(sessionExpiredMock);

      // Request -> 401; Refresh -> 401 INVALID_TOKEN (bukan penolakan bisnis)
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({success: false, error: 'TOKEN_EXPIRED'}),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: {code: 'INVALID_TOKEN', message: 'tidak valid'},
          }),
        });

      const response = await collectionService.getHistory();
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NETWORK_ERROR');

      // Sesi lokal DIPERTAHANKAN — petugas tidak ter-logout
      expect(sessionExpiredMock).not.toHaveBeenCalled();
      expect(await getToken()).toBe('expired_token');
      expect(await getRefreshToken()).toBe('still_hopeful_refresh_token');

      setSessionExpiredHandler(null);
    });
  });

  describe('Network Errors & Timeout', () => {
    it('returns NETWORK_ERROR on fetch rejection', async () => {
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network request failed'));

      const response = await tasksService.getTasks({status: 'ACTIVE'});
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NETWORK_ERROR');
    });

    it('returns specific message for timeout abort errors', async () => {
      const abortError = new Error('The user aborted a request.');
      abortError.name = 'AbortError';
      global.fetch = jest.fn().mockRejectedValueOnce(abortError);

      const response = await tasksService.getTasks({status: 'ACTIVE'});
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NETWORK_ERROR');
      expect(response.error?.message).toContain('timeout');
    });
  });
});
