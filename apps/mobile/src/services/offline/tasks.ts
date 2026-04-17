import { storage } from './mmkv';

const TASKS_KEY = 'offline_tasks';

export const taskCache = {
  saveTasks: (tasks: any[]): void => {
    storage.set(TASKS_KEY, JSON.stringify(tasks));
  },

  getTasks: (): any[] => {
    const data = storage.getString(TASKS_KEY);
    return data ? JSON.parse(data) : [];
  },

  clearTasks: (): void => {
    storage.delete(TASKS_KEY);
  }
};
