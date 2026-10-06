/**
 * C1-T4 — submission PPK & ranting dengan DB nyata (§14.5/10, §7–§9).
 *
 * Mencakup: hitung ceil otomatis, FINAL + gerbangnya, tombol-mati + version
 * optimistik, kunci submit/resubmit/skip pasca-FINAL, CHECK DB sama-TTD,
 * gerbang semua-PPK-FINAL (sebut nama), selisih share, FINAL_NOL.
 * Pola: periode fixed 2026-09 + injeksi now (tidak kedaluwarsa oleh waktu);
 * cleanup audit dulu (pola deleteMyAuditTrails, ketetapan review-T3).
 */
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import {
  computePpkTotals,
  ensurePpkSubmission,
  ensureBranchSubmission,
  finalizePpkSubmission,
  finalizeBranchSubmission,
  type SubmissionActor,
} from '../ppkSubmissions';
import { submitCollection, resubmitCollection, assertAssignmentSkippable } from '../collectionSubmission';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ErrorCode } from '../../utils/errorCatalog';

const OCT5 = new Date(2026, 9, 5, 12, 0, 0);

const T4_EMAILS = [
  'ppk1-t4@test.com', 'ppk2-t4@test.com', 'ppk3-t4@test.com', 'ppkr3-t4@test.com',
  'adminr-t4@test.com', 'adminr3-t4@test.com', 'keur-t4@test.com', 'keumwc-t4@test.com', 'keur3-t4@test.com',
];
const T4_BRANCH_CODES = ['BT4-R', 'BT4-R2', 'BT4-R3'];

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
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.email, T4_EMAILS));
  if (users.length > 0) {
    await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.userId, users.map((u) => u.id)));
  }
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T4_BRANCH_CODES));
  if (branches.length > 0) {
    const ppks = await db.select({ id: schema.ppkSubmissions.id }).from(schema.ppkSubmissions).where(inArray(schema.ppkSubmissions.branchId, branches.map((b) => b.id)));
    if (ppks.length > 0) {
      await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.entityId, ppks.map((p) => p.id)));
    }
    const brs = await db.select({ id: schema.branchSubmissions.id }).from(schema.branchSubmissions).where(inArray(schema.branchSubmissions.branchId, branches.map((b) => b.id)));
    if (brs.length > 0) {
      await db.delete(schema.activityLogs).where(inArray(schema.activityLogs.entityId, brs.map((b) => b.id)));
    }
  }
}

