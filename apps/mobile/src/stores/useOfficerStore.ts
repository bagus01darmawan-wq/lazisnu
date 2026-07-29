import { create } from 'zustand';
// Officer dari shared-types (SSOT) diimpor sebagai referensi tipe. Tipe lokal
// OfficerWithStats adalah versi "display-ready" dengan relasi district/branch
// yang sudah ter-resolve sebagai objek + stats computed. Hindari shadowing nama
// `Officer` agar tidak membingungkan antara tipe DB dan tipe UI.

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
  officer: null,
  isLoading: false,
  error: null,
  fetchOfficer: async () => {
    // Endpoint profil petugas belum tersedia. Jangan mengisi UI dengan data simulasi.
    set({isLoading: false, officer: null, error: null});
  },
}));
