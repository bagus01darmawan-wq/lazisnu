import { buildDraftLockError, type DraftLockInfo } from '../canDraftLock';
import { ErrorCode } from '../../utils/errorCatalog';

function lock(
  canId: string,
  periodMonth: number,
  status: 'DRAFT' | 'APPROVED',
  periodYear = 2026,
): DraftLockInfo {
  return { canId, periodYear, periodMonth, status };
}

describe('buildDraftLockError — tidak menahan', () => {
  it('tanpa baris draft → null (hapus permanen boleh lanjut)', () => {
    expect(buildDraftLockError([])).toBeNull();
    expect(buildDraftLockError([], 5)).toBeNull();
  });
});

describe('buildDraftLockError — hapus satu kaleng', () => {
  it('draft belum disetujui: sebut periode + suruh keluarkan dari draft', () => {
    const err = buildDraftLockError([lock('can-1', 10, 'DRAFT')]);

    expect(err).not.toBeNull();
    expect(err!.statusCode).toBe(409);
    expect(err!.code).toBe(ErrorCode.CAN_IN_PERIOD_DRAFT);
    expect(err!.message).toContain('2026-10');
    expect(err!.message).toContain('belum disetujui');
    expect(err!.message).toContain('Staf Bidang Pengumpulan');
  });

  it('draft sudah disetujui: TIDAK menyuruh mengeluarkan dari draft (mustahil)', () => {
    const err = buildDraftLockError([lock('can-1', 10, 'APPROVED')]);

    expect(err).not.toBeNull();
    expect(err!.statusCode).toBe(409);
    expect(err!.message).toContain('sudah disetujui');
    expect(err!.message).toContain('tidak bisa dihapus permanen');
    expect(err!.message).not.toContain('Minta Staf Bidang Pengumpulan');
  });

  it('campuran DRAFT + APPROVED: yang disetujui yang menentukan kalimatnya', () => {
    const err = buildDraftLockError([
      lock('can-1', 9, 'APPROVED'),
      lock('can-1', 10, 'DRAFT'),
    ]);

    expect(err!.message).toContain('2026-09, 2026-10');
    expect(err!.message).toContain('sudah disetujui');
  });
});

describe('buildDraftLockError — hapus massal', () => {
  it('sebut berapa dari berapa yang terblokir', () => {
    const err = buildDraftLockError(
      [lock('can-1', 10, 'DRAFT'), lock('can-2', 10, 'DRAFT'), lock('can-3', 9, 'DRAFT')],
      5,
    );

    expect(err).not.toBeNull();
    expect(err!.statusCode).toBe(409);
    expect(err!.message).toContain('3 dari 5');
    expect(err!.message).toContain('2026-09, 2026-10');
  });

  it('tidak membocorkan nama pemilik (id dari klien belum tentu milik rantingnya)', () => {
    const err = buildDraftLockError([lock('can-1', 10, 'DRAFT')], 2);

    expect(err!.message).not.toMatch(/pemilik|nama/i);
  });

  it('ada draft yang sudah disetujui → disebut terpisah', () => {
    const err = buildDraftLockError(
      [lock('can-1', 9, 'APPROVED'), lock('can-2', 10, 'DRAFT')],
      4,
    );

    expect(err!.message).toContain('2 dari 4');
    expect(err!.message).toContain('Draft 2026-09 sudah disetujui');
  });

  it('tanpa draft yang disetujui → sarankan hapus satu per satu', () => {
    const err = buildDraftLockError([lock('can-1', 10, 'DRAFT')], 3);

    expect(err!.message).toContain('satu per satu');
    expect(err!.message).not.toContain('sudah disetujui');
  });
});

describe('buildDraftLockError — periode panjang dipotong', () => {
  it('lebih dari tiga periode: tampil tiga + sisa jumlahnya', () => {
    const err = buildDraftLockError([
      lock('can-1', 7, 'DRAFT'),
      lock('can-1', 8, 'DRAFT'),
      lock('can-1', 9, 'DRAFT'),
      lock('can-1', 10, 'DRAFT'),
      lock('can-1', 11, 'DRAFT'),
    ]);

    expect(err!.message).toContain('2026-07, 2026-08, 2026-09');
    expect(err!.message).toContain('(+2 periode lain)');
  });

  it('periode ganda tidak diulang', () => {
    const err = buildDraftLockError([
      lock('can-1', 10, 'DRAFT'),
      lock('can-2', 10, 'DRAFT'),
    ]);

    expect(err!.message.match(/2026-10/g)).toHaveLength(1);
  });
});
