import {
  formatCurrency,
  formatInputCurrency,
  formatDate,
  formatPeriod,
} from '../../src/utils/format';

describe('format utils', () => {
  describe('formatCurrency', () => {
    it('formats numbers to Indonesian Rupiah currency format', () => {
      const result = formatCurrency(50000);
      expect(result).toMatch(/Rp\s*50\.000/);
    });

    it('handles zero nominal correctly', () => {
      const result = formatCurrency(0);
      expect(result).toMatch(/Rp\s*0/);
    });

    it('handles millions correctly without decimal places', () => {
      const result = formatCurrency(10000000);
      expect(result).toMatch(/Rp\s*10\.000\.000/);
    });

    it('handles NaN or invalid input safely by returning Rp 0', () => {
      const result = formatCurrency(NaN);
      expect(result).toMatch(/Rp\s*0/);
      // @ts-expect-error test invalid string input
      expect(formatCurrency('abc')).toMatch(/Rp\s*0/);
    });

    it('handles negative numbers properly', () => {
      const result = formatCurrency(-50000);
      expect(result).toMatch(/-.*Rp\s*50\.000|Rp\s*-50\.000/);
    });
  });

  describe('formatInputCurrency', () => {
    it('formats raw string numbers with thousand dots', () => {
      expect(formatInputCurrency('10000')).toBe('10.000');
      expect(formatInputCurrency('10000000')).toBe('10.000.000');
    });

    it('formats raw numbers with thousand dots', () => {
      expect(formatInputCurrency(25000)).toBe('25.000');
      expect(formatInputCurrency(NaN)).toBe('');
    });

    it('strips non-digit characters from input string', () => {
      expect(formatInputCurrency('Rp 25.000')).toBe('25.000');
      expect(formatInputCurrency('abc 123 def 456')).toBe('123.456');
    });

    it('returns empty string for empty input or zero string', () => {
      expect(formatInputCurrency('')).toBe('');
      expect(formatInputCurrency('abc')).toBe('');
    });
  });

  describe('formatDate', () => {
    it('formats valid ISO date string to Indonesian format', () => {
      const isoDate = '2026-08-22T14:30:00.000Z';
      const formatted = formatDate(isoDate);
      expect(formatted).toBeTruthy();
      expect(formatted).toContain('2026');
    });

    it('formats Date instance and timestamp number correctly', () => {
      const dateObj = new Date(2026, 7, 23, 10, 0);
      expect(formatDate(dateObj)).toContain('2026');
      expect(formatDate(dateObj.getTime())).toContain('2026');
    });

    it('supports custom formatting options', () => {
      const dateObj = new Date(2026, 7, 23);
      const formatted = formatDate(dateObj, {month: 'long', year: 'numeric'});
      expect(formatted).toContain('Agustus');
      expect(formatted).toContain('2026');
    });

    it('returns empty string for invalid or falsy date', () => {
      expect(formatDate('')).toBe('');
      expect(formatDate('invalid-date')).toBe('');
      // @ts-expect-error test null input
      expect(formatDate(null)).toBe('');
    });
  });

  describe('formatPeriod', () => {
    it('formats YYYY-MM period string to Indonesian month and year', () => {
      const result = formatPeriod('2026-08');
      expect(result).toContain('Agustus');
      expect(result).toContain('2026');
    });

    it('formats different months correctly', () => {
      expect(formatPeriod('2026-01')).toContain('Januari');
      expect(formatPeriod('2026-12')).toContain('Desember');
    });

    it('returns empty string for empty input', () => {
      expect(formatPeriod('')).toBe('');
    });

    it('returns original string if format is not YYYY-MM', () => {
      expect(formatPeriod('invalid-period')).toBe('invalid-period');
      expect(formatPeriod('2026/08')).toBe('2026/08');
    });
  });
});
