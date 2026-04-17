import { storage } from './mmkv';

const QUEUE_KEY = 'collection_queue';

export interface QueuedCollection {
  offline_id: string;
  assignment_id: string;
  can_id: string;
  amount: number;
  payment_method: 'CASH' | 'TRANSFER';
  transfer_receipt_url?: string;
  collected_at: string;
  latitude?: number;
  longitude?: number;
  device_info?: object;
  submit_sequence?: number;
  is_latest?: boolean;
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
  }
};
