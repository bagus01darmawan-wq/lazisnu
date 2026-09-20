/**
 * C1-T2 — uji kunci periode pada validateAssignmentForSubmit (dengan DB nyata).
 *
 * §14.1–14.2: patokan = assignment.period. Submit/sync Sept yang tiba setelah
 * Kunci Sistem (10 Okt 00:00) DITOLAK untuk Sept (QR_PERIOD_CLOSED 409,
 * non-retry → antrean HP: gagal permanen yang terlihat) dan diarahkan ke Okt.
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { validateAssignmentForSubmit } from '../collectionSubmission';
import { eq, sql } from 'drizzle-orm';
import { ErrorCode } from '../../utils/errorCatalog';

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

describe('C1-T2 kunci periode submit (tolak Sept→Okt)', () => {
  let officerId: string;
  let septCanId: string;
  let oktCanId: string;
  let septAssignmentId: string;
  let oktAssignmentId: string;
  let districtId: string;
  let branchId: string;

  beforeAll(async () => {
    await withImmutableRulesDisabled(async () => {
      for (const qr of ['TEST-QR-T2-SEPT', 'TEST-QR-T2-OKT']) {
        const oldCans = await db.query.cans.findMany({
          where: eq(schema.cans.qrCode, qr),
          columns: { id: true },
        });
        for (const c of oldCans) {
          await db.delete(schema.collections).where(eq(schema.collections.canId, c.id));
          await db.delete(schema.assignments).where(eq(schema.assignments.canId, c.id));
          await db.delete(schema.cans).where(eq(schema.cans.id, c.id));
        }
      }
      const oldOfficers = await db.query.officers.findMany({
        where: eq(schema.officers.employeeCode, 'EMP-T2'),
        columns: { id: true },
      });
      for (const o of oldOfficers) {
        await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
        await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
      }
      await db.delete(schema.users).where(eq(schema.users.email, 'officer-t2@test.com'));
      await db.delete(schema.branches).where(eq(schema.branches.code, 'BT2'));
      await db.delete(schema.districts).where(eq(schema.districts.code, 'DT2'));
    });

    const [district] = await db.insert(schema.districts).values({
      name: 'District Test T2', code: 'DT2', regionCode: 'DT',
    }).returning();
    districtId = district.id;

    const [branch] = await db.insert(schema.branches).values({
      districtId, name: 'Branch Test T2', code: 'BT2',
    }).returning();
    branchId = branch.id;

    const [user] = await db.insert(schema.users).values({
      email: 'officer-t2@test.com', passwordHash: 'hash', fullName: 'Officer T2',
      role: 'PETUGAS', branchId, phone: '081234567801',
    }).returning();

    const [officer] = await db.insert(schema.officers).values({
      userId: user.id, districtId, branchId,
      employeeCode: 'EMP-T2', fullName: 'Officer T2', phone: '081234567801',
    }).returning();
    officerId = officer.id;

    const [septCan] = await db.insert(schema.cans).values({
      branchId, ownerName: 'Owner Sept', ownerWhatsapp: '081234567802', qrCode: 'TEST-QR-T2-SEPT',
    }).returning();
    septCanId = septCan.id;

    const [oktCan] = await db.insert(schema.cans).values({
      branchId, ownerName: 'Owner Okt', ownerWhatsapp: '081234567803', qrCode: 'TEST-QR-T2-OKT',
    }).returning();
    oktCanId = oktCan.id;

    const [sept] = await db.insert(schema.assignments).values({
      officerId, canId: septCanId, periodYear: 2026, periodMonth: 9, status: 'ACTIVE',
    }).returning();
    septAssignmentId = sept.id;

    // Kasus §6: assignment Okt di-generate 10 Okt 00:00 (jemput awal 10–17 Okt).
    const [okt] = await db.insert(schema.assignments).values({
      officerId, canId: oktCanId, periodYear: 2026, periodMonth: 10, status: 'ACTIVE',
    }).returning();
    oktAssignmentId = okt.id;
  });

  afterAll(async () => {
    await withImmutableRulesDisabled(async () => {
      await db.delete(schema.collections).where(eq(schema.collections.officerId, officerId));
      await db.delete(schema.assignments).where(eq(schema.assignments.officerId, officerId));
      await db.delete(schema.officers).where(eq(schema.officers.id, officerId));
      await db.delete(schema.users).where(eq(schema.users.email, 'officer-t2@test.com'));
      await db.delete(schema.cans).where(eq(schema.cans.branchId, branchId));
      await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
      await db.delete(schema.districts).where(eq(schema.districts.id, districtId));
    });
    await closeDbConnection();
  });

  test('Sept masih terbuka 5 Okt → validate lolos', async () => {
    await db.transaction(async (tx) => {
      const a = await validateAssignmentForSubmit(
        tx as any, septAssignmentId, septCanId, officerId, new Date(2026, 9, 5, 12, 0, 0),
      );
      expect(a.id).toBe(septAssignmentId);
    });
  });

  test('uji §12.2: Sept tiba 10 Okt 00:00 → QR_PERIOD_CLOSED 409 non-retry + arahan Okt', async () => {
    await expect(
      db.transaction(async (tx) => {
        await validateAssignmentForSubmit(
          tx as any, septAssignmentId, septCanId, officerId, new Date(2026, 9, 10, 0, 0, 0),
        );
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.QR_PERIOD_CLOSED,
      statusCode: 409,
      isRetryable: false,
    });
  });

  test('detail error menyebut periode terkunci + periode pengganti', async () => {
    const err = await db
      .transaction(async (tx) => {
        await validateAssignmentForSubmit(
          tx as any, septAssignmentId, septCanId, officerId, new Date(2026, 9, 10, 0, 0, 1),
        );
      })
      .then(
        () => null,
        (e) => e,
      );
    expect(err).not.toBeNull();
    expect(err.details).toMatchObject({ period: '2026-09', next_period: '2026-10' });
    expect(err.message).toContain('2026-09');
    expect(err.message).toContain('2026-10');
  });

  test('kasus §6: Okt lolos 12 Okt (jemput awal, sebelum assign tgl 20)', async () => {
    await db.transaction(async (tx) => {
      const a = await validateAssignmentForSubmit(
        tx as any, oktAssignmentId, oktCanId, officerId, new Date(2026, 9, 12, 10, 0, 0),
      );
      expect(a.id).toBe(oktAssignmentId);
    });
  });
});
