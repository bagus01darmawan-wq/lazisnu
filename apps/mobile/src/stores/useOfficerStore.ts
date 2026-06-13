import { create } from 'zustand';
// Officer dari shared-types (SSOT) diimpor sebagai referensi tipe. Tipe lokal
// OfficerWithStats adalah versi "display-ready" dengan relasi district/branch
// yang sudah ter-resolve sebagai objek + stats computed. Hindari shadowing nama
// `Officer` agar tidak membingungkan antara tipe DB dan tipe UI.
import type { Officer } from '@lazisnu/shared-types';

interface OfficerStats {
  totalCollections: number;
  thisMonth: number;
  totalAmount: number;
}

interface OfficerWithStats {
  id: string;
  name: string;
  code: string;
  district: {
    id: string;
    name: string;
  };
  branch: {
    id: string;
    name: string;
  };
  stats: OfficerStats;
}

interface OfficerState {
  officer: OfficerWithStats | null;
  isLoading: boolean;
  error: string | null;
  fetchOfficer: () => Promise<void>;
}

export const useOfficerStore = create<OfficerState>((set) => ({
  officer: {
    id: 'off-1',
    name: 'Petugas Lapangan Lazisnu',
    code: 'PL-001',
    district: {
      id: 'dist-1',
      name: 'Kecamatan Paninggaran',
    },
    branch: {
      id: 'br-1',
      name: 'Ranting Domiyang',
    },
    stats: {
      totalCollections: 156,
      thisMonth: 42,
      totalAmount: 3750000,
    },
  },
  isLoading: false,
  error: null,
  fetchOfficer: async () => {
    // Simulasi fetch
    set({ isLoading: true });
    setTimeout(() => set({ isLoading: false }), 500);
  },
}));
