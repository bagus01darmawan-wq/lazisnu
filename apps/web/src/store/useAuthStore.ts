import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
          await fetch('/api/auth/logout', {
            method: 'POST',
          });
        } catch {} // ignore network errors on logout
        
        set({ user: null });
        authHelper.removeToken();
        window.location.href = '/login';
      },
    }),
    {
      name: 'lazisnu-auth-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
