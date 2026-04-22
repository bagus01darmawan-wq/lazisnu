import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Cookies from 'js-cookie';
import { authHelper } from '@/lib/auth';
import { User } from '@lazisnu/shared-types';

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),
      logout: async () => {
        try {
          const refreshToken = authHelper.getRefreshToken();
          if (refreshToken) {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/v1/auth/logout`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refreshToken }),
            });
          }
        } catch (e) {} // ignore network errors on logout
        
        set({ user: null });
        authHelper.removeToken();
        Cookies.remove('user_role');
        window.location.href = '/login';
      },
    }),
    {
      name: 'lazisnu-auth-storage',
    }
  )
);
