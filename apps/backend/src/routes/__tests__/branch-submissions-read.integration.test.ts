import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { getApp, closeApp } from './helpers/app-helper';
import { db } from '../../config/database';
import * as schema from '../../database/schema';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
const ids = {
  district: randomUUID(),
  branch: randomUUID(),
  user: randomUUID(),
};
const updatedAt = new Date('2026-10-20T00:00:00.000Z');
let token = '';
let existingSubmissionId = '';

describe('GET /v1/admin/branch-submissions is read-only', () => {
  beforeAll(async () => {
    const app = await getApp();
    await db.insert(schema.districts).values({
      id: ids.district,
      code: `BSD${TAG}`,
      name: 'Kecamatan Branch Submission Read',
      regionCode: '35',
    });
    await db.insert(schema.branches).values({
      id: ids.branch,
      districtId: ids.district,
      code: `BSB${TAG}`,
      name: 'Ranting Branch Submission Read',
    });
    await db.insert(schema.users).values({
      id: ids.user,
      email: `branch-submission-read-${TAG}@example.test`,
      passwordHash: 'x',
      fullName: 'Admin Ranting Read Test',
      phone: `62855${TAG}`,
      role: 'ADMIN_RANTING',
      districtId: ids.district,
      branchId: ids.branch,
    });
    const [submission] = await db.insert(schema.branchSubmissions).values({
      branchId: ids.branch,
      districtId: ids.district,
      periodYear: 2026,
      periodMonth: 10,
      totalAmount: 123n,
      collectionCount: 1,
      createdAt: updatedAt,
      updatedAt,
    }).returning({ id: schema.branchSubmissions.id });
    existingSubmissionId = submission.id;
    token = app.jwt.sign({
      userId: ids.user,
      role: 'ADMIN_RANTING',
      branchId: ids.branch,
      districtId: ids.district,
    });
  });

  afterAll(async () => {
    await db.delete(schema.branchSubmissions).where(eq(schema.branchSubmissions.branchId, ids.branch));
    await db.delete(schema.users).where(eq(schema.users.id, ids.user));
    await db.delete(schema.branches).where(eq(schema.branches.id, ids.branch));
    await db.delete(schema.districts).where(eq(schema.districts.id, ids.district));
    await closeApp();
  });

  it('does not materialize a report for an empty month', async () => {
    const app = await getApp();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/branch-submissions?year=2026&month=6',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
    const row = await db.query.branchSubmissions.findFirst({
      where: and(
        eq(schema.branchSubmissions.branchId, ids.branch),
        eq(schema.branchSubmissions.periodYear, 2026),
        eq(schema.branchSubmissions.periodMonth, 6),
      ),
    });
    expect(row).toBeUndefined();
  });

  it('does not refresh an existing draft through list or detail reads', async () => {
    const app = await getApp();
    const list = await app.inject({
      method: 'GET',
      url: '/v1/admin/branch-submissions?year=2026&month=10',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toMatchObject([{ id: existingSubmissionId, total_amount: 123 }]);

    const detail = await app.inject({
      method: 'GET',
      url: `/v1/admin/branch-submissions/${existingSubmissionId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data).toMatchObject({ id: existingSubmissionId, total_amount: 123 });

    const row = await db.query.branchSubmissions.findFirst({
      where: eq(schema.branchSubmissions.id, existingSubmissionId),
    });
    expect(row?.totalAmount).toBe(123n);
    expect(row?.updatedAt).toEqual(updatedAt);
  });
});
