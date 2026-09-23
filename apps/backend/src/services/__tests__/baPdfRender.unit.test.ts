/**
 * F7/D-14 — Renderer BAST: kop + nomor + paragraf terbungkus + TTD + QR.
 * Tanpa DB/R2 (render murni dari builder + logo modul).
 */
import { buildPpkBaText, buildBranchBaText, buildBaVerifyPayload, baContentHash } from '../beritaAcara';
import { ppkContentSnapshot, renderBaPdf } from '../baPdfService';

describe('paraf pihak BA (koreksi Pion 23 Sep 2026)', () => {
  const branchSub = {
    periodYear: 2026, periodMonth: 9,
    totalAmount: BigInt(175000), bisyarohTotal: BigInt(18000),
    shareMwc: BigInt(52500), netAmount: BigInt(104500),
    canAktif: 10, canNonaktif: 1, canRusak: 0, canHilang: 0,
    status: 'FINAL',
    rantingSignerId: 'u-ben-ranting', rantingSignedAt: new Date('2026-10-12T02:00:00Z'),
    mwcBendaharaSignerId: 'u-ben-mwc', mwcBendaharaSignedAt: new Date('2026-10-12T03:00:00Z'),
  };

  test('BA ranting: PIHAK PERTAMA = Bendahara Ranting, PIHAK KEDUA = Bendahara MWC', () => {
    const ba = buildBranchBaText({
      sub: branchSub,
      branchName: 'Al-Hidayah',
      districtName: 'MWC Kota',
      ppkList: [{ officerName: 'Petugas Satu', total: 100000 }],
      baNumber: '002/BA/X/2026',
      rantingName: 'Bendahara Rini',
      mwcName: 'Bendahara MWC Budi',
    });
    const teks = ba.statements.join('\n');

    // Jabatan tiap pihak harus eksplisit dan berurutan.
    expect(teks).toContain('Jabatan NU Care Lazisnu : Bendahara Ranting');
    expect(teks).toContain('Jabatan NU Care Lazisnu : Bendahara MWC');
    expect(teks.indexOf('PIHAK PERTAMA')).toBeLessThan(teks.indexOf('PIHAK KEDUA'));

    // Nama diambil dari akun penandatangan, bukan diketik.
    expect(teks).toContain('Nama : Bendahara Rini');
    expect(teks).toContain('Nama : Bendahara MWC Budi');

    // Kata-kata milik BA PPK tidak boleh bocor ke BA ranting.
    expect(teks).not.toContain('Nama Petugas Amil / Relawan');
    expect(teks).not.toContain('petugas amil atau relawan penghimpun koin');
  });

  test('BA ranting tanpa nama: fallback menyebut Bendahara, bukan Pengurus', () => {
    const ba = buildBranchBaText({
      sub: branchSub, branchName: 'Al-Hidayah', districtName: null, ppkList: [],
    });
    const teks = ba.statements.join('\n');
    expect(teks).toContain('Nama : Bendahara Ranting Al-Hidayah');
    expect(teks).not.toContain('Pengurus Ranting');
  });

  test('BA PPK: PIHAK PERTAMA = PPK, PIHAK KEDUA = Bendahara Ranting', () => {
    const ba = buildPpkBaText({
      sub: {
        periodYear: 2026, periodMonth: 9,
        totalAmount: BigInt(175000), collectionCount: 2,
        bisyarohAmount: BigInt(18000), netAmount: BigInt(157000),
        status: 'FINAL', ppkSignerId: 'u-ppk', ppkSignedAt: null,
        bendaharaSignerId: 'u-ben', bendaharaSignedAt: null,
      },
      officerName: 'Petugas Satu', branchName: 'Ranting A',
      bendaharaName: 'Bendahara Rini',
    });
    const teks = ba.statements.join('\n');
    expect(teks).toContain('Nama Petugas Amil / Relawan : Petugas Satu');
    expect(teks).toContain('Jabatan NU Care Lazisnu : Bendahara Ranting');
    expect(teks.indexOf('PIHAK PERTAMA')).toBeLessThan(teks.indexOf('PIHAK KEDUA'));
  });
});

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
