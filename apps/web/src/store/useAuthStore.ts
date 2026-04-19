import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Cookies from 'js-cookie';

interface User {
  id: string;
  full_name: string;
  role: 'ADMIN_KECAMATAN' | 'ADMIN_RANTING' | 'BENDAHARA' | 'PETUGAS';
  email?: string;
  branch_id?: string;
  district_id?: string;
}

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
      logout: () => {
        set({ user: null });
        Cookies.remove('lazisnu_token');
        Cookies.remove('user_role');
        window.location.href = '/login';
      },
    }),
    {
      name: 'lazisnu-auth-storage',
    }
  )
);
