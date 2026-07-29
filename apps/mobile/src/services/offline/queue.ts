import {getOfflineStorage} from './mmkv';

const getOfficerSuffix = (): string => {
  try {
    const { useAuthStore } = require('../../stores/useAuthStore');
    const userId = useAuthStore.getState().user?.id;
    return userId ? `_${userId}` : '';
  } catch {
    return '';
  }
};

const getQueueKey = () => `collection_queue${getOfficerSuffix()}`;
const getFailedQueueKey = () => `collection_queue_failed${getOfficerSuffix()}`;
const getSchemaVersionKey = () => `offline_queue_schema_version${getOfficerSuffix()}`;
const CURRENT_SCHEMA_VERSION = 2;

type QueueChangeListener = () => void;
const queueChangeListeners = new Set<QueueChangeListener>();

function notifyQueueChanged(): void {
  for (const listener of queueChangeListeners) {
    listener();
  }
}

export interface QueuedCollection {
  offline_id: string;
  assignment_id: string;
  can_id: string;
  nominal: number;
  collected_at: string;
  latitude?: number;
  longitude?: number;
  device_info?: object;
  submit_sequence?: number;
  is_latest?: boolean;
  error_type?: 'VALIDATION' | 'SERVER';
  can_retry?: boolean;
  error_message?: string;
  retry_attempts?: number; // P2: counter persisten per-item, bertahan antar panggilan autoSync
  next_retry_at?: string; // Waktu earliest retry untuk exponential backoff
}

type LegacyQueuedCollection = QueuedCollection & {
  payment_method?: unknown;
  transfer_receipt_url?: unknown;
};

function sanitizeQueue(items: LegacyQueuedCollection[]): QueuedCollection[] {
  return items.map(({payment_method: _paymentMethod, transfer_receipt_url: _transferReceiptUrl, ...item}) => item);
}

