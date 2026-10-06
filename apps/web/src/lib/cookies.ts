import { NextRequest } from 'next/server';

/**
 * Cookie `Secure` hanya boleh dipasang bila koneksi HTTPS — browser menolak
 * menyimpan cookie Secure lewat HTTP biasa (kecuali localhost yang dianggap
 * trustworthy). Flag berbasis NODE_ENV merusak preview LAN (HP via IP) pada
 * build production: login API sukses tetapi sesi tak tersimpan, lalu
 * middleware memantulkan ke /login rute yang sama tanpa pesan.
 */
export function shouldSecureCookie(request?: NextRequest): boolean {
  if (typeof window !== 'undefined') {
    return window.location.protocol === 'https:';
  }
  if (request) {
    const proto = request.headers.get('x-forwarded-proto');
    if (proto === 'https') return true;
    if (proto === 'http') return false;
    const host = (
      request.headers.get('x-forwarded-host') ??
      request.headers.get('host') ??
      ''
    ).split(':')[0];
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))(\.|$)/.test(host)
    ) {
      return false;
    }
  }
  return process.env.NODE_ENV === 'production';
}
