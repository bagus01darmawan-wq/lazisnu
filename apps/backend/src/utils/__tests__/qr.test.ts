import { signQRCode, verifyQRCode } from '../qr';

describe('QR Code utility', () => {
  const qrCode = 'LAZ-JKT-00001-123';

  describe('signQRCode', () => {
    it('menghasilkan token dengan format signature.qr_code', () => {
      const token = signQRCode(qrCode);
      expect(token).toContain('.');
      const parts = token.split('.');
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBe(32);
      expect(parts[1]).toBe(qrCode);
    });

    it('menghasilkan signature berbeda untuk QR code berbeda', () => {
      const t1 = signQRCode('LAZ-JKT-00001');
      const t2 = signQRCode('LAZ-JKT-00002');
      expect(t1).not.toBe(t2);
      expect(t1.split('.')[0]).not.toBe(t2.split('.')[0]);
    });

    it('signature konsisten untuk input yang sama', () => {
      const t1 = signQRCode(qrCode);
      const t2 = signQRCode(qrCode);
      expect(t1).toBe(t2);
    });
  });

  describe('verifyQRCode', () => {
    it('mengembalikan qr_code asli dari token valid', () => {
      const token = signQRCode(qrCode);
      const result = verifyQRCode(token);
      expect(result).toBe(qrCode);
    });

    it('return null untuk token yang dimodifikasi', () => {
      const token = signQRCode(qrCode);
      const [sig, code] = token.split('.');
      const tampered = `${sig}.LAZ-JKT-00002-FAKE`;
      expect(verifyQRCode(tampered)).toBeNull();
    });

    it('return null untuk token tanpa titik', () => {
      expect(verifyQRCode('notatoken')).toBeNull();
    });

    it('return null untuk token kosong', () => {
      expect(verifyQRCode('')).toBeNull();
    });

    it('return null untuk token dengan signature dimodifikasi', () => {
      const token = signQRCode(qrCode);
      const [, code] = token.split('.');
      const tamperedSig = '0'.repeat(32) + '.' + code;
      expect(verifyQRCode(tamperedSig)).toBeNull();
    });

    it('return null untuk token dengan signature lebih pendek', () => {
      const [, code] = signQRCode(qrCode).split('.');
      expect(verifyQRCode(`short.${code}`)).toBeNull();
    });
  });
});
