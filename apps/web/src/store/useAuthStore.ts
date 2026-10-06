import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authHelper } from '@/lib/auth';
import { UserRole } from '@lazisnu/shared-types';

/**
 * Bentuk user sesi di sisi web (camelCase — hasil normalisasi caseConverter
 * atas respons auth backend yang berkawat snake_case). Kontrak kawat
 * (shared-types `User`) TIDAK diubah; tipe ini hanya untuk konsumsi UI.
 */
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  districtId?: string;
  branchId?: string;
  isActive?: boolean;
  lastLogin?: string;
}

interface AuthState {
  user: SessionUser | null;
  setUser: (user: SessionUser | null) => void;
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
      // v2: user sesi kini camelCase (SessionUser) hasil normalisasi
      // caseConverter. Key baru membuang sesi snake_case lama agar
      // terhidrasi ulang via /auth/me (cookie masih valid, tanpa login ulang).
      name: 'lazisnu-auth-storage-v2',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
