import { create } from 'zustand';
import { collectionService } from '../services/api';
import { offlineQueue } from '../services/offline/queue';
import { syncService } from '../services/offline/sync';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { Collection } from '@lazisnu/shared-types';

interface CollectionState {
  isSubmitting: boolean;
  lastSubmitted: Collection | null;
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
  }) => Promise<boolean>;

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
        device_info: {
          model: Platform.Version.toString(),
          os_version: Platform.OS,
          app_version: '1.0.0',
        },
      });

      // 2. Cek koneksi & trigger sync jika online
      const netInfo = await NetInfo.fetch();
      const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable);

      if (isOnline) {
        await syncService.autoSync();
      }

      set({ isSubmitting: false, lastSubmitted: data as unknown as Collection });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan data';
      set({ error: message, isSubmitting: false });
      return false;
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

export const useCollectionsStore = create<CollectionsHistoryState>((set, get) => ({
  collections: [],
  isLoading: false,
  error: null,
  page: 1,
  totalPages: 1,

  fetchCollections: async () => {
    set({ isLoading: true, error: null });

    // DATA SIMULASI UNTUK RIWAYAT
    const mockCollections: Collection[] = [
      {
        id: 'hist-1',
        assignment_id: 'a1',
        can_id: 'c1',
        officer_id: 'p1',
        nominal: 50000,
        payment_method: 'CASH' as any,
        collected_at: new Date(Date.now() - 3600000).toISOString(),
        sync_status: 'COMPLETED' as any,
        whatsapp_sent: true,
        can: {
          qr_code: 'PNG-01-003',
          owner_name: 'Warung Bu Siti',
          owner_address: 'Pasar Paninggaran Blok A',
        },
      },
      {
        id: 'hist-2',
        assignment_id: 'a2',
        can_id: 'c2',
        officer_id: 'p1',
        nominal: 100000,
        payment_method: 'TRANSFER' as any,
        collected_at: new Date(Date.now() - 86400000).toISOString(),
        sync_status: 'COMPLETED' as any,
        whatsapp_sent: true,
        can: {
          qr_code: 'PNG-01-010',
          owner_name: 'H. Mansur',
          owner_address: 'Depan Masjid Jami',
        },
      },
      {
        id: 'hist-3',
        assignment_id: 'a3',
        can_id: 'c3',
        officer_id: 'p1',
        nominal: 25000,
        payment_method: 'CASH' as any,
        collected_at: new Date(Date.now() - 172800000).toISOString(),
        sync_status: 'COMPLETED' as any,
        whatsapp_sent: false,
        notes: 'Kaleng hampir penuh',
        can: {
          qr_code: 'PNG-02-005',
          owner_name: 'Ibu Ratna',
          owner_address: 'Perumahan Indah Gg. 4',
        },
      },
    ];

    try {
      const result = await collectionService.getHistory({ page: 1, limit: 20 });

      if (result.success && result.data) {
        const data = result.data as any;
        const realCollections = data.collections || [];
        set({
          collections: realCollections.length > 0 ? realCollections : mockCollections,
          page: data.pagination?.page || 1,
          totalPages: data.pagination?.total_pages || 1,
          isLoading: false,
        });
      } else {
        set({
          collections: mockCollections,
          isLoading: false,
        });
      }
    } catch (error) {
      set({
        collections: mockCollections,
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
        const data = result.data as any;
        set({
          collections: [...collections, ...(data.collections || [])],
          page: data.pagination?.page || page + 1,
          totalPages: data.pagination?.total_pages || totalPages,
          isLoading: false,
        });
      }
    } catch (error: any) {
      set({ isLoading: false });
    }
  },
}));
