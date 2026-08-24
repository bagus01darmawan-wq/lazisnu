import {create} from 'zustand';
import {collectionService} from '../services/api';
import {offlineQueue, generateOfflineId, QueuedCollection} from '../services/offline/queue';
import {correctionQueue} from '../services/offline/corrections';
import {syncService} from '../services/offline/sync';
import NetInfo from '@react-native-community/netinfo';
import {getDeviceInfo} from '../utils/device';
import {Collection, HistoryItem, SyncStatus} from '@lazisnu/shared-types';
import {useTasksStore} from './useTasksStore';
import {refreshSyncCounts} from './useSyncStore';
import {useDashboardStore} from './useDashboardStore';
import {collectionsCache} from '../services/offline/cache';
import {taskCache} from '../services/offline/tasks';

let latestCollectionsRequestId = 0;

// Batas nominal per penjemputan kotak infaq
export const MAX_COLLECTION_NOMINAL = 10_000_000;

// Tipe jujur untuk data yang disimpan setelah submit (sebelum sync ke server).
interface SubmittedCollectionDraft {
  assignment_id: string;
  can_id: string;
  nominal: number;
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
    collected_at: string;
    latitude?: number;
    longitude?: number;
    offline_id?: string;
  }) => Promise<{success: boolean; synced: boolean; error?: string}>;

  reset: () => void;
}

export const useCollectionStore = create<CollectionState>(set => ({
  isSubmitting: false,
  lastSubmitted: null,
  error: null,

  submitCollection: async data => {
    set({isSubmitting: true, error: null});

    // Validasi domain di level Store/Service
    if (typeof data.nominal !== 'number' || isNaN(data.nominal)) {
      const error = 'Nominal harus berupa angka valid.';
      set({error, isSubmitting: false});
      return {success: false, synced: false, error};
    }
    if (data.nominal < 0) {
      const error = 'Nominal tidak boleh bernilai negatif.';
      set({error, isSubmitting: false});
      return {success: false, synced: false, error};
    }
    if (data.nominal > MAX_COLLECTION_NOMINAL) {
      const error =
        'Maksimal nominal per penjemputan adalah Rp10.000.000. Hubungi admin untuk penjemputan khusus.';
      set({error, isSubmitting: false});
      return {success: false, synced: false, error};
    }

    const offlineId = data.offline_id || generateOfflineId();
    const preparedData: SubmittedCollectionDraft = {
      ...data,
      offline_id: offlineId,
    };

    try {
      const alreadyQueued = offlineQueue
        .getQueue()
        .some(item => item.assignment_id === preparedData.assignment_id);
      const alreadyCached = useCollectionsStore
        .getState()
        .collections.some(
          item =>
            item.assignment_id === preparedData.assignment_id &&
            item.sync_status === SyncStatus.PENDING,
        );

      if (alreadyQueued || alreadyCached) {
        refreshSyncCounts();
        set({isSubmitting: false, lastSubmitted: preparedData});
        return {success: true, synced: false};
      }

      // 1. Simpan ke Queue lokal (MMKV)
      offlineQueue.enqueue({
        ...preparedData,
        device_info: getDeviceInfo(),
      });

      // Ambil metadata sebelum task dipindahkan dari daftar ACTIVE.
      const task = useTasksStore.getState().tasks.find(t => t.id === preparedData.assignment_id);

      // Optimistic updates for offline-first responsiveness
      useTasksStore.getState().markTaskComplete(preparedData.assignment_id, preparedData.nominal);
      useDashboardStore.getState().optimisticUpdateStats(preparedData.nominal);
      useDashboardStore.getState().optimisticRemoveTask(preparedData.assignment_id);
      const newCollection: Collection = {
        id: preparedData.offline_id,
        assignment_id: preparedData.assignment_id,
        can_id: preparedData.can_id,
        officer_id: '',
        nominal: preparedData.nominal,
        collected_at: preparedData.collected_at,
        sync_status: SyncStatus.PENDING,
        can: {
          qr_code: task?.qr_code || 'Offline',
          owner_name: task?.owner_name || 'Kaleng Masukan QR',
          owner_address: task?.owner_address || '-',
        },
      };
      useCollectionsStore.getState().addOptimisticCollection(newCollection);

      // Update sync count state
      refreshSyncCounts();

      // 2. Cek koneksi & trigger sync jika online
      const netInfo = await NetInfo.fetch();
      const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable);

      if (isOnline) {
        const syncResult = await syncService.autoSync();
        // SYNC_IN_PROGRESS: data sudah di queue MMKV, akan tertangani oleh sync yang sedang berjalan.
        if (syncResult.error === 'SYNC_IN_PROGRESS') {
          set({isSubmitting: false, lastSubmitted: preparedData});
          return {success: true, synced: false};
        }
        if (!syncResult.success) {
          set({
            isSubmitting: false,
            lastSubmitted: preparedData,
            error: 'Gagal sinkronisasi. Data tersimpan offline.',
          });
          return {success: true, synced: false};
        }
        set({isSubmitting: false, lastSubmitted: preparedData});
        // Re-fetch dari server setelah sync berhasil untuk merekonsiliasi data optimistis.
        setTimeout(() => {
          useDashboardStore.getState().fetchDashboard();
          useTasksStore.getState().fetchTasks('ACTIVE');
          useTasksStore.getState().fetchStats();
          useCollectionsStore.getState().fetchCollections();
        }, 500);
        return {success: true, synced: true};
      }

      set({isSubmitting: false, lastSubmitted: preparedData});
      return {success: true, synced: false};
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan data';
      set({error: message, isSubmitting: false});
      return {success: false, synced: false, error: message};
    }
  },

  reset: () => set({isSubmitting: false, lastSubmitted: null, error: null}),
}));

