import {create} from 'zustand';
import {
  authService,
  setToken,
  setRefreshToken,
  getToken,
  clearToken,
  setSessionExpiredHandler,
  getAuthStorage,
  getRefreshToken,
} from '../services/api';
import {
  isBiometricAvailable,
  enableBiometric,
  getTokenWithBiometric,
  updateBiometricToken,
  disableBiometric,
} from '../services/biometric';
import {taskCache} from '../services/offline/tasks';
import {clearAllCache} from '../services/offline/cache';
import {resolveSessionAction, sessionExpiredMessage} from '../services/authSessionPolicy';
import {useDashboardStore} from './useDashboardStore';
import {useTasksStore} from './useTasksStore';
import {useCollectionsStore} from './useCollectionStore';
import {useSyncStore} from './useSyncStore';
import {User} from '@lazisnu/shared-types';
import {getErrorMessage} from '../utils/error';
import {
  setAuthTag,
  captureAuthEvent,
  clearAuthenticatedUser,
  setAuthenticatedUser,
} from '../config/crashlytics';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitializing: boolean; // true selama bootstrap app (initializeAuth)
  error: string | null;
  /** Pesan warning non-fatal (mis. mode enkripsi fallback). null = tidak ada. */
  encryptionWarning: string | null;

  /** Biometrik: apakah login sidik jari / face ID diaktifkan user */
  biometricEnabled: boolean;

  /**
   * True saat user terlempar ke AuthStack karena SESSION_EXPIRED dan
   * biometriknya aktif — halaman Login menampilkan panel pemulihan
   * "Lanjutkan dengan Sidik Jari" alih-alih form kosong.
   */
  sessionRecoveryAvailable: boolean;

  /**
   * Dipanggil sekali saat app boot. Jika ada token di MMKV,
   * validasi ke backend via /auth/me. Berhasil → set authenticated.
   * Gagal/expired → bersihkan state (lihat P1).
   */
  initializeAuth: () => Promise<void>;

  login: (phone: string, password: string) => Promise<boolean>;
  requestOTP: (phone: string) => Promise<boolean>;
  verifyOTP: (phone: string, otp: string) => Promise<boolean>;
  logout: () => Promise<void>;

  /**
   * Dipanggil oleh api.ts saat SESSION_EXPIRED terdeteksi.
   * Sama seperti logout tetapi tanpa panggil backend (token sudah mati).
   * Mengirim user kembali ke AuthStack dan membersihkan semua state.
   */
  forceLogout: (reason?: string) => void;

  /** Biometrik: aktifkan login sidik jari / face ID */
  enableBiometric: () => Promise<boolean>;

  /** Biometrik: login dengan sidik jari — dapat token baru dari server */
  loginWithBiometric: () => Promise<boolean>;

  /** Biometrik: nonaktifkan, hapus token dari Keystore */
  disableBiometric: () => Promise<void>;

  setUser: (user: User) => void;
  clearError: () => void;
  dismissSessionRecovery: () => void;
  setEncryptionWarning: (message: string | null) => void;
}

/**
 * Reset semua Zustand store + bersihkan MMKV instance kedua
 * (offline queue + task cache). Dipakai oleh logout/forceLogout.
 */
const CACHED_USER_KEY = 'cached_user_profile';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';

function loadBiometricEnabled(): boolean {
  try {
    return getAuthStorage().getBoolean(BIOMETRIC_ENABLED_KEY) ?? false;
  } catch {
    // Storage belum diinisialisasi (import time / test) — default aman: biometrik nonaktif
    return false;
  }
}

function saveBiometricEnabled(enabled: boolean): void {
  getAuthStorage().set(BIOMETRIC_ENABLED_KEY, enabled);
}

function saveCachedUser(user: User): void {
  getAuthStorage().set(CACHED_USER_KEY, JSON.stringify(user));
}

