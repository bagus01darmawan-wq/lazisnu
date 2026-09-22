import { describe, it, expect } from 'vitest';
import { getMenuItems, MENU_ITEMS } from './menu-config';

describe('menu-config peran C1', () => {
  it('staf pengumpulan/keuangan hanya melihat Persetujuan', () => {
    expect(getMenuItems('STAF_PENGUMPULAN').map((m) => m.path)).toEqual(['/dashboard/persetujuan']);
    expect(getMenuItems('STAF_KEUANGAN').map((m) => m.path)).toEqual(['/dashboard/persetujuan']);
  });

  it('admin ranting melihat Setoran Ranting (bukan Rekap MWC)', () => {
    const paths = getMenuItems('ADMIN_RANTING').map((m) => m.path);
    expect(paths).toContain('/dashboard/setoran');
    expect(paths).not.toContain('/dashboard/rekap-mwc');
  });

  it('admin kecamatan melihat Rekap MWC + menu lama', () => {
    const paths = getMenuItems('ADMIN_KECAMATAN').map((m) => m.path);
    expect(paths).toContain('/dashboard/rekap-mwc');
    expect(paths).toContain('/dashboard/overview');
    expect(paths).not.toContain('/dashboard/persetujuan');
    expect(paths).not.toContain('/dashboard/setoran');
  });

  it('semua item C1 punya ikon + path dashboard', () => {
    for (const m of MENU_ITEMS.filter((x) =>
      ['/dashboard/persetujuan', '/dashboard/setoran', '/dashboard/rekap-mwc'].includes(x.path),
    )) {
      expect(m.icon).toBeTruthy();
      expect(m.roles.length).toBeGreaterThan(0);
    }
  });
});