interface CollectionsHistoryState {
  collections: Collection[];
  isLoading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  total: number;

  fetchCollections: (filter?: string) => Promise<void>;
  loadMore: () => Promise<void>;
  hydrateFromCache: () => void;
  addOptimisticCollection: (collection: Collection) => void;
  updatePendingNominal: (offlineId: string, newNominal: number) => boolean;
  resubmitCollection: (
    id: string,
    payload: {nominal: number; alasan_resubmit: string; nominal_lama?: number},
  ) => Promise<{success: boolean; queued?: boolean; error?: string}>;
  retryFailedCollection: (offlineId: string) => Promise<boolean>;
}

/**
 * Map HistoryItem (denormalized dari backend) ke Collection (nested can).
 * UI HistoryScreen membaca `can.qr_code`, `can.owner_name` — sedangkan
 * backend mengirim field flat.
 */
function mapHistoryToCollection(item: HistoryItem): Collection {
  return {
    id: item.id,
    assignment_id: item.assignment_id,
    can_id: item.can_id,
    officer_id: '',
    nominal: item.nominal,
    collected_at: item.collected_at,
    sync_status: item.sync_status,
    offline_id: item.offline_id || undefined,
    submit_sequence: item.submit_sequence,
    can: {
      qr_code: item.qr_code,
      owner_name: item.owner_name,
      owner_address: item.owner_address,
    },
  };
}

