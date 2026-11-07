import {matchesTaskQuery} from '../../src/utils/taskSearch';

const task = {
  owner_name: 'Ayam Kremes',
  owner_address: 'Jl. Merdeka No. 10',
  qr_code: 'LAZ-PNG-25-00009-533',
  dukuh_name: 'BOJONGIRENG',
  rt: '001',
  rw: '002',
};

describe('matchesTaskQuery', () => {
  it('mencocokkan nama, alamat, dan kode QR', () => {
    expect(matchesTaskQuery(task, 'ayam')).toBe(true);
    expect(matchesTaskQuery(task, 'merdeka')).toBe(true);
    expect(matchesTaskQuery(task, '00009')).toBe(true);
  });

  it('mencocokkan Dukuh dan RT/RW', () => {
    expect(matchesTaskQuery(task, 'bojongireng')).toBe(true);
    expect(matchesTaskQuery(task, 'rt 001')).toBe(true);
    expect(matchesTaskQuery(task, 'rw 002')).toBe(true);
    expect(matchesTaskQuery(task, 'bojongireng · rt 001 / rw 002')).toBe(true);
  });

  it('mengembalikan true untuk query kosong', () => {
    expect(matchesTaskQuery(task, '')).toBe(true);
    expect(matchesTaskQuery(task, '   ')).toBe(true);
  });

  it('tidak mencocokkan teks yang tidak ada', () => {
    expect(matchesTaskQuery(task, 'kecamatan lain')).toBe(false);
  });
});
