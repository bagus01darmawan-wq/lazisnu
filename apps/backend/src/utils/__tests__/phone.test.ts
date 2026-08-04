import { normalizePhoneTo62, getPhoneLookupVariants } from '../phone';

describe('normalizePhoneTo62', () => {
  it('konversi prefix 0 ke 62', () => {
    expect(normalizePhoneTo62('082134536151')).toBe('6282134536151');
  });

  it('pertahankan format 62 yang sudah benar', () => {
    expect(normalizePhoneTo62('6282134536151')).toBe('6282134536151');
  });

  it('buang karakter non-digit', () => {
    expect(normalizePhoneTo62('+62 821-3453-6151')).toBe('6282134536151');
  });

  it('tambah 62 untuk nomor tanpa prefix', () => {
    expect(normalizePhoneTo62('82134536151')).toBe('6282134536151');
  });
});

describe('getPhoneLookupVariants', () => {
  it('format 08xx menghasilkan varian 08 + 62', () => {
    const variants = getPhoneLookupVariants('082134536151');
    expect(variants).toContain('082134536151');
    expect(variants).toContain('6282134536151');
  });

  it('format 62xx menghasilkan varian 62 + 08', () => {
    const variants = getPhoneLookupVariants('6282134536151');
    expect(variants).toContain('6282134536151');
    expect(variants).toContain('082134536151');
  });

  it('nomor dummy tanpa prefix tetap dicocokkan apa adanya', () => {
    const variants = getPhoneLookupVariants('454545454545');
    expect(variants[0]).toBe('454545454545');
    expect(variants.length).toBeGreaterThanOrEqual(1);
  });
});
