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
  /**
   * True bila context belum dikonfirmasi server pada panggilan terakhir:
   * seed dari cache offline, atau refresh gagal. Header menampilkan bar
   * "menyinkronkan" — nilainya bisa basi (periode aksi sudah berubah).
   */
  isStale: boolean;
  refresh: () => Promise<void>;
  hydrateFromCache: () => void;
  reset: () => void;
}

export const usePeriodStore = create<PeriodStoreState>((set, get) => ({
  context: null,
  isLoading: false,
  isStale: false,
  refresh: async () => {
    set({isLoading: true});
    // Hidrasi cache lebih dulu agar boot offline tidak jatuh ke bulan kalender.
    // Ditandai basi sampai server mengonfirmasi — jangan pernah menampilkan
    // periode dari cache seolah segar.
    if (!get().context) {
      const cached = periodContextCache.get<PeriodContextDto>();
      if (cached) set({context: cached, isStale: true});
    }
    try {
      const res = await c1Service.getPeriodContext();
      if (res.success && res.data) {
        set({context: res.data, isStale: false});
        periodContextCache.set(res.data);
      } else if (get().context) {
        // Server menjawab tapi tanpa data — anggap belum terkonfirmasi.
        set({isStale: true});
      }
    } catch {
      // Biarkan konteks lama — layar tetap bisa memuat periode berjalan.
      if (get().context) set({isStale: true});
    } finally {
      set({isLoading: false});
    }
  },
  hydrateFromCache: () => {
    if (get().context) return;
    const cached = periodContextCache.get<PeriodContextDto>();
    if (cached) set({context: cached, isStale: true});
  },
  reset: () => {
    periodContextCache.clear();
    set({context: null, isLoading: false, isStale: false});
  },
}));
