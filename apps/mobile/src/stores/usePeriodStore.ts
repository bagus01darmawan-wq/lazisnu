import {create} from 'zustand';
import {c1Service, type PeriodContextDto} from '../services/api';

/**
 * Periode tampilan berbasis aksi (satu sumber dari server).
 *
 * `display_period` = periode berhak tertua yang belum tuntas untuk cakupan
 * pengguna; dipakai sebagai default layar periode (Setoran/Keuangan). Tanggal
 * kalender hanya pengingat — tidak ada blokir di klien.
 */
interface PeriodStoreState {
  context: PeriodContextDto | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  reset: () => void;
}

export const usePeriodStore = create<PeriodStoreState>((set) => ({
  context: null,
  isLoading: false,
  refresh: async () => {
    set({isLoading: true});
    try {
      const res = await c1Service.getPeriodContext();
      if (res.success && res.data) {
        set({context: res.data});
      }
    } catch {
      // Biarkan konteks lama — layar tetap bisa memuat periode berjalan.
    } finally {
      set({isLoading: false});
    }
  },
  reset: () => set({context: null, isLoading: false}),
}));
