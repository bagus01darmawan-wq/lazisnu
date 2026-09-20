/**
 * Syarat review-T0 →T4 butir 3: kunci perilaku "staf tanpa branchId → 403".
 * `middleware/ownership.ts` sudah menolak; test ini menguncinya agar tak
 * terbuka lagi oleh perubahan masa depan. Tanpa DB (jalur yang diuji tidak
 * menyentuh database).
 */
import { assertBranchAccess, assertDistrictAccess } from '../ownership';
import { ErrorCode } from '../../utils/errorCatalog';

const BRANCH = '11111111-1111-1111-1111-111111111111';
const DISTRICT = '22222222-2222-2222-2222-222222222222';

describe('ownership — staf tanpa branchId → 403', () => {
  test.each([['STAF_PENGUMPULAN'], ['STAF_KEUANGAN']])(
    '%s tanpa branchId/distrik ditolak di assertBranchAccess',
    async (role) => {
      await expect(
        assertBranchAccess({ userId: 'u', role: role as never }, BRANCH),
      ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });
    },
  );

  test.each([['STAF_PENGUMPULAN'], ['STAF_KEUANGAN']])(
    '%s distrik saja tetap ditolak untuk ranting lain',
    async (role) => {
      await expect(
        assertBranchAccess(
          { userId: 'u', role: role as never, districtId: DISTRICT },
          BRANCH,
        ),
      ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });
    },
  );

  test('staf tanpa distrik ditolak di assertDistrictAccess', async () => {
    await expect(
      assertDistrictAccess({ userId: 'u', role: 'STAF_PENGUMPULAN' as never }, DISTRICT),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });
  });

  test('admin ranting dengan branchId miliknya tetap lolos (tanpa DB)', async () => {
    await expect(
      assertBranchAccess({ userId: 'u', role: 'ADMIN_RANTING', branchId: BRANCH }, BRANCH),
    ).resolves.toBeUndefined();
  });
});