export function mergeCollectionsWithQueues(
  serverMapped: Collection[],
  allowServerAck = false,
): Collection[] {
  const activeQueue = offlineQueue.getQueue();
  const failedQueue = offlineQueue.getFailedPermanent();
  const cacheTasks = [...taskCache.getTasks('ACTIVE'), ...taskCache.getTasks('COMPLETED')];

  const mapQueueToCollection = (item: QueuedCollection, isFailed: boolean): Collection => {
    const task = cacheTasks.find(t => t.id === item.assignment_id);
    return {
      id: item.offline_id,
      assignment_id: item.assignment_id,
      can_id: item.can_id,
      officer_id: '',
      nominal: item.nominal,
      collected_at: item.collected_at,
      sync_status: isFailed ? SyncStatus.FAILED : SyncStatus.PENDING,
      offline_id: item.offline_id || undefined,
      retry_attempts: item.retry_attempts,
      error_message: item.error_message,
      can: {
        qr_code: task?.qr_code || 'Offline',
        owner_name: task?.owner_name || 'Kaleng Masukan QR',
        owner_address: task?.owner_address || '-',
      },
    };
  };

  const localCollections = [
    ...activeQueue.map(item => mapQueueToCollection(item, false)),
    ...failedQueue.map(item => mapQueueToCollection(item, true)),
  ];
  const mergedMap = new Map<string, Collection>(
    localCollections.map(item => [`local:${item.offline_id || item.id}`, item]),
  );
  const acknowledgedOfflineIds = new Set<string>();

  // Hanya record COMPLETED dari server/cache yang dianggap riwayat durable.
  // Cache PENDING lama tidak boleh menimpa queue atau menjadi self-ACK.
  for (const serverItem of serverMapped) {
    if (serverItem.sync_status !== SyncStatus.COMPLETED) {
      continue;
    }

    const localMatch = localCollections.find(localItem => {
      const offlineIdMatches = Boolean(
        serverItem.offline_id &&
        localItem.offline_id &&
        serverItem.offline_id === localItem.offline_id,
      );
      const assignmentIdMatches = Boolean(
        serverItem.assignment_id &&
        localItem.assignment_id &&
        serverItem.assignment_id === localItem.assignment_id,
      );
      return offlineIdMatches || assignmentIdMatches;
    });

    if (localMatch) {
      mergedMap.delete(`local:${localMatch.offline_id || localMatch.id}`);
      if (allowServerAck && localMatch.offline_id) {
        acknowledgedOfflineIds.add(localMatch.offline_id);
      }
    }

    mergedMap.set(`server:${serverItem.id}`, serverItem);
  }

  // Recovery path bila server sudah commit tetapi app tertutup sebelum dequeue.
  // Hanya fresh server response yang boleh memicu side effect ini.
  if (allowServerAck && acknowledgedOfflineIds.size > 0) {
    const ids = Array.from(acknowledgedOfflineIds);
    offlineQueue.dequeue(ids);
    offlineQueue.removeFromFailedPermanent(ids);
  }

  // Overlay koreksi offline yang belum terkirim: record synced dari server/cache
  // menampilkan nominal_baru secara optimistis sampai flush sukses (setelah itu
  // server mengembalikan nilai yang sama pada fetch berikutnya — tidak ada lompatan).
  // Hanya item 'server:' yang di-overlay; koreksi gagal permanen TIDAK, agar
  // tampilan kembali ke kebenaran server saat koreksi ditolak (NOT_LATEST dsb.).
  const pendingCorrections = correctionQueue.getQueue();
  if (pendingCorrections.length > 0) {
    const correctionsByCollectionId = new Map(
      pendingCorrections.map(item => [item.collection_id, item]),
    );
    for (const [key, item] of mergedMap) {
      if (!key.startsWith('server:')) {
        continue;
      }
      const correction = correctionsByCollectionId.get(item.id);
      if (correction) {
        mergedMap.set(key, {
          ...item,
          nominal: correction.nominal_baru,
          pending_correction: true,
        });
      }
    }
  }

  const mergedList = Array.from(mergedMap.values());
  mergedList.sort(
    (a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime(),
  );
  return mergedList;
}
export const useCollectionsStore = create<CollectionsHistoryState>((set, get) => ({
  // Cache MMKV baru dibaca setelah initEncryptedStorage() selesai.
  collections: [],
  isLoading: false,
  error: null,
  page: 1,
  totalPages: 1,
  total: 0,

  hydrateFromCache: () => {
    const cached = collectionsCache.get();
    const merged = mergeCollectionsWithQueues(cached);
    set({collections: merged, total: merged.length});
  },

  fetchCollections: async () => {
    const requestId = ++latestCollectionsRequestId;
    const isLatestRequest = () => requestId === latestCollectionsRequestId;
    const netInfo = await NetInfo.fetch();
    if (!isLatestRequest()) {
      return;
    }

    const isOnline = !!(netInfo.isConnected && netInfo.isInternetReachable);

    if (!isOnline) {
      const cached = collectionsCache.get();
      const merged = mergeCollectionsWithQueues(cached);
      if (!isLatestRequest()) {
        return;
      }
      if (merged.length > 0) {
        set({collections: merged, total: merged.length, isLoading: false});
      }
      return;
    }

    set({isLoading: true, error: null});
    try {
      // Fetch semua riwayat sekaligus (limit tinggi) agar cache offline lengkap.
      // Jika backend mengembalikan lebih dari 1 halaman, auto-paginate sampai habis.
      const PAGE_LIMIT = 1000;
      const firstPage = await collectionService.getHistory({page: 1, limit: PAGE_LIMIT});
      if (!isLatestRequest()) {
        return;
      }

      if (firstPage.success && firstPage.data) {
        let allItems: HistoryItem[] = firstPage.data.items || [];
        const totalPages = firstPage.data.pagination.total_pages || 1;

        // Auto-paginate: fetch halaman 2..N di background agar cache lengkap
        if (totalPages > 1) {
          const remainingPages = Array.from({length: totalPages - 1}, (_, i) => i + 2);
          const results = await Promise.allSettled(
            remainingPages.map(p => collectionService.getHistory({page: p, limit: PAGE_LIMIT})),
          );
          if (!isLatestRequest()) {
            return;
          }
          for (const res of results) {
            if (res.status === 'fulfilled' && res.value.success && res.value.data) {
              allItems = [...allItems, ...(res.value.data.items || [])];
            }
          }
        }

        if (!isLatestRequest()) {
          return;
        }
        const mapped = allItems.map(mapHistoryToCollection);
        collectionsCache.set(mapped);

        const merged = mergeCollectionsWithQueues(mapped, true);
        set({
          collections: merged,
          page: 1,
          totalPages: 1, // Semua data sudah di-fetch
          total: firstPage.data.pagination.total || merged.length,
          isLoading: false,
        });
      } else {
        set({
          error: firstPage.error?.message || 'Gagal memuat riwayat koleksi',
          isLoading: false,
        });
      }
    } catch (error) {
      if (!isLatestRequest()) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Terjadi kesalahan jaringan';
      set({error: message, isLoading: false});
    }
  },
  loadMore: async () => {
    const {page, totalPages, collections} = get();
    if (page >= totalPages) {
      return;
    }

    set({isLoading: true});
    try {
      const result = await collectionService.getHistory({page: page + 1, limit: 20});

      if (result.success && result.data) {
        const items: HistoryItem[] = result.data.items || [];
        const mapped = items.map(mapHistoryToCollection);
        set({
          collections: mergeCollectionsWithQueues([...collections, ...mapped]),
          page: result.data.pagination.page || page + 1,
          totalPages: result.data.pagination.total_pages || totalPages,
          isLoading: false,
        });
      }
    } catch {
      set({isLoading: false});
    }
  },

  addOptimisticCollection: collection => {
    const {collections, total} = get();
    const alreadyExists = collections.some(
      item =>
        item.id === collection.id ||
        (!!item.assignment_id && item.assignment_id === collection.assignment_id),
    );
    if (alreadyExists) {
      return;
    }

    const updated = [collection, ...collections];
    // Transaksi lokal persisten di queue MMKV. Cache riwayat hanya menyimpan
    // record server agar kartu PENDING tidak dapat menjadi self-ACK.
    set({collections: updated, total: total + 1});
  },

  updatePendingNominal: (offlineId: string, newNominal: number): boolean => {
    if (
      typeof newNominal !== 'number' ||
      isNaN(newNominal) ||
      newNominal < 0 ||
      newNominal > MAX_COLLECTION_NOMINAL
    ) {
      return false;
    }
    const updated = offlineQueue.updateNominal(offlineId, newNominal);
    if (updated) {
      const cached = collectionsCache.get();
      const merged = mergeCollectionsWithQueues(cached);
      set({collections: merged, total: merged.length});
      refreshSyncCounts();
    }
    return updated;
  },

  resubmitCollection: async (
    id: string,
    payload: {nominal: number; alasan_resubmit: string; nominal_lama?: number},
  ) => {
    if (
      typeof payload.nominal !== 'number' ||
      isNaN(payload.nominal) ||
      payload.nominal < 0 ||
      payload.nominal > MAX_COLLECTION_NOMINAL
    ) {
      return {
        success: false,
        error: 'Nominal tidak valid atau melebihi batas maksimal Rp10.000.000.',
      };
    }
    if (!payload.alasan_resubmit || payload.alasan_resubmit.trim().length < 5) {
      return {success: false, error: 'Jelaskan alasan koreksi minimal 5 karakter.'};
    }

    // Offline (atau koneksi putus di tengah request): simpan niat koreksi di
    // antrean MMKV — UI sudah menampilkan nominal optimistis via merge overlay,
    // server menerima saat flush online. Collapse otomatis di correctionQueue
    // menjaga satu koreksi terbaru per collection_id.
    const queueOffline = (): {success: boolean; queued: boolean} => {
      const existing = correctionQueue.getLatestByCollectionId(id);
      const nominalLama = existing ? existing.nominal_lama : payload.nominal_lama;
      if (typeof nominalLama !== 'number' || isNaN(nominalLama) || nominalLama < 0) {
        return {success: false, queued: false};
      }
      const result = correctionQueue.enqueue({
        collection_id: id,
        nominal_lama: nominalLama,
        nominal_baru: payload.nominal,
        alasan_resubmit: payload.alasan_resubmit.trim(),
      });
      if (!result.queued) {
        return {success: false, queued: false};
      }
      const cached = collectionsCache.get();
      const merged = mergeCollectionsWithQueues(cached);
      set({collections: merged, total: merged.length});
      refreshSyncCounts();
      return {success: true, queued: true};
    };

    const netInfo = await NetInfo.fetch();
    if (!(netInfo.isConnected && netInfo.isInternetReachable)) {
      return queueOffline();
    }

    try {
      const response = await collectionService.resubmitCollection(id, {
        nominal: payload.nominal,
        alasan_resubmit: payload.alasan_resubmit.trim(),
      });

      if (response.success) {
        await get().fetchCollections();
        return {success: true};
      }
      if (response.error?.code === 'NETWORK_ERROR') {
        return queueOffline();
      }
      return {success: false, error: response.error?.message || 'Data belum dapat dikoreksi.'};
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Terjadi kesalahan saat mengirim koreksi.';
      return {success: false, error: message};
    }
  },

  retryFailedCollection: async (offlineId: string): Promise<boolean> => {
    const failedList = offlineQueue.getFailedPermanent();
    const itemToRecover = failedList.find(i => i.offline_id === offlineId);
    if (!itemToRecover) {
      return false;
    }

    itemToRecover.retry_attempts = 0;
    delete itemToRecover.error_message;
    delete itemToRecover.error_type;
    delete itemToRecover.can_retry;
    delete itemToRecover.next_retry_at;

    // Tulis active queue lebih dahulu; jika gagal, record tetap di quarantine.
    offlineQueue.enqueue(itemToRecover);
    offlineQueue.removeFromFailedPermanent([offlineId]);

    const cached = collectionsCache.get();
    const merged = mergeCollectionsWithQueues(cached);
    set({collections: merged, total: merged.length});
    refreshSyncCounts();

    await syncService.autoSync();
    return true;
  },
}));
