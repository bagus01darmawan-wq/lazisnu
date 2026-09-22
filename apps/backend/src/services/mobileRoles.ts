/**
 * C1-T9 — Layanan peran mobile (1 APK, tampil beda per kartu).
 *
 * Penjaga tetap di server (routes + service induk); fungsi di sini hanya
 * merangkum data baca per peran dari tabel yang sudah ada:
 * - `getPeriodInfo`: batas + status + countdown satu periode (murni tanggal,
 *   tanpa DB — dipakai chip toleransi & countdown semua peran).
 * - `saveDeviceToken`: simpan fcm_token milik sendiri (fondasi push T11).
 * - `getStafSummary`: ringkasan Staf Pengumpulan (setuju/monitor).
 * - `getKeuanganInbox`: antrean countersign Bendahara/Sekretaris.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq, sql } from 'drizzle-orm';
import { Errors } from '../utils/errorCatalog';
import { insertActivityLog } from './auditLogService';
import {
  buildPeriodBoundaries,
  periodKey,
  resolvePeriodStatus,
} from './periodCalendar';
import { isEscalated } from './periodDrafts';
import type { SubmissionActor } from './ppkSubmissions';

export interface PeriodInfo {
  period: string;
  period_year: number;
  period_month: number;
  assign_date: Date;
  due_date: Date;
  tolerance_end: Date;
  period_status: 'OPEN' | 'TOLERANCE' | 'LOCKED' | 'DIBUKA_SEBAGIAN';
  /** Sisa hari penjemputan s/d due (tgl 27); 0 bila lewat. */
  days_to_due: number;
  /** Sisa hari s/d kunci keras (tgl 9 bln berikut 23:59); 0 bila terkunci. */
  days_to_lock: number;
  /** True bila masih dalam masa toleransi 28–9. */
  in_tolerance: boolean;
}

export function getPeriodInfo(year: number, month: number, now: Date = new Date()): PeriodInfo {
  let b: ReturnType<typeof buildPeriodBoundaries>;
  try {
    b = buildPeriodBoundaries(year, month);
  } catch {
    throw Errors.VALIDATION_ERROR('Periode tidak valid (year 2020–2100, month 1–12).');
  }
  const status = resolvePeriodStatus(now, b);
  const dayMs = 24 * 3_600_000;
  return {
    period: periodKey(year, month),
    period_year: year,
    period_month: month,
    assign_date: b.assignDate,
    due_date: b.dueDate,
    tolerance_end: b.toleranceEnd,
    period_status: status,
    days_to_due: Math.max(0, Math.ceil((b.dueDate.getTime() - now.getTime()) / dayMs)),
    days_to_lock: Math.max(0, Math.ceil((b.toleranceEnd.getTime() - now.getTime()) / dayMs)),
    in_tolerance: status === 'TOLERANCE',
  };
}

