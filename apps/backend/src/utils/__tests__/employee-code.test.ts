import { buildNextEmployeeCode } from '../employee-code';

describe('buildNextEmployeeCode', () => {
  it('mulai dari 0001 saat ranting belum punya petugas', () => {
    expect(buildNextEmployeeCode('PNG-01', [])).toBe('PNG-01-0001');
  });

  it('melanjutkan nomor berurutan', () => {
    expect(buildNextEmployeeCode('PNG-05', ['PNG-05-0001', 'PNG-05-0002'])).toBe('PNG-05-0003');
  });

  it('memakai nomor terakhir, bukan jumlah petugas, saat ada celah', () => {
    // Regresi: dua petugas dengan kode 0002 & 0003 → jumlah 2 → pola lama
    // menghasilkan PNG-01-0003 yang sudah dipakai (unique constraint gagal).
    const codes = ['PNG-01-0002', 'PNG-01-0003'];

    expect(buildNextEmployeeCode('PNG-01', codes)).toBe('PNG-01-0004');
    expect(codes).not.toContain(buildNextEmployeeCode('PNG-01', codes));
  });

  it('aman saat hanya tersisa satu kode', () => {
    expect(buildNextEmployeeCode('PNG-02', ['PNG-02-0002'])).toBe('PNG-02-0003');
  });

  it('mengabaikan kode milik ranting lain', () => {
    expect(buildNextEmployeeCode('PNG-05', ['PNG-04-0009', 'PNG-05-0001'])).toBe('PNG-05-0002');
  });

  it('mengabaikan kode lama yang suffix-nya bukan angka', () => {
    expect(buildNextEmployeeCode('PNG-06', ['PNG-06-0003', 'PNG-06-LEGACY'])).toBe('PNG-06-0004');
  });

  it('memakai prefix XX saat kode ranting kosong', () => {
    expect(buildNextEmployeeCode(null, ['XX-0004'])).toBe('XX-0005');
    expect(buildNextEmployeeCode('', [])).toBe('XX-0001');
  });

  it('tetap 4 digit sampai 9999, lalu melebar tanpa terpotong', () => {
    expect(buildNextEmployeeCode('PNG-03', ['PNG-03-0999'])).toBe('PNG-03-1000');
    expect(buildNextEmployeeCode('PNG-03', ['PNG-03-9999'])).toBe('PNG-03-10000');
  });
});