describe('C1-T4 submission PPK & ranting (DB)', () => {
  let districtId: string;
  let branchR: string;
  let branchR2: string;
  let branchR3: string;
  let off1: string;
  let off2: string;
  let off3: string;
  let offR3: string;
  let uPpk1: string;
  let uPpk2: string;
  let uPpkR3: string;
  let uAdminR: string;
  let uAdminR3: string;
  let uKeuR: string;
  let uKeuMwc: string;
  let uKeuR3: string;
  let asgC5: string;
  let colSeq2Id: string;

  let ppk1: SubmissionActor;
  let ppk2: SubmissionActor;
  let ppkR3: SubmissionActor;
  let adminR: SubmissionActor;
  let adminR3: SubmissionActor;
  let keuR: SubmissionActor;
  let keuMwc: SubmissionActor;
  let keuR3: SubmissionActor;

  async function mkPetugas(email: string, phone: string, branchId: string, code: string, name: string) {
    const [u] = await db.insert(schema.users).values({
      email, passwordHash: 'hash', fullName: name, phone, role: 'PETUGAS', branchId,
    }).returning();
    const [o] = await db.insert(schema.officers).values({
      userId: u.id, districtId, branchId, employeeCode: code, fullName: name, phone,
    }).returning();
    return { userId: u.id, officerId: o.id };
  }

  async function mkAsg(officerId: string, canId: string, y: number, m: number) {
    const [a] = await db.insert(schema.assignments).values({
      officerId, canId, periodYear: y, periodMonth: m, status: 'ACTIVE',
    }).returning();
    return a.id;
  }

  async function doSubmit(assignmentId: string, canId: string, officerId: string, nominal: number) {
    return db.transaction(async (tx) => {
      const c = await submitCollection(tx as never, {
        assignmentId, canId, officerId, nominal,
        collectedAt: new Date(2026, 8, 25, 10, 0, 0),
      });
      return c;
    });
  }

  beforeAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(async () => {
      const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(inArray(schema.branches.code, T4_BRANCH_CODES));
      const bIds = branches.map((b) => b.id);
      if (bIds.length > 0) {
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
        await db.delete(schema.branches).where(inArray(schema.branches.id, bIds));
      }
      await db.delete(schema.users).where(inArray(schema.users.email, T4_EMAILS));
      await db.delete(schema.districts).where(eq(schema.districts.code, 'DT4'));
    });

    const [district] = await db.insert(schema.districts).values({
      name: 'District Test T4', code: 'DT4', regionCode: 'DT',
    }).returning();
    districtId = district.id;

    const [r] = await db.insert(schema.branches).values({ districtId, name: 'Ranting T4', code: 'BT4-R' }).returning();
    branchR = r.id;
    const [r2] = await db.insert(schema.branches).values({ districtId, name: 'Ranting T4-2', code: 'BT4-R2' }).returning();
    branchR2 = r2.id;
    const [r3] = await db.insert(schema.branches).values({ districtId, name: 'Ranting T4-3', code: 'BT4-R3' }).returning();
    branchR3 = r3.id;

    const p1 = await mkPetugas('ppk1-t4@test.com', '083000000101', branchR, 'EMP-T4-1', 'Petugas T4 Satu');
    const p2 = await mkPetugas('ppk2-t4@test.com', '083000000102', branchR, 'EMP-T4-2', 'Petugas T4 Dua');
    const p3 = await mkPetugas('ppk3-t4@test.com', '083000000103', branchR2, 'EMP-T4-3', 'Petugas T4 Tiga');
    const pR3 = await mkPetugas('ppkr3-t4@test.com', '083000000105', branchR3, 'EMP-T4-R3', 'Petugas T4 R3');
    uPpk1 = p1.userId; off1 = p1.officerId;
    uPpk2 = p2.userId; off2 = p2.officerId;
    off3 = p3.officerId;
    uPpkR3 = pR3.userId; offR3 = pR3.officerId;

    async function mkStaf(email: string, phone: string, role: 'ADMIN_RANTING' | 'STAF_KEUANGAN', branchId: string | null) {
      const [u] = await db.insert(schema.users).values({
        email, passwordHash: 'hash', fullName: email, phone, role, branchId,
        districtId: branchId ? null : districtId,
      }).returning();
      return u.id;
    }
    uAdminR = await mkStaf('adminr-t4@test.com', '083000000201', 'ADMIN_RANTING', branchR);
    uAdminR3 = await mkStaf('adminr3-t4@test.com', '083000000202', 'ADMIN_RANTING', branchR3);
    uKeuR = await mkStaf('keur-t4@test.com', '083000000203', 'STAF_KEUANGAN', branchR);
    uKeuMwc = await mkStaf('keumwc-t4@test.com', '083000000204', 'STAF_KEUANGAN', null);
    uKeuR3 = await mkStaf('keur3-t4@test.com', '083000000205', 'STAF_KEUANGAN', branchR3);

    ppk1 = { userId: uPpk1, role: 'PETUGAS', branchId: branchR, districtId, officerId: off1 };
    ppk2 = { userId: uPpk2, role: 'PETUGAS', branchId: branchR, districtId, officerId: off2 };
    adminR = { userId: uAdminR, role: 'ADMIN_RANTING', branchId: branchR, districtId };
    adminR3 = { userId: uAdminR3, role: 'ADMIN_RANTING', branchId: branchR3, districtId };
    keuR = { userId: uKeuR, role: 'STAF_KEUANGAN', branchId: branchR, districtId };
    keuMwc = { userId: uKeuMwc, role: 'STAF_KEUANGAN', branchId: null, districtId };
    ppkR3 = { userId: uPpkR3, role: 'PETUGAS', branchId: branchR3, districtId, officerId: offR3 };
    keuR3 = { userId: uKeuR3, role: 'STAF_KEUANGAN', branchId: branchR3, districtId };

    async function mkCan(branchId: string, qr: string, condition: 'AKTIF' | 'NON_AKTIF' = 'AKTIF') {
      const [c] = await db.insert(schema.cans).values({
        branchId, ownerName: `Owner ${qr}`, ownerWhatsapp: '083000000100', qrCode: qr, condition,
      }).returning();
      return c.id;
    }
    const c1 = await mkCan(branchR, 'TEST-QR-T4-C1');
    const c2 = await mkCan(branchR, 'TEST-QR-T4-C2');
    const c4 = await mkCan(branchR, 'TEST-QR-T4-C4');
    await mkCan(branchR, 'TEST-QR-T4-C6', 'NON_AKTIF');
    const c3 = await mkCan(branchR2, 'TEST-QR-T4-C3');

    // off1: C1 seq1 50rb → koreksi seq2 75rb; C2 100rb (COMPLETED semua).
    const a1 = await mkAsg(off1, c1, 2026, 9);
    await doSubmit(a1, c1, off1, 50000);
    const seq1 = await db.query.collections.findFirst({
      where: and(eq(schema.collections.assignmentId, a1), eq(schema.collections.submitSequence, 1)),
    });
    const { newCollection } = await db.transaction(async (tx) => {
      return resubmitCollection(tx as never, { collectionId: seq1!.id, nominal: 75000, alasanResubmit: 'Salah ketik nominal koreksi' });
    });
    colSeq2Id = newCollection.id;
    const a2 = await mkAsg(off1, c2, 2026, 9);
    await doSubmit(a2, c2, off1, 100000);

    // off2: C4 867.500 (angka Madendo — bisyaroh 87.000).
    const a4 = await mkAsg(off2, c4, 2026, 9);
    await doSubmit(a4, c4, off2, 867500);
    void c3;
  });

  afterAll(async () => {
    await deleteMyAuditTrails();
    await withImmutableRulesDisabled(async () => {
      const cans = await db.select({ id: schema.cans.id }).from(schema.cans).where(inArray(schema.cans.branchId, [branchR, branchR2, branchR3]));
      const cIds = cans.map((c) => c.id);
      if (cIds.length > 0) {
        await db.delete(schema.collections).where(inArray(schema.collections.canId, cIds));
        await db.delete(schema.assignments).where(inArray(schema.assignments.canId, cIds));
      }
      const ppks = await db.select({ id: schema.ppkSubmissions.id }).from(schema.ppkSubmissions).where(inArray(schema.ppkSubmissions.branchId, [branchR, branchR2, branchR3]));
      for (const p of ppks) await db.delete(schema.ppkSubmissions).where(eq(schema.ppkSubmissions.id, p.id));
      const brs = await db.select({ id: schema.branchSubmissions.id }).from(schema.branchSubmissions).where(inArray(schema.branchSubmissions.branchId, [branchR, branchR2, branchR3]));
      for (const b of brs) await db.delete(schema.branchSubmissions).where(eq(schema.branchSubmissions.id, b.id));
      const officers = await db.select({ id: schema.officers.id }).from(schema.officers).where(inArray(schema.officers.branchId, [branchR, branchR2, branchR3]));
      for (const o of officers) {
        await db.delete(schema.assignments).where(eq(schema.assignments.officerId, o.id));
        await db.delete(schema.officers).where(eq(schema.officers.id, o.id));
      }
      if (cIds.length > 0) await db.delete(schema.cans).where(inArray(schema.cans.id, cIds));
      await db.delete(schema.users).where(inArray(schema.users.email, T4_EMAILS));
      await db.delete(schema.branches).where(inArray(schema.branches.id, [branchR, branchR2, branchR3]));
      await db.delete(schema.districts).where(eq(schema.districts.id, districtId));
    });
    await closeDbConnection();
  });

  test('hitung otomatis: total versi terbaru + ceil ribuan (75rb+100rb=175rb → bis 18rb)', async () => {
    const t = await computePpkTotals(db, off1, 2026, 9);
    expect(t).toEqual({ total: 175000, collectionCount: 2, bisyaroh: 18000, net: 157000, aggregateTotal: 0, aggregateCount: 0 });
    const sub = await ensurePpkSubmission(off1, branchR, 2026, 9);
    expect(sub.status).toBe('DRAFT');
    expect(sub.version).toBe(1);
    expect(Number(sub.totalAmount)).toBe(175000);
    expect(sub.formulaSnapshot).toMatchObject({ bisyaroh_pct: 10, rounding: 'ceil_1000' });
  });

  test('FINAL menolak: signer kosong, sama orang, PPK bukan pemilik, bendahara bukan Keuangan', async () => {
    const sub = await ensurePpkSubmission(off2, branchR, 2026, 9);
    const bad: Array<Record<string, string>> = [
      { ppk_signer_id: uPpk2, bendahara_signer_id: uPpk2 },
      { ppk_signer_id: uPpk1, bendahara_signer_id: uKeuR },
      { ppk_signer_id: uPpk2, bendahara_signer_id: uPpk1 },
    ];
    for (const b of bad) {
      await expect(
        finalizePpkSubmission(ppk2, {
          submissionId: sub.id, ppkSignerId: b.ppk_signer_id, bendaharaSignerId: b.bendahara_signer_id,
        }, OCT5),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    }
    // Keuangan MWC (distrik saja) tidak boleh FINAL-kan setoran ranting.
    await expect(
      finalizePpkSubmission(keuMwc, {
        submissionId: sub.id, ppkSignerId: uPpk2, bendaharaSignerId: uKeuMwc,
      }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });
    // PPK lain tidak boleh FINAL-kan setoran orang.
    await expect(
      finalizePpkSubmission(ppk1, {
        submissionId: sub.id, ppkSignerId: uPpk2, bendaharaSignerId: uKeuR,
      }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  test('FINAL menolak sisa ACTIVE; force Admin + alasan lolos + audit', async () => {
    const c5 = await db.insert(schema.cans).values({
      branchId: branchR, ownerName: 'Owner TEST-QR-T4-C5', ownerWhatsapp: '083000000100', qrCode: 'TEST-QR-T4-C5',
    }).returning().then((r) => r[0].id);
    asgC5 = await mkAsg(off1, c5, 2026, 9);
    const sub = await ensurePpkSubmission(off1, branchR, 2026, 9);

    await expect(
      finalizePpkSubmission(ppk1, { submissionId: sub.id, ppkSignerId: uPpk1, bendaharaSignerId: uKeuR }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

    await expect(
      finalizePpkSubmission(ppk1, {
        submissionId: sub.id, ppkSignerId: uPpk1, bendaharaSignerId: uKeuR, forceReason: 'Saya paksa sendiri',
      }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

    const res = await finalizePpkSubmission(adminR, {
      submissionId: sub.id, ppkSignerId: uPpk1, bendaharaSignerId: uKeuR, forceReason: 'PPK sakit, sisa 1 kaleng dinolkan manual',
    }, OCT5);
    expect(res.status).toBe('FINAL');
    expect(res.total_amount).toBe(175000);
    expect(res.version).toBe(1);
    expect(res.finalized_at).not.toBeNull();
  });

  test('tombol mati: FINAL ganda → CONFLICT; version basi → CONFLICT; ensure beku', async () => {
    const sub = await ensurePpkSubmission(off1, branchR, 2026, 9);
    expect(sub.status).toBe('FINAL');
    await expect(
      finalizePpkSubmission(adminR, {
        submissionId: sub.id, ppkSignerId: uPpk1, bendaharaSignerId: uKeuR, forceReason: 'Coba dua kali',
      }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

    const d2 = await ensurePpkSubmission(off2, branchR, 2026, 9);
    await expect(
      finalizePpkSubmission(ppk2, {
        submissionId: d2.id, ppkSignerId: uPpk2, bendaharaSignerId: uKeuR, expectedVersion: 999,
      }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

    const ok = await finalizePpkSubmission(keuR, {
      submissionId: d2.id, ppkSignerId: uPpk2, bendaharaSignerId: uKeuR,
    }, OCT5);
    expect(ok.status).toBe('FINAL');
    expect(ok.total_amount).toBe(867500);
    expect(ok.bisyaroh_amount).toBe(87000);
  });

  test('kunci pasca-FINAL: submit/resubmit/skip Sept off1 → QR_ALREADY_SUBMITTED', async () => {
    const asgC5Row = await db.query.assignments.findFirst({ where: eq(schema.assignments.id, asgC5) });
    await expect(
      db.transaction(async (tx) => {
        await submitCollection(tx as never, {
          assignmentId: asgC5, canId: asgC5Row!.canId,
          officerId: off1, nominal: 10000, collectedAt: new Date(2026, 8, 26, 10, 0, 0),
        });
      }),
    ).rejects.toMatchObject({ code: ErrorCode.QR_ALREADY_SUBMITTED });

    await expect(
      db.transaction(async (tx) => {
        await resubmitCollection(tx as never, {
          collectionId: colSeq2Id, nominal: 76000, alasanResubmit: 'Coba koreksi pasca FINAL',
        });
      }),
    ).rejects.toMatchObject({ code: ErrorCode.QR_ALREADY_SUBMITTED });

    const asg = await db.query.assignments.findFirst({ where: eq(schema.assignments.id, asgC5) });
    await expect(assertAssignmentSkippable(db, asg!)).rejects.toMatchObject({
      code: ErrorCode.QR_ALREADY_SUBMITTED,
    });
  });

  test('syarat T0: CHECK DB menolak dua TTD userId sama (ppk + ranting)', async () => {
    await expect(
      db.insert(schema.ppkSubmissions).values({
        officerId: off3, branchId: branchR2, periodYear: 2026, periodMonth: 9,
        ppkSignerId: uAdminR, bendaharaSignerId: uAdminR,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(schema.branchSubmissions).values({
        branchId: branchR2, districtId, periodYear: 2026, periodMonth: 10,
        rantingSignerId: uAdminR, mwcBendaharaSignerId: uAdminR,
      }),
    ).rejects.toThrow();
  });

  test('gerbang ranting: 1 PPK DRAFT → tolak sambil sebut nama', async () => {
    await ensureBranchSubmission(branchR2, 2026, 9);
    const sub = await db.query.branchSubmissions.findFirst({
      where: and(
        eq(schema.branchSubmissions.branchId, branchR2),
        eq(schema.branchSubmissions.periodYear, 2026),
        eq(schema.branchSubmissions.periodMonth, 9),
      ),
    });
    await expect(
      finalizeBranchSubmission({ userId: uAdminR, role: 'ADMIN_RANTING', branchId: branchR, districtId }, {
        submissionId: sub!.id, shareMwc: 0,
        rantingSignerId: uAdminR, mwcBendaharaSignerId: uKeuMwc,
      }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  test('gerbang ranting R2 miliknya: tolak + sebut "Petugas T4 Tiga"', async () => {
    await ensurePpkSubmission(off3, branchR2, 2026, 9);
    const adminR2 = { userId: 'x', role: 'ADMIN_RANTING', branchId: branchR2, districtId } as SubmissionActor;
    const sub = await db.query.branchSubmissions.findFirst({
      where: and(
        eq(schema.branchSubmissions.branchId, branchR2),
        eq(schema.branchSubmissions.periodYear, 2026),
        eq(schema.branchSubmissions.periodMonth, 9),
      ),
    });
    try {
      await finalizeBranchSubmission(adminR2, {
        submissionId: sub!.id, shareMwc: 0,
        rantingSignerId: 'x', mwcBendaharaSignerId: uKeuMwc,
      }, OCT5);
      throw new Error('seharusnya ditolak');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(err.message).toContain('Petugas T4 Tiga');
    }
  });

  test('selisih share: >10rb tanpa alasan ditolak; GABUNG tanpa periode ditolak; pas lolos', async () => {
    const agg = await ensureBranchSubmission(branchR, 2026, 9);
    expect(Number(agg.totalAmount)).toBe(1042500);
    expect(Number(agg.expectedShare)).toBe(281250);

    await expect(
      finalizeBranchSubmission(adminR, {
        submissionId: agg.id, shareMwc: 300000,
        rantingSignerId: uAdminR, mwcBendaharaSignerId: uKeuMwc,
      }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

    await expect(
      finalizeBranchSubmission(adminR, {
        submissionId: agg.id, shareMwc: 300000, varianceReason: 'GABUNG_PERIODE',
        rantingSignerId: uAdminR, mwcBendaharaSignerId: uKeuMwc,
      }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

    const res = await finalizeBranchSubmission(adminR, {
      submissionId: agg.id, shareMwc: 281000,
      rantingSignerId: uAdminR, mwcBendaharaSignerId: uKeuMwc,
    }, OCT5);
    expect(res.status).toBe('FINAL');
    expect(res.share_variance).toBe(-250);
    expect(res.net_amount).toBe(1042500 - 105000 - 281000);
    expect(res.can_total).toBe(5);
    expect(res.can_aktif).toBe(4);
    expect(res.can_nonaktif).toBe(1);
  });

  test('FINAL_NOL: tanpa alasan ditolak; beralasan → FINAL_NOL 0', async () => {
    const sub = await ensureBranchSubmission(branchR3, 2026, 9);
    expect(Number(sub.totalAmount)).toBe(0);
    await expect(
      finalizeBranchSubmission(adminR3, {
        submissionId: sub.id, shareMwc: 0, asNol: true,
        rantingSignerId: uAdminR3, mwcBendaharaSignerId: uKeuMwc,
      }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

    const res = await finalizeBranchSubmission(adminR3, {
      submissionId: sub.id, shareMwc: 0, asNol: true, varianceReason: 'KOREKSI_ADMIN',
      rantingSignerId: uAdminR3, mwcBendaharaSignerId: uKeuMwc,
    }, OCT5);
    expect(res.status).toBe('FINAL_NOL');
    expect(res.total_amount).toBe(0);
  });

  test('syarat review-T4 #1: bendahara ranting lain → FORBIDDEN_SCOPE (tingkat PPK)', async () => {
    const sub = await ensurePpkSubmission(offR3, branchR3, 2026, 9);
    expect(sub.status).toBe('DRAFT');
    await expect(
      finalizePpkSubmission(ppkR3, {
        submissionId: sub.id, ppkSignerId: uPpkR3, bendaharaSignerId: uKeuR,
      }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });
    const ok = await finalizePpkSubmission(ppkR3, {
      submissionId: sub.id, ppkSignerId: uPpkR3, bendaharaSignerId: uKeuR3,
    }, OCT5);
    expect(ok.status).toBe('FINAL');
  });

  test('syarat review-T4 #1: bendahara cabang (bukan MWC) → FORBIDDEN_SCOPE (tingkat ranting)', async () => {
    const sub = await ensureBranchSubmission(branchR2, 2026, 10);
    expect(sub.status).toBe('DRAFT');
    const adminR2x = { userId: 'x', role: 'ADMIN_RANTING', branchId: branchR2, districtId } as SubmissionActor;
    await expect(
      finalizeBranchSubmission(adminR2x, {
        submissionId: sub.id, shareMwc: 0,
        rantingSignerId: 'x', mwcBendaharaSignerId: uKeuR,
      }, OCT5),
    ).rejects.toMatchObject({ code: ErrorCode.FORBIDDEN_SCOPE });
  });
});
