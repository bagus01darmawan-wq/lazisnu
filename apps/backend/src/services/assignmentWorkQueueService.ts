import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { JWTPayload } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { assertBranchAccess, assertDukuhAccess } from '../middleware/ownership';
import { ASSIGNABLE_CONDITIONS } from './conditionRules';
import { currentOperationalPeriod } from '../utils/operationalTimeZone';

/**
 * Satu permintaan untuk seluruh kebutuhan tab "Kelola" halaman Penugasan:
 * ringkasan coverage, queue grup yang belum ditugaskan, dan beban petugas.
 *
 * Angka `unassignedAssignableCans` sengaja memakai aturan yang sama dengan
 * `POST /assignments/bulk-branch` (kaleng aktif + kondisi AKTIF/RUSAK/HILANG),
 * supaya angka di layar tidak pernah berbeda dari hasil assign massal.
 */

export type WorkQueueScope = 'branch' | 'dukuh';
export type WorkQueueGroupKind = 'dukuh' | 'rt' | 'can';

export interface WorkQueueGroup {
  kind: WorkQueueGroupKind;
  id: string;
  name: string;
  totalCans: number;
  assignedCans: number;
  unassignedCans: number;
  canIds: string[] | null;
}

export interface WorkQueueOfficer {
  id: string;
  fullName: string;
  employeeCode: string;
  isActive: boolean;
  dukuhId: string | null;
  dukuhName: string | null;
  assignedCount: number;
  completedCount: number;
  uncollectedCount: number;
}

export interface WorkQueueSummary {
  totalCans: number;
  assignableCans: number;
  assignedAssignableCans: number;
  unassignedAssignableCans: number;
  nonAssignableCans: number;
  completed: number;
  uncollected: number;
  officerCount: number;
  activeOfficerCount: number;
  groupCount: number;
}

export interface WorkQueueResponse {
  period: { year: number; month: number };
  region: {
    kind: WorkQueueScope;
    id: string;
    name: string;
    branchId: string;
    branchName: string;
  };
  summary: WorkQueueSummary;
  groups: WorkQueueGroup[];
  officers: WorkQueueOfficer[];
}

export interface WorkQueueParams {
  year?: string;
  month?: string;
  branch_id?: string;
  dukuh_id?: string;
}

function parsePeriod(params: WorkQueueParams) {
  const { year: currentYear, month: currentMonth } = currentOperationalPeriod();
  const year = params.year ? parseInt(params.year, 10) : currentYear;
  const month = params.month ? parseInt(params.month, 10) : currentMonth;
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    year < 2020 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    throw new AppError('INVALID_PERIOD', 'Periode tidak valid', 400);
  }
  return { year, month };
}

/**
 * Filter SQL yang identik dengan aturan `bulk-branch`. Diekspresikan sebagai
 * ekspresi agar bisa dipakai di dalam FILTER aggregate.
 */
const assignableFilter = sql`${schema.cans.isActive} = true AND ${schema.cans.condition} IN (${sql.join(
  ASSIGNABLE_CONDITIONS.map((condition) => sql`${condition}`),
  sql`, `
)})`;

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

async function resolveRegion(user: JWTPayload, params: WorkQueueParams) {
  if (params.dukuh_id) {
    const dukuh = await db.query.dukuhs.findFirst({
      where: eq(schema.dukuhs.id, params.dukuh_id),
      columns: { id: true, name: true, branchId: true },
    });
    if (!dukuh) throw new AppError('NOT_FOUND', 'Dukuh tidak ditemukan', 404);
    await assertDukuhAccess(user as JWTPayload & { userId: string }, dukuh.id);

    const branch = await db.query.branches.findFirst({
      where: eq(schema.branches.id, dukuh.branchId),
      columns: { id: true, name: true },
    });
    if (!branch) throw new AppError('NOT_FOUND', 'Ranting tidak ditemukan', 404);

    return {
      kind: 'dukuh' as const,
      id: dukuh.id,
      name: dukuh.name,
      branchId: branch.id,
      branchName: branch.name,
    };
  }

  const branchId = user.role === 'ADMIN_RANTING' ? user.branchId : params.branch_id;
  if (!branchId) {
    throw new AppError('MISSING_BRANCH', 'Ranting wajib dipilih', 400);
  }
  await assertBranchAccess(user as JWTPayload & { userId: string }, branchId);

  const branch = await db.query.branches.findFirst({
    where: eq(schema.branches.id, branchId),
    columns: { id: true, name: true },
  });
  if (!branch) throw new AppError('NOT_FOUND', 'Ranting tidak ditemukan', 404);

  return {
    kind: 'branch' as const,
    id: branch.id,
    name: branch.name,
    branchId: branch.id,
    branchName: branch.name,
  };
}

