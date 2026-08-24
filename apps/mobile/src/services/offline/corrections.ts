import 'react-native-get-random-values';
import {getOfflineStorage} from './mmkv';
import {generateOfflineId, getOfficerSuffix} from './queue';

/**
 * Antrean koreksi offline untuk riwayat yang SUDAH tersinkronisasi ke server.
 *
 * Berbeda dengan collection_queue (record belum pernah dilihat server), koreksi
 * pada record synced memerlukan audit trail di server (alasan_resubmit), sehingga
 * saat offline niat koreksi disimpan lokal dan dibuang ke server saat online.
 *
 * Batasan v1 (dokumentasi standar Bab offline-first): endpoint resubmit server
 * tidak idempoten — jika request terkirim tapi respons timeout, retry manual
 * berpotensi menghasilkan dua baris koreksi. Flush hanya auto-retry pada
 * kegagalan jaringan yang pasti; lihat sync.ts flushCorrections().
 */

export interface QueuedCorrection {
  correction_id: string;
  // UUID record server (bukan offline_id) — target endpoint /collections/:id/resubmit
  collection_id: string;
  nominal_lama: number;
  nominal_baru: number;
  alasan_resubmit: string;
  created_at: string;
  retry_attempts?: number;
  next_retry_at?: string;
  error_type?: 'VALIDATION' | 'SERVER' | 'NOT_LATEST';
  can_retry?: boolean;
  error_message?: string;
}

type CorrectionChangeListener = () => void;
const correctionChangeListeners = new Set<CorrectionChangeListener>();

function notifyCorrectionsChanged(): void {
  for (const listener of correctionChangeListeners) {
    listener();
  }
}

const getCorrectionQueueKey = () => `correction_queue${getOfficerSuffix()}`;
const getFailedCorrectionKey = () => `correction_queue_failed${getOfficerSuffix()}`;

// Cap retry & backoff — pola sama dengan collection queue (sync.ts MAX_RETRIES).
const MAX_RETRIES = 3;

export function isValidQueuedCorrection(item: QueuedCorrection): boolean {
  return (
    typeof item.correction_id === 'string' &&
    item.correction_id.length > 0 &&
    typeof item.collection_id === 'string' &&
    item.collection_id.length > 0 &&
    Number.isSafeInteger(item.nominal_lama) &&
    item.nominal_lama >= 0 &&
    Number.isSafeInteger(item.nominal_baru) &&
    item.nominal_baru >= 0 &&
    typeof item.alasan_resubmit === 'string' &&
    item.alasan_resubmit.trim().length >= 5 &&
    typeof item.created_at === 'string' &&
    !isNaN(Date.parse(item.created_at))
  );
}

