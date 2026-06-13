import { storage } from './mmkv';
import { Task } from '@lazisnu/shared-types';

const TASKS_KEY = 'offline_tasks';

export const taskCache = {
  saveTasks: (tasks: Task[]): void => {
    storage.set(TASKS_KEY, JSON.stringify(tasks));
  },

  getTasks: (): Task[] => {
    const data = storage.getString(TASKS_KEY);
    if (!data) { return []; }
    try {
      const parsed = JSON.parse(data);
      // Minimal runtime guard: pastikan hasilnya array.
      // Jika JSON corrupt, jangan crash — kembalikan array kosong.
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  clearTasks: (): void => {
    storage.delete(TASKS_KEY);
  },
};
