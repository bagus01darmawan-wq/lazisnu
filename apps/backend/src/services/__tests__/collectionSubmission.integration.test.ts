import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { submitCollection, resubmitCollection, validateAssignmentForSubmit } from '../collectionSubmission';
import { eq, like } from 'drizzle-orm';
import { ErrorCode } from '../../utils/errorCatalog';

describe('Collection Submission Integration Test', () => {
  let branchId: string;
  let canId: string;
  let officerId: string;
  let assignmentId: string;
  let userId: string;

  let districtId: string;

  beforeAll(async () => {
    // Insert district
    const [district] = await db.insert(schema.districts).values({
      name: 'District Test Integration',
      code: 'DTI',
      regionCode: 'DT',
    }).returning();
    districtId = district.id;

    // Insert branch
    const [branch] = await db.insert(schema.branches).values({
      districtId,
      name: 'Branch Test Integration',
      code: 'BTI',
    }).returning();
    branchId = branch.id;

    // Insert can
    const [can] = await db.insert(schema.cans).values({
      branchId,
      ownerName: 'Owner Test',
      ownerWhatsapp: '081234567890',
      qrCode: 'TEST-QR-INT',
    }).returning();
    canId = can.id;

    // Insert user + officer
    const [user] = await db.insert(schema.users).values({
      email: 'officer-int@test.com',
      passwordHash: 'hash',
      fullName: 'Officer Test',
      role: 'PETUGAS',
      branchId,
      phone: '081234567800',
    }).returning();
    userId = user.id;

    const [officer] = await db.insert(schema.officers).values({
      userId: user.id,
      districtId,
      branchId,
      employeeCode: 'EMP-001',
      fullName: 'Officer Test',
      phone: '081234567800',
    }).returning();
    officerId = officer.id;

    // Insert assignment
    const [assignment] = await db.insert(schema.assignments).values({
      officerId,
      canId,
      periodYear: 2026,
      periodMonth: 6,
      status: 'ACTIVE',
    }).returning();
    assignmentId = assignment.id;
  });

  afterAll(async () => {
    // cleanup
    await db.delete(schema.collections).where(eq(schema.collections.canId, canId));
    await db.delete(schema.assignments).where(eq(schema.assignments.id, assignmentId));
    await db.delete(schema.officers).where(eq(schema.officers.id, officerId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await db.delete(schema.cans).where(eq(schema.cans.id, canId));
    await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
    await db.delete(schema.districts).where(eq(schema.districts.id, districtId));
    await closeDbConnection();
  });

  it('should submit collection successfully (INSERT) and update totalCollected', async () => {
    await db.transaction(async (tx) => {
      // Validate
      const assignment = await validateAssignmentForSubmit(tx as any, assignmentId, canId, officerId);
      expect(assignment.id).toBe(assignmentId);

      // Submit
      const collection = await submitCollection(tx as any, {
        assignmentId,
        canId,
        officerId,
        nominal: 50000,
        paymentMethod: 'CASH',
        collectedAt: new Date(),
      });

      expect(collection.submitSequence).toBe(1);
      expect(collection.nominal).toBe(BigInt(50000));
    });

    // Check DB effects
    const can = await db.query.cans.findFirst({ where: eq(schema.cans.id, canId) });
    expect(can?.totalCollected).toBe(BigInt(50000));
    expect(can?.collectionCount).toBe(1);

    const assignment = await db.query.assignments.findFirst({ where: eq(schema.assignments.id, assignmentId) });
    expect(assignment?.status).toBe('COMPLETED');
  });

  it('should resubmit collection successfully and update diff', async () => {
    const col = await db.query.collections.findFirst({
      where: eq(schema.collections.canId, canId)
    });
    
    expect(col).toBeDefined();

    await db.transaction(async (tx) => {
      const { newCollection } = await resubmitCollection(tx as any, {
        collectionId: col!.id,
        nominal: 75000,
        alasanResubmit: 'Salah ketik nominal',
      });

      expect(newCollection.submitSequence).toBe(2);
      expect(newCollection.nominal).toBe(BigInt(75000));
      expect(newCollection.alasanResubmit).toBe('Salah ketik nominal');
    });

    // Check DB effects (Total should be 75000)
    const can = await db.query.cans.findFirst({ where: eq(schema.cans.id, canId) });
    expect(can?.totalCollected).toBe(BigInt(75000));
  });

  it('should prevent resubmitting an old sequence (NOT_LATEST)', async () => {
    const colSeq1 = await db.query.collections.findFirst({
      where: eq(schema.collections.submitSequence, 1)
    });
    
    expect(colSeq1).toBeDefined();

    await expect(
      db.transaction(async (tx) => {
        await resubmitCollection(tx as any, {
          collectionId: colSeq1!.id,
          nominal: 100000,
          alasanResubmit: 'Coba submit seq lama',
        });
      })
    ).rejects.toMatchObject({ code: ErrorCode.NOT_LATEST });
  });
});
