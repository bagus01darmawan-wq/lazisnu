/**
 * Unit test pemetaan status lifecycle + kondisi fisik kaleng.
 *
 * Sumber aturan: docs/rencana-pemisahan-status-kondisi-kaleng-periode-2026-11-13.md
 * Modul yang diuji murni (tanpa database) agar mapping backfill dan proyeksi
 * legacy tidak tersebar di service lain.
 */
import {
  LEGACY_BAIK_ASSUMPTION,
  applyPhysicalCondition,
  applyStatusChange,
  deriveIsActive,
  deriveLegacyCondition,
  newCanState,
  replayCanStatePatches,
  resolveStateInput,
  stateAfterCollection,
  stateAfterReplacement,
  stateAfterVisitOutcome,
  stateFromLegacyCondition,
} from '../canState';
import type { CanState, CanStatePatch } from '../canState';

describe('mapping backfill lima kondisi legacy', () => {
  it('AKTIF menjadi AKTIF + BAIK', () => {
    expect(stateFromLegacyCondition('AKTIF')).toEqual({
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'BAIK',
      physicalConditionSource: 'OBSERVED',
    });
  });

  it('RUSAK/HILANG tetap berstatus AKTIF dengan kondisi fisiknya', () => {
    expect(stateFromLegacyCondition('RUSAK')).toMatchObject({
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'RUSAK',
    });
    expect(stateFromLegacyCondition('HILANG')).toMatchObject({
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'HILANG',
    });
  });

  it('NON_AKTIF memakai kondisi fisik terakhir yang dapat dibuktikan', () => {
    expect(stateFromLegacyCondition('NON_AKTIF', {
      lastKnownPhysicalCondition: 'RUSAK',
      provenance: 'OBSERVED',
    })).toEqual({
      lifecycleStatus: 'NON_AKTIF',
      physicalCondition: 'RUSAK',
      physicalConditionSource: 'OBSERVED',
    });
  });

  it('NON_AKTIF tanpa bukti memakai BAIK ber-provenance asumsi', () => {
    expect(stateFromLegacyCondition('NON_AKTIF')).toEqual({
      lifecycleStatus: 'NON_AKTIF',
      physicalCondition: 'BAIK',
      physicalConditionSource: LEGACY_BAIK_ASSUMPTION,
    });
  });

  it('DIKEMBALIKAN tanpa bukti juga memakai BAIK ber-provenance asumsi', () => {
    expect(stateFromLegacyCondition('DIKEMBALIKAN')).toEqual({
      lifecycleStatus: 'DIKEMBALIKAN',
      physicalCondition: 'BAIK',
      physicalConditionSource: LEGACY_BAIK_ASSUMPTION,
    });
  });
});

describe('proyeksi balik ke legacy condition', () => {
  it('AKTIF+BAIK/RUSAK/HILANG memakai enum legacy lama', () => {
    expect(deriveLegacyCondition('AKTIF', 'BAIK')).toBe('AKTIF');
    expect(deriveLegacyCondition('AKTIF', 'RUSAK')).toBe('RUSAK');
    expect(deriveLegacyCondition('AKTIF', 'HILANG')).toBe('HILANG');
  });

  it('NON_AKTIF dan DIKEMBALIKAN menang atas kondisi fisik (lossy)', () => {
    expect(deriveLegacyCondition('NON_AKTIF', 'BAIK')).toBe('NON_AKTIF');
    expect(deriveLegacyCondition('NON_AKTIF', 'RUSAK')).toBe('NON_AKTIF');
    expect(deriveLegacyCondition('DIKEMBALIKAN', 'HILANG')).toBe('DIKEMBALIKAN');
  });

  it('is_active hanya false untuk DIKEMBALIKAN', () => {
    expect(deriveIsActive('AKTIF')).toBe(true);
    expect(deriveIsActive('NON_AKTIF')).toBe(true);
    expect(deriveIsActive('DIKEMBALIKAN')).toBe(false);
  });
});