function getCachedUser(): User | null {
  const raw = getAuthStorage().getString(CACHED_USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as User;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function clearCachedUser(): void {
  getAuthStorage().delete(CACHED_USER_KEY);
}

function resetAllClientState() {
  // 1. Bersihkan cache task
  taskCache.clearTasks();
  clearCachedUser();
  // 3. Bersihkan cache MMKV tampilan (dashboard, tasks stats, collections)
  //    WAJIB dipanggil saat logout/ganti akun agar data petugas lama tidak bocor.
  clearAllCache();
  // 4. Reset Zustand stores (kecuali auth sendiri — di-handle pemanggil)
  useDashboardStore.setState({
    todayStats: null,
    weekStats: null,
    pendingTasks: [],
    recentCollections: [],
    isLoading: false,
    error: null,
  });
  useTasksStore.setState({
    tasks: [],
    currentTask: null,
    isLoading: false,
    error: null,
    page: 1,
    totalPages: 1,
    activeCount: 0,
    completedCount: 0,
    totalCount: 0,
  });
  useCollectionsStore.setState({
    collections: [],
    isLoading: false,
    error: null,
    page: 1,
    totalPages: 1,
    total: 0,
  });
  useSyncStore.setState({
    pendingCount: 0,
    permanentFailedCount: 0,
    pendingCorrectionsCount: 0,
    failedCorrectionsCount: 0,
    isSyncing: false,
    progress: 0,
    lastSyncAt: null,
    oldestPending: null,
    error: null,
  });
}

export const useAuthStore = create<AuthState>(set => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isInitializing: true, // true sampai initializeAuth selesai
  error: null,
  encryptionWarning: null,
  biometricEnabled: loadBiometricEnabled(),
  sessionRecoveryAvailable: false,

  initializeAuth: async () => {
    set({isInitializing: true, error: null});
    try {
      const token = await getToken();
      if (!token) {
        // Tidak ada token — biarkan AuthStack yang render
        set({isInitializing: false});
        return;
      }
      // Token ada di MMKV. Validasi ke backend.
      const result = await authService.me();
      if (result.success && result.data) {
        // result.data bertipe MeResponse (snake_case) — akses langsung tanpa as any
        const {id, full_name, email, phone, role, branch_id, district_id, is_active} = result.data;

        if (!is_active) {
          console.warn('[Auth] initializeAuth: account disabled');
          await clearToken();
          resetAllClientState();
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isInitializing: false,
          });
          return;
        }

        set({
          user: {
            id,
            full_name,
            email: email || '',
            phone: phone || '',
            role: role as User['role'],
            branch_id,
            district_id,
            is_active,
          },
          token,
          isAuthenticated: true,
          isInitializing: false,
        });
        saveCachedUser({
          id,
          full_name,
          email: email || '',
          phone: phone || '',
          role: role as User['role'],
          branch_id,
          district_id,
          is_active,
        });
        setAuthenticatedUser(id);
      } else {
        // Bedakan kegagalan jaringan dari penolakan server sungguhan.
        // apiRequest TIDAK pernah throw saat offline — ia return
        // {success:false, code:'NETWORK_ERROR'}. Menghapus sesi karena tidak
        // ada sinyal membuat petugas lapangan terlempar ke halaman Login dan
        // cache offline (dashboard/tugas/riwayat) ikut terhapus.
        const errorCode = result.error?.code;
        // Sesi Permanen Sliding: hanya penolakan bisnis eksplisit yang
        // membuang sesi lokal; UNAUTHORIZED polos (= access token expired
        // dan refresh sempat gagal teknis) TIDAK lagi menghapus login.
        const isAuthRejection =
          errorCode === 'SESSION_EXPIRED' || resolveSessionAction(errorCode) === 'logout';
        const cachedToken = await getToken();

        if (!isAuthRejection && cachedToken) {
          // Jaringan bermasalah / server error — pulihkan sesi dari cache.
          console.warn('[Auth] initializeAuth: jaringan tidak tersedia, pulihkan sesi lokal');
          const cachedUser = getCachedUser();
          set({
            user: cachedUser,
            token: cachedToken,
            isAuthenticated: true,
            isInitializing: false,
          });
          if (cachedUser) {
            setAuthenticatedUser(cachedUser.id);
          }
          return;
        }

        // Penolakan eksplisit backend atau token hilang — bersihkan semuanya
        await clearToken();
        resetAllClientState();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isInitializing: false,
        });
      }
    } catch (error) {
      // Offline-first: trust token di MMKV. Petugas bisa pakai app terbatas
      // tanpa koneksi. Token expired akan tertangani oleh sessionExpiredHandler
      // di api.ts saat panggilan API pertama setelah online kembali.
      console.warn('[Auth] initializeAuth network error:', getErrorMessage(error, ''));
      const cachedToken = await getToken();
      if (cachedToken) {
        const cachedUser = getCachedUser();
        set({user: cachedUser, token: cachedToken, isAuthenticated: true, isInitializing: false});
        if (cachedUser) {
          setAuthenticatedUser(cachedUser.id);
        }
      } else {
        set({isInitializing: false});
      }
    }
  },

  login: async (phone: string, password: string) => {
    set({isLoading: true, error: null});
    try {
      const result = await authService.login(phone, password);

      if (result.success && result.data) {
        // result.data bertipe AuthLoginResponse — akses langsung tanpa cast
        const {access_token, refresh_token, user} = result.data;

        if (!access_token || !user) {
          set({error: 'Respons server tidak valid (token/user kosong)', isLoading: false});
          return false;
        }

        await setToken(access_token);
        if (refresh_token) {
          setRefreshToken(refresh_token);
        }
        set({
          // AuthLoginResponse.user: { id, full_name, role, email?, branch_id?, district_id? }
          // verifyOTP mengirim subset (tanpa email). Pastikan setiap field punya fallback.
          user: {
            id: user.id,
            full_name: user.full_name,
            email: user.email || '',
            phone: phone, // dari parameter function, bukan dari respons backend
            role: user.role as User['role'],
            branch_id: user.branch_id,
            district_id: user.district_id,
            is_active: true,
          },
          token: access_token,
          isAuthenticated: true,
          isLoading: false,
          sessionRecoveryAvailable: false,
        });
        saveCachedUser({
          id: user.id,
          full_name: user.full_name,
          email: user.email || '',
          phone,
          role: user.role as User['role'],
          branch_id: user.branch_id,
          district_id: user.district_id,
          is_active: true,
        });
        setAuthenticatedUser(user.id);
        // Setelah login, ulangi migrasi agar legacy queue memakai key officerId.
        require('../services/offline/queue').offlineQueue.runMigration();
        return true;
      } else {
        set({error: result.error?.message || 'Login gagal', isLoading: false});
        return false;
      }
    } catch (error: unknown) {
      set({error: getErrorMessage(error, 'Terjadi kesalahan'), isLoading: false});
      return false;
    }
  },

  requestOTP: async (phone: string) => {
    set({isLoading: true, error: null});
    try {
      const result = await authService.requestOTP(phone);

      if (result.success) {
        set({isLoading: false});
        return true;
      } else {
        set({error: result.error?.message || 'Gagal kirim OTP', isLoading: false});
        return false;
      }
    } catch (error: unknown) {
      set({error: getErrorMessage(error, 'Terjadi kesalahan'), isLoading: false});
      return false;
    }
  },

  verifyOTP: async (phone: string, otp: string) => {
    set({isLoading: true, error: null});
    try {
      const result = await authService.verifyOTP(phone, otp);

      if (result.success && result.data) {
        // result.data bertipe AuthLoginResponse — akses langsung tanpa cast
        const {access_token, refresh_token, user} = result.data;

        if (!access_token || !user) {
          set({error: 'Respons server tidak valid (token/user kosong)', isLoading: false});
          return false;
        }

        await setToken(access_token);
        if (refresh_token) {
          setRefreshToken(refresh_token);
        }
        set({
          // AuthLoginResponse.user: { id, full_name, role, email?, branch_id?, district_id? }
          // verifyOTP mengirim subset (tanpa email). Pastikan setiap field punya fallback.
          user: {
            id: user.id,
            full_name: user.full_name,
            email: user.email || '',
            phone: phone, // dari parameter function, bukan dari respons backend
            role: user.role as User['role'],
            branch_id: user.branch_id,
            district_id: user.district_id,
            is_active: true,
          },
          token: access_token,
          isAuthenticated: true,
          isLoading: false,
          sessionRecoveryAvailable: false,
        });
        saveCachedUser({
          id: user.id,
          full_name: user.full_name,
          email: user.email || '',
          phone,
          role: user.role as User['role'],
          branch_id: user.branch_id,
          district_id: user.district_id,
          is_active: true,
        });
        setAuthenticatedUser(user.id);
        // Setelah login, ulangi migrasi agar legacy queue memakai key officerId.
        require('../services/offline/queue').offlineQueue.runMigration();
        return true;
      } else {
        set({error: result.error?.message || 'OTP tidak valid', isLoading: false});
        return false;
      }
    } catch (error: unknown) {
      set({error: getErrorMessage(error, 'Terjadi kesalahan'), isLoading: false});
      return false;
    }
  },

  logout: async () => {
    // JANGAN revoke sesi di server jika biometrik aktif: refresh token yang
    // tersimpan di Keychain (dilindungi sidik jari) harus tetap hidup agar
    // "login biometrik setelah logout" berfungsi. Logout adalah aksi lokal;
    // pencabutan sesi tetap bisa dilakukan dari web (logout semua perangkat)
    // yang memicu REFRESH_REVOKED → biometrik nonaktif otomatis.
    const biometricActive = useAuthStore.getState().biometricEnabled;
    if (!biometricActive) {
      // 1. Beritahu backend (best-effort, jangan gagalkan logout bila offline)
      await authService.logout().catch(() => {});
    }
    // 2. Bersihkan token + seluruh state klien
    await clearToken();
    resetAllClientState();
    clearAuthenticatedUser();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null,
      sessionRecoveryAvailable: false,
    });
  },

  forceLogout: reason => {
    // Dipanggil saat SESSION_EXPIRED dari api.ts — HANYA untuk penolakan
    // bisnis eksplisit (revoked/disabled). Tidak panggil backend — token sudah tidak valid.
    // Crashlytics: telemetri untuk monitoring post-rollout
    setAuthTag('force_logout', 'true');
    captureAuthEvent('force_logout', {reason: reason || 'unknown'});
    clearAuthenticatedUser();

    clearToken().catch(() => {
      /* ignore */
    });
    resetAllClientState();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: sessionExpiredMessage(reason),
      sessionRecoveryAvailable: useAuthStore.getState().biometricEnabled,
    });
  },

  // ── Biometrik ──────────────────────────────────────────────────────────

  enableBiometric: async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    const available = await isBiometricAvailable();
    if (!available) {
      return false;
    }

    const result = await enableBiometric(refreshToken);
    if (result) {
      saveBiometricEnabled(true);
      set({biometricEnabled: true});
    }
    return result;
  },

  loginWithBiometric: async () => {
    set({isLoading: true, error: null});
    try {
      const storedToken = await getTokenWithBiometric();
      if (!storedToken) {
        set({isLoading: false, error: 'Biometrik dibatalkan atau gagal'});
        return false;
      }

      // Panggil refresh dengan token dari Keystore
      const result = await authService.refresh(storedToken);

      if (result.success && result.data) {
        const {access_token, refresh_token} = result.data;

        if (!access_token) {
          set({error: 'Respons server tidak valid (token kosong)', isLoading: false});
          return false;
        }

        await setToken(access_token);
        if (refresh_token) {
          setRefreshToken(refresh_token);
          // Simpan refresh token baru kembali ke Keystore (rotasi)
          await updateBiometricToken(refresh_token);
        }

        // Ambil profil user untuk set state
        const meResult = await authService.me();
        if (meResult.success && meResult.data) {
          const {id, full_name, email, phone, role, branch_id, district_id, is_active} =
            meResult.data;
          if (!is_active) {
            await clearToken();
            await disableBiometric();
            saveBiometricEnabled(false);
            set({
              user: null,
              token: null,
              isAuthenticated: false,
              biometricEnabled: false,
              isLoading: false,
              error: 'Akun tidak aktif',
            });
            return false;
          }
          set({
            user: {
              id,
              full_name,
              email: email || '',
              phone: phone || '',
              role: role as User['role'],
              branch_id,
              district_id,
              is_active,
            },
            token: access_token,
            isAuthenticated: true,
            isLoading: false,
            sessionRecoveryAvailable: false,
          });
          saveCachedUser({
            id,
            full_name,
            email: email || '',
            phone: phone || '',
            role: role as User['role'],
            branch_id,
            district_id,
            is_active,
          });
          setAuthenticatedUser(id);
          return true;
        }

        // me() gagal tapi token valid — set minimal state dari refresh response
        set({
          token: access_token,
          isAuthenticated: true,
          isLoading: false,
          sessionRecoveryAvailable: false,
        });
        return true;
      }

      // Token mati/rusak secara definitif — nonaktifkan biometrik agar user
      // tidak terus-menerus gagal dengan pesan sama (kode asli server kini
      // sampai karena authService.refresh tidak lewat interceptor 401).
      if (
        result.error?.code === 'REFRESH_REVOKED' ||
        result.error?.code === 'UNAUTHORIZED' ||
        result.error?.code === 'INVALID_TOKEN' ||
        result.error?.code === 'MISSING_TOKEN'
      ) {
        await disableBiometric();
        saveBiometricEnabled(false);
        set({
          biometricEnabled: false,
          isLoading: false,
          error: 'Sesi biometrik telah berakhir. Silakan login dengan kata sandi.',
        });
        return false;
      }

      if (result.error?.code === 'NETWORK_ERROR') {
        // Jaringan bermasalah BUKAN alasan mencabut biometrik — token di
        // Keychain tetap sah, cukup diminta ulang saat online.
        set({
          isLoading: false,
          error:
            result.error.message || 'Tidak ada koneksi internet. Coba lagi saat jaringan tersedia.',
        });
        return false;
      }

      set({error: result.error?.message || 'Login biometrik gagal', isLoading: false});
      return false;
    } catch (error: unknown) {
      set({error: getErrorMessage(error, 'Terjadi kesalahan'), isLoading: false});
      return false;
    }
  },

  disableBiometric: async () => {
    await disableBiometric();
    saveBiometricEnabled(false);
    set({biometricEnabled: false});
  },

  setUser: (user: User) => set({user}),

  clearError: () => set({error: null}),

  dismissSessionRecovery: () => set({sessionRecoveryAvailable: false, error: null}),

  setEncryptionWarning: message => set({encryptionWarning: message}),
}));

// Daftarkan handler SESSION_EXPIRED ke api.ts agar saat refresh token
// ditolak dengan penolakan bisnis eksplisit (revoked/disabled), store
// otomatis paksa logout dan UI kembali ke AuthStack.
// Masalah teknis (jaringan/server) TIDAK pernah sampai sini — sesi dipertahankan.
// Side-effect ini aman: hanya jalan sekali saat module di-load.
setSessionExpiredHandler(reason => {
  useAuthStore.getState().forceLogout(reason);
});
