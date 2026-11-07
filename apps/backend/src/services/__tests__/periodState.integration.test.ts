/**
 * Periode berbasis AKSI — tes integrasi (DB nyata).
 *
 * Menguji satu sumber kebenaran `periodState`:
 * - `display_period` = periode berhak tertua yang belum tuntas.
 * - DRAFT tanpa assignment tidak menahan periode.
 * - REASSIGNED netral (tugas sudah lepas ke pengganti).
 * - Gate giliran: warn / enforce / force + alasan (audit).
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq, or } from 'drizzle-orm';
import {
  assertPreviousPeriodSettled,
  getPeriodState,
  type PeriodScope,
} from '../periodState';

const NOV3 = new Date(2026, 10, 3, 10, 0, 0);

describe('periodState — periode berbasis aksi (DB)', () => {
  let districtId: string;
  let branchId: string;
  let userId: string;
  let officerId: string;
  let canId: string;
  let officerScope: PeriodScope;

  beforeAll(async () => {
    const [district] = await db
      .insert(schema.districts)
      .values({ name: 'District PS', code: 'DPS', regionCode: 'DP' })
      .returning();
    districtId = district.id;

    const [branch] = await db
      .insert(schema.branches)
      .values({ districtId, name: 'Branch PS', code: 'BPS' })
      .returning();
    branchId = branch.id;

    const [user] = await db
      .insert(schema.users)
      .values({
        email: 'ppk-ps@test.com',
        passwordHash: 'hash',
        fullName: 'PPK PS',
        role: 'PETUGAS',
        branchId,
        phone: '081200000001',
      })
      .returning();
    userId = user.id;

    const [officer] = await db
      .insert(schema.officers)
      .values({
        userId,
        districtId,
        branchId,
        employeeCode: 'EMP-PS',
        fullName: 'PPK PS',
        phone: '081200000001',
      })
      .returning();
    officerId = officer.id;
    officerScope = { kind: 'officer', officerId };

    const [can] = await db
      .insert(schema.cans)
      .values({ branchId, ownerName: 'Owner PS', ownerWhatsapp: '081200000002', qrCode: 'QR-PS-1' })
      .returning();
    canId = can.id;

    await db.insert(schema.assignments).values({
      officerId,
      canId,
      periodYear: 2026,
      periodMonth: 10,
      status: 'ACTIVE',
    });

    await db.insert(schema.ppkSubmissions).values({
      officerId,
      branchId,
      periodYear: 2026,
      periodMonth: 10,
      status: 'PPK_SIGNED',
      ppkSignerId: userId,
    });
  });

  afterAll(async () => {
    await db
      .delete(schema.activityLogs)
      .where(or(eq(schema.activityLogs.userId, userId), eq(schema.activityLogs.officerId, officerId)));
    await db.delete(schema.ppkSubmissions).where(eq(schema.ppkSubmissions.officerId, officerId));
    await db.delete(schema.assignments).where(eq(schema.assignments.officerId, officerId));
    await db.delete(schema.cans).where(eq(schema.cans.id, canId));
    await db.delete(schema.officers).where(eq(schema.officers.id, officerId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await db.delete(schema.branches).where(eq(schema.branches.id, branchId));
    await db.delete(schema.districts).where(eq(schema.districts.id, districtId));
    await closeDbConnection();
  });

  test('BA Oktober PPK_SIGNED → display_period Oktober, menunggu bendahara', async () => {
    const state = await getPeriodState(officerScope, NOV3);
    expect(state.current_period).toEqual({ year: 2026, month: 11 });
    expect(state.display_period).toEqual({ year: 2026, month: 10 });
    expect(state.unsettled[0]).toMatchObject({
      period: '2026-10',
      reason: 'PPK_WAITING_BENDAHARA',
      waiting_for: 'BENDAHARA_RANTING',
    });
    // Masih ada tugas ACTIVE → banner TTD belum boleh muncul.
    expect(state.awaiting_signature).toEqual([]);
  });

  test('semua tugas selesai → banner menunggu bendahara muncul', async () => {
    await db
      .update(schema.assignments)
      .set({ status: 'COMPLETED', completedAt: NOV3 })
      .where(and(
        eq(schema.assignments.officerId, officerId),
        eq(schema.assignments.periodYear, 2026),
        eq(schema.assignments.periodMonth, 10),
      ));

    const state = await getPeriodState(officerScope, NOV3);
    expect(state.unsettled[0]).toMatchObject({ period: '2026-10' });
    expect(state.awaiting_signature[0]).toMatchObject({
      period: '2026-10',
      reason: 'PPK_WAITING_BENDAHARA',
      waiting_for: 'BENDAHARA_RANTING',
    });
  });

  test('semua tugas selesai + BA masih DRAFT → banner menunggu PPK', async () => {
    await db
      .update(schema.ppkSubmissions)
      .set({ status: 'DRAFT', ppkSignerId: null })
      .where(and(
        eq(schema.ppkSubmissions.officerId, officerId),
        eq(schema.ppkSubmissions.periodYear, 2026),
        eq(schema.ppkSubmissions.periodMonth, 10),
      ));

    const state = await getPeriodState(officerScope, NOV3);
    expect(state.awaiting_signature[0]).toMatchObject({
      period: '2026-10',
      reason: 'PPK_DRAFT',
      waiting_for: 'PPK',
    });
  });

  test('gate warn: target November memberi peringatan tanpa menolak', async () => {
    delete process.env.PERIOD_GATE;
    const res = await assertPreviousPeriodSettled(officerScope, { year: 2026, month: 11 }, { now: NOV3 });
    expect(res.overridden).toBe(false);
    expect(res.warning?.period).toBe('2026-10');
  });

  test('gate enforce: target November ditolak 409 PREVIOUS_PERIOD_NOT_SETTLED', async () => {
    process.env.PERIOD_GATE = 'enforce';
    try {
      await expect(
        assertPreviousPeriodSettled(officerScope, { year: 2026, month: 11 }, { now: NOV3 }),
      ).rejects.toMatchObject({ code: 'PREVIOUS_PERIOD_NOT_SETTLED', statusCode: 409 });
    } finally {
      delete process.env.PERIOD_GATE;
    }
  });

  test('gate force: wajib alasan, lalu lolos dan tercatat di audit', async () => {
    process.env.PERIOD_GATE = 'enforce';
    try {
      await expect(
        assertPreviousPeriodSettled(officerScope, { year: 2026, month: 11 }, { now: NOV3, force: true }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });

      const res = await assertPreviousPeriodSettled(
        officerScope,
        { year: 2026, month: 11 },
        { now: NOV3, force: true, reason: 'bendahara cuti panjang', actor: { userId } },
      );
      expect(res.overridden).toBe(true);
      const log = await db.query.activityLogs.findFirst({
        where: and(
          eq(schema.activityLogs.userId, userId),
          eq(schema.activityLogs.actionType, 'PERIOD_GATE_OVERRIDE'),
        ),
      });
      expect(log).toBeDefined();
    } finally {
      delete process.env.PERIOD_GATE;
    }
  });

  test('setelah BA Oktober FINAL → periode maju ke November', async () => {
    await db
      .update(schema.ppkSubmissions)
      .set({ status: 'FINAL', finalizedAt: NOV3 })
      .where(and(
        eq(schema.ppkSubmissions.officerId, officerId),
        eq(schema.ppkSubmissions.periodYear, 2026),
        eq(schema.ppkSubmissions.periodMonth, 10),
      ));

    const state = await getPeriodState(officerScope, NOV3);
    expect(state.display_period).toEqual({ year: 2026, month: 11 });
    expect(state.unsettled).toEqual([]);
  });

  test('DRAFT tanpa assignment tidak menahan periode', async () => {
    await db.insert(schema.ppkSubmissions).values({
      officerId,
      branchId,
      periodYear: 2026,
      periodMonth: 9,
      status: 'DRAFT',
    });
    const state = await getPeriodState(officerScope, NOV3);
    expect(state.unsettled.find((u) => u.period === '2026-09')).toBeUndefined();
    expect(state.display_period).toEqual({ year: 2026, month: 11 });
  });

  test('REASSIGNED netral: periode yang seluruh tugasnya dialihkan tidak menahan', async () => {
    await db.insert(schema.assignments).values({
      officerId,
      canId,
      periodYear: 2026,
      periodMonth: 8,
      status: 'REASSIGNED',
    });
    const state = await getPeriodState(officerScope, NOV3);
    expect(state.unsettled.find((u) => u.period === '2026-08')).toBeUndefined();
  });
});
