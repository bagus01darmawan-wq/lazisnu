import { create } from 'zustand';
import { collectionService } from '../services/api';
import { offlineQueue } from '../services/offline/queue';
import { syncService } from '../services/offline/sync';
import NetInfo from '@react-native-community/netinfo';
import { getDeviceInfo } from '../utils/device';
import { Collection, HistoryItem } from '@lazisnu/shared-types';

// Tipe jujur untuk data yang disimpan setelah submit (sebelum sync ke server).
// Tidak menggunakan `Collection` karena data belum punya field server-side
// seperti `id`, `officer_id`, `sync_status`, atau nested `can`.
interface SubmittedCollectionDraft {
  assignment_id: string;
  can_id: string;
  nominal: number;
  payment_method: 'CASH' | 'TRANSFER';
  collected_at: string;
  latitude?: number;
  longitude?: number;
  offline_id: string;
}

interface CollectionState {
  isSubmitting: boolean;
  lastSubmitted: SubmittedCollectionDraft | null;
  error: string | null;

  submitCollection: (data: {
    assignment_id: string;
    can_id: string;
    nominal: number;
    payment_method: 'CASH' | 'TRANSFER';
    collected_at: string;
    latitude?: number;
    longitude?: number;
    offline_id: string;
  }) => Promise<{ success: boolean; synced: boolean }>;

  reset: () => void;
}

export const useCollectionStore = create<CollectionState>((set) => ({
  isSubmitting: false,
  lastSubmitted: null,
  error: null,

  submitCollection: async (data) => {
    set({ isSubmitting: true, error: null });
    try {
      // 1. Simpan ke Queue lokal (MMKV)
      offlineQueue.enqueue({
        ...data,
        device_info: getDeviceInfo(),
      });

      // 2. Cek koneksi & trigger sync jika online
      const netInfo = await NetInfo.fetch();
      const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable);

      if (isOnline) {
        const syncResult = await syncService.autoSync();
        // SYNC_IN_PROGRESS: data sudah di queue MMKV, akan tertangani oleh sync yang sedang berjalan.
        // Jangan error — user tidak perlu tahu ada race condition internal.
        if (syncResult.error === 'SYNC_IN_PROGRESS') {
          set({ isSubmitting: false, lastSubmitted: data });
          return { success: true, synced: false };
        }
        if (!syncResult.success) {
          set({
            isSubmitting: false,
            lastSubmitted: data,
            error: 'Gagal sinkronisasi. Data tersimpan offline.',
          });
          return { success: true, synced: false };
        }
        set({ isSubmitting: false, lastSubmitted: data });
        return { success: true, synced: true };
      }

      set({ isSubmitting: false, lastSubmitted: data });
      return { success: true, synced: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan data';
      set({ error: message, isSubmitting: false });
      return { success: false, synced: false };
    }
  },

  reset: () => set({ isSubmitting: false, lastSubmitted: null, error: null }),
}));

interface CollectionsHistoryState {
  collections: Collection[];
  isLoading: boolean;
  error: string | null;
  page: number;
  totalPages: number;

  fetchCollections: (filter?: string) => Promise<void>;
  loadMore: () => Promise<void>;
}

/**
 * Map HistoryItem (denormalized dari backend) → Collection (nested can, dengan
 * field opsional dikosongkan). UI HistoryScreen membaca `can.qr_code`,
 * `can.owner_name` — sedangkan backend mengirim field flat.
 */
function mapHistoryToCollection(item: HistoryItem): Collection {
  return {
    id: item.id,
    assignment_id: '',
    can_id: '',
    officer_id: '',
    nominal: item.nominal,
    payment_method: item.payment_method,
    collected_at: item.collected_at,
    sync_status: item.sync_status,
    can: {
      qr_code: item.qr_code,
      owner_name: item.owner_name,
      owner_address: item.owner_address,
    },
  };
}

export const useCollectionsStore = create<CollectionsHistoryState>((set, get) => ({
  collections: [],
  isLoading: false,
  error: null,
  page: 1,
  totalPages: 1,

  fetchCollections: async () => {
    set({ isLoading: true, error: null });

    try {
      const result = await collectionService.getHistory({ page: 1, limit: 20 });

      if (result.success && result.data) {
        // result.data bertipe HistoryResponse — backend mengirim items (denormalized).
        // UI membutuhkan shape Collection (nested can). Mapping eksplisit di sini.
        const items: HistoryItem[] = result.data.items || [];
        const mapped = items.map(mapHistoryToCollection);
        set({
          collections: mapped,
          page: result.data.pagination.page || 1,
          totalPages: result.data.pagination.total_pages || 1,
          isLoading: false,
        });
      } else {
        set({
          collections: [],
          error: result.error?.message || 'Gagal memuat riwayat koleksi',
          isLoading: false,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan jaringan';
      set({
        collections: [],
        error: message,
        isLoading: false,
      });
    }
  },

  loadMore: async () => {
    const { page, totalPages, collections } = get();
    if (page >= totalPages) {return;}

    set({ isLoading: true });
    try {
      const result = await collectionService.getHistory({ page: page + 1, limit: 20 });

      if (result.success && result.data) {
        const items: HistoryItem[] = result.data.items || [];
        const mapped = items.map(mapHistoryToCollection);
        set({
          collections: [...collections, ...mapped],
          page: result.data.pagination.page || page + 1,
          totalPages: result.data.pagination.total_pages || totalPages,
          isLoading: false,
        });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
