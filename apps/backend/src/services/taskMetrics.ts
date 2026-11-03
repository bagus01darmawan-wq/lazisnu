/**
 * Kontrak metrik tugas — SATU sumber kebenaran untuk rumus task_total dll.
 *
 * Kontrak: docs/audit/dasar-perbaikan-metrik-tugas-mobile-2026-09-13.md §7
 * - tugas_belum   = ACTIVE
 * - tugas_selesai = COMPLETED + UNCOLLECTED
 * - task_total    = ACTIVE + COMPLETED + UNCOLLECTED
 * - task_reassigned = REASSIGNED — DILAPORKAN tapi tidak masuk penyebut.
 *
 * REASSIGNED berarti tugas lepas dari petugas asal (transfer ke petugas lain,
 * baris ACTIVE baru dibuat untuk pengganti). Karena itu ia bukan beban kerja
 * maupun progres petugas asal: petugas yang mentransfer 3 dari 10 paket dan
 * menyelesaikan 7 sisanya harus tampil 100%, bukan 70%. Akuntansi baris tetap
 * utuh lewat invariant task_total + task_reassigned == jumlah baris.
 *
 * Mengapa file ini ada: rumus ini dulu dihitung ulang di 4 tempat
 * (overviewService.getTaskSummary, routes/mobile/tasks.ts month_stats dan
 * stats-range, officerService). Penghapusan dead enum POSTPONED menyentuh
 * keempatnya sekaligus tanpa ada test yang memaksa keempatnya tetap seimbang
 * (TINJAUAN-ULANG §C2). Dipindahkan ke sini supaya:
 * 1. Tidak mungkin ada yang lupa mengikuti kontrak saat menambah/menghapus
 *    status enum — cukup ubah di satu tempat.
 * 2. Test bisa membandingkan output web dan mobile untuk skenario yang sama
 *    tanpa harus menyalakan DB (mock driver cukup memberi rows ke fungsi ini).
 *
 * Status assignment yang tidak masuk total (mis. status baru di masa depan)
 * HARUS ditangani eksplisit di sini — lihat test kontrak di file test.
 */

/** Baris hasil `groupBy(assignments.status)` dari Drizzle. */
export interface StatusCountRow {
  status: string;
  count: number | string | null;
}

export type AssignmentStatus =
  | 'ACTIVE'
  | 'COMPLETED'
  | 'UNCOLLECTED'
  | 'REASSIGNED';

/**
 * Seluruh status assignment yang dikenal skema. Dipakai untuk mendeteksi baris
 * tak terhitung; REASSIGNED ada di sini tetapi TIDAK masuk `task_total` —
 * lihat kontrak di atas.
 */
export const TOTAL_STATUSES: readonly AssignmentStatus[] = [
  'ACTIVE',
  'COMPLETED',
  'UNCOLLECTED',
  'REASSIGNED',
];

/**
 * Rumus metrik tugas murni dari baris groupBy(status).
 *
 * Memakai penjumlahan eksplisit per status (bukan `reduce` atas seluruh
 * baris) supaya penambahan status enum baru TIDAK diam-diam mengubah total —
 * harus dideklarasikan di TOTAL_STATUSES dulu. Ini perbaikan langsung dari
 * pola lama `taskRows.reduce(...)` yang memasukkan POSTPONED secara tak
 * sengaja.
 *
 * Baris dengan status tak dikenal (tidak ada di TOTAL_STATUSES) tetap
 * dilaporkan via `task_unaccounted` supaya bisa dideteksi sebagai bug —
 * kontrak mengharuskan total == jumlah seluruh baris pada scope+periode.
 */
export function computeTaskMetrics(rows: StatusCountRow[]): {
  task_active: number;
  task_completed: number;
  task_uncollected: number;
  task_reassigned: number;
  task_closed: number;
  task_total: number;
  /** Baris dengan status tak dikenal — untuk alarm. */
  task_unaccounted: number;
} {
  const countOf = (status: string) =>
    Number(rows.find((r) => r.status === status)?.count ?? 0);

  const task_active = countOf('ACTIVE');
  const task_completed = countOf('COMPLETED');
  const task_uncollected = countOf('UNCOLLECTED');
  const task_reassigned = countOf('REASSIGNED');

  const known = new Set<string>(TOTAL_STATUSES);
  let task_unaccounted = 0;
  for (const row of rows) {
    if (!known.has(row.status)) {
      task_unaccounted += Number(row.count ?? 0);
    }
  }

  // REASSIGNED = tugas lepas, bukan beban petugas asal.
  const task_total = task_active + task_completed + task_uncollected;
  const task_closed = task_completed + task_uncollected;

  return {
    task_active,
    task_completed,
    task_uncollected,
    task_reassigned,
    task_closed,
    task_total,
    task_unaccounted,
  };
}

/** Cek apakah angka metrik konsisten — total + dialihkan harus sama dengan jumlah baris. */
export function assertMetricsAccountForAllRows(rows: StatusCountRow[]): void {
  const m = computeTaskMetrics(rows);
  const rowCount = rows.reduce((sum, r) => sum + Number(r.count ?? 0), 0);
  if (m.task_total + m.task_reassigned !== rowCount) {
    throw new Error(
      `Kontrak metrik dilanggar: task_total=${m.task_total} + dialihkan=${m.task_reassigned} ` +
        `padahal jumlah baris=${rowCount} ` +
        `(tidak terhitung: ${m.task_unaccounted}). Status enum baru belum didaftarkan di TOTAL_STATUSES?`,
    );
  }
}
