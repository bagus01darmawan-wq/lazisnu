import * as Keychain from 'react-native-keychain';
import {
  initializeAuthStorage,
  getAuthStorage,
  setToken,
  setRefreshToken,
  authService,
  dashboardService,
} from '../../src/services/api';
import {initializeOfflineStorage} from '../../src/services/offline/mmkv';
import {useAuthStore} from '../../src/stores/useAuthStore';
import {collectionsCache} from '../../src/services/offline/cache';
import {SyncStatus, Collection} from '@lazisnu/shared-types';

const BIOMETRIC_SERVICE = 'com.lazisnu.biometric.refresh-token';

const seedCachedUser = () => {
  getAuthStorage().set(
    'cached_user_profile',
    JSON.stringify({
      id: 'usr_1',
      full_name: 'Petugas Lapangan',
      email: '',
      phone: '081234567890',
      role: 'PETUGAS',
      is_active: true,
    }),
  );
};

const resetAuthState = () => {
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    isInitializing: true,
    error: null,
    biometricEnabled: false,
    sessionRecoveryAvailable: false,
  });
};

describe('Sesi & Biometrik (initializeAuth / refresh / biometrik)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    initializeAuthStorage('test-auth-key-32-chars-length!');
    initializeOfflineStorage('test-offline-key-32-chars-length!');
    getAuthStorage().clearAll();
    Keychain.__resetMock();
    resetAuthState();
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('initializeAuth — offline-first restore', () => {
    it('memulihkan sesi dari cache saat /auth/me gagal karena jaringan', async () => {
      setToken('access_tok_valid');
      setRefreshToken('refresh_tok_valid');
      seedCachedUser();
      const cachedCollection: Collection = {
        id: 'server-1',
        assignment_id: 'asg-1',
        can_id: 'can-1',
        officer_id: 'off-1',
        nominal: 50000,
        collected_at: '2026-08-24T02:00:00.000Z',
        sync_status: SyncStatus.COMPLETED,
      };
      collectionsCache.set([cachedCollection]);

      // apiRequest tidak pernah throw saat offline — fetch reject
      // menghasilkan respons NETWORK_ERROR yang TIDAK boleh menghapus sesi.
      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

      await useAuthStore.getState().initializeAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user?.full_name).toBe('Petugas Lapangan');
      // Cache tampilan TIDAK ikut terhapus
      expect(collectionsCache.get()).toHaveLength(1);
    });

    it('membersihkan sesi hanya saat server menolak secara eksplisit', async () => {
      setToken('access_tok_revoked');
      setRefreshToken('refresh_tok_revoked');
      seedCachedUser();

      // 403 tidak memicu interceptor auto-refresh (bukan 401)
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({success: false, error: {code: 'FORBIDDEN', message: 'Ditolak'}}),
      });

      await useAuthStore.getState().initializeAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.token).toBeNull();
    });
  });

  describe('authService.refresh — kode error asli tanpa interceptor', () => {
    it('meneruskan REFRESH_REVOKED apa adanya dan hanya memanggil fetch sekali', async () => {
      const fetchSpy = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: {code: 'REFRESH_REVOKED', message: 'Refresh token sudah tidak berlaku'},
        }),
      });
      global.fetch = fetchSpy;

      const result = await authService.refresh('rt_lama');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('REFRESH_REVOKED');
      // Tidak ada percobaan auto-refresh kedua di belakang layar
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('meneruskan sukses beserta token baru', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {access_token: 'a_baru', refresh_token: 'r_baru'},
        }),
      });

      const result = await authService.refresh('rt_lama');

      expect(result.success).toBe(true);
      expect(result.data?.access_token).toBe('a_baru');
      expect(result.data?.refresh_token).toBe('r_baru');
    });
  });

  describe('rotasi refresh token — sinkronisasi Keychain biometrik', () => {
    const setupRotationFlow = () => {
      setToken('access_lama');
      setRefreshToken('rt_lama');
      // Panggilan 1: request dashboard → 401
      // Panggilan 2: refreshAccessToken → sukses + token baru
      // Panggilan 3: retry dashboard → sukses
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({success: false, error: {code: 'UNAUTHORIZED'}}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {access_token: 'access_baru', refresh_token: 'rt_baru'},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              today: {collected: 0, remaining: 0, total_nominal: 0},
              week: {collected: 0, total_nominal: 0},
            },
          }),
        });
      return dashboardService.getDashboard();
    };

    it('menulis ulang RT baru ke Keychain saat biometrik aktif', async () => {
      useAuthStore.setState({biometricEnabled: true});
      await enableBiometricSeed();

      await setupRotationFlow();

      expect(getAuthStorage().getString('refresh_token')).toBe('rt_baru');
      const setCalls = Keychain.__getCalls().filter(c => c.method === 'setGenericPassword');
      expect(setCalls.length).toBeGreaterThan(0);
      expect(Keychain.__getCalls().length).toBeGreaterThan(0);
    });

    it('tidak menyentuh Keychain saat biometrik nonaktif', async () => {
      useAuthStore.setState({biometricEnabled: false});

      await setupRotationFlow();

      expect(getAuthStorage().getString('refresh_token')).toBe('rt_baru');
      const setCalls = Keychain.__getCalls().filter(c => c.method === 'setGenericPassword');
      expect(setCalls).toHaveLength(0);
    });
  });

  describe('loginWithBiometric — klasifikasi kegagalan', () => {
    it('gagal jaringan TIDAK menonaktifkan biometrik', async () => {
      useAuthStore.setState({biometricEnabled: true});
      Keychain.__setMockValue({
        service: BIOMETRIC_SERVICE,
        username: 'biometric',
        password: 'rt_tersimpan',
      });
      global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

      const success = await useAuthStore.getState().loginWithBiometric();

      expect(success).toBe(false);
      expect(useAuthStore.getState().biometricEnabled).toBe(true);
      expect(useAuthStore.getState().error).toContain('koneksi');
    });

    it('REFRESH_REVOKED menonaktifkan biometrik dan menghapus token Keychain', async () => {
      useAuthStore.setState({biometricEnabled: true});
      Keychain.__setMockValue({
        service: BIOMETRIC_SERVICE,
        username: 'biometric',
        password: 'rt_kedaluwarsa',
      });
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: {code: 'REFRESH_REVOKED', message: 'Refresh token sudah tidak berlaku'},
        }),
      });

      const success = await useAuthStore.getState().loginWithBiometric();

      expect(success).toBe(false);
      expect(useAuthStore.getState().biometricEnabled).toBe(false);
      // Keychain dibersihkan — tombol biometrik tidak muncul lagi
      expect(await Keychain.getGenericPassword({service: BIOMETRIC_SERVICE})).toBeNull();
    });

    it('sukses me-reset flag pemulihan sesi', async () => {
      useAuthStore.setState({biometricEnabled: true, sessionRecoveryAvailable: true});
      Keychain.__setMockValue({
        service: BIOMETRIC_SERVICE,
        username: 'biometric',
        password: 'rt_valid',
      });
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {access_token: 'a_baru', refresh_token: 'r_baru'},
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: 'usr_1',
              full_name: 'Petugas Lapangan',
              phone: '081234567890',
              role: 'PETUGAS',
              is_active: true,
            },
          }),
        });

      const success = await useAuthStore.getState().loginWithBiometric();

      expect(success).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().sessionRecoveryAvailable).toBe(false);
    });
  });

  describe('forceLogout — panel pemulihan', () => {
    it('menandai sessionRecoveryAvailable hanya jika biometrik aktif', () => {
      useAuthStore.setState({biometricEnabled: true});
      useAuthStore.getState().forceLogout('Sesi telah berakhir. Silakan login kembali.');
      expect(useAuthStore.getState().sessionRecoveryAvailable).toBe(true);

      useAuthStore.setState({biometricEnabled: false});
      useAuthStore.getState().forceLogout();
      expect(useAuthStore.getState().sessionRecoveryAvailable).toBe(false);
    });
  });
});

// Helper: simulasikan token biometrik sudah tersimpan di Keychain
async function enableBiometricSeed(): Promise<void> {
  Keychain.__setMockValue({
    service: BIOMETRIC_SERVICE,
    username: 'biometric',
    password: 'rt_lama',
  });
}
