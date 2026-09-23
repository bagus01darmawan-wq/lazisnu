/**
 * F7/D-14 — Test terbilang rupiah (murni, tanpa DB).
 */
import { terbilangRupiah } from '../baTerbilang';

describe('terbilangRupiah', () => {
  test.each([
    [0, 'Nol Rupiah'],
    [1, 'Satu Rupiah'],
    [10, 'Sepuluh Rupiah'],
    [11, 'Sebelas Rupiah'],
    [15, 'Lima Belas Rupiah'],
    [21, 'Dua Puluh Satu Rupiah'],
    [100, 'Seratus Rupiah'],
    [101, 'Seratus Satu Rupiah'],
    [1000, 'Seribu Rupiah'],
    [2000, 'Dua Ribu Rupiah'],
    [86000, 'Delapan Puluh Enam Ribu Rupiah'],
    [608000, 'Enam Ratus Delapan Ribu Rupiah'],
    [5600700, 'Lima Juta Enam Ratus Ribu Tujuh Ratus Rupiah'],
    [75000, 'Tujuh Puluh Lima Ribu Rupiah'],
    [1000000, 'Satu Juta Rupiah'],
    [234450, 'Dua Ratus Tiga Puluh Empat Ribu Empat Ratus Lima Puluh Rupiah'],
  ])('nominal %i → %s', (n, expected) => {
    expect(terbilangRupiah(n)).toBe(expected);
  });

  test('bigint + batas', () => {
    expect(terbilangRupiah(BigInt(50000))).toBe('Lima Puluh Ribu Rupiah');
    expect(() => terbilangRupiah(-1)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(() => terbilangRupiah(1_000_000_000_000_000)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
});
