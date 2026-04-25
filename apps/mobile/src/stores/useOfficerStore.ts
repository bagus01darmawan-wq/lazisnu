import { create } from 'zustand';

interface OfficerStats {
  totalCollections: number;
  thisMonth: number;
  totalAmount: number;
}

interface Officer {
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
  officer: Officer | null;
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
