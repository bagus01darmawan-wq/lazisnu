import { isValidQRCode } from '../qr';

describe('isValidQRCode', () => {
  it('menerima qr_code mentah dengan format resmi', () => {
    expect(isValidQRCode('LAZ-PNG-25-00004-952')).toBe(true);
  });

  it.each([
    '',
    'laz-png-25-00004-952',
    ' LAZ-PNG-25-00004-952',
    'LAZ-PNG-25-00004-952 ',
    'signature.LAZ-PNG-25-00004-952',
    'PNG-25-00004-952',
    'LAZ_PNG_25_00004_952',
  ])('menolak format yang tidak exact-match: %s', (value) => {
    expect(isValidQRCode(value)).toBe(false);
  });

  it('menolak kode yang melebihi panjang kolom database', () => {
    expect(isValidQRCode(`LAZ-${'A'.repeat(47)}`)).toBe(false);
  });
});
