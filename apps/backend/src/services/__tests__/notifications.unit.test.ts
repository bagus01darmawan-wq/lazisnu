/**
 * C1-T11 — template 7 event murni (tanpa DB/IO).
 */
import { buildNotifBody, type NotifTemplate } from '../notifications';

describe('C1-T11 template notifikasi', () => {
  const cases: Array<{ t: NotifTemplate; p: Record<string, string | number>; must: string[] }> = [
    { t: 'TUGAS_DIGENERATE', p: { count: 12, period: '2026-09', branch: 'Madendo' }, must: ['12', '2026-09', 'Madendo', '27'] },
    { t: 'APPROVE_DIMINTA', p: { branch: 'Madendo', period: '2026-09', count: 12 }, must: ['Madendo', '24 jam'] },
    { t: 'APPROVE_ESKALASI', p: { branch: 'Madendo', period: '2026-09' }, must: ['Madendo', '24 jam'] },
    { t: 'PENGINGAT_H3', p: { name: 'Ali', left: 5, period: '2026-09' }, must: ['Ali', '5', 'H-3'] },
    { t: 'MENDEKATI_KUNCI', p: { name: 'Ali', left: 2, period: '2026-09' }, must: ['Ali', 'tgl 10', 'UNCOLLECTED'] },
    { t: 'PPK_FINAL', p: { officer: 'Ali', period: '2026-09', total: 75000 }, must: ['Ali', 'FINAL'] },
    { t: 'REOPEN', p: { what: 'Setoran Ali', period: '2026-09', reason: 'ada susulan' }, must: ['48 jam', 'ada susulan'] },
    { t: 'SELISIH_BESAR', p: { branch: 'Madendo', period: '2026-09', variance: -58680, reason: 'KURANG_BAYAR' }, must: ['-58680', 'KURANG_BAYAR'] },
    { t: 'BA_SIAP', p: { what: 'Rekap Madendo', period: '2026-09' }, must: ['FINAL', 'Unduh'] },
  ];

  test.each(cases.map((c) => [c.t, c]))('%s memuat fakta kunci', (_t, c) => {
    const text = buildNotifBody(c.t, c.p);
    expect(text.title.length).toBeGreaterThan(0);
    for (const m of c.must) {
      expect(`${text.title} ${text.body}`).toContain(String(m));
    }
  });
});
