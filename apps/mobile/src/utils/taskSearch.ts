import {formatCanAddress} from './format';

export interface TaskSearchFields {
  owner_name?: string | null;
  owner_address?: string | null;
  qr_code?: string | null;
  dukuh_name?: string | null;
  dukuh?: string | null;
  rt?: string | null;
  rw?: string | null;
}

/** Pencarian kartu tugas: nama, alamat bebas, kode QR, Dukuh, dan RT/RW. */
export const matchesTaskQuery = (task: TaskSearchFields, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const haystack = [
    task.owner_name,
    task.owner_address,
    task.qr_code,
    task.dukuh_name,
    task.dukuh,
    task.rt,
    task.rw,
    formatCanAddress(task, ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
};
