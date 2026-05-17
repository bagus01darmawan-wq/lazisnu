import { storage } from './mmkv';

const QUEUE_KEY = 'collection_queue';
const FAILED_QUEUE_KEY = 'collection_queue_failed';

export interface QueuedCollection {
  offline_id: string;
  assignment_id: string;
  can_id: string;
  nominal: number;
  payment_method: 'CASH' | 'TRANSFER';
  transfer_receipt_url?: string;
  collected_at: string;
  latitude?: number;
  longitude?: number;
  device_info?: object;
  submit_sequence?: number;
  is_latest?: boolean;
  error_type?: 'VALIDATION' | 'SERVER';
  can_retry?: boolean;
  error_message?: string;
}

export const offlineQueue = {
  getQueue: (): QueuedCollection[] => {
    const data = storage.getString(QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  },

  enqueue: (item: QueuedCollection): void => {
    const queue = offlineQueue.getQueue();
    queue.push(item);
    storage.set(QUEUE_KEY, JSON.stringify(queue));
  },

  dequeue: (offline_ids: string[]): void => {
    let queue = offlineQueue.getQueue();
    queue = queue.filter((item: QueuedCollection) => !offline_ids.includes(item.offline_id));
    storage.set(QUEUE_KEY, JSON.stringify(queue));
  },

  clearQueue: (): void => {
    storage.delete(QUEUE_KEY);
  },

  getQueueCount: (): number => {
    return offlineQueue.getQueue().length;
  },

  getRetryableQueue: (): QueuedCollection[] => {
    const queue = offlineQueue.getQueue();
    return queue.filter((item) => item.can_retry !== false);
  },

  getFailedPermanent: (): QueuedCollection[] => {
    const data = storage.getString(FAILED_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  },

  moveToFailedPermanent: (items: QueuedCollection[]): void => {
    const failed = offlineQueue.getFailedPermanent();
    const allFailed = [...failed, ...items];
    storage.set(FAILED_QUEUE_KEY, JSON.stringify(allFailed));

    const queue = offlineQueue.getQueue();
    const failedIds = items.map((i) => i.offline_id);
    const remaining = queue.filter((item) => !failedIds.includes(item.offline_id));
    storage.set(QUEUE_KEY, JSON.stringify(remaining));
  },

  getFailedPermanentCount: (): number => {
    return offlineQueue.getFailedPermanent().length;
  },

  removeFromFailedPermanent: (offline_ids: string[]): void => {
    let failed = offlineQueue.getFailedPermanent();
    failed = failed.filter((item) => !offline_ids.includes(item.offline_id));
    storage.set(FAILED_QUEUE_KEY, JSON.stringify(failed));
  },

  clearFailedPermanent: (): void => {
    storage.delete(FAILED_QUEUE_KEY);
  },
};
