import {parseStatsRange, computeMonthsCovered, MAX_RANGE_MS} from '../../../utils/statsRange';

describe('parseStatsRange', () => {
  it('menerima rentang valid dalam satu bulan', () => {
    const result = parseStatsRange('2026-08-01', '2026-08-15');
    expect(result.ok).toBe(true);
    expect(result.startDate).toEqual(new Date('2026-08-01T00:00:00'));
    expect(result.endDate).toEqual(new Date('2026-08-15T23:59:59.999'));
  });

  it('menolak parameter yang hilang atau format salah', () => {
    expect(parseStatsRange(undefined, '2026-08-15').ok).toBe(false);
    expect(parseStatsRange('2026-08-01', undefined).ok).toBe(false);
    expect(parseStatsRange('', '').ok).toBe(false);
    expect(parseStatsRange('15-08-2026', '2026-08-20').ok).toBe(false);
    expect(parseStatsRange('2026/08/01', '2026/08/20').ok).toBe(false);
    expect(parseStatsRange('bukan-tanggal', '2026-08-20').ok).toBe(false);
  });

  it('menolak tanggal yang tidak ada di kalender', () => {
    // 30 Februari tidak pernah ada — Date menggulung ke 1/2 Mar tapi tetap
    // harus ditolak karena input bukan tanggal sah.
    const result = parseStatsRange('2026-02-30', '2026-03-10');
    expect(result.ok).toBe(false);
  });

  it('menolak start > end', () => {
    const result = parseStatsRange('2026-08-20', '2026-08-01');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('melebihi');
  });

  it('menolak rentang lebih dari 1 tahun', () => {
    const result = parseStatsRange('2025-01-01', '2026-06-30');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('maksimal 1 tahun');
  });

  it('menerima rentang tepat 366 hari (tahun kabisat)', () => {
    const result = parseStatsRange('2024-01-01', '2024-12-31');
    expect(result.ok).toBe(true);
  });

  it('rentang satu hari pun sah (mulai == akhir)', () => {
    const result = parseStatsRange('2026-08-26', '2026-08-26');
    expect(result.ok).toBe(true);
  });

  it('MAX_RANGE_MS sama dengan 366 hari', () => {
    expect(MAX_RANGE_MS).toBe(366 * 24 * 60 * 60 * 1000);
  });
});

describe('computeMonthsCovered', () => {
  it('satu bulan bila rentang dalam bulan yang sama', () => {
    const months = computeMonthsCovered(new Date('2026-08-05'), new Date('2026-08-25'));
    expect(months).toEqual(['2026-08']);
  });

  it('lintas tahun menghasilkan periode berurutan termasuk Desember–Januari', () => {
    const months = computeMonthsCovered(new Date('2025-11-20'), new Date('2026-02-10'));
    expect(months).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('inklusif pada batas: hari pertama & terakhir bulan ikut terhitung', () => {
    const months = computeMonthsCovered(new Date('2026-07-31'), new Date('2026-09-01'));
    expect(months).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('aman melewati Februari tahun kabisat', () => {
    const months = computeMonthsCovered(new Date('2024-01-15'), new Date('2024-04-15'));
    expect(months).toEqual(['2024-01', '2024-02', '2024-03', '2024-04']);
  });
});
