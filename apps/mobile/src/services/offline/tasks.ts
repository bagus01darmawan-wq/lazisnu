import {getOfflineStorage} from './mmkv';
import {AssignmentStatus, Task} from '@lazisnu/shared-types';

type TaskFilter = 'ACTIVE' | 'COMPLETED';

const LEGACY_TASKS_KEY = 'offline_tasks';
const getTasksKey = (status: TaskFilter) => `offline_tasks_${status.toLowerCase()}`;

const dedupeTasks = (tasks: Task[]): Task[] =>
  Array.from(new Map(tasks.map(task => [task.id, task])).values());

export const taskCache = {
  saveTasks: (tasks: Task[], status: TaskFilter = 'ACTIVE'): void => {
    getOfflineStorage().set(getTasksKey(status), JSON.stringify(dedupeTasks(tasks)));
  },

  getTasks: (status: TaskFilter = 'ACTIVE'): Task[] => {
    const storage = getOfflineStorage();
    const key = getTasksKey(status);
    const data =
      storage.getString(key) ||
      (status === 'ACTIVE' ? storage.getString(LEGACY_TASKS_KEY) : undefined);
    if (!data) {
      return [];
    }
    try {
      const parsed = JSON.parse(data);
      const tasks = Array.isArray(parsed) ? dedupeTasks(parsed as Task[]) : [];
      if (!storage.getString(key)) {
        storage.set(key, JSON.stringify(tasks));
      }
      return tasks;
    } catch {
      return [];
    }
  },

  findByQRCode: (qrCode: string): Task | null => {
    const normalized = qrCode.trim().toLowerCase();
    const allTasks = [...taskCache.getTasks('ACTIVE'), ...taskCache.getTasks('COMPLETED')];
    return allTasks.find(task => task.qr_code.trim().toLowerCase() === normalized) || null;
  },

  markCompleted: (taskId: string): boolean => {
    const active = taskCache.getTasks('ACTIVE');
    const task = active.find(item => item.id === taskId);
    if (!task) {
      return false;
    }

    taskCache.saveTasks(
      active.filter(item => item.id !== taskId),
      'ACTIVE',
    );
    taskCache.saveTasks(
      [{...task, status: AssignmentStatus.COMPLETED}, ...taskCache.getTasks('COMPLETED')],
      'COMPLETED',
    );
    return true;
  },

  clearTasks: (): void => {
    const storage = getOfflineStorage();
    storage.delete(LEGACY_TASKS_KEY);
    storage.delete(getTasksKey('ACTIVE'));
    storage.delete(getTasksKey('COMPLETED'));
  },
};
