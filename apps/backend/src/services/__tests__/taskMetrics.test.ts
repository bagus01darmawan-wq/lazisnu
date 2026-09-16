/**
 * Kontrak metrik tugas — memastikan web dan mobile tidak bisa berangsur lepas.
 *
 * Latar belakang: TINJAUAN-ULANG-SUSULAN-MOBILE-OVERVIEW §C2. Penghapusan dead
 * enum POSTPONED menyentuh 4 call site rumus `task_total` sekaligus tanpa
 * satu pun test yang membandingkannya. Test ini mengeksekusi fungsi tunggal
 * `computeTaskMetrics` yang sekarang dipakai bersama oleh:
 *  - overviewService.getTaskSummary   (dashboard web)
 *  - routes/mobile/tasks.ts month_stats + stats-range (dashboard mobile)
 *  - officerService                   (profil petugas)
 * jadi setiap perubahan rumus otomatis teruji untuk semuanya sekaligus.
 */
import {
  computeTaskMetrics,
  assertMetricsAccountForAllRows,
  TOTAL_STATUSES,
  type StatusCountRow,
} from '../taskMetrics';

/** Sebaran produksi riode 2026-09-16 (212 baris): dipakai beberapa test. */
const PROD_ROWS: StatusCountRow[] = [
  { status: 'ACTIVE', count: 15 },
  { status: 'COMPLETED', count: 84 },
  { status: 'REASSIGNED', count: 53 },
  { status: 'UNCOLLECTED', count: 60 },
];

describe('computeTaskMetrics — kontrak dasar-perbaikan-metrik §7', () => {
  it('task_total = ACTIVE + COMPLETED + UNCOLLECTED + REASSIGNED', () => {
    const m = computeTaskMetrics(PROD_ROWS);
    expect(m.task_total).toBe(15 + 84 + 60 + 53);
    expect(m.task_total).toBe(212);
  });

  it('task_closed = COMPLETED + UNCOLLECTED (REASSIGNED tidak pernah selesai)', () => {
    const m = computeTaskMetrics(PROD_ROWS);
    expect(m.task_closed).toBe(84 + 60);
    expect(m.task_closed).toBe(144);

    // REASSIGNED tidak pernah dihitung selesai walau jumlahnya berubah.
    expect(computeTaskMetrics([{ status: 'REASSIGNED', count: 99 }]).task_closed).toBe(0);
  });

  it('task_active = ACTIVE (tugas belum selesai)', () => {
    expect(computeTaskMetrics(PROD_ROWS).task_active).toBe(15);
  });

  it('POSTPONED tidak pernah masuk total (dead enum dihapus 2026-09-16)', () => {
    const rows: StatusCountRow[] = [
      ...PROD_ROWS,
      { status: 'POSTPONED', count: 7 },
    ];
    const m = computeTaskMetrics(rows);
    // Total tidak bertambah...
    expect(m.task_total).toBe(212);
    // ...dan 7 baris itu dilaporkan sebagai tidak terhitung, bukan diam-diam
    // dibuang. Inilah perbaikan inti: pola lama `reduce(rows)` memasukkan
    // POSTPONED ke total secara tak terdeteksi.
    expect(m.task_unaccounted).toBe(7);
  });

  it('status enum baru harus didaftarkan, tidak bisa diam-diam menambah total', () => {
    const rows: StatusCountRow[] = [
      ...PROD_ROWS,
      { status: 'CANCELED', count: 3 },
    ];
    const m = computeTaskMetrics(rows);
    expect(m.task_total).toBe(212);
    expect(m.task_unaccounted).toBe(3);
  });

  it('menerima count sebagai bigint/string dari driver (tabel besar)', () => {
    const m = computeTaskMetrics([
      { status: 'ACTIVE', count: '15' },
      { status: 'COMPLETED', count: '84000' },
      { status: 'UNCOLLECTED', count: '600' },
      { status: 'REASSIGNED', count: '5300' },
    ]);
    expect(m.task_total).toBe(89915);
    expect(m.task_closed).toBe(84600);
  });

  it('daftar input kosong menghasilkan semua nol, bukan NaN', () => {
    const m = computeTaskMetrics([]);
    expect(m).toEqual({
      task_active: 0,
      task_completed: 0,
      task_uncollected: 0,
      task_reassigned: 0,
      task_closed: 0,
      task_total: 0,
      task_unaccounted: 0,
    });
  });

  it('count null (coalesce gagal) tidak menjadi NaN', () => {
    const m = computeTaskMetrics([{ status: 'ACTIVE', count: null }]);
    expect(m.task_active).toBe(0);
    expect(m.task_total).toBe(0);
  });

  it('TOTAL_STATUSES sesuai enum skema setelah POSTPONED dihapus', () => {
    expect(TOTAL_STATUSES).toEqual([
      'ACTIVE',
      'COMPLETED',
      'UNCOLLECTED',
      'REASSIGNED',
    ]);
  });
});

describe('assertMetricsAccountForAllRows — alarm kontrak', () => {
  it('sunyi saat semua baris terhitung', () => {
    expect(() => assertMetricsAccountForAllRows(PROD_ROWS)).not.toThrow();
  });

  it('lempar bila ada baris tak terhitung (status tak terdaftar)', () => {
    expect(() =>
      assertMetricsAccountForAllRows([
        ...PROD_ROWS,
        { status: 'POSTPONED', count: 2 },
      ]),
    ).toThrow(/Kontrak metrik dilanggar/);
  });
});