export const offlineQueue = {
  subscribe: (listener: QueueChangeListener): (() => void) => {
    queueChangeListeners.add(listener);
    return () => queueChangeListeners.delete(listener);
  },

  getQueue: (): QueuedCollection[] => {
    const storage = getOfflineStorage();
    const key = getQueueKey();
    const data = storage.getString(key);
    if (!data) { return []; }

    const queue = sanitizeQueue(JSON.parse(data) as LegacyQueuedCollection[]);
    const sanitizedData = JSON.stringify(queue);
    if (sanitizedData !== data) { storage.set(key, sanitizedData); }
    return queue;
  },

  enqueue: (item: QueuedCollection): void => {
    const queue = offlineQueue.getQueue();
    if (queue.some(existing => existing.offline_id === item.offline_id)) { return; }
    queue.push(item);
    getOfflineStorage().set(getQueueKey(), JSON.stringify(queue));
    notifyQueueChanged();
  },

  dequeue: (offline_ids: string[]): void => {
    let queue = offlineQueue.getQueue();
    const previousLength = queue.length;
    queue = queue.filter((item: QueuedCollection) => !offline_ids.includes(item.offline_id));
    if (queue.length === previousLength) { return; }
    getOfflineStorage().set(getQueueKey(), JSON.stringify(queue));
    notifyQueueChanged();
  },

  getQueueCount: (): number => {
    return offlineQueue.getQueue().length;
  },

  /**
   * Koreksi nominal pada item yang masih di queue (belum sync ke server).
   * Mengembalikan true jika item ditemukan dan diperbarui.
   */
  updateNominal: (offline_id: string, newNominal: number): boolean => {
    if (!Number.isSafeInteger(newNominal) || newNominal < 0) { return false; }
    const queue = offlineQueue.getQueue();
    const idx = queue.findIndex(item => item.offline_id === offline_id);
    if (idx === -1) { return false; }
    queue[idx].nominal = newNominal;
    getOfflineStorage().set(getQueueKey(), JSON.stringify(queue));
    notifyQueueChanged();
    return true;
  },

  getRetryableQueue: (): QueuedCollection[] => {
    const queue = offlineQueue.getQueue();
    const now = Date.now();
    return queue.filter((item) => item.can_retry !== false && (!item.next_retry_at || Date.parse(item.next_retry_at) <= now));
  },

  // P2: Increment retry_attempts pada item-item tertentu (dipanggil saat batchSubmit gagal).
  // Counter ini persisten di MMKV — bertahan antar panggilan autoSync.
  incrementRetryAttempts: (items: QueuedCollection[]): void => {
    const queue = offlineQueue.getQueue();
    const idsToUpdate = new Set(items.map((i) => i.offline_id));
    for (const item of queue) {
      if (idsToUpdate.has(item.offline_id)) {
        item.retry_attempts = (item.retry_attempts || 0) + 1;
        const delayMs = Math.pow(2, item.retry_attempts - 1) * 1000;
        item.next_retry_at = new Date(Date.now() + delayMs).toISOString();
      }
    }
    getOfflineStorage().set(getQueueKey(), JSON.stringify(queue));
    notifyQueueChanged();
  },

  getFailedPermanent: (): QueuedCollection[] => {
    const storage = getOfflineStorage();
    const key = getFailedQueueKey();
    const data = storage.getString(key);
    if (!data) { return []; }

    const queue = sanitizeQueue(JSON.parse(data) as LegacyQueuedCollection[]);
    const sanitizedData = JSON.stringify(queue);
    if (sanitizedData !== data) { storage.set(key, sanitizedData); }
    return queue;
  },

  moveToFailedPermanent: (items: QueuedCollection[]): void => {
    const failed = offlineQueue.getFailedPermanent();
    const allFailed = Array.from(
      new Map([...failed, ...items].map(item => [item.offline_id, item])).values(),
    );
    getOfflineStorage().set(getFailedQueueKey(), JSON.stringify(allFailed));

    const queue = offlineQueue.getQueue();
    const failedIds = items.map((i) => i.offline_id);
    const remaining = queue.filter((item) => !failedIds.includes(item.offline_id));
    getOfflineStorage().set(getQueueKey(), JSON.stringify(remaining));
    notifyQueueChanged();
  },

  getFailedPermanentCount: (): number => {
    return offlineQueue.getFailedPermanent().length;
  },

  removeFromFailedPermanent: (offline_ids: string[]): void => {
    let failed = offlineQueue.getFailedPermanent();
    const previousLength = failed.length;
    failed = failed.filter((item) => !offline_ids.includes(item.offline_id));
    if (failed.length === previousLength) { return; }
    getOfflineStorage().set(getFailedQueueKey(), JSON.stringify(failed));
    notifyQueueChanged();
  },

  runMigration: (): void => {
    try {
      const storage = getOfflineStorage();
      const version = storage.getNumber(getSchemaVersionKey()) || 1;
      if (version >= CURRENT_SCHEMA_VERSION) {
        return;
      }

      // 1. Baca semua record failedPermanent dari key lama (tanpa suffix)
      const data = storage.getString('collection_queue_failed');
      if (!data) {
        storage.set(getSchemaVersionKey(), CURRENT_SCHEMA_VERSION);
        return;
      }

      const failed = sanitizeQueue(JSON.parse(data) as LegacyQueuedCollection[]);
      if (failed.length === 0) {
        storage.set(getSchemaVersionKey(), CURRENT_SCHEMA_VERSION);
        return;
      }

      // 2. Validasi field transaksi utamanya
      const validToRecover: QueuedCollection[] = [];
      const stillFailed: QueuedCollection[] = [];

      for (const item of failed) {
        const isValid =
          typeof item.offline_id === 'string' && item.offline_id.length > 0 &&
          typeof item.assignment_id === 'string' && item.assignment_id.length > 0 &&
          typeof item.can_id === 'string' && item.can_id.length > 0 &&
          typeof item.nominal === 'number' && item.nominal >= 0 &&
          typeof item.collected_at === 'string' && !isNaN(Date.parse(item.collected_at));

        if (isValid) {
          // 3. Reset metadata kegagalan kontrak
          const recoveredItem: QueuedCollection = {
            offline_id: item.offline_id,
            assignment_id: item.assignment_id,
            can_id: item.can_id,
            nominal: item.nominal,
            collected_at: item.collected_at,
            latitude: item.latitude,
            longitude: item.longitude,
            device_info: item.device_info,
            submit_sequence: item.submit_sequence,
            is_latest: item.is_latest,
            retry_attempts: 0,
          };
          validToRecover.push(recoveredItem);
        } else {
          stillFailed.push(item);
        }
      }

      if (validToRecover.length > 0) {
        // 4. Pindahkan kembali ke active queue baru (dengan suffix)
        const currentQueueKey = getQueueKey();
        const activeData = storage.getString(currentQueueKey);
        const activeQueue = activeData ? sanitizeQueue(JSON.parse(activeData) as LegacyQueuedCollection[]) : [];
        const mergedActive = [...activeQueue, ...validToRecover];

        // 5. Tulis active queue baru, baru bersihkan / update key lama
        storage.set(currentQueueKey, JSON.stringify(mergedActive));
        storage.delete('collection_queue_failed');
      }

      if (stillFailed.length > 0) {
        const existingFailed = offlineQueue.getFailedPermanent();
        storage.set(getFailedQueueKey(), JSON.stringify([...existingFailed, ...stillFailed]));
      }
      storage.delete('collection_queue_failed');

      // 6. Set version key
      storage.set(getSchemaVersionKey(), CURRENT_SCHEMA_VERSION);
      notifyQueueChanged();
      console.log(`[Migration] Recovered ${validToRecover.length} failed collections back to active queue.`);
    } catch (err) {
      console.error('[Migration] Failed to run MMKV migration:', err);
    }
  },
};