/** Simpan fcm_token milik sendiri (token milik sesi login — tanpa userId body). */
export async function saveDeviceToken(userId: string, fcmToken: string): Promise<{ saved: boolean }> {
  const token = (fcmToken ?? '').trim();
  if (token.length < 1 || token.length > 255) {
    throw Errors.VALIDATION_ERROR('fcm_token wajib 1–255 karakter.');
  }
  const updated = await db
    .update(schema.users)
    .set({ fcmToken: token, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning({ id: schema.users.id });
  if (updated.length === 0) throw Errors.VALIDATION_ERROR('Pengguna tidak ditemukan');
  // K3 (review-T9): jejak audit agar T11 mudah menelusur token yang dipakai.
  try {
    await insertActivityLog({
      userId,
      officerId: null,
      actionType: 'DEVICE_TOKEN_SAVED',
      entityType: 'user',
      entityId: userId,
      oldData: null,
      newData: { token_updated: true },
      ipAddress: 'device-token',
      userAgent: null,
    });
  } catch {
    // Audit tak boleh menggagalkan simpan yang sah.
  }
  return { saved: true };
}

export interface StafSummary {
  period: string;
  period_status: string;
  // K1 (review-T9): countdown nyata dari server agar pengingat klien jujur.
  days_to_due: number;
  days_to_lock: number;
  in_tolerance: boolean;
  scope: { kind: 'RANTING' | 'PROGRAM_MWC'; branch_id: string | null; district_id: string | null };
  drafts: { pending: number; escalated: number; approved: number };
  ppk: { final_count: number; total_count: number };
  tugas_active: number;
}

/**
 * Ringkasan Staf Pengumpulan: draft menunggu/eskalasi/disetujui + progres
 * PPK + sisa ACTIVE dalam scope-nya (rantingnya / program MWC distriknya).
 */
export async function getStafSummary(
  actor: SubmissionActor,
  year: number,
  month: number,
  now: Date = new Date(),
): Promise<StafSummary> {
  if (actor.role !== 'STAF_PENGUMPULAN') {
    throw Errors.FORBIDDEN('Hanya Staf Bid. Pengumpulan');
  }
  try {
    buildPeriodBoundaries(year, month);
  } catch {
    throw Errors.VALIDATION_ERROR('Periode tidak valid (year 2020–2100, month 1–12).');
  }
  const countdown = getPeriodInfo(year, month, now);
  const periodStatus = countdown.period_status;

  // Scope: ranting (branchId) atau program MWC distrik (districtId).
  let draftBranchIds: string[];
  let ppkBranchIds: string[];
  let scope: StafSummary['scope'];
  if (actor.branchId) {
    draftBranchIds = [actor.branchId];
    ppkBranchIds = [actor.branchId];
    scope = { kind: 'RANTING', branch_id: actor.branchId, district_id: actor.districtId ?? null };
  } else if (actor.districtId) {
    const progs = await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(and(eq(schema.branches.districtId, actor.districtId), eq(schema.branches.kind, 'PROGRAM_MWC')));
    draftBranchIds = progs.map((p) => p.id);
    ppkBranchIds = progs.map((p) => p.id);
    scope = { kind: 'PROGRAM_MWC', branch_id: null, district_id: actor.districtId };
  } else {
    throw Errors.FORBIDDEN_SCOPE('Akun staf tanpa scope ranting/distrik');
  }

  let pending = 0;
  let escalated = 0;
  let approved = 0;
  for (const branchId of draftBranchIds) {
    const d = await db.query.periodDrafts.findFirst({
      where: and(
        eq(schema.periodDrafts.periodYear, year),
        eq(schema.periodDrafts.periodMonth, month),
        eq(schema.periodDrafts.branchId, branchId),
      ),
      columns: { status: true, preparedAt: true },
    });
    if (!d) continue;
    if (d.status === 'APPROVED') approved += 1;
    else if (isEscalated(d.preparedAt, now)) escalated += 1;
    else pending += 1;
  }

  let finalCount = 0;
  let totalCount = 0;
  let tugasActive = 0;
  for (const branchId of ppkBranchIds) {
    const subs = await db.query.ppkSubmissions.findMany({
      where: and(
        eq(schema.ppkSubmissions.branchId, branchId),
        eq(schema.ppkSubmissions.periodYear, year),
        eq(schema.ppkSubmissions.periodMonth, month),
      ),
      columns: { status: true, officerId: true },
    });
    totalCount += subs.length;
    finalCount += subs.filter((s) => s.status === 'FINAL').length;
    for (const s of subs) {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.assignments)
        .where(
          and(
            eq(schema.assignments.officerId, s.officerId),
            eq(schema.assignments.periodYear, year),
            eq(schema.assignments.periodMonth, month),
            eq(schema.assignments.status, 'ACTIVE'),
          ),
        );
      tugasActive += n;
    }
  }

  return {
    period: periodKey(year, month),
    period_status: periodStatus,
    days_to_due: countdown.days_to_due,
    days_to_lock: countdown.days_to_lock,
    in_tolerance: countdown.in_tolerance,
    scope,
    drafts: { pending, escalated, approved },
    ppk: { final_count: finalCount, total_count: totalCount },
    tugas_active: tugasActive,
  };
}

export interface KeuanganInboxItem {
  kind: 'ppk' | 'branch';
  submission_id: string;
  branch_id: string;
  branch_name: string;
  officer_name: string | null;
  total: number;
  status: string;
  version: number;
  needs_force: boolean;
}

export interface KeuanganInbox {
  period: string;
  items: KeuanganInboxItem[];
}

/**
 * Antrean countersign Bendahara/Sekretaris: PPK_SIGNED seranting (atau
 * sedistrik bila akun MWC) + branch DRAFT yang sudah di-sign ranting.
 * FINAL tak masuk antrean (selesai). Read-only.
 */
export async function getKeuanganInbox(
  actor: SubmissionActor,
  year: number,
  month: number,
): Promise<KeuanganInbox> {
  if (actor.role !== 'STAF_KEUANGAN') {
    throw Errors.FORBIDDEN('Hanya Bendahara/Sekretaris');
  }
  try {
    buildPeriodBoundaries(year, month);
  } catch {
    throw Errors.VALIDATION_ERROR('Periode tidak valid (year 2020–2100, month 1–12).');
  }
  const items: KeuanganInboxItem[] = [];

  if (actor.branchId) {
    // Keuangan ranting: PPK_SIGNED rantingnya.
    const subs = await db.query.ppkSubmissions.findMany({
      where: and(
        eq(schema.ppkSubmissions.branchId, actor.branchId),
        eq(schema.ppkSubmissions.periodYear, year),
        eq(schema.ppkSubmissions.periodMonth, month),
        eq(schema.ppkSubmissions.status, 'PPK_SIGNED'),
      ),
      with: {
        officer: { columns: { fullName: true } },
        branch: { columns: { name: true } },
      },
    });
    for (const s of subs) {
      const [{ n: activeLeft }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.assignments)
        .where(
          and(
            eq(schema.assignments.officerId, s.officerId),
            eq(schema.assignments.periodYear, year),
            eq(schema.assignments.periodMonth, month),
            eq(schema.assignments.status, 'ACTIVE'),
          ),
        );
      items.push({
        kind: 'ppk',
        submission_id: s.id,
        branch_id: s.branchId,
        branch_name: s.branch?.name ?? '',
        officer_name: s.officer?.fullName ?? null,
        total: Number(s.totalAmount),
        status: s.status,
        version: s.version,
        needs_force: activeLeft > 0,
      });
    }
  } else if (actor.districtId) {
    // Keuangan MWC: branch DRAFT yang sudah di-sign Admin Ranting, sedistrik.
    const subs = await db.query.branchSubmissions.findMany({
      where: and(
        eq(schema.branchSubmissions.districtId, actor.districtId),
        eq(schema.branchSubmissions.periodYear, year),
        eq(schema.branchSubmissions.periodMonth, month),
        eq(schema.branchSubmissions.status, 'DRAFT'),
      ),
      with: { branch: { columns: { name: true } } },
    });
    for (const s of subs) {
      if (!s.rantingSignerId) continue;
      items.push({
        kind: 'branch',
        submission_id: s.id,
        branch_id: s.branchId,
        branch_name: s.branch?.name ?? '',
        officer_name: null,
        total: Number(s.totalAmount),
        status: s.status,
        version: s.version,
        needs_force: false,
      });
    }
  } else {
    throw Errors.FORBIDDEN_SCOPE('Akun keuangan tanpa scope ranting/distrik');
  }

  return { period: periodKey(year, month), items };
}
