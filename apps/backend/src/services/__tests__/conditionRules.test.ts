/**
 * Unit test aturan kondisi kaleng (tanpa database).
 * Rujukan: services/conditionRules.ts dan dokumen keputusan status kaleng.
 */
import {
  ACTION_REQUIRED_CONDITIONS,
  ALLOWED_TRANSITIONS,
  ASSIGNABLE_CONDITIONS,
  EMPTY_STREAK_THRESHOLD,
  PLACEMENT_CONDITIONS,
  actionLabel,
  conditionAfterReplacementVisit,
  conditionLabel,
  countTrailingEmptyCollections,
  isAssignableCondition,
  isPlacementCondition,
  isTrackedForCondition,
  isTransitionAllowed,
  proposalForSkipReason,
  shouldProposeInactive,
  shouldRestoreActive,
} from '../conditionRules';

describe('cakupan kondisi', () => {
  it('cakupan penempatan memuat AKTIF, NON_AKTIF, RUSAK — tanpa HILANG', () => {
    expect(PLACEMENT_CONDITIONS).toEqual(['AKTIF', 'NON_AKTIF', 'RUSAK']);
    expect(PLACEMENT_CONDITIONS).not.toContain('HILANG');
  });

  it('hanya AKTIF, RUSAK, HILANG yang boleh menerima tugas penjemputan', () => {
    expect(ASSIGNABLE_CONDITIONS).toEqual(['AKTIF', 'RUSAK', 'HILANG']);
    expect(isAssignableCondition('AKTIF')).toBe(true);
    expect(isAssignableCondition('RUSAK')).toBe(true);
    expect(isAssignableCondition('HILANG')).toBe(true);
    expect(isAssignableCondition('NON_AKTIF')).toBe(false);
    expect(isAssignableCondition('DIKEMBALIKAN')).toBe(false);
  });

  it('perlu tindakan = NON_AKTIF + RUSAK + HILANG', () => {
    expect(ACTION_REQUIRED_CONDITIONS).toEqual(['NON_AKTIF', 'RUSAK', 'HILANG']);
  });

  it('is_active diturunkan dari kondisi, bukan sebaliknya', () => {
    expect(isTrackedForCondition('AKTIF')).toBe(true);
    expect(isTrackedForCondition('NON_AKTIF')).toBe(true);
    expect(isTrackedForCondition('HILANG')).toBe(true);
    expect(isTrackedForCondition('DIKEMBALIKAN')).toBe(false);
    expect(isPlacementCondition('HILANG')).toBe(false);
  });
});

describe('hitungan penjemputan kosong berturut-turut', () => {
  it('menghitung kosong berturut-turut dari riwayat terbaru', () => {
    // terbaru → terlama
    expect(countTrailingEmptyCollections([0, 0, 0, 5000, 0, 0])).toBe(3);
  });

  it('berhenti pada penjemputan berisi nominal terbaru', () => {
    expect(countTrailingEmptyCollections([2000, 0, 0, 0])).toBe(0);
  });

  it('menghitung seluruh riwayat bila belum pernah berisi', () => {
    expect(countTrailingEmptyCollections([0, 0, 0, 0, 0, 0])).toBe(6);
    expect(countTrailingEmptyCollections([])).toBe(0);
  });

  it('nominal 0 tetap dihitung sebagai penjemputan (bukan UNCOLLECTED)', () => {
    expect(countTrailingEmptyCollections([0, 0, 0, 0, 0, 0])).toBe(EMPTY_STREAK_THRESHOLD);
  });
});

describe('usulan dan transisi kondisi', () => {
  it('mengusulkan NON_AKTIF hanya untuk kondisi yang masih dijemput', () => {
    expect(shouldProposeInactive('AKTIF', 6)).toBe(true);
    expect(shouldProposeInactive('RUSAK', 6)).toBe(true);
    expect(shouldProposeInactive('HILANG', 6)).toBe(true);
    expect(shouldProposeInactive('AKTIF', 5)).toBe(false);
    expect(shouldProposeInactive('NON_AKTIF', 6)).toBe(false);
    expect(shouldProposeInactive('DIKEMBALIKAN', 99)).toBe(false);
  });

  it('NON_AKTIF yang kembali berisi otomatis kembali AKTIF', () => {
    expect(shouldRestoreActive('NON_AKTIF', 5000)).toBe(true);
    expect(shouldRestoreActive('NON_AKTIF', 0)).toBe(false);
    expect(shouldRestoreActive('AKTIF', 5000)).toBe(false);
  });

  it('CAN_LOST → HILANG dan CAN_DAMAGED → RUSAK; kode lain tidak mengusulkan', () => {
    expect(proposalForSkipReason('CAN_LOST')).toBe('HILANG');
    expect(proposalForSkipReason('CAN_DAMAGED')).toBe('RUSAK');
    expect(proposalForSkipReason('OWNER_ABSENT')).toBeNull();
    expect(proposalForSkipReason('OTHER')).toBeNull();
  });

  it('hanya transisi yang diizinkan yang lolos', () => {
    expect(isTransitionAllowed('AKTIF', 'NON_AKTIF')).toBe(true);
    expect(isTransitionAllowed('AKTIF', 'DIKEMBALIKAN')).toBe(true);
    expect(isTransitionAllowed('DIKEMBALIKAN', 'AKTIF')).toBe(true);
    expect(isTransitionAllowed('AKTIF', 'AKTIF')).toBe(true);
    expect(ALLOWED_TRANSITIONS.DIKEMBALIKAN).toEqual(['AKTIF']);
    // Kaleng yang sudah keluar tidak boleh melompat ke kondisi lain tanpa pemasangan baru.
    expect(isTransitionAllowed('DIKEMBALIKAN', 'RUSAK')).toBe(false);
  });

  it('kunjungan penggantian menutup kasus RUSAK/HILANG saja', () => {
    expect(conditionAfterReplacementVisit('RUSAK')).toBe('AKTIF');
    expect(conditionAfterReplacementVisit('HILANG')).toBe('AKTIF');
    expect(conditionAfterReplacementVisit('NON_AKTIF')).toBeNull();
    expect(conditionAfterReplacementVisit('AKTIF')).toBeNull();
  });
});

describe('label', () => {
  it('label Indonesia tersedia untuk kondisi dan tindakan', () => {
    expect(conditionLabel('HILANG')).toBe('Hilang');
    expect(conditionLabel('DIKEMBALIKAN')).toBe('Dikembalikan');
    expect(actionLabel('RUSAK')).toBe('Ganti unit kaleng');
    expect(actionLabel('HILANG')).toBe('Beri kaleng baru');
    expect(actionLabel('NON_AKTIF')).toBe('Kunjungi untuk verifikasi');
    expect(actionLabel('AKTIF')).toBe('');
  });
});