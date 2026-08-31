import {describe, expect, it} from 'vitest';
import {formatAuditAction, getProp} from './audit-log-formatters';

describe('getProp', () => {
  it('mengambil properti dengan fallback camelCase/snake_case', () => {
    expect(getProp({fullName: 'Ali'}, ['fullName', 'full_name'])).toBe('Ali');
    expect(getProp({full_name: 'Budi'}, ['fullName', 'full_name'])).toBe('Budi');
  });

  it('mengembalikan undefined bila kunci tidak ada atau objek invalid', () => {
    expect(getProp({}, ['fullName'])).toBeUndefined();
    expect(getProp(null, ['fullName'])).toBeUndefined();
  });
});

describe('formatAuditAction', () => {
  it('memetakan aksi autentikasi ke label Indonesia', () => {
    expect(formatAuditAction('LOGIN_SUCCESS')).toBe('Login Berhasil');
    expect(formatAuditAction('FAILED_LOGIN')).toBe('Login Gagal');
    expect(formatAuditAction('LOGOUT')).toBe('Logout');
  });

  it('memetakan mutasi POST ke label yang sesuai', () => {
    expect(formatAuditAction('POST /cans')).toBe('Menambahkan Kaleng');
    expect(formatAuditAction('POST /officers')).toBe('Menambahkan Petugas');
  });

  it('menangani aksi resubmit dan WA dengan substring', () => {
    expect(formatAuditAction('COLLECTIONS/RESUBMIT')).toBe('Koreksi Setoran');
    expect(formatAuditAction('WA/RETRY 123')).toBe('Jadwalkan Ulang Notifikasi');
  });
});
