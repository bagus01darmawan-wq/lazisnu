/**
 * C1-T3 — uji alur Generate Approve dengan DB nyata (§14.12, §6).
 *
 * Skenario: prepare Sept (robot) → edit → approve Staf → tombol mati →
 * eskalasi Keuangan (24 jam) → sapuan susulan pasca-approve. Guard masa depan
 * & kunci diuji dengan draft sisipan langsung.
 *
 * Pola fixture tanggal: periode fixed 2026-09 + injeksi `now` eksplisit agar
 * tidak kedaluwarsa oleh waktu (pola T2).
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import {
  approveDraft,
  collectApprovalRecipients,
  deleteDraftItem,
  getDraftDetail,
  listDrafts,
  preparePeriodDraft,
  updateDraftItem,
  periodCalendarRowMatches,
  type DraftActor,
} from '../periodDrafts';
import { and, eq, inArray, sql } from 'drizzle-orm';
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

const OCT5 = new Date(2026, 9, 5, 12, 0, 0);

const T3_EMAILS = [
  'stafr-t3@test.com', 'stafmwc-t3@test.com', 'keumwc-t3@test.com', 'stafr2-t3@test.com', 'keur2-t3@test.com',
  'petugas-t3-a@test.com', 'petugas-t3-b@test.com', 'petugas-t3-t@test.com', 'petugas-t3-r2@test.com',
];
const T3_BRANCH_CODES = ['BT3-R', 'BT3-T', 'BT3-R2'];

/** Jejak audit T3 (DRAFT_*) menunjuk user/draft via FK — bersihkan dulu. */
async function deleteMyAuditTrails() {
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, T3_EMAILS));
  if (users.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users.map((u) => u.id)));
  }
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T3_BRANCH_CODES));
  if (branches.length > 0) {
    const drafts = await db.select({ id: schema.periodDrafts.id }).from(schema.periodDrafts).where(inArray(schema.periodDrafts.branchId, branches.map((b) => b.id)));
    if (drafts.length > 0) {
      await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.entityId, drafts.map((d) => d.id)));
    }
  }
}

