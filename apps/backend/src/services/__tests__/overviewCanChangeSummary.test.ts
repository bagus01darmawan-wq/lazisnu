/**
 * Aturan agregasi murni rekap perubahan kaleng per periode tugas.
 * Tanpa database: mengunci distinct per (periode, kaleng, dimensi), kategori
 * nilai terakhir, dan penjumlahan bulanan.
 */
import {
  summarizeCanChangesByPeriod,
  type AttributedCanChangeEvent,
  type CanChangePeriodRef,
} from '../overviewCanChangeSummary';
import type { CanLifecycleStatus, CanPhysicalCondition } from '../canState';

let seq = 0;

function event(overrides: Partial<AttributedCanChangeEvent> & {
  canId: string;
  periodYear: number;
  periodMonth: number;
}): AttributedCanChangeEvent {
  seq += 1;
  return {
    id: `evt-${seq}`,
    effectiveAt: new Date('2026-10-05T00:00:00Z'),
    canVersion: seq,
    lifecycleStatus: null,
    physicalCondition: null,
    ...overrides,
  };
}

const oct: CanChangePeriodRef = { year: 2026, month: 10 };
const nov: CanChangePeriodRef = { year: 2026, month: 11 };

function counts(events: AttributedCanChangeEvent[], periods: CanChangePeriodRef[], ref: CanChangePeriodRef) {
  const key = `${ref.year}-${String(ref.month).padStart(2, '0')}`;
  return summarizeCanChangesByPeriod(events, periods).get(key)!;
}

describe('summarizeCanChangesByPeriod', () => {
  it('dua event kondisi pada satu kaleng dalam satu periode = satu kaleng unik', () => {
    const result = counts([
      event({
        canId: 'can-a',
        periodYear: 2026,
        periodMonth: 10,
        effectiveAt: new Date('2026-10-02T00:00:00Z'),
        physicalCondition: 'RUSAK' as CanPhysicalCondition,
      }),
      event({
        canId: 'can-a',
        periodYear: 2026,
        periodMonth: 10,
        effectiveAt: new Date('2026-10-03T00:00:00Z'),
        physicalCondition: 'BAIK' as CanPhysicalCondition,
      }),
    ], [oct], oct);

    expect(result.physical_condition.total).toBe(1);
    expect(result.physical_condition.by_category).toEqual({ BAIK: 1, RUSAK: 0, HILANG: 0 });
  });

  it('perubahan balik tetap satu kaleng, kategori = nilai terakhir', () => {
    const result = counts([
      event({
        canId: 'can-a',
        periodYear: 2026,
        periodMonth: 10,
        effectiveAt: new Date('2026-10-02T00:00:00Z'),
        physicalCondition: 'RUSAK' as CanPhysicalCondition,
      }),
      event({
        canId: 'can-a',
        periodYear: 2026,
        periodMonth: 10,
        effectiveAt: new Date('2026-10-03T00:00:00Z'),
        physicalCondition: 'BAIK' as CanPhysicalCondition,
      }),
    ], [oct], oct);

    expect(result.physical_condition.total).toBe(1);
    expect(result.physical_condition.by_category.BAIK).toBe(1);
    expect(result.physical_condition.by_category.RUSAK).toBe(0);
  });

  it('status dan kondisi fisik dihitung satu kali di kelompok masing-masing', () => {
    const result = counts([
      event({
        canId: 'can-a',
        periodYear: 2026,
        periodMonth: 10,
        lifecycleStatus: 'NON_AKTIF' as CanLifecycleStatus,
      }),
      event({
        canId: 'can-a',
        periodYear: 2026,
        periodMonth: 10,
        physicalCondition: 'RUSAK' as CanPhysicalCondition,
      }),
    ], [oct], oct);

    expect(result.lifecycle.total).toBe(1);
    expect(result.lifecycle.by_category.NON_AKTIF).toBe(1);
    expect(result.physical_condition.total).toBe(1);
    expect(result.physical_condition.by_category.RUSAK).toBe(1);
  });

  it('kaleng yang berubah di dua periode dihitung sekali pada tiap periode', () => {
    const events = [
      event({
        canId: 'can-a',
        periodYear: 2026,
        periodMonth: 10,
        physicalCondition: 'RUSAK' as CanPhysicalCondition,
      }),
      event({
        canId: 'can-a',
        periodYear: 2026,
        periodMonth: 11,
        effectiveAt: new Date('2026-11-05T00:00:00Z'),
        physicalCondition: 'BAIK' as CanPhysicalCondition,
      }),
    ];

    const october = counts(events, [oct, nov], oct);
    const november = counts(events, [oct, nov], nov);

    expect(october.physical_condition.total).toBe(1);
    expect(october.physical_condition.by_category.RUSAK).toBe(1);
    expect(november.physical_condition.total).toBe(1);
    expect(november.physical_condition.by_category.BAIK).toBe(1);
  });

  it('urutan kategori memakai effective_at lalu can_version, bukan urutan input', () => {
    // Event BAIK lebih baru walau diberikan lebih dulu di array.
    const result = counts([
      event({
        canId: 'can-a',
        periodYear: 2026,
        periodMonth: 10,
        effectiveAt: new Date('2026-10-09T00:00:00Z'),
        canVersion: 5,
        physicalCondition: 'BAIK' as CanPhysicalCondition,
      }),
      event({
        canId: 'can-a',
        periodYear: 2026,
        periodMonth: 10,
        effectiveAt: new Date('2026-10-09T00:00:00Z'),
        canVersion: 3,
        physicalCondition: 'RUSAK' as CanPhysicalCondition,
      }),
    ], [oct], oct);

    expect(result.physical_condition.total).toBe(1);
    expect(result.physical_condition.by_category.BAIK).toBe(1);
  });

  it('hanya periode terpilih yang dijumlahkan (Sep + Nov, bukan Okt)', () => {
    const sep: CanChangePeriodRef = { year: 2026, month: 9 };
    const events = [
      event({
        canId: 'can-sep',
        periodYear: 2026,
        periodMonth: 9,
        effectiveAt: new Date('2026-09-05T00:00:00Z'),
        physicalCondition: 'RUSAK' as CanPhysicalCondition,
      }),
      event({
        canId: 'can-oct',
        periodYear: 2026,
        periodMonth: 10,
        physicalCondition: 'HILANG' as CanPhysicalCondition,
      }),
      event({
        canId: 'can-nov',
        periodYear: 2026,
        periodMonth: 11,
        effectiveAt: new Date('2026-11-05T00:00:00Z'),
        lifecycleStatus: 'NON_AKTIF' as CanLifecycleStatus,
      }),
    ];

    const result = summarizeCanChangesByPeriod(events, [sep, nov]);
    expect(result.get('2026-09')!.physical_condition.total).toBe(1);
    expect(result.get('2026-11')!.lifecycle.total).toBe(1);
    expect(result.has('2026-10')).toBe(false);
  });

  it('periode kosong menghasilkan nol', () => {
    const result = counts([], [oct], oct);
    expect(result.lifecycle.total).toBe(0);
    expect(result.lifecycle.by_category).toEqual({ AKTIF: 0, NON_AKTIF: 0, DIKEMBALIKAN: 0 });
    expect(result.physical_condition.total).toBe(0);
    expect(result.physical_condition.by_category).toEqual({ BAIK: 0, RUSAK: 0, HILANG: 0 });
  });
});
