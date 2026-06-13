import { create } from 'zustand';
import { authService, setToken, setRefreshToken, getToken, clearToken, setSessionExpiredHandler } from '../services/api';
import { offlineQueue } from '../services/offline/queue';
import { taskCache } from '../services/offline/tasks';
import { useDashboardStore } from './useDashboardStore';
import { useTasksStore } from './useTasksStore';
import { useCollectionsStore } from './useCollectionStore';
import { useSyncStore } from './useSyncStore';
import { User } from '@lazisnu/shared-types';
import { getErrorMessage } from '../utils/error';
import { setAuthTag, captureAuthEvent, clearAuthenticatedUser } from '../config/sentry';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitializing: boolean; // true selama bootstrap app (initializeAuth)
  error: string | null;
  /** Pesan warning non-fatal (mis. mode enkripsi fallback). null = tidak ada. */
  encryptionWarning: string | null;

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

  setUser: (user: User) => void;
  clearError: () => void;
  setEncryptionWarning: (message: string | null) => void;
}

/**
 * Reset semua Zustand store + bersihkan MMKV instance kedua
 * (offline queue + task cache). Dipakai oleh logout/forceLogout.
 */
function resetAllClientState() {
  // 1. Bersihkan antrean offline koleksi finansial
  offlineQueue.clearQueue();
  offlineQueue.clearFailedPermanent();
  // 2. Bersihkan cache task
  taskCache.clearTasks();
  // 3. Reset Zustand stores (kecuali auth sendiri — di-handle pemanggil)
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
  });
  useCollectionsStore.setState({
    collections: [],
    isLoading: false,
    error: null,
    page: 1,
    totalPages: 1,
  });
  useSyncStore.setState({
    pendingCount: 0,
    permanentFailedCount: 0,
    isSyncing: false,
    progress: 0,
    lastSyncAt: null,
    oldestPending: null,
    error: null,
  });
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  isInitializing: true, // true sampai initializeAuth selesai
  error: null,
  encryptionWarning: null,

  initializeAuth: async () => {
    set({ isInitializing: true, error: null });
    try {
      const token = await getToken();
      if (!token) {
        // Tidak ada token — biarkan AuthStack yang render
        set({ isInitializing: false });
        return;
      }
      // Token ada di MMKV. Validasi ke backend.
      const result = await authService.me();
      if (result.success && result.data) {
        // result.data bertipe MeResponse (snake_case) — akses langsung tanpa as any
        const { id, full_name, email, phone, role, branch_id, district_id, is_active } = result.data;

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
      } else {
        // Token ditolak backend — bersihkan semuanya
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
        set({ token: cachedToken, isAuthenticated: true, isInitializing: false });
      } else {
        set({ isInitializing: false });
      }
    }
  },

  login: async (phone: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await authService.login(phone, password);

      if (result.success && result.data) {
        // result.data bertipe AuthLoginResponse — akses langsung tanpa cast
        const { access_token, refresh_token, user } = result.data;

        if (!access_token || !user) {
          set({ error: 'Respons server tidak valid (token/user kosong)', isLoading: false });
          return false;
        }

        await setToken(access_token);
        if (refresh_token) {setRefreshToken(refresh_token);}
        set({
          // AuthLoginResponse.user: { id, full_name, role, email?, branch_id?, district_id? }
          // verifyOTP mengirim subset (tanpa email). Pastikan setiap field punya fallback.
          user: {
            id: user.id,
            full_name: user.full_name,
            email: user.email || '',
            phone: phone,      // dari parameter function, bukan dari respons backend
            role: user.role as User['role'],
            branch_id: user.branch_id,
            district_id: user.district_id,
            is_active: true,
          },
          token: access_token,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      } else {
        set({ error: result.error?.message || 'Login gagal', isLoading: false });
        return false;
      }
    } catch (error: unknown) {
      set({ error: getErrorMessage(error, 'Terjadi kesalahan'), isLoading: false });
      return false;
    }
  },

  requestOTP: async (phone: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await authService.requestOTP(phone);

      if (result.success) {
        set({ isLoading: false });
        return true;
      } else {
        set({ error: result.error?.message || 'Gagal kirim OTP', isLoading: false });
        return false;
      }
    } catch (error: unknown) {
      set({ error: getErrorMessage(error, 'Terjadi kesalahan'), isLoading: false });
      return false;
    }
  },

  verifyOTP: async (phone: string, otp: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await authService.verifyOTP(phone, otp);

      if (result.success && result.data) {
        // result.data bertipe AuthLoginResponse — akses langsung tanpa cast
        const { access_token, refresh_token, user } = result.data;

        if (!access_token || !user) {
          set({ error: 'Respons server tidak valid (token/user kosong)', isLoading: false });
          return false;
        }

        await setToken(access_token);
        if (refresh_token) {setRefreshToken(refresh_token);}
        set({
          // AuthLoginResponse.user: { id, full_name, role, email?, branch_id?, district_id? }
          // verifyOTP mengirim subset (tanpa email). Pastikan setiap field punya fallback.
          user: {
            id: user.id,
            full_name: user.full_name,
            email: user.email || '',
            phone: phone,      // dari parameter function, bukan dari respons backend
            role: user.role as User['role'],
            branch_id: user.branch_id,
            district_id: user.district_id,
            is_active: true,
          },
          token: access_token,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      } else {
        set({ error: result.error?.message || 'OTP tidak valid', isLoading: false });
        return false;
      }
    } catch (error: unknown) {
      set({ error: getErrorMessage(error, 'Terjadi kesalahan'), isLoading: false });
      return false;
    }
  },

  logout: async () => {
    // 1. Beritahu backend (best-effort, jangan gagalkan logout bila offline)
    await authService.logout().catch(() => { });
    // 2. Bersihkan token + seluruh state klien
    await clearToken();
    resetAllClientState();
    set({ user: null, token: null, isAuthenticated: false, error: null });
  },

  forceLogout: (reason) => {
    // Dipanggil saat SESSION_EXPIRED dari api.ts (refresh gagal).
    // Tidak panggil backend — token sudah tidak valid.
    // Sentry: telemetri untuk monitoring post-rollout
    setAuthTag('force_logout', 'true');
    captureAuthEvent('force_logout', { reason: reason || 'unknown' });
    clearAuthenticatedUser();

    clearToken().catch(() => { /* ignore */ });
    resetAllClientState();
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      error: reason || 'Sesi telah berakhir. Silakan login kembali.',
    });
  },

  setUser: (user: User) => set({ user }),

  clearError: () => set({ error: null }),

  setEncryptionWarning: (message) => set({ encryptionWarning: message }),
}));

// Daftarkan handler SESSION_EXPIRED ke api.ts agar saat refresh token
// gagal, store otomatis paksa logout dan UI kembali ke AuthStack.
// Side-effect ini aman: hanya jalan sekali saat module di-load.
setSessionExpiredHandler(() => {
  useAuthStore.getState().forceLogout();
});
