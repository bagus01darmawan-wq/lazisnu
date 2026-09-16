/**
 * Tes untuk `assertCanAccess` — satu-satunya aturan kepemilikan kaleng.
 *
 * Dipakai oleh rute admin (getCanDetail/updateCan/deleteCan/canProposals) dan
 * rute mobile (POST /mobile/cans/:canId/visits).
 *
 * Sebelum perbaikan ini, role PETUGAS lolos tanpa pemeriksaan — cabang
 * `ADMIN_RANTING`/`ADMIN_KECAMATAN` saja yang ada. Akibatnya endpoint visits
 * bisa mengubah status kaleng di luar wilayah petugas. Tes ini menjaga agar
 * cabang PETUGAS tidak pernah dihapus lagi.
 */
import { assertCanAccess } from '../canService';

// Hanya query branches pada cabang ADMIN_KECAMATAN yang memakai DB.
jest.mock('../../config/database', () => ({
  db: {
    query: {
      branches: {
        // Default: ranting milik kecamatan token. Tiap tes bisa override.
        findFirst: jest.fn().mockResolvedValue({ districtId: 'district-A' }),
      },
    },
  },
}));

const BRANCH_SENDIRI = 'branch-petinggaran';
const BRANCH_LAIN = 'branch-desa-lain';

describe('assertCanAccess — pintu kepemilikan kaleng', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('PETUGAS diizinkan pada kaleng di rantingnya sendiri', async () => {
    await expect(
      assertCanAccess(
        { userId: 'u1', role: 'PETUGAS', officerId: 'off-1', branchId: BRANCH_SENDIRI },
        { branchId: BRANCH_SENDIRI },
      ),
    ).resolves.toBeUndefined();
  });

  it('PETUGAS DITOLAK pada kaleng di ranting lain (pintu utama)', async () => {
    await expect(
      assertCanAccess(
        { userId: 'u1', role: 'PETUGAS', officerId: 'off-1', branchId: BRANCH_SENDIRI },
        { branchId: BRANCH_LAIN },
      ),
    ).rejects.toThrow();
  });

  it('PETUGAS tanpa branchId ditolak (harus terikat ranting)', async () => {
    await expect(
      assertCanAccess(
        { userId: 'u1', role: 'PETUGAS', officerId: 'off-1' },
        { branchId: BRANCH_SENDIRI },
      ),
    ).rejects.toThrow();
  });

  it('PETUGAS tidak bisa menukar branchId lewat input — hanya token yang dipakai', async () => {
    // Aturan hanya membandingkan token vs DB. Tidak ada argumen input pemanggil
    // yang bisa mengubah branchId yang dipakai untuk perbandingan.
    const tokenPetugas = {
      userId: 'u1',
      role: 'PETUGAS' as const,
      officerId: 'off-1',
      branchId: BRANCH_SENDIRI,
    };
    await expect(assertCanAccess(tokenPetugas, { branchId: BRANCH_SENDIRI })).resolves.toBeUndefined();
    await expect(assertCanAccess(tokenPetugas, { branchId: BRANCH_LAIN })).rejects.toThrow();
  });

  it('ADMIN_RANTING diizinkan pada kaleng rantingnya sendiri', async () => {
    await expect(
      assertCanAccess(
        { userId: 'u2', role: 'ADMIN_RANTING', branchId: BRANCH_SENDIRI },
        { branchId: BRANCH_SENDIRI },
      ),
    ).resolves.toBeUndefined();
  });

  it('ADMIN_RANTING ditolak pada kaleng ranting lain', async () => {
    await expect(
      assertCanAccess(
        { userId: 'u2', role: 'ADMIN_RANTING', branchId: BRANCH_SENDIRI },
        { branchId: BRANCH_LAIN },
      ),
    ).rejects.toThrow();
  });

  it('ADMIN_KECAMATAN diizinkan pada kaleng di ranting kecamatannya', async () => {
    await expect(
      assertCanAccess(
        { userId: 'u3', role: 'ADMIN_KECAMATAN', districtId: 'district-A' },
        { branchId: BRANCH_LAIN },
      ),
    ).resolves.toBeUndefined();
  });

  it('ADMIN_KECAMATAN ditolak pada kaleng di luar kecamatannya', async () => {
    const db = require('../../config/database').db;
    db.query.branches.findFirst.mockResolvedValueOnce({ districtId: 'district-LAIN' });

    await expect(
      assertCanAccess(
        { userId: 'u3', role: 'ADMIN_KECAMATAN', districtId: 'district-A' },
        { branchId: BRANCH_LAIN },
      ),
    ).rejects.toThrow();
  });
});
