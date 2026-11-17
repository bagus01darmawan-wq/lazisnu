import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { submitCollection, resubmitCollection, validateAssignmentForSubmit } from '../collectionSubmission';
import { and, eq, sql } from 'drizzle-orm';
import { ErrorCode } from '../../utils/errorCatalog';
import Fastify from 'fastify';
import { collectionsRoutes } from '../../routes/mobile/collections';

/**
 * RULE immutable koleksi (migration 0004) memblokir DELETE/UPDATE pada collections.
 * Untuk kebutuhan cleanup data test, rules dinonaktifkan sementara lalu dibuat ulang.
 */
async function withImmutableRulesDisabled(fn: () => Promise<void>) {
  await db.execute(sql`DROP RULE IF EXISTS disable_delete_koleksi ON collections`);
  await db.execute(sql`DROP RULE IF EXISTS disable_update_nominal_koleksi ON collections`);
  try {
    await fn();
  } finally {
    await db.execute(sql`CREATE OR REPLACE RULE disable_delete_koleksi AS ON DELETE TO collections DO INSTEAD NOTHING`);
    await db.execute(sql`CREATE OR REPLACE RULE disable_update_nominal_koleksi AS ON UPDATE TO collections WHERE NEW.nominal <> OLD.nominal DO INSTEAD NOTHING`);
  }
}

