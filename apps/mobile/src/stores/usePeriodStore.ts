import {create} from 'zustand';
import {c1Service, type PeriodContextDto} from '../services/api';
import {periodContextCache} from '../services/offline/cache';

/**
 * Periode tampilan berbasis aksi (satu sumber dari server).
 *
 * `display_period` = periode berhak tertua yang belum tuntas untuk cakupan
 * pengguna; dipakai semua layar yang menyebut periode. Tanggal kalender hanya
 * pengingat — tidak ada blokir di klien.
 */
interface PeriodStoreState {
  context: PeriodContextDto | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  hydrateFromCache: () => void;
  reset: () => void;
}

export const usePeriodStore = create<PeriodStoreState>((set, get) => ({
  context: null,
  isLoading: false,
  refresh: async () => {
    set({isLoading: true});
    // Hidrasi cache lebih dulu agar boot offline tidak jatuh ke bulan kalender.
    if (!get().context) {
      const cached = periodContextCache.get<PeriodContextDto>();
      if (cached) set({context: cached});
    }
    try {
      const res = await c1Service.getPeriodContext();
      if (res.success && res.data) {
        set({context: res.data});
        periodContextCache.set(res.data);
      }
    } catch {
      // Biarkan konteks lama — layar tetap bisa memuat periode berjalan.
    } finally {
      set({isLoading: false});
    }
  },
  hydrateFromCache: () => {
    if (get().context) return;
    const cached = periodContextCache.get<PeriodContextDto>();
    if (cached) set({context: cached});
  },
  reset: () => {
    periodContextCache.clear();
    set({context: null, isLoading: false});
  },
}));
