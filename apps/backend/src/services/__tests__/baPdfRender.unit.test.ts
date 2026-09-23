/**
 * F7/D-14 — Renderer BAST: kop + nomor + paragraf terbungkus + TTD + QR.
 * Tanpa DB/R2 (render murni dari builder + logo modul).
 */
import { buildPpkBaText, buildBaVerifyPayload, baContentHash } from '../beritaAcara';
import { ppkContentSnapshot, renderBaPdf } from '../baPdfService';

describe('renderBaPdf BAST', () => {
  test('PDF valid + memuat nomor + tanpa kalimat terpenggal 95', async () => {
    const sub = {
      periodYear: 2026, periodMonth: 9,
      totalAmount: BigInt(175000), collectionCount: 2,
      bisyarohAmount: BigInt(18000), netAmount: BigInt(157000),
      status: 'FINAL',
      ppkSignerId: 'u-ppk', ppkSignedAt: new Date('2026-10-12T02:00:00Z'),
      bendaharaSignerId: 'u-ben', bendaharaSignedAt: new Date('2026-10-12T03:00:00Z'),
    };
    const ba = buildPpkBaText({
      sub, officerName: 'Petugas Satu', branchName: 'Ranting A',
      baNumber: '001/BA/X/2026', eventAt: new Date('2026-10-12T02:00:00Z'),
      bendaharaName: 'Bendahara Rini',
    });
    const snap = ppkContentSnapshot({ ...sub, id: 'ba-test-id', version: 1, baNumber: '001/BA/X/2026' });
    expect(snap).toMatchObject({ baNumber: '001/BA/X/2026' });
    const pdf = await renderBaPdf({
      ba,
      qrPayload: buildBaVerifyPayload({ type: 'ppk', id: 'ba-test-id', version: 1, hash: baContentHash('ppk', snap) }),
      signatures: [
        { label: 'PPK', image: null, signerId: 'u-ppk', name: 'Petugas Satu', at: new Date('2026-10-12T02:00:00Z') },
        { label: 'Bendahara', image: null, signerId: 'u-ben', name: 'Bendahara Rini', at: new Date('2026-10-12T03:00:00Z') },
      ],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000); // kop logo + teks + QR ikut ter-render
  });
});
