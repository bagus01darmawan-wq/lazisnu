import {Task} from '@lazisnu/shared-types';
import {QueuedAction} from './actionQueue';
import {taskCache} from './tasks';

function isSkipAction(action: QueuedAction): action is Extract<QueuedAction, {kind: 'SKIP'}> {
  return action.kind === 'SKIP';
}

/**
 * Susun daftar "Tidak Dijemput" untuk mode offline: daftar terakhir dari
 * server (yang tetap tampil) ditambah aksi skip yang masih menunggu replay
 * di perangkat — dedupe berdasarkan assignment id. Stub tampilan saja:
 * kartu Riwayat hanya memakai owner_name, qr_code, dan skip_reason_code.
 */
export function composeUncollectedOffline(
  prev: Task[],
  queue: QueuedAction[],
  options?: {displayPeriod?: string; lookupTask?: (assignmentId: string) => Task | null},
): Task[] {
  const pendingSkips = queue.filter(isSkipAction);
  if (pendingSkips.length === 0) {
    return prev;
  }
  const lookupTask =
    options?.lookupTask ??
    ((assignmentId: string) => {
      try {
        return (
          taskCache.getTasks('ACTIVE').find(task => task.id === assignmentId) ??
          taskCache.getTasks('COMPLETED').find(task => task.id === assignmentId) ??
          null
        );
      } catch {
        // Storage belum siap (mis. unit test/boot) — pakai fallback periode.
        return null;
      }
    });
  const known = new Set(prev.map(task => task.id));
  const additions: Task[] = pendingSkips
    .filter(action => !known.has(action.assignment_id))
    .map(action => {
      const cached = lookupTask(action.assignment_id);
      return {
        id: action.assignment_id,
        can_id: action.can_id ?? '',
        qr_code: action.qr_code ?? '',
        owner_name: action.owner_name || action.qr_code || 'Kaleng (offline)',
        owner_phone: '',
        owner_address: 'Alamat belum tersedia',
        status: 'UNCOLLECTED' as Task['status'],
        assigned_at: action.created_at,
        // Periode assignment, bukan bulan aksi di perangkat.
        period:
          action.period ??
          cached?.period ??
          options?.displayPeriod ??
          action.created_at.slice(0, 7),
        skip_reason_code: action.reason_code ?? null,
      };
    });
  if (additions.length === 0) {
    return prev;
  }
  return [...prev, ...additions];
}
