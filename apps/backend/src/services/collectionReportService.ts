/**
 * Collection Report Service — detail & summary reports.
 *
 * Diekstrak dari reportService.ts.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';

export async function getCollectionDetail(id: string) {
  const [collection, notification] = await Promise.all([
    db.query.collections.findFirst({
      where: eq(schema.collections.id, id),
      with: { can: { with: { branch: { with: { district: true } } } }, officer: { columns: { fullName: true, phone: true, employeeCode: true } }, notifications: { orderBy: [desc(schema.notifications.createdAt)], limit: 1 } },
    }),
    db.query.notifications.findFirst({ where: eq(schema.notifications.collectionId, id), orderBy: [desc(schema.notifications.createdAt)] }),
  ]);

  if (!collection) return null;

  return {
    id: collection.id,
    can: { qr_code: collection.can.qrCode, owner_name: collection.can.ownerName, owner_address: collection.can.ownerAddress, owner_phone: collection.can.ownerPhone },
    officer: { name: collection.officer.fullName, phone: collection.officer.phone, code: collection.officer.employeeCode },
    nominal: Number(collection.nominal),
    collected_at: collection.collectedAt, submitted_at: collection.submittedAt,
    synced_at: collection.syncedAt, sync_status: collection.syncStatus,
    notification_status: notification?.status || 'NOT_SENT',
    latitude: collection.latitude, longitude: collection.longitude,
    branch_name: collection.can.branch.name, district_name: collection.can.branch.district.name,
  };
}

export async function getReportSummary(whereClause: any) {
  const [totalRes, districtRes, branchRes, officerRes] = await Promise.all([
    db.select({
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    }).from(schema.collections).where(whereClause),

    db.select({
      districtName: schema.districts.name,
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    })
    .from(schema.collections)
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
    .innerJoin(schema.districts, eq(schema.branches.districtId, schema.districts.id))
    .where(whereClause)
    .groupBy(schema.districts.name),

    db.select({
      branchName: schema.branches.name,
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    })
    .from(schema.collections)
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
    .where(whereClause)
    .groupBy(schema.branches.name),

    db.select({
      officerName: schema.officers.fullName,
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.collections)
    .innerJoin(schema.officers, eq(schema.collections.officerId, schema.officers.id))
    .where(whereClause)
    .groupBy(schema.officers.fullName),
  ]);

  return {
    totalRes: totalRes[0],
    districtRes,
    branchRes,
    officerRes,
  };
}

export async function getReportStats(params: {
  year: number;
  months: number[];
  branchId?: string;
  districtId?: string;
}) {
  const { year, months, branchId, districtId } = params;
  const monthList = months.length > 0 ? months : Array.from({ length: 12 }, (_, i) => i + 1);

  const startDate = `${year}-${String(monthList[0]).padStart(2, '0')}-01`;
  const lastMonth = monthList[monthList.length - 1];
  const endDate = new Date(year, lastMonth, 0).toISOString().split('T')[0];

  let branchScopeCondition: any = undefined;
  let officerScopeCondition: any = undefined;

  if (branchId) {
    branchScopeCondition = eq(schema.cans.branchId, branchId);
    officerScopeCondition = and(
      eq(schema.officers.branchId, branchId),
      eq(schema.officers.isActive, true),
    );
  } else if (districtId) {
    const branches = await db.select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.districtId, districtId));

    const branchIds = branches.map(b => b.id);
    if (branchIds.length === 0) {
      return {
        officers_assigned: 0, officers_total: 0,
        zero_nominal_count: 0, uncollected_count: 0,
        total_collected_cans: 0, total_assignments: 0,
      };
    }

    branchScopeCondition = inArray(schema.cans.branchId, branchIds);
    officerScopeCondition = and(
      inArray(schema.officers.branchId, branchIds),
      eq(schema.officers.isActive, true),
    );
  } else {
    officerScopeCondition = eq(schema.officers.isActive, true);
  }

  const assignmentPeriodCondition = and(
    eq(schema.assignments.periodYear, year),
    inArray(schema.assignments.periodMonth, monthList),
  );

  const assignmentBaseConditions = branchScopeCondition
    ? and(assignmentPeriodCondition, branchScopeCondition)
    : assignmentPeriodCondition;

  const collectionPeriod = and(
    sql`${schema.collections.collectedAt} >= ${startDate}`,
    sql`${schema.collections.collectedAt} <= ${endDate}`,
    eq(schema.collections.syncStatus, 'COMPLETED'),
  );

  const collectionBaseConditions = branchScopeCondition
    ? and(branchScopeCondition, collectionPeriod)
    : collectionPeriod;

  const [
    assignedDistinct, uncollectedRows, zeroNominalRows,
    officersTotal, collectedCans, totalAssignments,
  ] = await Promise.all([
    db.select({
      count: sql<number>`count(distinct ${schema.assignments.officerId})::int`,
    }).from(schema.assignments)
      .innerJoin(schema.cans, eq(schema.assignments.canId, schema.cans.id))
      .where(assignmentBaseConditions),

    db.select({ count: sql<number>`count(*)::int` })
      .from(schema.assignments)
      .innerJoin(schema.cans, eq(schema.assignments.canId, schema.cans.id))
      .where(and(assignmentBaseConditions, eq(schema.assignments.status, 'UNCOLLECTED'))),

    db.select({ count: sql<number>`count(*)::int` })
      .from(schema.collections)
      .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
      .where(and(collectionBaseConditions, eq(schema.collections.nominal, BigInt(0)))),

    db.select({ count: sql<number>`count(*)::int` })
      .from(schema.officers)
      .where(officerScopeCondition),

    db.select({
      count: sql<number>`count(distinct ${schema.collections.canId})::int`,
    }).from(schema.collections)
      .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
      .where(collectionBaseConditions),

    db.select({ count: sql<number>`count(*)::int` })
      .from(schema.assignments)
      .innerJoin(schema.cans, eq(schema.assignments.canId, schema.cans.id))
      .where(assignmentBaseConditions),
  ]);

  return {
    officers_assigned: Number(assignedDistinct[0]?.count || 0),
    officers_total: Number(officersTotal[0]?.count || 0),
    zero_nominal_count: Number(zeroNominalRows[0]?.count || 0),
    uncollected_count: Number(uncollectedRows[0]?.count || 0),
    total_collected_cans: Number(collectedCans[0]?.count || 0),
    total_assignments: Number(totalAssignments[0]?.count || 0),
  };
}