export const correctionQueue = {
  subscribe: (listener: CorrectionChangeListener): (() => void) => {
    correctionChangeListeners.add(listener);
    return () => correctionChangeListeners.delete(listener);
  },

  getQueue: (): QueuedCorrection[] => {
    const storage = getOfflineStorage();
    const data = storage.getString(getCorrectionQueueKey());
    if (!data) {
      return [];
    }
    try {
      const queue = JSON.parse(data) as QueuedCorrection[];
      return Array.isArray(queue) ? queue : [];
    } catch {
      return [];
    }
  },

  /**
   * Menyimpan niat koreksi. Jika sudah ada koreksi belum terkirim untuk
   * collection_id yang sama, entri lama DITIMPA (collapse) — yang terakhir
   * menang, antrean tidak menumpuk koreksi berantai untuk record yang sama.
   */
  enqueue: (
    item: Omit<QueuedCorrection, 'correction_id' | 'created_at'> &
      Partial<Pick<QueuedCorrection, 'correction_id' | 'created_at'>>,
  ): {queued: boolean; collapsed: boolean; correction_id: string} => {
    const full: QueuedCorrection = {
      ...item,
      correction_id: item.correction_id || generateOfflineId(),
      created_at: item.created_at || new Date().toISOString(),
    };
    if (!isValidQueuedCorrection(full)) {
      return {queued: false, collapsed: false, correction_id: full.correction_id};
    }

    const queue = correctionQueue.getQueue();
    const existingIdx = queue.findIndex(entry => entry.collection_id === full.collection_id);
    const collapsed = existingIdx !== -1;
    if (collapsed) {
      queue.splice(existingIdx, 1, full);
    } else {
      queue.push(full);
    }
    getOfflineStorage().set(getCorrectionQueueKey(), JSON.stringify(queue));
    notifyCorrectionsChanged();
    return {queued: true, collapsed, correction_id: full.correction_id};
  },

  getLatestByCollectionId: (collectionId: string): QueuedCorrection | undefined => {
    return correctionQueue.getQueue().find(entry => entry.collection_id === collectionId);
  },

  dequeue: (correctionIds: string[]): void => {
    const queue = correctionQueue.getQueue();
    const previousLength = queue.length;
    const remaining = queue.filter(item => !correctionIds.includes(item.correction_id));
    if (remaining.length === previousLength) {
      return;
    }
    getOfflineStorage().set(getCorrectionQueueKey(), JSON.stringify(remaining));
    notifyCorrectionsChanged();
  },

  getQueueCount: (): number => correctionQueue.getQueue().length,

  getRetryableCorrections: (): QueuedCorrection[] => {
    const now = Date.now();
    return correctionQueue
      .getQueue()
      .filter(
        item =>
          item.can_retry !== false &&
          (!item.next_retry_at || Date.parse(item.next_retry_at) <= now),
      );
  },

  incrementRetryAttempts: (correctionIds: string[]): void => {
    if (correctionIds.length === 0) {
      return;
    }
    const ids = new Set(correctionIds);
    const queue = correctionQueue.getQueue();
    for (const item of queue) {
      if (ids.has(item.correction_id)) {
        item.retry_attempts = (item.retry_attempts || 0) + 1;
        item.next_retry_at = new Date(
          Date.now() + Math.pow(2, item.retry_attempts - 1) * 1000,
        ).toISOString();
      }
    }
    getOfflineStorage().set(getCorrectionQueueKey(), JSON.stringify(queue));
    notifyCorrectionsChanged();
  },

  hasExceededRetries: (item: QueuedCorrection): boolean =>
    (item.retry_attempts || 0) >= MAX_RETRIES,

  getFailedPermanent: (): QueuedCorrection[] => {
    const storage = getOfflineStorage();
    const data = storage.getString(getFailedCorrectionKey());
    if (!data) {
      return [];
    }
    try {
      const failed = JSON.parse(data) as QueuedCorrection[];
      return Array.isArray(failed) ? failed : [];
    } catch {
      return [];
    }
  },

  moveToFailedPermanent: (items: QueuedCorrection[]): void => {
    if (items.length === 0) {
      return;
    }
    const failed = correctionQueue.getFailedPermanent();
    const merged = Array.from(
      new Map([...failed, ...items].map(item => [item.correction_id, item])).values(),
    );
    getOfflineStorage().set(getFailedCorrectionKey(), JSON.stringify(merged));

    const failedIds = new Set(items.map(i => i.correction_id));
    const remaining = correctionQueue.getQueue().filter(item => !failedIds.has(item.correction_id));
    getOfflineStorage().set(getCorrectionQueueKey(), JSON.stringify(remaining));
    notifyCorrectionsChanged();
  },

  removeFromFailedPermanent: (correctionIds: string[]): void => {
    const failed = correctionQueue.getFailedPermanent();
    const previousLength = failed.length;
    const remaining = failed.filter(item => !correctionIds.includes(item.correction_id));
    if (remaining.length === previousLength) {
      return;
    }
    getOfflineStorage().set(getFailedCorrectionKey(), JSON.stringify(remaining));
    notifyCorrectionsChanged();
  },

  getFailedPermanentCount: (): number => correctionQueue.getFailedPermanent().length,
};
