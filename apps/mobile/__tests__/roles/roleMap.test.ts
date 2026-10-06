import {
  canUseScan,
  countdownText,
  homeTitle,
  isKeuangan,
  isManager,
  isPpk,
  isStafPengumpulan,
  normalizeRole,
  reminderFor,
  tabsForRole,
  toleranceChip,
} from '../../src/roles/roleMap';

describe('C1-T9 roleMap', () => {
  test('normalizeRole: dikenal lolos, asing → UNKNOWN', () => {
    expect(normalizeRole('PETUGAS')).toBe('PETUGAS');
    expect(normalizeRole('STAF_PENGUMPULAN')).toBe('STAF_PENGUMPULAN');
    expect(normalizeRole('STAF_KEUANGAN')).toBe('STAF_KEUANGAN');
    expect(normalizeRole('ADMIN_RANTING')).toBe('ADMIN_RANTING');
    expect(normalizeRole('ADMIN_KECAMATAN')).toBe('ADMIN_KECAMATAN');
    expect(normalizeRole('SUPERADMIN')).toBe('UNKNOWN');
    expect(normalizeRole(null)).toBe('UNKNOWN');
    expect(normalizeRole(undefined)).toBe('UNKNOWN');
  });

  test('predikat peran + scan hanya PPK', () => {
    expect(isPpk('PETUGAS')).toBe(true);
    expect(isPpk('ADMIN_RANTING')).toBe(false);
    expect(isStafPengumpulan('STAF_PENGUMPULAN')).toBe(true);
    expect(isKeuangan('STAF_KEUANGAN')).toBe(true);
    expect(isManager('ADMIN_RANTING')).toBe(true);
    expect(isManager('ADMIN_KECAMATAN')).toBe(true);
    expect(isManager('PETUGAS')).toBe(false);
    expect(canUseScan('PETUGAS')).toBe(true);
    expect(canUseScan('STAF_PENGUMPULAN')).toBe(false);
    expect(canUseScan('ADMIN_KECAMATAN')).toBe(false);
  });

  test('tabsForRole: PPK tak berubah; peran lain tanpa Scan/Tasks/History', () => {
    expect(tabsForRole('PETUGAS')).toEqual(['Dashboard', 'Tasks', 'Scan', 'History', 'Profile']);
    expect(tabsForRole('STAF_PENGUMPULAN')).toEqual(['Persetujuan', 'Profile']);
    expect(tabsForRole('STAF_KEUANGAN')).toEqual(['Keuangan', 'Profile']);
    expect(tabsForRole('ADMIN_RANTING')).toEqual(['Rekap', 'Profile']);
    expect(tabsForRole('ADMIN_KECAMATAN')).toEqual(['Rekap', 'Profile']);
    expect(tabsForRole('UNKNOWN')).toEqual(['Profile']);
    for (const r of [
      'STAF_PENGUMPULAN',
      'STAF_KEUANGAN',
      'ADMIN_RANTING',
      'ADMIN_KECAMATAN',
    ] as const) {
      expect(tabsForRole(r)).not.toContain('Scan');
    }
  });

  test('countdownText: due → toleransi → kunci', () => {
    const open = {
      period: '2026-09',
      period_status: 'OPEN',
      days_to_due: 5,
      days_to_lock: 17,
      in_tolerance: false,
    };
    expect(countdownText(open)).toBe('Sisa 5 hari penjemputan');
    const tol = {
      period: '2026-09',
      period_status: 'TOLERANCE',
      days_to_due: 0,
      days_to_lock: 4,
      in_tolerance: true,
    };
    expect(countdownText(tol)).toBe('Toleransi: sisa 4 hari');
    const locked = {
      period: '2026-09',
      period_status: 'LOCKED',
      days_to_due: 0,
      days_to_lock: 0,
      in_tolerance: false,
    };
    expect(countdownText(locked)).toBe('Periode 2026-09 dikunci');
  });

  test('toleranceChip: hanya toleransi & kunci', () => {
    expect(
      toleranceChip({
        period: '2026-09',
        period_status: 'OPEN',
        days_to_due: 5,
        days_to_lock: 17,
        in_tolerance: false,
      }),
    ).toBeNull();
    expect(
      toleranceChip({
        period: '2026-09',
        period_status: 'TOLERANCE',
        days_to_due: 0,
        days_to_lock: 4,
        in_tolerance: true,
      }),
    ).toEqual({
      label: 'Toleransi 2026-09',
      tone: 'warn',
    });
    expect(
      toleranceChip({
        period: '2026-09',
        period_status: 'LOCKED',
        days_to_due: 0,
        days_to_lock: 0,
        in_tolerance: false,
      }),
    ).toEqual({
      label: 'Dikunci',
      tone: 'lock',
    });
  });

  test('reminderFor: urgent/info/none', () => {
    const open = {
      period: '2026-09',
      period_status: 'OPEN',
      days_to_due: 2,
      days_to_lock: 14,
      in_tolerance: false,
    };
    expect(reminderFor(open, 7).level).toBe('urgent');
    expect(reminderFor({...open, days_to_due: 6}, 7).level).toBe('info');
    expect(reminderFor({...open, days_to_due: 20}, 7).level).toBe('none');
    expect(reminderFor(open, 0).level).toBe('none');
    const locked = {
      period: '2026-09',
      period_status: 'LOCKED',
      days_to_due: 0,
      days_to_lock: 0,
      in_tolerance: false,
    };
    expect(reminderFor(locked, 3).level).toBe('urgent');
    expect(reminderFor(locked, 0).level).toBe('none');
  });

  test('homeTitle per peran', () => {
    expect(homeTitle('PETUGAS')).toBe('Penjemputan Koin');
    expect(homeTitle('STAF_PENGUMPULAN')).toBe('Persetujuan Tugas');
    expect(homeTitle('STAF_KEUANGAN')).toBe('Keuangan & BA');
    expect(homeTitle('ADMIN_RANTING')).toBe('Ranting');
    expect(homeTitle('ADMIN_KECAMATAN')).toBe('Rekap MWC');
  });
});
