/**
 * Unit test replay ledger keadaan kaleng (tanpa database).
 *
 * Fokus: urutan deterministik, patch per dimensi, baseline cutover, event
 * terlambat, dan batas historis setengah terbuka.
 */
import { replayCanStateAt, type CanStateEventRow } from '../canStateHistory';
import type { CanState } from '../canState';

const baseline: CanState = {
  lifecycleStatus: 'AKTIF',
  physicalCondition: 'BAIK',
  physicalConditionSource: 'CUTOVER_BASELINE',
};

function event(overrides: Partial<CanStateEventRow> & { effectiveAt: Date }): CanStateEventRow {
  return {
    canVersion: 1,
    lifecycleStatus: null,
    physicalCondition: null,
    physicalConditionSource: null,
    branchId: null,
    sourceType: 'ADMIN_UPDATE',
    ...overrides,
  };
}

const fallback = { state: baseline, branchId: 'branch-a' };

describe('replay baseline + patch', () => {
  it('baseline cutover menjadi state awal', () => {
    const result = replayCanStateAt([
      event({ effectiveAt: new Date('2026-11-13T00:00:00Z'), sourceType: 'CUTOVER_BASELINE', ...baseline, branchId: 'branch-a' }),
    ], null, fallback);
    expect(result.state).toEqual(baseline);
    expect(result.branchId).toBe('branch-a');
    expect(result.historyComplete).toBe(true);
  });

  it('patch kondisi dan status diterapkan berurutan', () => {
    const result = replayCanStateAt([
      event({ effectiveAt: new Date('2026-11-13T00:00:00Z'), sourceType: 'CUTOVER_BASELINE', ...baseline, branchId: 'branch-a', canVersion: 0 }),
      event({ effectiveAt: new Date('2026-11-14T00:00:00Z'), physicalCondition: 'RUSAK', physicalConditionSource: 'OBSERVED', canVersion: 1 }),
      event({ effectiveAt: new Date('2026-11-15T00:00:00Z'), lifecycleStatus: 'NON_AKTIF', canVersion: 2 }),
    ], null, fallback);
    expect(result.state).toMatchObject({
      lifecycleStatus: 'NON_AKTIF',
      physicalCondition: 'RUSAK',
    });
  });
});

describe('event pindah ranting dan event kondisi terlambat', () => {
  it('pindah ranting 10 Okt tidak mengubah kondisi fisik', () => {
    const result = replayCanStateAt([
      event({ effectiveAt: new Date('2026-10-01T00:00:00Z'), sourceType: 'CUTOVER_BASELINE', ...baseline, branchId: 'branch-a', canVersion: 0 }),
      event({ effectiveAt: new Date('2026-10-10T00:00:00Z'), branchId: 'branch-b', canVersion: 2 }),
    ], null, fallback);
    expect(result.state.physicalCondition).toBe('BAIK');
    expect(result.branchId).toBe('branch-b');
  });

  it('event RUSAK terlambat (5 Okt) masuk sebelum pindah ranting 10 Okt', () => {
    const events = [
      event({ effectiveAt: new Date('2026-10-01T00:00:00Z'), sourceType: 'CUTOVER_BASELINE', ...baseline, branchId: 'branch-a', canVersion: 0 }),
      event({ effectiveAt: new Date('2026-10-10T00:00:00Z'), branchId: 'branch-b', canVersion: 2 }),
      // Diterima belakangan, tetapi waktu kejadiannya 5 Okt.
      event({ effectiveAt: new Date('2026-10-05T00:00:00Z'), physicalCondition: 'RUSAK', physicalConditionSource: 'OBSERVED', canVersion: 3 }),
    ];
    const afterFifth = replayCanStateAt(events, { at: new Date('2026-10-06T00:00:00Z'), inclusive: false }, fallback);
    expect(afterFifth.state.physicalCondition).toBe('RUSAK');
    const afterTenth = replayCanStateAt(events, null, fallback);
    expect(afterTenth.state.physicalCondition).toBe('RUSAK');
    expect(afterTenth.branchId).toBe('branch-b');
  });

  it('perubahan fisik berikutnya memang menimpa RUSAK', () => {
    const result = replayCanStateAt([
      event({ effectiveAt: new Date('2026-10-01T00:00:00Z'), sourceType: 'CUTOVER_BASELINE', ...baseline, branchId: 'branch-a', canVersion: 0 }),
      event({ effectiveAt: new Date('2026-10-05T00:00:00Z'), physicalCondition: 'RUSAK', physicalConditionSource: 'OBSERVED', canVersion: 1 }),
      event({ effectiveAt: new Date('2026-10-12T00:00:00Z'), physicalCondition: 'BAIK', physicalConditionSource: 'OBSERVED', canVersion: 2 }),
    ], null, fallback);
    expect(result.state.physicalCondition).toBe('BAIK');
  });

  it('dua event pada timestamp sama diurutkan can_version', () => {
    const at = new Date('2026-10-05T00:00:00Z');
    const result = replayCanStateAt([
      event({ effectiveAt: new Date('2026-10-01T00:00:00Z'), sourceType: 'CUTOVER_BASELINE', ...baseline, branchId: 'branch-a', canVersion: 0 }),
      event({ effectiveAt: at, lifecycleStatus: 'NON_AKTIF', canVersion: 2 }),
      event({ effectiveAt: at, physicalCondition: 'HILANG', physicalConditionSource: 'OBSERVED', canVersion: 1 }),
    ], null, fallback);
    expect(result.state).toMatchObject({ lifecycleStatus: 'NON_AKTIF', physicalCondition: 'HILANG' });
  });
});

