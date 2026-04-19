import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'ADMIN_RANTING' | 'ADMIN_KECAMATAN' | 'BENDAHARA' | 'PETUGAS' | 'SUPER_ADMIN';
  districtId?: string;
  branchId?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: {
    id: 'mock-admin-id',
    email: 'admin@lazisnu.id',
    full_name: 'Admin Kecamatan Audit',
    role: 'ADMIN_KECAMATAN',
    districtId: 'mock-district-id'
  },
  token: 'mock-token',
  isAuthenticated: true,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setToken: (token) => set({ token }),
  logout: () => set({ user: null, token: null, isAuthenticated: false }),
}));
