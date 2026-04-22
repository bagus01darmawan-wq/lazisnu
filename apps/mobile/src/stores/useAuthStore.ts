import { create } from 'zustand';
import { authService, setToken, setRefreshToken, storage } from '../services/api';
import { User } from '@lazisnu/shared-types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (phone: string, password: string) => Promise<boolean>;
  requestOTP: (phone: string) => Promise<boolean>;
  verifyOTP: (phone: string, otp: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setUser: (user: User) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (phone: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await authService.login(phone, password);

      if (result.success && result.data) {
        const data = result.data as any;
        await setToken(data.access_token);
        if (data.refresh_token) setRefreshToken(data.refresh_token);
        set({
          user: data.user,
          token: data.access_token,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      } else {
        set({ error: result.error?.message || 'Login gagal', isLoading: false });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message || 'Terjadi kesalahan', isLoading: false });
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
    } catch (error: any) {
      set({ error: error.message || 'Terjadi kesalahan', isLoading: false });
      return false;
    }
  },

  verifyOTP: async (phone: string, otp: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await authService.verifyOTP(phone, otp);

      if (result.success && result.data) {
        const data = result.data as any;
        await setToken(data.access_token);
        if (data.refresh_token) setRefreshToken(data.refresh_token);
        set({
          user: data.user,
          token: data.access_token,
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      } else {
        set({ error: result.error?.message || 'OTP tidak valid', isLoading: false });
        return false;
      }
    } catch (error: any) {
      set({ error: error.message || 'Terjadi kesalahan', isLoading: false });
      return false;
    }
  },

  logout: async () => {
    await authService.logout();
    storage.delete('user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  setUser: (user: User) => set({ user }),

  clearError: () => set({ error: null }),
}));
