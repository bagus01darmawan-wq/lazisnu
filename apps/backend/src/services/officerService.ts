import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, inArray, sql, count, sum, desc, asc } from 'drizzle-orm';

export async function getOfficerDetailWithStats(
  officerId: string,
  filters: {
    year?: number;
    months?: number[];
  } = {}
) {
  const year = filters.year ?? new Date().getFullYear();
  const monthList = filters.months && filters.months.length > 0
    ? filters.months
    : Array.from({ length: 12 }, (_, i) => i + 1);

  const startDate = `${year}-${String(monthList[0]).padStart(2, '0')}-01`;
  const lastMonth = monthList[monthList.length - 1];
  const endDate = new Date(year, lastMonth, 0).toISOString().split('T')[0];

  const officer = await db.query.officers.findFirst({
    where: eq(schema.officers.id, officerId),
    with: {
      branch: {
        columns: { id: true, name: true, code: true },
      },
      district: {
        columns: { id: true, name: true, code: true },
      },
    },
  });

  if (!officer) return null;

  const [
    collectionStats,
    assignmentStats,
    monthlyStats,
    topDonors,
    bottomDonors,
  ] = await Promise.all([
    // Total collections and amount in selected period
    db.select({
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    }).from(schema.collections)
      .where(and(
        eq(schema.collections.officerId, officerId),
        eq(schema.collections.syncStatus, 'COMPLETED'),
        sql`${schema.collections.collectedAt} >= ${startDate}`,
        sql`${schema.collections.collectedAt} <= ${endDate}`,
      )),

    // Assignment counts by status
    db.select({
      status: schema.assignments.status,
      count: sql<number>`count(*)::int`,
    }).from(schema.assignments)
      .where(and(
        eq(schema.assignments.officerId, officerId),
        eq(schema.assignments.periodYear, year),
        inArray(schema.assignments.periodMonth, monthList),
      ))
      .groupBy(schema.assignments.status),

    // Monthly breakdown for selected year
    db.select({
      month: sql<number>`extract(month from ${schema.collections.collectedAt})::int`,
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    }).from(schema.collections)
      .where(and(
        eq(schema.collections.officerId, officerId),
        eq(schema.collections.syncStatus, 'COMPLETED'),
        sql`extract(year from ${schema.collections.collectedAt}) = ${year}`,
      ))
      .groupBy(sql`extract(month from ${schema.collections.collectedAt})`),

    // Top 10 donors by total nominal
    db.select({
      owner_name: schema.cans.ownerName,
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    }).from(schema.collections)
      .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
      .where(and(
        eq(schema.collections.officerId, officerId),
        eq(schema.collections.syncStatus, 'COMPLETED'),
        sql`${schema.collections.collectedAt} >= ${startDate}`,
        sql`${schema.collections.collectedAt} <= ${endDate}`,
      ))
      .groupBy(schema.cans.ownerName)
      .orderBy(desc(sql`coalesce(sum(${schema.collections.nominal}), 0)`))
      .limit(10),

    // Bottom 10 donors by total nominal
    db.select({
      owner_name: schema.cans.ownerName,
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    }).from(schema.collections)
      .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
      .where(and(
        eq(schema.collections.officerId, officerId),
        eq(schema.collections.syncStatus, 'COMPLETED'),
        sql`${schema.collections.collectedAt} >= ${startDate}`,
        sql`${schema.collections.collectedAt} <= ${endDate}`,
      ))
      .groupBy(schema.cans.ownerName)
      .orderBy(asc(sql`coalesce(sum(${schema.collections.nominal}), 0)`))
      .limit(10),
  ]);

  const totalCollections = Number(collectionStats[0]?.count || 0);
  const totalAmount = Number(collectionStats[0]?.total || 0);

  const countsByStatus = Object.fromEntries(
    assignmentStats.map((row) => [row.status, Number(row.count)])
  ) as Record<string, number>;

  const totalAssignments = Object.values(countsByStatus).reduce((a, b) => a + b, 0);
  const completedAssignments = countsByStatus['COMPLETED'] || 0;
  const activeAssignments = countsByStatus['ACTIVE'] || 0;
  const uncollectedAssignments = countsByStatus['UNCOLLECTED'] || 0;
  const postponedAssignments = countsByStatus['POSTPONED'] || 0;
  const reassignedAssignments = countsByStatus['REASSIGNED'] || 0;

  const completionRate = totalAssignments > 0
    ? Math.round((completedAssignments / totalAssignments) * 100)
    : 0;

  const averagePerCollection = totalCollections > 0
    ? Math.round(totalAmount / totalCollections)
    : 0;

  // Normalize monthly breakdown for the 12 months
  const monthlyMap = new Map<number, { count: number; amount: number }>();
  for (const row of monthlyStats) {
    const month = Number(row.month);
    const current = monthlyMap.get(month) || { count: 0, amount: 0 };
    current.count += Number(row.count);
    current.amount += Number(row.total);
    monthlyMap.set(month, current);
  }

  const monthlyBreakdown = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const data = monthlyMap.get(month) || { count: 0, amount: 0 };
    return {
      month,
      year,
      count: data.count,
      amount: data.amount,
    };
  });

  return {
    ...officer,
    stats: {
      total_collections: totalCollections,
      total_amount: totalAmount,
      total_assignments: totalAssignments,
      completed_assignments: completedAssignments,
      active_assignments: activeAssignments,
      uncollected_assignments: uncollectedAssignments,
      postponed_assignments: postponedAssignments,
      reassigned_assignments: reassignedAssignments,
      completion_rate: completionRate,
      average_per_collection: averagePerCollection,
      monthly_breakdown: monthlyBreakdown,
      top_donors: topDonors.map(d => ({
        owner_name: d.owner_name,
        total: Number(d.total),
      })),
      bottom_donors: bottomDonors.map(d => ({
        owner_name: d.owner_name,
        total: Number(d.total),
      })),
    },
  };
}