describe('Collection Submission Integration Test', () => {
  let branchId: string;
  let canId: string;
  let officerId: string;
  let assignmentId: string;
  let userId: string;

  let districtId: string;

  beforeAll(async () => {
    // ── Bersihkan sisa data dari test run sebelumnya (idempotent) ──
    // Urutan: child → parent (karena foreign key constraints)
    await withImmutableRulesDisabled(async () => {
      // 1. Hapus collections & assignments terkait can 'TEST-QR-INT'
      const oldCans = await db.query.cans.findMany({
        where: eq(schema.cans.qrCode, 'TEST-QR-INT'),
        columns: { id: true },
      });
      for (const c of oldCans) {
        await db.delete(schema.collections).where(eq(schema.collections.canId, c.id));
        await db.delete(schema.assignments).where(eq(schema.assignments.canId, c.id));
        await db.delete(schema.cans).where(eq(schema.cans.id, c.id));
      }

      // 2. Hapus officers dengan employeeCode 'EMP-001'
      const oldOfficers = await db.query.officers.findMany({
        where: eq(schema.officers.employeeCode, 'EMP-001'),
        columns: { id: true },
      });
      for (const o of oldOfficers) {
        await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
        await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
      }

      // 3. Hapus users dengan email test
      await db.delete(schema.users).where(eq(schema.users.email, 'officer-int@test.com'));

      // 4. Hapus branches dengan code 'BTI'
      await db.delete(schema.branches).where(eq(schema.branches.code, 'BTI'));

      // 5. Hapus districts dengan code 'DTI'
      await db.delete(schema.districts).where(eq(schema.districts.code, 'DTI'));
    });

    // ── Insert data baru ──

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

    // Insert assignment — periode BERJALAN dinamis (C1-T2: validate kini menolak
    // periode terkunci; fixture statis Juni 2026 akan selalu terkunci).
    const now = new Date();
    const [assignment] = await db.insert(schema.assignments).values({
      officerId,
      canId,
      periodYear: now.getFullYear(),
      periodMonth: now.getMonth() + 1,
      status: 'ACTIVE',
    }).returning();
    assignmentId = assignment.id;
  });

  afterAll(async () => {
    // cleanup
    await withImmutableRulesDisabled(async () => {
      await db.delete(schema.collections).where(eq(schema.collections.canId, canId));
      await db.delete(schema.assignments).where(eq(schema.assignments.id, assignmentId));
      await db.delete(schema.officers).where(eq(schema.officers.id, officerId));
      await db.delete(schema.users).where(eq(schema.users.id, userId));
      await db.delete(schema.cans).where(eq(schema.cans.id, canId));
      await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
      await db.delete(schema.districts).where(eq(schema.districts.id, districtId));
    });
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

  it('mengakui ulang operasi koreksi yang sama tanpa menambah versi atau nominal', async () => {
    const source = await db.query.collections.findFirst({
      where: and(eq(schema.collections.canId, canId), eq(schema.collections.submitSequence, 2)),
    });
    expect(source).toBeDefined();
    const input = {
      collectionId: source!.id,
      nominal: 76000,
      alasanResubmit: 'Uji koreksi idempoten',
      requiredOfficerId: officerId,
      operationId: 'test-operation-sync-unique',
    };
    const [first, replay] = await Promise.all([
      db.transaction(tx => resubmitCollection(tx as any, input)),
      db.transaction(tx => resubmitCollection(tx as any, input)),
    ]);
    expect(first.newCollection.id).toBe(replay.newCollection.id);
    const rows = await db.query.collections.findMany({where: eq(schema.collections.canId, canId)});
    expect(rows.filter(row => row.submitSequence === 3)).toHaveLength(1);
    expect((await db.query.cans.findFirst({where: eq(schema.cans.id, canId)}))?.totalCollected).toBe(BigInt(76000));
    await expect(db.transaction(tx => resubmitCollection(tx as any, {...input, nominal: 77000})))
      .rejects.toMatchObject({code: ErrorCode.CONFLICT});
    await expect(db.transaction(tx => resubmitCollection(tx as any, {...input, requiredOfficerId: userId})))
      .rejects.toMatchObject({code: ErrorCode.COLLECTION_NOT_FOUND});

    const newer = await db.transaction(tx => resubmitCollection(tx as any, {
      collectionId: first.newCollection.id,
      nominal: 78000,
      alasanResubmit: 'Koreksi lanjutan',
      requiredOfficerId: officerId,
      operationId: 'test-operation-sync-second',
    }));
    const retried = await db.transaction(tx => resubmitCollection(tx as any, input));
    expect(retried.newCollection.id).toBe(first.newCollection.id);
    expect(newer.newCollection.submitSequence).toBe(4);
    expect((await db.query.cans.findFirst({where: eq(schema.cans.id, canId)}))?.totalCollected).toBe(BigInt(78000));
  });

  it('HTTP mengakui operasi koreksi yang sama dan menolak penggunaan ulang payload berbeda', async () => {
    const source = await db.query.collections.findFirst({
      where: and(eq(schema.collections.canId, canId), eq(schema.collections.submitSequence, 4)),
    });
    expect(source).toBeDefined();
    const app = Fastify();
    app.addHook('onRequest', async request => {
      request.currentUser = {userId, officerId, role: 'PETUGAS'} as typeof request.currentUser;
    });
    await app.register(collectionsRoutes);
    await app.ready();
    try {
      const payload = {nominal: 0, alasan_resubmit: 'Uji respons ulang', operation_id: 'http-operation-test'};
      const url = `/collections/${source!.id}/resubmit`;
      const first = await app.inject({method: 'POST', url, payload});
      const replay = await app.inject({method: 'POST', url, payload});
      expect(first.statusCode).toBe(200);
      expect(replay.statusCode).toBe(200);
      expect(replay.json().data.id).toBe(first.json().data.id);
      const conflict = await app.inject({method: 'POST', url, payload: {...payload, nominal: 1}});
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json().error.code).toBe(ErrorCode.CONFLICT);
    } finally {
      await app.close();
    }
  });

  it('should prevent resubmitting an old sequence (NOT_LATEST)', async () => {
    const colSeq1 = await db.query.collections.findFirst({
      // Scope ke kaleng fixture ini: test DB dipakai bersama lintas suite,
      // sehingga submit_sequence=1 milik fixture lain bisa terbaca lebih dulu.
      where: and(
        eq(schema.collections.canId, canId),
        eq(schema.collections.submitSequence, 1),
      ),
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
