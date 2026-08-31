import {describe, expect, it} from 'vitest';
import {cleanBranchName} from './formatters';

describe('cleanBranchName', () => {
  it('menghapus kata Ranting dan spasi sisa', () => {
    expect(cleanBranchName('Ranting Sukamaju')).toBe('Sukamaju');
    expect(cleanBranchName('RANTING Margorejo')).toBe('Margorejo');
    expect(cleanBranchName('ranting Wetan')).toBe('Wetan');
  });

  it('menangani nama tanpa kata Ranting', () => {
    expect(cleanBranchName('Sukamaju')).toBe('Sukamaju');
  });

  it('mengembalikan N/A untuk nilai kosong', () => {
    expect(cleanBranchName(undefined)).toBe('N/A');
    expect(cleanBranchName('')).toBe('N/A');
  });
});
