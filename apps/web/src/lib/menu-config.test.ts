import { describe, it, expect } from 'vitest';
import { getMenuItems, MENU_ITEMS } from './menu-config';

describe('menu-config peran C1', () => {
  it('staf pengumpulan/keuangan hanya melihat Persetujuan', () => {
    expect(getMenuItems('STAF_PENGUMPULAN').map((m) => m.path)).toEqual(['/dashboard/persetujuan']);
    expect(getMenuItems('STAF_KEUANGAN').map((m) => m.path)).toEqual(['/dashboard/persetujuan']);
  });

  it('admin ranting melihat Berita Acara (bukan Rekap MWC)', () => {
    const paths = getMenuItems('ADMIN_RANTING').map((m) => m.path);
    expect(paths).toContain('/dashboard/setoran');
    expect(paths).not.toContain('/dashboard/rekap-mwc');
  });

  it('admin kecamatan (MWC) ikut melihat laporan Berita Acara', () => {
    const paths = getMenuItems('ADMIN_KECAMATAN').map((m) => m.path);
    expect(paths).toContain('/dashboard/rekap-mwc');
    expect(paths).toContain('/dashboard/overview');
    expect(paths).not.toContain('/dashboard/persetujuan');
    // Koreksi Pion 23 Sep 2026: halaman /dashboard/setoran kini laporan
    // baca-saja "BA sudah diterbitkan", jadi MWC juga berhak melihatnya.
    expect(paths).toContain('/dashboard/setoran');
  });

  it('staf keuangan TIDAK melihat halaman BA web — dia tanda tangan di mobile', () => {
    // Bendahara Ranting = STAF_KEUANGAN bercakupan ranting; tanda tangan BA
    // ranting dilakukan di aplikasi mobile (tab Keuangan), bukan di web.
    expect(getMenuItems('STAF_KEUANGAN').map((m) => m.path)).not.toContain('/dashboard/setoran');
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