async function buildBranchGroups(branchId: string, year: number, month: number) {
  const rows = await db
    .select({
      id: schema.cans.dukuhId,
      name: schema.dukuhs.name,
      // count(DISTINCT), bukan count(*): kaleng yang pernah di-transfer punya
      // lebih dari satu baris assignment pada periode yang sama (baris lama
      // REASSIGNED + baris baru ACTIVE), dan LEFT JOIN menggandakannya.
      total: sql<number>`count(DISTINCT ${schema.cans.id}) FILTER (WHERE ${assignableFilter})`,
      assigned: sql<number>`count(DISTINCT ${schema.cans.id}) FILTER (WHERE ${assignableFilter} AND ${schema.assignments.id} IS NOT NULL)`,
    })
    .from(schema.cans)
    .leftJoin(schema.dukuhs, eq(schema.cans.dukuhId, schema.dukuhs.id))
    .leftJoin(
      schema.assignments,
      and(
        eq(schema.assignments.canId, schema.cans.id),
        eq(schema.assignments.periodYear, year),
        eq(schema.assignments.periodMonth, month)
      )
    )
    .where(and(eq(schema.cans.branchId, branchId), isNotNull(schema.cans.dukuhId)))
    .groupBy(schema.cans.dukuhId, schema.dukuhs.name)
    .orderBy(asc(schema.dukuhs.name));

  const groups: WorkQueueGroup[] = rows
    .map((row) => {
      const totalCans = toNumber(row.total);
      const assignedCans = Math.min(toNumber(row.assigned), totalCans);
      return {
        kind: 'dukuh' as const,
        id: row.id as string,
        name: row.name || 'TANPA NAMA',
        totalCans,
        assignedCans,
        unassignedCans: Math.max(totalCans - assignedCans, 0),
        canIds: null,
      };
    })
    .filter((group) => group.unassignedCans > 0);

  // Kaleng tanpa dukuh tetap harus bisa ditugaskan. Dikelompokkan per kaleng
  // agar bisa dikirim lewat bulk-cans tanpa menebak wilayahnya.
  const unmappedCans = await db
    .select({
      id: schema.cans.id,
      ownerName: schema.cans.ownerName,
    })
    .from(schema.cans)
    .leftJoin(
      schema.assignments,
      and(
        eq(schema.assignments.canId, schema.cans.id),
        eq(schema.assignments.periodYear, year),
        eq(schema.assignments.periodMonth, month)
      )
    )
    .where(
      and(
        eq(schema.cans.branchId, branchId),
        isNull(schema.cans.dukuhId),
        assignableFilter,
        isNull(schema.assignments.id)
      )
    )
    .orderBy(asc(schema.cans.ownerName));

  const unmappedGroups: WorkQueueGroup[] = unmappedCans.map((can) => ({
    kind: 'can',
    id: can.id,
    name: can.ownerName,
    totalCans: 1,
    assignedCans: 0,
    unassignedCans: 1,
    canIds: [can.id],
  }));

  return [...groups, ...unmappedGroups];
}

async function buildDukuhGroups(dukuhId: string, year: number, month: number) {
  const rows = await db
    .select({
      id: schema.cans.id,
      ownerName: schema.cans.ownerName,
      rt: schema.cans.rt,
      rw: schema.cans.rw,
    })
    .from(schema.cans)
    .leftJoin(
      schema.assignments,
      and(
        eq(schema.assignments.canId, schema.cans.id),
        eq(schema.assignments.periodYear, year),
        eq(schema.assignments.periodMonth, month)
      )
    )
    .where(and(eq(schema.cans.dukuhId, dukuhId), assignableFilter, isNull(schema.assignments.id)))
    .orderBy(asc(schema.cans.rt), asc(schema.cans.rw), asc(schema.cans.ownerName));

  const byRt = new Map<string, WorkQueueGroup>();
  for (const can of rows) {
    const hasRt = Boolean(can.rt || can.rw);
    const key = hasRt ? `rt:${can.rt ?? '-'}:rw:${can.rw ?? '-'}` : `can:${can.id}`;
    const existing = byRt.get(key);
    if (existing) {
      existing.totalCans += 1;
      existing.unassignedCans += 1;
      existing.canIds!.push(can.id);
      continue;
    }
    byRt.set(key, {
      kind: hasRt ? 'rt' : 'can',
      id: key,
      name: hasRt ? `RT ${can.rt ?? '-'} / RW ${can.rw ?? '-'}` : can.ownerName,
      totalCans: 1,
      assignedCans: 0,
      unassignedCans: 1,
      canIds: [can.id],
    });
  }

  return Array.from(byRt.values());
}

