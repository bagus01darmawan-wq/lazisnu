import {getErrorMessage} from '../../src/utils/error';

describe('getErrorMessage — pesan error jujur (tanpa fitnah penyebab)', () => {
  it('memetakan unduhan terputus (regresi blob-util) ke penjelasan jujur', () => {
    expect(getErrorMessage(new Error('Download interrupted.'))).toBe(
      'Unduhan terputus sebelum selesai — file tidak utuh.',
    );
  });

  it('memetakan kegagalan jaringan fetch ke fakta yang terbukti', () => {
    expect(getErrorMessage(new TypeError('Network request failed'))).toBe(
      'Koneksi jaringan bermasalah.',
    );
    expect(getErrorMessage(new TypeError('Failed to fetch'))).toBe('Koneksi jaringan bermasalah.');
  });

  it('memetakan status HTTP ke pesan yang jujur', () => {
    expect(getErrorMessage(new Error('HTTP 500'))).toBe('Server menjawab dengan status HTTP 500.');
  });

  it('memetakan timeout/abort ke fakta yang terbukti', () => {
    expect(getErrorMessage(new Error('Aborted'))).toBe('Waktu tunggu habis — server tidak merespons.');
    expect(getErrorMessage(new Error('timeout of 5000ms exceeded'))).toBe(
      'Waktu tunggu habis — server tidak merespons.',
    );
  });

  it('pesan tidak dikenal → diteruskan apa adanya (jujur, bukan fitnah)', () => {
    expect(getErrorMessage(new Error('disk full'))).toBe('disk full');
  });

  it('objek non-Error dengan message → dipakai', () => {
    expect(getErrorMessage({message: 'Bentuk respons tidak sesuai'})).toBe(
      'Bentuk respons tidak sesuai',
    );
  });

  it('tanpa informasi sama sekali → fallback netral (tidak menuduh)', () => {
    expect(getErrorMessage('jaringan putus')).toBe('Terjadi kesalahan');
    expect(getErrorMessage(undefined)).toBe('Terjadi kesalahan');
    expect(getErrorMessage(null)).toBe('Terjadi kesalahan');
    expect(getErrorMessage(new Error('   '))).toBe('Terjadi kesalahan');
    expect(getErrorMessage(null, 'Gagal mengunduh pembaruan')).toBe('Gagal mengunduh pembaruan');
  });

  it('pesan panjang dipotong agar tidak membanjiri UI', () => {
    const msg = getErrorMessage(new Error('x'.repeat(200)));
    expect(msg.length).toBeLessThanOrEqual(141);
    expect(msg.endsWith('…')).toBe(true);
  });
});
