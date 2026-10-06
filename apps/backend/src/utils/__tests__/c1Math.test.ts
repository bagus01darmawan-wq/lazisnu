import { ceil1000, calcBisyaroh, calcExpectedShare, calcShareVariance, needsVarianceReason } from '../c1Math';

describe('C1-T0 rumus terkunci (§8 + B-3)', () => {
  test('ceil1000: 86.750 → 87.000', () => {
    expect(ceil1000(86750)).toBe(87000);
  });

  test('Madendo: total 867.500 → bisyaroh 87.000 (10% ceil ribuan)', () => {
    expect(calcBisyaroh(867500)).toBe(87000);
  });

  test('Madendo rumus baru: ekspektasi = 30% × (867.500 − 87.000) = 234.150', () => {
    expect(calcExpectedShare(867500, 87000)).toBe(234150);
  });

  test('Pan. Barat: sisa 5.600.700 × 30% = 1.680.210', () => {
    // total − bisyaroh = sisa 5.600.700 (angka dokumen §8)
    expect(calcExpectedShare(5600700, 0)).toBe(1680210);
  });

  test('selisih butuh alasan bila |selisih| > 10.000', () => {
    expect(needsVarianceReason(calcShareVariance(1675000, 1680210))).toBe(false); // −5.210 hijau
    expect(needsVarianceReason(-58680)).toBe(true); // Rowadi wajib alasan
    expect(needsVarianceReason(105555)).toBe(true); // Lambanggelun wajib alasan
  });
});
