import {getErrorMessage} from '../../src/utils/error';

describe('getErrorMessage (utils/error.ts)', () => {
  it('mengembalikan message dari instance Error', () => {
    expect(getErrorMessage(new Error('Gagal memuat'))).toBe('Gagal memuat');
  });

  it('mengembalikan message dari objek non-Error yang memiliki field message string', () => {
    expect(getErrorMessage({message: 'respons server'})).toBe('respons server');
  });

  it('mengembalikan fallback bawaan untuk nilai tanpa message', () => {
    expect(getErrorMessage('string biasa')).toBe('Terjadi kesalahan');
    expect(getErrorMessage(42)).toBe('Terjadi kesalahan');
    expect(getErrorMessage(null)).toBe('Terjadi kesalahan');
    expect(getErrorMessage(undefined)).toBe('Terjadi kesalahan');
  });

  it('menghormati fallback kustom dari caller', () => {
    expect(getErrorMessage(undefined, 'Fallback kustom')).toBe('Fallback kustom');
  });

  it('mengabaikan field message yang bukan string', () => {
    expect(getErrorMessage({message: 123})).toBe('Terjadi kesalahan');
  });
});