export async function getAssignmentWorkQueue(
  user: JWTPayload,
  params: WorkQueueParams
): Promise<WorkQueueResponse> {
  const period = parsePeriod(params);
  const region = await resolveRegion(user, params);
  const scopeFilter =
    region.kind === 'dukuh'
      ? eq(schema.cans.dukuhId, region.id)
      : eq(schema.cans.branchId, region.branchId);

  const [canAggRow] = await db
    .select({
      // count(DISTINCT) juga di sini — alasan sama dengan buildBranchGroups.
      totalCans: sql<number>`count(DISTINCT ${schema.cans.id})`,
      assignableCans: sql<number>`count(DISTINCT ${schema.cans.id}) FILTER (WHERE ${assignableFilter})`,
      assignedAssignableCans: sql<number>`count(DISTINCT ${schema.cans.id}) FILTER (WHERE ${assignableFilter} AND ${schema.assignments.id} IS NOT NULL)`,
    })
    .from(schema.cans)
    .leftJoin(
      schema.assignments,
      and(
        eq(schema.assignments.canId, schema.cans.id),
        eq(schema.assignments.periodYear, period.year),
        eq(schema.assignments.periodMonth, period.month)
      )
    )
    .where(scopeFilter);

  const [statusAggRow] = await db
    .select({
      completed: sql<number>`count(*) FILTER (WHERE ${schema.assignments.status} = 'COMPLETED')`,
      uncollected: sql<number>`count(*) FILTER (WHERE ${schema.assignments.status} = 'UNCOLLECTED')`,
    })
    .from(schema.assignments)
    .innerJoin(schema.cans, eq(schema.cans.id, schema.assignments.canId))
    .where(
      and(
        scopeFilter,
        eq(schema.assignments.periodYear, period.year),
        eq(schema.assignments.periodMonth, period.month)
      )
    );

  const [officerAggRow] = await db
    .select({
      officerCount: sql<number>`count(*)`,
      activeOfficerCount: sql<number>`count(*) FILTER (WHERE ${schema.officers.isActive})`,
    })
    .from(schema.officers)
    .where(eq(schema.officers.branchId, region.branchId));

  const groups =
    region.kind === 'dukuh'
      ? await buildDukuhGroups(region.id, period.year, period.month)
      : await buildBranchGroups(region.branchId, period.year, period.month);

  const officerRows = await db
    .select({
      id: schema.officers.id,
      fullName: schema.officers.fullName,
      employeeCode: schema.officers.employeeCode,
      isActive: schema.officers.isActive,
      dukuhId: schema.officers.dukuhId,
      dukuhName: schema.dukuhs.name,
    })
    .from(schema.officers)
    .leftJoin(schema.dukuhs, eq(schema.officers.dukuhId, schema.dukuhs.id))
    .where(and(eq(schema.officers.branchId, region.branchId), eq(schema.officers.isActive, true)))
    .orderBy(asc(schema.officers.fullName));

  const officerIds = officerRows.map((officer) => officer.id);
  const assignmentCounts =
    officerIds.length === 0
      ? []
      : await db
          .select({
            officerId: schema.assignments.officerId,
            assignedCount: sql<number>`count(*) FILTER (WHERE ${schema.assignments.status} IN ('ACTIVE', 'COMPLETED', 'UNCOLLECTED'))`,
            completedCount: sql<number>`count(*) FILTER (WHERE ${schema.assignments.status} = 'COMPLETED')`,
            uncollectedCount: sql<number>`count(*) FILTER (WHERE ${schema.assignments.status} = 'UNCOLLECTED')`,
          })
          .from(schema.assignments)
          .where(
            and(
              inArray(schema.assignments.officerId, officerIds),
              eq(schema.assignments.periodYear, period.year),
              eq(schema.assignments.periodMonth, period.month)
            )
          )
          .groupBy(schema.assignments.officerId);

  const countsByOfficer = new Map(assignmentCounts.map((row) => [row.officerId, row]));

  const officers: WorkQueueOfficer[] = officerRows.map((officer) => {
    const counts = countsByOfficer.get(officer.id);
    return {
      id: officer.id,
      fullName: officer.fullName,
      employeeCode: officer.employeeCode,
      isActive: officer.isActive,
      dukuhId: officer.dukuhId,
      dukuhName: officer.dukuhName,
      assignedCount: toNumber(counts?.assignedCount),
      completedCount: toNumber(counts?.completedCount),
      uncollectedCount: toNumber(counts?.uncollectedCount),
    };
  });

  const totalCans = toNumber(canAggRow?.totalCans);
  const assignableCans = toNumber(canAggRow?.assignableCans);
  const assignedAssignableCans = Math.min(
    toNumber(canAggRow?.assignedAssignableCans),
    assignableCans
  );

  return {
    period,
    region,
    summary: {
      totalCans,
      assignableCans,
      assignedAssignableCans,
      unassignedAssignableCans: Math.max(assignableCans - assignedAssignableCans, 0),
      nonAssignableCans: Math.max(totalCans - assignableCans, 0),
      completed: toNumber(statusAggRow?.completed),
      uncollected: toNumber(statusAggRow?.uncollected),
      officerCount: toNumber(officerAggRow?.officerCount),
      activeOfficerCount: toNumber(officerAggRow?.activeOfficerCount),
      groupCount: groups.length,
    },
    groups,
    officers,
  };
}
