/**
 * Unit test caseConverter — penopang migrasi Opsi A (respons API dibaca
 * camelCase di seluruh web). Menjaga tiga invariansi: nested/array ikut
 * terkonversi, key enum ALL_CAPS tidak tersentuh, nilai khusus aman.
 */
import { describe, expect, it } from 'vitest';
import { toCamelCase, toCamelKey } from '../caseConverter';

describe('toCamelKey', () => {
  it('mengubah snake_case menjadi camelCase', () => {
    expect(toCamelKey('assignment_total')).toBe('assignmentTotal');
    expect(toCamelKey('branch_id')).toBe('branchId');
    expect(toCamelKey('access_token')).toBe('accessToken');
  });

  it('tidak mengubah key tanpa underscore', () => {
    expect(toCamelKey('total')).toBe('total');
    expect(toCamelKey('name')).toBe('name');
  });

  it('tidak mengubah key enum ALL_CAPS (mis. map breakdown)', () => {
    expect(toCamelKey('NON_AKTIF')).toBe('NON_AKTIF');
    expect(toCamelKey('AKTIF')).toBe('AKTIF');
    expect(toCamelKey('DIKEMBALIKAN')).toBe('DIKEMBALIKAN');
  });
});

describe('toCamelCase', () => {
  it('mengonversi objek dangkal', () => {
    expect(toCamelCase({ branch_id: '1', full_name: 'A' })).toEqual({
      branchId: '1',
      fullName: 'A',
    });
  });

  it('mengonversi nested objek dan array (bentuk region-cards)', () => {
    const input = {
      assignment_total: 10,
      officer_count: 3,
      officers: [{ full_name: 'Ulan', is_active: false }],
      breakdown: { AKTIF: 5, NON_AKTIF: 1 },
    };
    expect(toCamelCase(input)).toEqual({
      assignmentTotal: 10,
      officerCount: 3,
      officers: [{ fullName: 'Ulan', isActive: false }],
      breakdown: { AKTIF: 5, NON_AKTIF: 1 },
    });
  });

  it('aman untuk null, primitif, dan Date', () => {
    expect(toCamelCase(null)).toBeNull();
    expect(toCamelCase(undefined)).toBeUndefined();
    expect(toCamelCase(42)).toBe(42);
    expect(toCamelCase('x')).toBe('x');
    const d = new Date();
    expect(toCamelCase(d)).toBe(d);
  });

  it('tidak mengubah array tingkat atas menjadi objek', () => {
    expect(toCamelCase([{ qr_code: 'Q1' }])).toEqual([{ qrCode: 'Q1' }]);
  });
});