describe('transisi dua dimensi independen', () => {
  const base: CanState = newCanState();

  it('kaleng baru selalu AKTIF + BAIK', () => {
    expect(base).toEqual({
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'BAIK',
      physicalConditionSource: 'OBSERVED',
    });
  });

  it('kondisi fisik bertahan saat status menjadi NON_AKTIF/DIKEMBALIKAN', () => {
    const damaged = applyPhysicalCondition(base, 'RUSAK');
    expect(applyStatusChange(damaged, 'NON_AKTIF')).toMatchObject({
      lifecycleStatus: 'NON_AKTIF',
      physicalCondition: 'RUSAK',
    });
    expect(applyStatusChange(damaged, 'DIKEMBALIKAN')).toMatchObject({
      lifecycleStatus: 'DIKEMBALIKAN',
      physicalCondition: 'RUSAK',
    });
  });

  it('kunjungan isi memperbarui kondisi fisik dan mengaktifkan status', () => {
    const inactive = applyStatusChange(base, 'NON_AKTIF');
    expect(stateAfterVisitOutcome(inactive, 'ISI', 'HILANG')).toMatchObject({
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'HILANG',
      physicalConditionSource: 'OBSERVED',
    });
  });

  it('kunjungan kosong mempertahankan kondisi fisik dan status NON_AKTIF', () => {
    const inactive = applyStatusChange(applyPhysicalCondition(base, 'RUSAK'), 'NON_AKTIF');
    expect(stateAfterVisitOutcome(inactive, 'KOSONG')).toMatchObject({
      lifecycleStatus: 'NON_AKTIF',
      physicalCondition: 'RUSAK',
    });
  });

  it('kunjungan dikembalikan mengubah status tanpa menghapus kondisi fisik', () => {
    const inactive = applyStatusChange(applyPhysicalCondition(base, 'HILANG'), 'NON_AKTIF');
    expect(stateAfterVisitOutcome(inactive, 'DIKEMBALIKAN')).toMatchObject({
      lifecycleStatus: 'DIKEMBALIKAN',
      physicalCondition: 'HILANG',
    });
  });

  it('kaleng rusak/hilang tetap berstatus aktif saat penjemputan biasa', () => {
    expect(stateAfterCollection(base, 'RUSAK')).toMatchObject({
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'RUSAK',
    });
    expect(stateAfterCollection(base, 'HILANG')).toMatchObject({
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'HILANG',
    });
  });

  it('penggantian unit menutup RUSAK/HILANG menjadi AKTIF + BAIK', () => {
    expect(stateAfterReplacement(applyPhysicalCondition(base, 'RUSAK'))).toMatchObject({
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'BAIK',
    });
    expect(stateAfterReplacement(applyPhysicalCondition(base, 'HILANG'))).toMatchObject({
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'BAIK',
    });
    expect(stateAfterReplacement(base)).toEqual(base);
  });
});

describe('validasi request campuran legacy + field baru', () => {
  const current: CanState = {
    lifecycleStatus: 'AKTIF',
    physicalCondition: 'BAIK',
    physicalConditionSource: 'OBSERVED',
  };

  it('request legacy tunggal dipetakan sebagai kondisi fisik, status dari state machine', () => {
    expect(resolveStateInput({ condition: 'RUSAK' }, current)).toEqual({
      ok: true,
      state: {
        lifecycleStatus: 'AKTIF',
        physicalCondition: 'RUSAK',
        physicalConditionSource: 'OBSERVED',
      },
    });
    expect(resolveStateInput({ condition: 'NON_AKTIF' }, current)).toEqual({
      ok: true,
      state: { ...current, lifecycleStatus: 'NON_AKTIF' },
    });
  });

  it('pasangan baru yang konsisten dengan legacy diterima', () => {
    expect(resolveStateInput({
      condition: 'RUSAK',
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'RUSAK',
    }, current)).toMatchObject({
      ok: true,
      state: { lifecycleStatus: 'AKTIF', physicalCondition: 'RUSAK' },
    });
  });

  it('pasangan baru yang bertentangan dengan legacy ditolak VALIDATION_ERROR', () => {
    const result = resolveStateInput({
      condition: 'AKTIF',
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'RUSAK',
    }, current);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.message).toMatch(/bertentangan/i);
    }
  });

  it('physical_condition tanpa lifecycle mempertahankan status saat ini', () => {
    const inactive = applyStatusChange(current, 'NON_AKTIF');
    expect(resolveStateInput({ physicalCondition: 'RUSAK' }, inactive)).toEqual({
      ok: true,
      state: {
        lifecycleStatus: 'NON_AKTIF',
        physicalCondition: 'RUSAK',
        physicalConditionSource: 'OBSERVED',
      },
    });
  });

  it('nilai enum tidak dikenal ditolak', () => {
    const result = resolveStateInput({ physicalCondition: 'BAGUS' as never }, current);
    expect(result.ok).toBe(false);
  });
});

describe('replay patch per dimensi', () => {
  const baseline: CanState = {
    lifecycleStatus: 'AKTIF',
    physicalCondition: 'BAIK',
    physicalConditionSource: 'CUTOVER_BASELINE',
  };

  it('patch hanya mengubah dimensi yang terisi', () => {
    const patches: CanStatePatch[] = [
      { branchId: 'branch-b' },
      { physicalCondition: 'RUSAK' },
      { lifecycleStatus: 'NON_AKTIF' },
    ];
    expect(replayCanStatePatches(baseline, patches, 'branch-a')).toEqual({
      lifecycleStatus: 'NON_AKTIF',
      physicalCondition: 'RUSAK',
      physicalConditionSource: 'OBSERVED',
      branchId: 'branch-b',
    });
  });

  it('event pindah ranting tidak mengembalikan kondisi fisik lama', () => {
    const patches: CanStatePatch[] = [
      { physicalCondition: 'RUSAK' },
      { branchId: 'branch-c' },
    ];
    expect(replayCanStatePatches(baseline, patches, 'branch-a')).toMatchObject({
      physicalCondition: 'RUSAK',
      branchId: 'branch-c',
    });
  });
});
