/**
 * C1-T6 — kunci berlapis MWC 2 tahap + F3/F8 (DB nyata, R2 mock).
 * Pola: periode fixed 2026-09 + now injeksi + cleanup audit dulu (T3→T5).
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ErrorCode } from '../../utils/errorCatalog';
import { kunciPeriode } from '../kunciPeriode';
import {
  countersignBranchSubmission,
  countersignPpkSubmission,
  signBranchSubmission,
  signPpkSubmission,
  type RequestContext,
} from '../cosign';
import { ensureBranchSubmission, ensurePpkSubmission } from '../ppkSubmissions';
import { submitCollection } from '../collectionSubmission';
import { baContentHash } from '../beritaAcara';
import { branchContentSnapshot, verifyBaRecord } from '../baPdfService';

jest.mock('../r2', () => ({
  uploadToR2: jest.fn(async (p: { key: string }) => ({ success: true, key: p.key })),
  getSignedDownloadUrl: jest.fn(async () => 'https://signed.test/ba.pdf'),
  deleteFromR2: jest.fn(async () => true),
  downloadFromR2: jest.fn(async () =>
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )),
}));

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const CTX: RequestContext = { ipAddress: '127.0.0.1', userAgent: 'jest' };

// Fase waktu Sept 2026: REKAP 28 Sep; KUNCI_KERAS 10 Okt 00:00:01.
const NOW_REKAP = new Date(2026, 8, 28, 12, 0, 0);
const NOW_KERAS = new Date(2026, 9, 10, 0, 0, 1);
const NOW_BELUM = new Date(2026, 8, 26, 12, 0, 0);

const T6_EMAILS = [
  'ppk-t6@test.com', 'ppk4-t6@test.com', 'ppk5-t6@test.com',
  'keur2-t6@test.com', 'keur5-t6@test.com',
  'adminr2-t6@test.com', 'adminr5-t6@test.com',
  'keumwc-t6@test.com', 'adminkec-t6@test.com', 'adminkec2-t6@test.com',
];
const T6_BRANCH_CODES = ['BT6-R1', 'BT6-R2', 'BT6-R3', 'BT6-R4', 'BT6-R5', 'BT6-PROG'];
const T6_DISTRICTS = ['DT6', 'DT6-B'];

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

async function deleteMyAuditTrails() {
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, T6_EMAILS));
  if (users.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users.map((u) => u.id)));
  }
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T6_BRANCH_CODES));
  if (branches.length > 0) {
    const bIds = branches.map((b) => b.id);
    const ppks = await db.select({ id: schema.ppkSubmissions.id }).from(schema.ppkSubmissions).where(inArray(schema.ppkSubmissions.branchId, bIds));
    const brs = await db.select({ id: schema.branchSubmissions.id }).from(schema.branchSubmissions).where(inArray(schema.branchSubmissions.branchId, bIds));
    const ids = [...ppks.map((p) => p.id), ...brs.map((b) => b.id)];
    if (ids.length > 0) {
      await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.entityId, ids));
    }
  }
}

describe('C1-T6 kunci berlapis MWC (DB, R2 mock)', () => {
  let dt6: string;
  let dt6b: string;
  let bR1: string;
  let bR2: string;
  let bR3: string;
  let bR4: string;
  let bR5: string;
  let bProg: string;

  let adminKec: { userId: string; role: string; branchId: null; districtId: string };
  let keuMwc: { userId: string; role: string; branchId: null; districtId: string };

  let r2BranchId: string;
  let r2PpkSubId: string;
  let r2BranchSubId: string;
  let r3BranchSubId: string;

  async function mkUser(
    email: string,
    phone: string,
    role: 'PETUGAS' | 'STAF_KEUANGAN' | 'ADMIN_RANTING' | 'ADMIN_KECAMATAN',
    branchId: string | null,
    districtId: string | null,
  ) {
    const [u] = await db
      .insert(schema.users)
      .values({ email, passwordHash: 'hash', fullName: email, phone, role, branchId, districtId })
      .returning();
    return u.id;
  }

  beforeAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(async () => {
      const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T6_BRANCH_CODES));
      const bIds = branches.map((b) => b.id);
      if (bIds.length > 0) {
        // Cross-talk T3: preparePeriodDraft membuat draft untuk SEMUA ranting
        // (termasuk fixture kita, tergantung urutan suite) — hapus dulu agar
        // FK draft_items → officers tak memblokir cleanup.
        const drafts = await db.select({ id: schema.periodDrafts.id }).from(schema.periodDrafts).where(inArray(schema.periodDrafts.branchId, bIds));
        const dIds = drafts.map((d) => d.id);
        if (dIds.length > 0) {
          await db.delete(schema.periodDraftItems).where(inArray(schema.periodDraftItems.draftId, dIds));
          await db.delete(schema.periodDrafts).where(inArray(schema.periodDrafts.id, dIds));
        }
        const cans = await db.select({ id: schema.cans.id }).from(schema.cans).where(inArray(schema.cans.branchId, bIds));
        const cIds = cans.map((c) => c.id);
        if (cIds.length > 0) {
          await db.delete(schema.collections).where(inArray(schema.collections.canId, cIds));
          await db.delete(schema.assignments).where(inArray(schema.assignments.canId, cIds));
        }
        const ppks = await db.select({ id: schema.ppkSubmissions.id }).from(schema.ppkSubmissions).where(inArray(schema.ppkSubmissions.branchId, bIds));
        for (const p of ppks) await db.delete(schema.ppkSubmissions).where(eq(schema.ppkSubmissions.id, p.id));
        const brs = await db.select({ id: schema.branchSubmissions.id }).from(schema.branchSubmissions).where(inArray(schema.branchSubmissions.branchId, bIds));
        for (const b of brs) await db.delete(schema.branchSubmissions).where(eq(schema.branchSubmissions.id, b.id));
        const officers = await db.select({ id: schema.officers.id }).from(schema.officers).where(inArray(schema.officers.branchId, bIds));
        for (const o of officers) {
          await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
          await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
        }
        if (cIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, cIds));
      }
      // FK period_calendar.locked_by → users: kalender wajib dihapus SEBELUM users.
      await db.delete(schema.periodCalendar).where(and(eq(schema.periodCalendar.periodYear, 2026), eq(schema.periodCalendar.periodMonth, 9)));
      // FK users.branch_id → branches: users wajib dihapus SEBELUM branches.
      await db.delete(schema.users).where(inArray(schema.users.email, T6_EMAILS));
      if (bIds.length > 0) {
        await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
      }
      await db.delete(schema.districts).where(inArray(schema.districts.code, T6_DISTRICTS));
    });

    const [d1] = await db.insert(schema.districts).values({ name: 'District T6', code: 'DT6', regionCode: 'D6' }).returning();
    const [d2] = await db.insert(schema.districts).values({ name: 'District T6-B', code: 'DT6-B', regionCode: 'DB' }).returning();
    dt6 = d1.id;
    dt6b = d2.id;

    const [r1] = await db.insert(schema.branches).values({ districtId: dt6, name: 'Ranting T6-1 diam', code: 'BT6-R1' }).returning();
    const [r2] = await db.insert(schema.branches).values({ districtId: dt6, name: 'Ranting T6-2 lapor', code: 'BT6-R2' }).returning();
    const [r3] = await db.insert(schema.branches).values({ districtId: dt6, name: 'Ranting T6-3 draft', code: 'BT6-R3' }).returning();
    const [r4] = await db.insert(schema.branches).values({ districtId: dt6, name: 'Ranting T6-4 ppk-parsial', code: 'BT6-R4' }).returning();
    const [r5] = await db.insert(schema.branches).values({ districtId: dt6, name: 'Ranting T6-5 force', code: 'BT6-R5' }).returning();
    const [pg] = await db.insert(schema.branches).values({ districtId: dt6, name: 'Program T6', code: 'BT6-PROG', kind: 'PROGRAM_MWC' }).returning();
    bR1 = r1.id; bR2 = r2.id; bR3 = r3.id; bR4 = r4.id; bR5 = r5.id; bProg = pg.id;

    // R1 diam: 1 kaleng AKTIF untuk snapshot (tanpa PPK/submission).
    await db.insert(schema.cans).values({ branchId: bR1, ownerName: 'Owner R1', ownerWhatsapp: '084000000600', qrCode: 'TEST-QR-T6-R1' });

    // R2 lapor: PPK + branch difinalkan via upacara (non-nol 50rb agar realistis).
    const uPpk2 = await mkUser('ppk-t6@test.com', '084000000601', 'PETUGAS', bR2, null);
    const [off2] = await db.insert(schema.officers).values({
      userId: uPpk2, districtId: dt6, branchId: bR2, employeeCode: 'EMP-T6-2', fullName: 'Petugas T6-2', phone: '084000000601',
    }).returning();
    const uKeuR2 = await mkUser('keur2-t6@test.com', '084000000602', 'STAF_KEUANGAN', bR2, null);
    const uAdminR2 = await mkUser('adminr2-t6@test.com', '084000000603', 'ADMIN_RANTING', bR2, null);
    const uKeuMwc = await mkUser('keumwc-t6@test.com', '084000000604', 'STAF_KEUANGAN', null, dt6);
    const uAdminKec = await mkUser('adminkec-t6@test.com', '084000000605', 'ADMIN_KECAMATAN', null, dt6);
    await mkUser('adminkec2-t6@test.com', '084000000606', 'ADMIN_KECAMATAN', null, dt6b);
    adminKec = { userId: uAdminKec, role: 'ADMIN_KECAMATAN', branchId: null, districtId: dt6 };
    keuMwc = { userId: uKeuMwc, role: 'STAF_KEUANGAN', branchId: null, districtId: dt6 };

    const [can2] = await db.insert(schema.cans).values({ branchId: bR2, ownerName: 'Owner R2', ownerWhatsapp: '084000000600', qrCode: 'TEST-QR-T6-R2' }).returning();
    const [asg2] = await db.insert(schema.assignments).values({ officerId: off2.id, canId: can2.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' }).returning();
    await db.transaction(async (tx) => {
      await submitCollection(tx as never, {
        assignmentId: asg2.id, canId: can2.id, officerId: off2.id, nominal: 50000,
        collectedAt: new Date(2026, 8, 25, 10, 0, 0),
      });
    });
    const ppkActor2 = { userId: uPpk2, role: 'PETUGAS', branchId: bR2, districtId: dt6, officerId: off2.id };
    const keuR2Actor = { userId: uKeuR2, role: 'STAF_KEUANGAN', branchId: bR2, districtId: dt6 };
    const adminR2Actor = { userId: uAdminR2, role: 'ADMIN_RANTING', branchId: bR2, districtId: dt6 };
    const keuMwcActor = { userId: uKeuMwc, role: 'STAF_KEUANGAN', branchId: null, districtId: dt6 };

    const sPpk2 = await ensurePpkSubmission(off2.id, bR2, 2026, 9);
    r2PpkSubId = sPpk2.id;
    await signPpkSubmission(ppkActor2, { submissionId: r2PpkSubId, signaturePng: TINY_PNG_B64, consent: true }, CTX, NOW_REKAP);
    const cs2 = await countersignPpkSubmission(keuR2Actor, { submissionId: r2PpkSubId, signaturePng: TINY_PNG_B64, consent: true }, CTX, NOW_REKAP);
    expect(cs2.status).toBe('FINAL');

    const sBr2 = await ensureBranchSubmission(bR2, 2026, 9);
    r2BranchSubId = sBr2.id;
    // total 50000 → bisyaroh 5000 → ekspektasi 13500 → setor pas agar tanpa alasan.
    await signBranchSubmission(keuR2Actor, {
      submissionId: r2BranchSubId, signaturePng: TINY_PNG_B64, consent: true, shareMwc: 13500,
    }, CTX, NOW_REKAP);
    const csBr2 = await countersignBranchSubmission(keuMwcActor, { submissionId: r2BranchSubId, signaturePng: TINY_PNG_B64, consent: true }, CTX, NOW_REKAP);
    expect(csBr2.status).toBe('FINAL');
    r2BranchId = bR2;

    // R3 draft: baris DRAFT tanpa TTD (pending manual).
    const sBr3 = await ensureBranchSubmission(bR3, 2026, 9);
    r3BranchSubId = sBr3.id;

    // R4 ppk-parsial: ada PPK DRAFT tapi tanpa branch row → pending, tidak di-nol-kan.
    const [u4] = await db.insert(schema.users).values({
      email: 'ppk4-t6@test.com', passwordHash: 'hash', fullName: 'ppk4', phone: '084000000607', role: 'PETUGAS', branchId: bR4,
    }).returning();
    const [off4] = await db.insert(schema.officers).values({
      userId: u4.id, districtId: dt6, branchId: bR4, employeeCode: 'EMP-T6-4', fullName: 'Petugas T6-4', phone: '084000000607',
    }).returning();
    await ensurePpkSubmission(off4.id, bR4, 2026, 9);

    // R5 needs_force (F8): 1 assignment ACTIVE tersisa → countersign tetap PPK_SIGNED.
    const [u5] = await db.insert(schema.users).values({
      email: 'ppk5-t6@test.com', passwordHash: 'hash', fullName: 'ppk5', phone: '084000000608', role: 'PETUGAS', branchId: bR5,
    }).returning();
    const [off5] = await db.insert(schema.officers).values({
      userId: u5.id, districtId: dt6, branchId: bR5, employeeCode: 'EMP-T6-5', fullName: 'Petugas T6-5', phone: '084000000608',
    }).returning();
    const uKeu5 = await mkUser('keur5-t6@test.com', '084000000609', 'STAF_KEUANGAN', bR5, null);
    await mkUser('adminr5-t6@test.com', '084000000610', 'ADMIN_RANTING', bR5, null);
    const [can5] = await db.insert(schema.cans).values({ branchId: bR5, ownerName: 'Owner R5', ownerWhatsapp: '084000000600', qrCode: 'TEST-QR-T6-R5' }).returning();
    await db.insert(schema.assignments).values({ officerId: off5.id, canId: can5.id, periodYear: 2026, periodMonth: 9, status: 'ACTIVE' });
    const sPpk5 = await ensurePpkSubmission(off5.id, bR5, 2026, 9);
    await signPpkSubmission(
      { userId: u5.id, role: 'PETUGAS', branchId: bR5, districtId: dt6, officerId: off5.id },
      { submissionId: sPpk5.id, signaturePng: TINY_PNG_B64, consent: true },
      CTX, NOW_REKAP,
    );
    await countersignPpkSubmission(
      { userId: uKeu5, role: 'STAF_KEUANGAN', branchId: bR5, districtId: dt6 },
      { submissionId: sPpk5.id, signaturePng: TINY_PNG_B64, consent: true },
      CTX, NOW_REKAP,
    );
  });

  afterAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(async () => {
      const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T6_BRANCH_CODES));
      const bIds = branches.map((b) => b.id);
      if (bIds.length > 0) {
        // Cross-talk T3: siapkan hapus draft (lihat beforeAll).
        const drafts = await db.select({ id: schema.periodDrafts.id }).from(schema.periodDrafts).where(inArray(schema.periodDrafts.branchId, bIds));
        const dIds = drafts.map((d) => d.id);
        if (dIds.length > 0) {
          await db.delete(schema.periodDraftItems).where(inArray(schema.periodDraftItems.draftId, dIds));
          await db.delete(schema.periodDrafts).where(inArray(schema.periodDrafts.id, dIds));
        }
        const cans = await db.select({ id: schema.cans.id }).from(schema.cans).where(inArray(schema.cans.branchId, bIds));
        const cIds = cans.map((c) => c.id);
        if (cIds.length > 0) {
          await db.delete(schema.collections).where(inArray(schema.collections.canId, cIds));
          await db.delete(schema.assignments).where(inArray(schema.assignments.canId, cIds));
        }
        const ppks = await db.select({ id: schema.ppkSubmissions.id }).from(schema.ppkSubmissions).where(inArray(schema.ppkSubmissions.branchId, bIds));
        for (const p of ppks) await db.delete(schema.ppkSubmissions).where(eq(schema.ppkSubmissions.id, p.id));
        const brs = await db.select({ id: schema.branchSubmissions.id }).from(schema.branchSubmissions).where(inArray(schema.branchSubmissions.branchId, bIds));
        for (const b of brs) await db.delete(schema.branchSubmissions).where(eq(schema.branchSubmissions.id, b.id));
        const officers = await db.select({ id: schema.officers.id }).from(schema.officers).where(inArray(schema.officers.branchId, bIds));
        for (const o of officers) {
          await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
          await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
        }
        if (cIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, cIds));
      }
      // FK period_calendar.locked_by → users: kalender wajib dihapus SEBELUM users.
      await db.delete(schema.periodCalendar).where(and(eq(schema.periodCalendar.periodYear, 2026), eq(schema.periodCalendar.periodMonth, 9)));
      // FK users.branch_id → branches: users wajib dihapus SEBELUM branches.
      await db.delete(schema.users).where(inArray(schema.users.email, T6_EMAILS));
      if (bIds.length > 0) {
        await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
      }
      await db.delete(schema.districts).where(inArray(schema.districts.code, T6_DISTRICTS));
    });
    await closeDbConnection();
  });

  test('belum saatnya (<27) → VALIDATION_ERROR; non-MWC → FORBIDDEN', async () => {
    await expect(kunciPeriode(adminKec, { year: 2026, month: 9 }, NOW_BELUM)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    await expect(
      kunciPeriode({ userId: keuMwc.userId, role: 'STAF_KEUANGAN', branchId: null, districtId: dt6 }, { year: 2026, month: 9 }, NOW_REKAP),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    await expect(kunciPeriode(adminKec, { year: 2027, month: 1 }, new Date(2026, 8, 28))).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  test('REKAP (27–9): tarik FINAL saja, tanpa men-nolkan, tanpa LOCKED', async () => {
    const res = await kunciPeriode(adminKec, { year: 2026, month: 9 }, NOW_REKAP);
    expect(res.phase).toBe('REKAP');
    expect(res.period).toBe('2026-09');
    expect(res.total_ranting).toBe(5);
    expect(res.final_count).toBe(1);
    expect(res.reported_count).toBe(1);
    expect(res.created_final_nol).toEqual([]);
    expect(res.calendar_locked).toBe(false);
    // R1 diam + R3 draft + R4 parsial + R5 force → 4 pending (R2 FINAL dikecualikan).
    expect(res.pending_count).toBe(4);
    const cal = await db.query.periodCalendar.findFirst({
      where: and(eq(schema.periodCalendar.periodYear, 2026), eq(schema.periodCalendar.periodMonth, 9)),
    });
    expect(cal).toBeDefined();
    expect(cal?.status).not.toBe('LOCKED');
    // Tidak ada FINAL_NOL yang terbuat pada fase REKAP.
    const nols = await db.select().from(schema.branchSubmissions).where(
      and(eq(schema.branchSubmissions.periodYear, 2026), eq(schema.branchSubmissions.periodMonth, 9), eq(schema.branchSubmissions.status, 'FINAL_NOL')),
    );
    expect(nols.length).toBe(0);
    expect(res.program_mwc_total).toBe(1);
  });

  test('F3 (T6): verify hanya sah untuk FINAL — DRAFT + hash benar → false', async () => {
    const draft = await db.query.branchSubmissions.findFirst({ where: eq(schema.branchSubmissions.id, r3BranchSubId) });
    expect(draft?.status).toBe('DRAFT');
    const goodHash = baContentHash('branch', branchContentSnapshot(draft!));
    expect(await verifyBaRecord('branch', draft!.id, draft!.version, goodHash)).toBe(false);
    const fin = await db.query.branchSubmissions.findFirst({ where: eq(schema.branchSubmissions.id, r2BranchSubId) });
    const finHash = baContentHash('branch', branchContentSnapshot(fin!));
    expect(await verifyBaRecord('branch', fin!.id, fin!.version, finHash)).toBe(true);
    expect(await verifyBaRecord('branch', fin!.id, fin!.version, '0'.repeat(64))).toBe(false);
  });

  test('F8 (T6): countersign ulang selama PPK_SIGNED dibiarkan (koreksi coretan)', async () => {
    const rows = await db.select().from(schema.ppkSubmissions).where(
      and(eq(schema.ppkSubmissions.branchId, bR5), eq(schema.ppkSubmissions.periodYear, 2026), eq(schema.ppkSubmissions.periodMonth, 9)),
    );
    const subId = rows[0].id;
    expect(rows[0].status).toBe('PPK_SIGNED');
    expect(rows[0].bendaharaSignerId).not.toBeNull();
    const users = await db.select().from(schema.users).where(eq(schema.users.email, 'keur5-t6@test.com'));
    const again = await countersignPpkSubmission(
      { userId: users[0].id, role: 'STAF_KEUANGAN', branchId: bR5, districtId: dt6 },
      { submissionId: subId, signaturePng: TINY_PNG_B64, consent: true },
      CTX, NOW_REKAP,
    );
    expect(again.status).toBe('PPK_SIGNED');
    expect(again.needs_force).toBe(true);
  });

  test('KUNCI_KERAS (10+): FINAL_NOL massal hanya ranting diam + LOCKED + idempoten', async () => {
    const res = await kunciPeriode(adminKec, { year: 2026, month: 9 }, NOW_KERAS);
    expect(res.phase).toBe('KUNCI_KERAS');
    expect(res.calendar_locked).toBe(true);
    // Hanya R1 yang diam (tanpa baris + tanpa PPK) → 1 FINAL_NOL.
    expect(res.created_final_nol.length).toBe(1);
    expect(res.created_final_nol[0].branch_id).toBe(bR1);
    expect(res.final_nol_count).toBe(1);
    expect(res.reported_count).toBe(1);

    const created = await db.query.branchSubmissions.findFirst({
      where: and(eq(schema.branchSubmissions.branchId, bR1), eq(schema.branchSubmissions.periodYear, 2026), eq(schema.branchSubmissions.periodMonth, 9)),
    });
    expect(created?.status).toBe('FINAL_NOL');
    expect(Number(created?.totalAmount)).toBe(0);
    expect(Number(created?.shareMwc)).toBe(0);
    expect(created?.varianceReason).toBe('KOREKSI_ADMIN');
    expect(created?.finalizedBy).toBe(adminKec.userId);
    expect(created?.canAktif).toBe(1);

    // Program MWC tidak ikut massal.
    const prog = await db.query.branchSubmissions.findFirst({
      where: and(eq(schema.branchSubmissions.branchId, bProg), eq(schema.branchSubmissions.periodYear, 2026), eq(schema.branchSubmissions.periodMonth, 9)),
    });
    expect(prog).toBeUndefined();

    // R3 DRAFT dan R4 parsial tetap pending (tidak di-nol-kan).
    const r3 = await db.query.branchSubmissions.findFirst({ where: eq(schema.branchSubmissions.id, r3BranchSubId) });
    expect(r3?.status).toBe('DRAFT');

    const cal = await db.query.periodCalendar.findFirst({
      where: and(eq(schema.periodCalendar.periodYear, 2026), eq(schema.periodCalendar.periodMonth, 9)),
    });
    expect(cal?.status).toBe('LOCKED');

    // Idempoten: panggilan kedua menciptakan 0 baru.
    const res2 = await kunciPeriode(adminKec, { year: 2026, month: 9 }, new Date(2026, 9, 11, 12, 0, 0));
    expect(res2.created_final_nol.length).toBe(0);
    expect(res2.final_nol_count).toBe(1);
    expect(r2BranchId).toBe(bR2);
  });
});