describe('baseline dan kelengkapan riwayat', () => {
  it('event sebelum baseline tidak menimpa baseline terverifikasi', () => {
    const result = replayCanStateAt([
      event({ effectiveAt: new Date('2026-10-01T00:00:00Z'), physicalCondition: 'RUSAK', physicalConditionSource: 'OBSERVED', canVersion: 1 }),
      event({ effectiveAt: new Date('2026-11-13T00:00:00Z'), sourceType: 'CUTOVER_BASELINE', ...baseline, branchId: 'branch-a', canVersion: 0 }),
    ], null, fallback);
    expect(result.state.physicalCondition).toBe('BAIK');
  });

  it('cutoff sebelum baseline ditandai riwayat tidak lengkap', () => {
    const result = replayCanStateAt([
      event({ effectiveAt: new Date('2026-11-13T00:00:00Z'), sourceType: 'CUTOVER_BASELINE', ...baseline, branchId: 'branch-a', canVersion: 0 }),
    ], { at: new Date('2026-10-31T00:00:00Z'), inclusive: false }, fallback);
    expect(result.historyComplete).toBe(false);
    expect(result.state).toEqual(baseline);
  });

  it('batas historis setengah terbuka: tepat awal bulan berikutnya tidak masuk', () => {
    const events = [
      event({ effectiveAt: new Date('2026-10-01T00:00:00Z'), sourceType: 'CUTOVER_BASELINE', ...baseline, branchId: 'branch-a', canVersion: 0 }),
      event({ effectiveAt: new Date('2026-10-31T23:59:59.999Z'), physicalCondition: 'RUSAK', physicalConditionSource: 'OBSERVED', canVersion: 1 }),
      event({ effectiveAt: new Date('2026-11-01T00:00:00Z'), physicalCondition: 'HILANG', physicalConditionSource: 'OBSERVED', canVersion: 2 }),
    ];
    const october = replayCanStateAt(events, { at: new Date('2026-11-01T00:00:00Z'), inclusive: false }, fallback);
    expect(october.state.physicalCondition).toBe('RUSAK');
    const november = replayCanStateAt(events, { at: new Date('2026-11-01T00:00:00Z'), inclusive: true }, fallback);
    expect(november.state.physicalCondition).toBe('HILANG');
  });

  it('bulan berjalan memakai cutoff inklusif <= now', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    const result = replayCanStateAt([
      event({ effectiveAt: new Date('2026-10-01T00:00:00Z'), sourceType: 'CUTOVER_BASELINE', ...baseline, branchId: 'branch-a', canVersion: 0 }),
      event({ effectiveAt: now, lifecycleStatus: 'NON_AKTIF', canVersion: 1 }),
    ], { at: now, inclusive: true }, fallback);
    expect(result.state.lifecycleStatus).toBe('NON_AKTIF');
  });
});
