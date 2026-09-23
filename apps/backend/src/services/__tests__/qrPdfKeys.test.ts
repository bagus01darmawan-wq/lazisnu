/**
 * Regresi key R2 label QR — **key tidak boleh bergantung waktu**.
 *
 * Bug 23 Sep 2026: key memuat `Date.now()` sehingga setiap "Generate QR" membuat
 * objek R2 baru yang tidak pernah dihapus → bucket menumpuk selamanya.
 * Uji di bawah mengunci sifat deterministik itu supaya tidak kembali.
 */
import { qrPdfKey, qrBatchPdfKey, QR_PDF_PREFIX } from '../qrPdfKeys';

/** Jalankan `fn` dengan Date.now() yang dibekukan, lalu kembalikan hasilnya. */
function withFrozenNow<T>(epochMs: number, fn: () => T): T {
  const realNow = Date.now;
  try {
    Date.now = () => epochMs;
    return fn();
  } finally {
    Date.now = realNow;
  }
}

describe('qrPdfKey', () => {
  test('deterministik: panggilan berulang menghasilkan key sama', () => {
    expect(qrPdfKey('R001', 'QR-ABC')).toBe(qrPdfKey('R001', 'QR-ABC'));
    expect(qrPdfKey('R001', 'QR-ABC')).toBe('qr-pdfs/R001/qr-QR-ABC.pdf');
  });

  test('key tidak berubah walau waktu berubah (anti-regresi timestamp)', () => {
    const a = withFrozenNow(1_700_000_000_000, () => qrPdfKey('R001', 'QR-ABC'));
    const b = withFrozenNow(1_900_000_000_000, () => qrPdfKey('R001', 'QR-ABC'));
    expect(a).toBe(b);
  });

  test('tidak memuat epoch milidetik', () => {
    expect(qrPdfKey('R001', 'QR-ABC')).not.toMatch(/\d{13}/);
  });

  test('berbeda per ranting dan per nomor QR', () => {
    expect(qrPdfKey('R001', 'QR-A')).not.toBe(qrPdfKey('R002', 'QR-A'));
    expect(qrPdfKey('R001', 'QR-A')).not.toBe(qrPdfKey('R001', 'QR-B'));
  });

  test('berada di bawah prefix qr-pdfs/', () => {
    expect(qrPdfKey('R001', 'QR-A').startsWith(QR_PDF_PREFIX)).toBe(true);
  });
});

describe('qrBatchPdfKey', () => {
  test('deterministik dan tidak bergantung urutan pilihan', () => {
    expect(qrBatchPdfKey('R001', ['QR-B', 'QR-A']))
      .toBe(qrBatchPdfKey('R001', ['QR-A', 'QR-B']));
  });

  test('key tidak berubah walau waktu berubah (anti-regresi timestamp)', () => {
    const a = withFrozenNow(1_700_000_000_000, () => qrBatchPdfKey('R001', ['QR-A']));
    const b = withFrozenNow(1_900_000_000_000, () => qrBatchPdfKey('R001', ['QR-A']));
    expect(a).toBe(b);
  });

  test('pilihan berbeda menghasilkan key berbeda', () => {
    expect(qrBatchPdfKey('R001', ['QR-A']))
      .not.toBe(qrBatchPdfKey('R001', ['QR-A', 'QR-B']));
  });

  test('berada di subfolder batch di bawah prefix qr-pdfs/', () => {
    const key = qrBatchPdfKey('R001', ['QR-A']);
    expect(key.startsWith(QR_PDF_PREFIX)).toBe(true);
    expect(key).toContain('/batch/');
    expect(key).not.toMatch(/\d{13}/);
  });
});