describe('C1-T3 generate approve (DB)', () => {
  let districtId: string;
  let branchR: string;
  let branchT: string;
  let branchR2: string;
  let offA: string;
  let offB: string;
  let offT: string;
  let offR2: string;
  let canR4: string;
  let rDraftId: string;
  let tDraftId: string;
  let r2DraftId: string;

  let stafR: DraftActor;
  let stafMwc: DraftActor;
  let keuMwc: DraftActor;
  let stafR2: DraftActor;
  let keuR2: DraftActor;

  async function mkUser(email: string, phone: string, role: 'STAF_PENGUMPULAN' | 'STAF_KEUANGAN' | 'PETUGAS', branchId: string | null) {
    const [u] = await db.insert(schema.users).values({
      email, passwordHash: 'hash', fullName: email, phone, role,
      branchId, districtId: branchId ? null : districtId,
    }).returning();
    return u;
  }

  beforeAll(async () => {
    // ── Bersih idempoten ──
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(async () => {
      const branches = await db.query.branches.findMany({
        where: inArray(schema.branches.code, ['BT3-R', 'BT3-T', 'BT3-R2']),
        columns: { id: true },
      });
      const bIds = branches.map((b) => b.id);
      if (bIds.length > 0) {
        const cans = await db.select({ id: schema.cans.id }).from(schema.cans).where(inArray(schema.cans.branchId, bIds));
        const cIds = cans.map((c) => c.id);
        if (cIds.length > 0) {
          await db.delete(schema.collections).where(inArray(schema.collections.canId, cIds));
          await db.delete(schema.assignments).where(inArray(schema.assignments.canId, cIds));
        }
        const drafts = await db.select({ id: schema.periodDrafts.id }).from(schema.periodDrafts).where(inArray(schema.periodDrafts.branchId, bIds));
        for (const d of drafts) {
          await db.delete(schema.periodDraftItems).where(eq(schema.periodDraftItems.draftId, d.id));
          await db.delete(schema.periodDrafts).where(eq(schema.periodDrafts.id, d.id));
        }
        const officers = await db.select({ id: schema.officers.id }).from(schema.officers).where(inArray(schema.officers.branchId, bIds));
        for (const o of officers) {
          await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
          await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
        }
        // Users dulu (FK users.branch_id) sebelum branches; T3_EMAILS dipakai ulang.
        await db.delete(schema.users).where(inArray(schema.users.email, T3_EMAILS));
        if (cIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, cIds));
        await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
      }
      await db.delete(schema.districts).where(eq(schema.districts.code, 'DT3'));
    });

    // ── Fixture ──
    const [district] = await db.insert(schema.districts).values({
      name: 'District Test T3', code: 'DT3', regionCode: 'DT',
    }).returning();
    districtId = district.id;

    const [r] = await db.insert(schema.branches).values({ districtId, name: 'Ranting T3', code: 'BT3-R' }).returning();
    branchR = r.id;
    const [t] = await db.insert(schema.branches).values({
      districtId, name: 'Taqwa T3', code: 'BT3-T', kind: 'PROGRAM_MWC',
    }).returning();
    branchT = t.id;
    const [r2] = await db.insert(schema.branches).values({ districtId, name: 'Ranting T3-2', code: 'BT3-R2' }).returning();
    branchR2 = r2.id;

    async function mkOfficer(email: string, phone: string, branchId: string, code: string, name: string, createdAt?: Date) {
      const [u] = await db.insert(schema.users).values({
        email, passwordHash: 'hash', fullName: name, phone, role: 'PETUGAS', branchId,
      }).returning();
      const [o] = await db.insert(schema.officers).values({
        userId: u.id, districtId, branchId, employeeCode: code, fullName: name, phone,
        ...(createdAt ? { createdAt } : {}),
      }).returning();
      return o.id;
    }

    offA = await mkOfficer('petugas-t3-a@test.com', '082000000101', branchR, 'EMP-T3-A', 'Petugas T3 A', new Date(2026, 0, 1));
    offB = await mkOfficer('petugas-t3-b@test.com', '082000000102', branchR, 'EMP-T3-B', 'Petugas T3 B', new Date(2026, 0, 2));
    offT = await mkOfficer('petugas-t3-t@test.com', '082000000103', branchT, 'EMP-T3-T', 'Petugas T3 Taqwa');
    offR2 = await mkOfficer('petugas-t3-r2@test.com', '082000000104', branchR2, 'EMP-T3-R2', 'Petugas T3 R2');

    async function mkCan(branchId: string, qr: string, condition: 'AKTIF' | 'NON_AKTIF' = 'AKTIF') {
      const [c] = await db.insert(schema.cans).values({
        branchId, ownerName: `Owner ${qr}`, ownerWhatsapp: '082000000100', qrCode: qr, condition,
      }).returning();
      return c.id;
    }

    await mkCan(branchR, 'TEST-QR-T3-R1');
    await mkCan(branchR, 'TEST-QR-T3-R2');
    await mkCan(branchR, 'TEST-QR-T3-R3');
    await mkCan(branchR, 'TEST-QR-T3-RN', 'NON_AKTIF'); // tidak boleh masuk draft
    await mkCan(branchT, 'TEST-QR-T3-T1');
    await mkCan(branchR2, 'TEST-QR-T3-R2-1');

    const uR = await mkUser('stafr-t3@test.com', '082000000201', 'STAF_PENGUMPULAN', branchR);
    const uMwc = await mkUser('stafmwc-t3@test.com', '082000000202', 'STAF_PENGUMPULAN', null);
    const uKeu = await mkUser('keumwc-t3@test.com', '082000000203', 'STAF_KEUANGAN', null);
    const uR2 = await mkUser('stafr2-t3@test.com', '082000000204', 'STAF_PENGUMPULAN', branchR2);
    const uKeuR2 = await mkUser('keur2-t3@test.com', '082000000205', 'STAF_KEUANGAN', branchR2);
    stafR = { userId: uR.id, role: 'STAF_PENGUMPULAN', branchId: branchR, districtId };
    stafMwc = { userId: uMwc.id, role: 'STAF_PENGUMPULAN', branchId: null, districtId };
    keuMwc = { userId: uKeu.id, role: 'STAF_KEUANGAN', branchId: null, districtId };
    stafR2 = { userId: uR2.id, role: 'STAF_PENGUMPULAN', branchId: branchR2, districtId };
    keuR2 = { userId: uKeuR2.id, role: 'STAF_KEUANGAN', branchId: branchR2, districtId };
  });

  afterAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(async () => {
      const cans = await db.select({ id: schema.cans.id }).from(schema.cans).where(inArray(schema.cans.branchId, [branchR, branchT, branchR2]));
      const cIds = cans.map((c) => c.id);
      if (cIds.length > 0) {
        await db.delete(schema.collections).where(inArray(schema.collections.canId, cIds));
        await db.delete(schema.assignments).where(inArray(schema.assignments.canId, cIds));
      }
      const drafts = await db.select({ id: schema.periodDrafts.id }).from(schema.periodDrafts).where(inArray(schema.periodDrafts.branchId, [branchR, branchT, branchR2]));
      for (const d of drafts) {
        await db.delete(schema.periodDraftItems).where(eq(schema.periodDraftItems.draftId, d.id));
        await db.delete(schema.periodDrafts).where(eq(schema.periodDrafts.id, d.id));
      }
      const officers = await db.select({ id: schema.officers.id }).from(schema.officers).where(inArray(schema.officers.branchId, [branchR, branchT, branchR2]));
      for (const o of officers) {
        await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
        await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
      }
      if (cIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, cIds));
      await db.delete(schema.users).where(inArray(schema.users.email, T3_EMAILS));
      await db.delete(schema.branches).where(inArray(schema.branches.id, [branchR, branchT, branchR2]));
      await db.delete(schema.districts).where(eq(schema.districts.id, districtId));
    });
    await closeDbConnection();
  });

  test('robot prepare Sept: draft per ranting + baris kalender identik helper (syarat b)', async () => {
    const res = await preparePeriodDraft(2026, 9, { now: OCT5 });
    expect(res.period).toBe('2026-09');
    expect(res.calendarRowWritten).toBe(true);

    const row = await db.query.periodCalendar.findFirst({
      where: and(eq(schema.periodCalendar.periodYear, 2026), eq(schema.periodCalendar.periodMonth, 9)),
    });
    expect(row).toBeDefined();
    expect(periodCalendarRowMatches(row!, 2026, 9)).toBe(true);

    const mine = res.drafts.filter((d) => [branchR, branchT, branchR2].includes(d.branchId));
    expect(mine).toHaveLength(3);
    const byBranch = new Map(mine.map((d) => [d.branchId, d]));
    expect(byBranch.get(branchR)).toMatchObject({ draftStatus: 'DRAFT', totalItems: 3 });
    expect(byBranch.get(branchT)).toMatchObject({ draftStatus: 'DRAFT', totalItems: 1 });
    expect(byBranch.get(branchR2)).toMatchObject({ draftStatus: 'DRAFT', totalItems: 1 });
    rDraftId = byBranch.get(branchR)!.draftId;
    tDraftId = byBranch.get(branchT)!.draftId;
    r2DraftId = byBranch.get(branchR2)!.draftId;

    // Petugas pertama (tertua) memegang semua item ranting R.
    const detail = await getDraftDetail(stafR, rDraftId);
    expect(detail.items).toHaveLength(3);
    expect(detail.items.every((it) => it.officerId === offA)).toBe(true);
  });

  test('robot idempoten: prepare ulang → tambah 0, tanpa duplikat', async () => {
    const res = await preparePeriodDraft(2026, 9, { now: OCT5 });
    const mine = res.drafts.filter((d) => [branchR, branchT, branchR2].includes(d.branchId));
    expect(mine.every((d) => d.addedItems === 0)).toBe(true);
    expect(mine.find((d) => d.branchId === branchR)).toMatchObject({ totalItems: 3 });
  });

  test('robot menolak bulan masa depan', async () => {
    await expect(preparePeriodDraft(2026, 11, { now: OCT5 })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  test('Staf setujui draft R → 3 assignment ACTIVE Sept + tombol mati', async () => {
    const res = await approveDraft(stafR, rDraftId, new Date(2026, 9, 5, 12, 0, 0));
    expect(res).toMatchObject({ period: '2026-09', itemCount: 3, createdAssignments: 3, escalated: false });

    const asg = await db.query.assignments.findMany({
      where: and(
        eq(schema.assignments.periodYear, 2026),
        eq(schema.assignments.periodMonth, 9),
        inArray(schema.assignments.canId,
          (await db.select({ id: schema.cans.id }).from(schema.cans).where(eq(schema.cans.branchId, branchR))).map((c) => c.id)),
      ),
    });
    expect(asg).toHaveLength(3);
    expect(asg.every((a) => a.status === 'ACTIVE')).toBe(true);
    expect(asg.every((a) => a.assignedAt.getTime() === new Date(2026, 9, 5, 12, 0, 0).getTime())).toBe(true);
    expect(asg.some((a) => a.backupOfficerId === offB)).toBe(true);

    await expect(approveDraft(stafR, rDraftId, new Date(2026, 9, 5, 13, 0, 0))).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  test('Staf ranting lain → FORBIDDEN_SCOPE (sebelum status dicek)', async () => {
    await expect(approveDraft(stafR, tDraftId, new Date(2026, 9, 5, 12, 0, 0))).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN_SCOPE,
    });
  });

  test('edit draft R2: ganti petugas + tolak lintas-ranting + tolak Keuangan + hapus', async () => {
    const detail = await getDraftDetail(stafR2, r2DraftId);
    expect(detail.items).toHaveLength(1);
    const itemId = detail.items[0].id;

    const edited = await updateDraftItem(stafR2, itemId, { officerId: offR2 });
    expect(edited.officerId).toBe(offR2);

    await expect(updateDraftItem(stafR2, itemId, { officerId: offA })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });

    // Keuangan se-scope pun tidak boleh mengedit (hanya menyetujui eskalasi).
    await expect(updateDraftItem(keuR2, itemId, { officerId: offR2 })).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
    await expect(deleteDraftItem(keuR2, itemId)).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });

    // Keuangan MWC boleh baca draft program, staf R tidak.
    await expect(getDraftDetail(stafR, tDraftId)).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });
    const tDetail = await getDraftDetail(keuMwc, tDraftId);
    expect(tDetail.items).toHaveLength(1);

    await deleteDraftItem(stafR2, itemId);
    const after = await getDraftDetail(stafR2, r2DraftId);
    expect(after.items).toHaveLength(0);
  });

  test('temuan review-T3 #2: petugas dinonaktifkan setelah prepare → approve ditolak, draft tetap DRAFT', async () => {
    const tDetail = await getDraftDetail(keuMwc, tDraftId);
    expect(tDetail.items).toHaveLength(1);
    await db.update(schema.officers).set({ isActive: false }).where(eq(schema.officers.id, offT));
    try {
      // Lewat 24 jam agar gerbang eskalasi lolos — yang menolak harus gerbang aktif.
      await expect(approveDraft(keuMwc, tDraftId, new Date(2026, 9, 6, 13, 0, 0))).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
      const still = await db.query.periodDrafts.findFirst({ where: eq(schema.periodDrafts.id, tDraftId) });
      expect(still?.status).toBe('DRAFT');
    } finally {
      await db.update(schema.officers).set({ isActive: true }).where(eq(schema.officers.id, offT));
    }
  });

  test('eskalasi: Keuangan dini ditolak, lewat 24 jam lolos (draft Taqwa)', async () => {
    await expect(approveDraft(keuMwc, tDraftId, new Date(2026, 9, 5, 12, 0, 0))).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
    });
    // preparedAt = 5 Okt 12:00 (OCT5) → 6 Okt 13:00 = 25 jam → eskalasi sah.
    const res = await approveDraft(keuMwc, tDraftId, new Date(2026, 9, 6, 13, 0, 0));
    expect(res).toMatchObject({ escalated: true, createdAssignments: 1, approvedByRole: 'STAF_KEUANGAN' });
  });

  test('draft masa depan & terkunci tidak bisa disetujui', async () => {
    const [novDraft] = await db.insert(schema.periodDrafts).values({
      periodYear: 2026, periodMonth: 11, branchId: branchR2, districtId, status: 'DRAFT',
    }).returning();
    await expect(approveDraft(stafR2, novDraft.id, new Date(2026, 9, 5, 12, 0, 0))).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });

    const [augDraft] = await db.insert(schema.periodDrafts).values({
      periodYear: 2026, periodMonth: 8, branchId: branchR2, districtId, status: 'DRAFT',
    }).returning();
    await expect(approveDraft(stafR2, augDraft.id, new Date(2026, 9, 10, 0, 0, 1))).rejects.toMatchObject({
      code: ErrorCode.QR_PERIOD_CLOSED,
    });

    await db.delete(schema.periodDrafts).where(inArray(schema.periodDrafts.id, [novDraft.id, augDraft.id]));
  });

  test('sapuan susulan pasca-approve: kaleng baru langsung jadi assignment', async () => {
    const [c4] = await db.insert(schema.cans).values({
      branchId: branchR, ownerName: 'Owner T3-R4', ownerWhatsapp: '082000000100', qrCode: 'TEST-QR-T3-R4',
    }).returning();
    canR4 = c4.id;

    const res = await preparePeriodDraft(2026, 9, { now: new Date(2026, 9, 6, 8, 0, 0) });
    const rDraft = res.drafts.find((d) => d.branchId === branchR)!;
    expect(rDraft.draftStatus).toBe('APPROVED');
    expect(rDraft.directAssignments).toBe(1);

    const asg = await db.query.assignments.findFirst({
      where: and(eq(schema.assignments.canId, canR4), eq(schema.assignments.periodYear, 2026), eq(schema.assignments.periodMonth, 9)),
    });
    expect(asg?.status).toBe('ACTIVE');
  });

  test('listDrafts menghormati scope + recipients T11 hanya staf se-scope', async () => {
    const mine = await listDrafts(stafR, { year: 2026, month: 9 });
    expect(mine).toHaveLength(1);
    expect(mine[0].branchId).toBe(branchR);

    const all = await listDrafts(stafMwc, { year: 2026, month: 9 });
    const ids = all.map((d) => d.branchId);
    expect(ids).toEqual(expect.arrayContaining([branchR, branchT, branchR2]));

    const recipients = await collectApprovalRecipients(tDraftId);
    const recipientIds = recipients.map((r) => r.userId);
    expect(recipientIds).toEqual(expect.arrayContaining([stafMwc.userId, keuMwc.userId]));
    expect(recipientIds).not.toContain(stafR.userId);
    expect(recipients.every((r) => ['STAF_PENGUMPULAN', 'STAF_KEUANGAN'].includes(r.role))).toBe(true);
  });
});
