import {
  resolveSessionAction,
  sessionExpiredMessage,
} from './authSessionPolicy';

describe('authSessionPolicy — kode error → aksi sesi', () => {
  it.each([
    'REFRESH_REVOKED',
    'ACCOUNT_DISABLED',
    'OFFICER_DISABLED',
  ])('kode penolakan bisnis %s → logout', code => {
    expect(resolveSessionAction(code)).toBe('logout');
  });

  it.each([
    'INVALID_TOKEN', // token invalid sesaat — tidak boleh menghapus sesi lokal
    'NETWORK_ERROR',
    'UNKNOWN_ERROR',
    'SERVICE_UNAVAILABLE',
    undefined,
    null,
    '',
  ])('kode non-bisnis %p → keep (tetap login)', code => {
    expect(resolveSessionAction(code as string | null | undefined)).toBe('keep');
  });
});

describe('authSessionPolicy — pesan UX spesifik', () => {
  it('pesan per kode tidak lagi generik', () => {
    expect(sessionExpiredMessage('ACCOUNT_DISABLED')).toMatch(/dinonaktifkan admin/i);
    expect(sessionExpiredMessage('OFFICER_DISABLED')).toMatch(/petugas/i);
    expect(sessionExpiredMessage('REFRESH_REVOKED')).toMatch(/dicabut/i);
  });

  it('fallback generik untuk kode tak dikenal', () => {
    expect(sessionExpiredMessage(undefined)).toMatch(/Sesi telah berakhir/i);
    expect(sessionExpiredMessage('APAPUN')).toMatch(/Sesi telah berakhir/i);
  });
});
