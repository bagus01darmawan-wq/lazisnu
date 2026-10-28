import 'react-native-get-random-values';
import {getOfflineStorage} from './mmkv';
import {generateOfflineId, getOfficerSuffix} from './queue';
import {CanVisitOutcome} from '@lazisnu/shared-types';

/**
 * Antrean aksi non-penjemputan yang boleh dilakukan offline: "tandai tidak
 * dijemput" (skip tugas aktif) dan tindakan kaleng NON_AKTIF (kunjungan).
 * Pola mengikuti offlineQueue (MMKV per petugas, backoff, gagal permanen),
 * tetapi itemnya direplay satu per satu ke endpoint masing-masing — bukan
 * batch — karena kedua endpoint itu tidak menerima antrean koleksi.
 */

const getQueueKey = () => `action_queue${getOfficerSuffix()}`;
const getFailedQueueKey = () => `action_queue_failed${getOfficerSuffix()}`;

type QueueChangeListener = () => void;
const actionChangeListeners = new Set<QueueChangeListener>();

function notifyActionChanged(): void {
  for (const listener of actionChangeListeners) {
    listener();
  }
}

/** Aksi kunjungan NON_AKTIF — diteruskan apa adanya ke POST /cans/:canId/visits. */
export interface QueuedVisitAction {
  kind: 'VISIT';
  offline_id: string;
  can_id: string;
  qr_code?: string;
  outcome: Exclude<CanVisitOutcome, 'ISI'>;
  notes?: string;
  created_at: string;
  retry_attempts?: number;
  next_retry_at?: string;
  error_message?: string;
}

/** Aksi skip tugas aktif — diteruskan ke POST /assignments/:id/skip. */
export interface QueuedSkipAction {
  kind: 'SKIP';
  offline_id: string;
  assignment_id: string;
  /** Informasi tampilan saja (kartu Riwayat offline) — replay hanya butuh assignment_id. */
  can_id?: string;
  qr_code?: string;
  owner_name?: string;
  reason_code?: string;
  notes?: string;
  created_at: string;
  retry_attempts?: number;
  next_retry_at?: string;
  error_message?: string;
}

export type QueuedAction = QueuedVisitAction | QueuedSkipAction;

/** Omit yang distributif atas union — Omit biasa melipat union jadi satu objek. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type NewQueuedAction = DistributiveOmit<QueuedAction, 'offline_id'> & {
  offline_id?: string;
};

function sanitizeActions(items: QueuedAction[]): QueuedAction[] {
  return items.filter(
    item =>
      (item.kind === 'SKIP' && !!item.assignment_id) ||
      (item.kind === 'VISIT' && !!item.can_id && !!item.outcome),
  );
}

export const MAX_ACTION_RETRIES = 3;

export const actionQueue = {
  subscribe: (listener: QueueChangeListener): (() => void) => {
    actionChangeListeners.add(listener);
    return () => actionChangeListeners.delete(listener);
  },

  getQueue: (): QueuedAction[] => {
    const data = getOfflineStorage().getString(getQueueKey());
    if (!data) {
      return [];
    }
    try {
      return sanitizeActions(JSON.parse(data) as QueuedAction[]);
    } catch {
      return [];
    }
  },

  enqueue: (item: NewQueuedAction): void => {
    const queue = actionQueue.getQueue();
    const offline_id = item.offline_id || generateOfflineId();
    if (queue.some(existing => existing.offline_id === offline_id)) {
      return;
    }
    queue.push({...item, offline_id} as QueuedAction);
    getOfflineStorage().set(getQueueKey(), JSON.stringify(queue));
    notifyActionChanged();
  },

  dequeue: (offline_ids: string[]): void => {
    const queue = actionQueue.getQueue();
    const remaining = queue.filter(item => !offline_ids.includes(item.offline_id));
    if (remaining.length === queue.length) {
      return;
    }
    getOfflineStorage().set(getQueueKey(), JSON.stringify(remaining));
    notifyActionChanged();
  },

  getQueueCount: (): number => {
    return actionQueue.getQueue().length;
  },

  getRetryableActions: (): QueuedAction[] => {
    const now = Date.now();
    return actionQueue
      .getQueue()
      .filter(item => !item.next_retry_at || Date.parse(item.next_retry_at) <= now);
  },

  incrementRetryAttempts: (offline_ids: string[]): void => {
    const queue = actionQueue.getQueue();
    const ids = new Set(offline_ids);
    for (const item of queue) {
      if (ids.has(item.offline_id)) {
        item.retry_attempts = (item.retry_attempts || 0) + 1;
        const delayMs = Math.pow(2, item.retry_attempts - 1) * 1000;
        item.next_retry_at = new Date(Date.now() + delayMs).toISOString();
      }
    }
    getOfflineStorage().set(getQueueKey(), JSON.stringify(queue));
    notifyActionChanged();
  },

  getFailedPermanent: (): QueuedAction[] => {
    const data = getOfflineStorage().getString(getFailedQueueKey());
    if (!data) {
      return [];
    }
    try {
      return sanitizeActions(JSON.parse(data) as QueuedAction[]);
    } catch {
      return [];
    }
  },

  getFailedPermanentCount: (): number => {
    return actionQueue.getFailedPermanent().length;
  },

  moveToFailedPermanent: (items: QueuedAction[]): void => {
    const failed = actionQueue.getFailedPermanent();
    const allFailed = Array.from(
      new Map([...failed, ...items].map(item => [item.offline_id, item])).values(),
    );
    getOfflineStorage().set(getFailedQueueKey(), JSON.stringify(allFailed));
    actionQueue.dequeue(items.map(item => item.offline_id));
  },

  removeFromFailedPermanent: (offline_ids: string[]): void => {
    const failed = actionQueue.getFailedPermanent();
    const remaining = failed.filter(item => !offline_ids.includes(item.offline_id));
    if (remaining.length === failed.length) {
      return;
    }
    getOfflineStorage().set(getFailedQueueKey(), JSON.stringify(remaining));
    notifyActionChanged();
  },

  /** Kembalikan aksi gagal ke antrean aktif dengan metadata retry bersih. */
  retryFailedAction: (offline_id: string): boolean => {
    const failed = actionQueue.getFailedPermanent();
    const item = failed.find(failedItem => failedItem.offline_id === offline_id);
    if (!item) {
      return false;
    }
    actionQueue.removeFromFailedPermanent([offline_id]);
    actionQueue.enqueue({
      ...item,
      retry_attempts: 0,
      next_retry_at: undefined,
      error_message: undefined,
    });
    return true;
  },
};
