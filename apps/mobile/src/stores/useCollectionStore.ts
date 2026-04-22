import { create } from 'zustand';
import { collectionService } from '../services/api';
import { collectionStorage, syncManager } from '../services/offlineStorage';
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
      await collectionStorage.save({
        ...data,
        device_info: {
          model: Platform.Version.toString(),
          os_version: Platform.OS,
          app_version: '1.0.0',
        },
      });

      const isOnline = await syncManager.isOnline();

      if (isOnline) {
        const result = await syncManager.sync();
        if (result.success > 0) {
          set({ isSubmitting: false, lastSubmitted: data as unknown as Collection });
          return true;
        }
      }

      set({ isSubmitting: false, lastSubmitted: data as unknown as Collection });
      return true;
    } catch (error: any) {
      set({ error: error.message || 'Gagal menyimpan data', isSubmitting: false });
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
    try {
      const result = await collectionService.getHistory({ page: 1, limit: 20 });

      if (result.success && result.data) {
        const data = result.data as any;
        set({
          collections: data.collections || [],
          page: data.pagination?.page || 1,
          totalPages: data.pagination?.total_pages || 1,
          isLoading: false,
        });
      } else {
        set({ error: result.error?.message || 'Gagal memuat riwayat', isLoading: false });
      }
    } catch (error: any) {
      set({ error: error.message || 'Terjadi kesalahan', isLoading: false });
    }
  },

  loadMore: async () => {
    const { page, totalPages, collections } = get();
    if (page >= totalPages) return;

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
