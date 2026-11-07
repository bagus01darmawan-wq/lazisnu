/**
 * GET /mobile/tasks/stats-range — kartu event-based:
 * - dijemput = collected_at di dalam rentang
 * - tidak dijemput = UNCOLLECTED dengan completed_at di dalam rentang
 * - tugas selesai = dijemput + tidak dijemput (selalu sinkron)
 * - periode tugas = periode assignment kejadian, bukan bulan kalender rentang
 * - sisa periode = ACTIVE pada periode assignment kejadian
 */
import { randomUUID } from 'crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { getApp, closeApp } from './helpers/app-helper';
import { db } from '../../config/database';
import * as schema from '../../database/schema';

const TAG = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();

describe('GET /mobile/tasks/stats-range — event-based', () => {
  const ids = {
    district: randomUUID(),
    branch: randomUUID(),
    user: randomUUID(),
    officer: randomUUID(),
  };
  const canIds: string[] = [];
  let token = '';

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

  async function cleanup() {
    if (canIds.length > 0) {
      await db.delete(schema.collections).where(inArray(schema.collections.canId, canIds));
      await db.delete(schema.assignments).where(inArray(schema.assignments.canId, canIds));
      await db.delete(schema.cans).where(inArray(schema.cans.id, canIds));
    }
    await db.delete(schema.officers).where(eq(schema.officers.id, ids.officer));
    await db.delete(schema.users).where(eq(schema.users.id, ids.user));
    await db.delete(schema.branches).where(eq(schema.branches.id, ids.branch));
    await db.delete(schema.districts).where(eq(schema.districts.id, ids.district));
  }

  beforeAll(async () => {
    const app = await getApp();
    await withImmutableRulesDisabled(cleanup);

    await db.insert(schema.districts).values({
      id: ids.district,
      code: `SR${TAG}`,
      name: 'Kecamatan Stats Range',
      regionCode: '37',
    });
    await db.insert(schema.branches).values({
      id: ids.branch,
      districtId: ids.district,
      code: `SRB${TAG}`,
      name: 'Ranting Stats Range',
    });
    await db.insert(schema.users).values({
      id: ids.user,
      email: `sr.${TAG}@example.test`,
      passwordHash: 'x',
      fullName: 'Petugas Stats Range',
      phone: `62877${TAG}`,
      role: 'PETUGAS',
      districtId: ids.district,
      branchId: ids.branch,
    });
    await db.insert(schema.officers).values({
      id: ids.officer,
      userId: ids.user,
      employeeCode: `SR${TAG}`,
      fullName: 'Petugas Stats Range',
      phone: `62877${TAG}`,
      districtId: ids.district,
      branchId: ids.branch,
      isActive: true,
    });

    const cans = Array.from({ length: 11 }, (_, i) => ({
      id: randomUUID(),
      branchId: ids.branch,
      ownerName: `Warga Stats Range ${i + 1}`,
      ownerWhatsapp: `6287${TAG}${String(i).padStart(2, '0')}`,
      condition: 'AKTIF' as const,
      isActive: true,
    }));
    await db.insert(schema.cans).values(cans);
    canIds.push(...cans.map((c) => c.id));

    // 10 tugas periode Oktober 2026: 1 dijemput, 1 tidak dijemput, 8 ACTIVE.
    const assignments = cans.slice(0, 10).map((can, index) => ({
      id: randomUUID(),
      officerId: ids.officer,
      canId: can.id,
      periodYear: 2026,
      periodMonth: 10,
      status: index === 0 ? ('COMPLETED' as const) : index === 1 ? ('UNCOLLECTED' as const) : ('ACTIVE' as const),
      completedAt: index <= 1 ? new Date(2026, 10, 5, 10, 0, 0) : null,
      skipReasonCode: index === 1 ? ('OWNER_ABSENT' as const) : null,
    }));
    // Tugas November (ACTIVE) tidak boleh ikut dihitung sebagai sisa periode
    // kejadian Oktober.
    assignments.push({
      id: randomUUID(),
      officerId: ids.officer,
      canId: cans[10].id,
      periodYear: 2026,
      periodMonth: 11,
      status: 'ACTIVE' as const,
      completedAt: null,
      skipReasonCode: null,
    });
    await db.insert(schema.assignments).values(assignments);

    await db.insert(schema.collections).values({
      assignmentId: assignments[0].id,
      canId: cans[0].id,
      officerId: ids.officer,
      nominal: 50000n,
      collectedAt: new Date(2026, 10, 5, 10, 0, 0),
      submittedAt: new Date(2026, 10, 5, 10, 0, 0),
      syncedAt: new Date(2026, 10, 5, 10, 0, 0),
      syncStatus: 'COMPLETED',
      serverTimestamp: new Date(2026, 10, 5, 10, 0, 0),
      submitSequence: 1,
    });

    token = app.jwt.sign({
      userId: ids.user,
      role: 'PETUGAS',
      officerId: ids.officer,
      branchId: ids.branch,
      districtId: ids.district,
    });
  });

  afterAll(async () => {
    await withImmutableRulesDisabled(cleanup);
    await closeApp();
  });

  test('angka sinkron: dijemput + tidak dijemput, periode dari kejadian, sisa periode', async () => {
    const app = await getApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/mobile/tasks/stats-range?start=2026-11-01&end=2026-11-06',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;

    expect(data.collected_in_range).toBe(1);
    expect(data.nominal_in_range).toBe(50000);
    expect(data.task_uncollected_in_range).toBe(1);
    expect(data.task_closed_in_range).toBe(2);
    expect(data.months_covered).toEqual(['2026-10']);
    // 8 ACTIVE Oktober; tugas November tidak ikut karena bukan periode kejadian.
    expect(data.task_active_in_periods).toBe(8);
  });
});
