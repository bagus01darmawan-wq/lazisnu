/**
 * Dashboard Report Service — dashboard bendahara.
 *
 * Diekstrak dari reportService.ts.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { getLatestCollectionCondition } from './collectionSubmission';

export async function getBendaharaDashboard() {
  const latestCollectionCondition = getLatestCollectionCondition();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const baseWhere = and(
    gte(schema.collections.collectedAt, monthStart),
    eq(schema.collections.syncStatus, 'COMPLETED'),
    latestCollectionCondition
  );

  const [totalRes, districtRes, officerRes, recent] = await Promise.all([
    db.select({
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    }).from(schema.collections).where(baseWhere),

    db.select({
      districtId: schema.branches.districtId,
      districtName: schema.districts.name,
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.collections)
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
    .innerJoin(schema.districts, eq(schema.branches.districtId, schema.districts.id))
    .where(baseWhere)
    .groupBy(schema.branches.districtId, schema.districts.name),

    db.select({
      officerId: schema.collections.officerId,
      officerName: schema.officers.fullName,
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.collections)
    .innerJoin(schema.officers, eq(schema.collections.officerId, schema.officers.id))
    .where(baseWhere)
    .groupBy(schema.collections.officerId, schema.officers.fullName),

    db.query.collections.findMany({
      where: baseWhere,
      with: {
        can: { columns: { ownerName: true } },
        officer: { columns: { id: true, fullName: true } },
      },
      orderBy: [desc(schema.collections.collectedAt)],
      limit: 10,
    }),
  ]);

  return {
    current_month: {
      total: Number(totalRes[0]?.total || 0),
      count: Number(totalRes[0]?.count || 0),
    },
    by_district: districtRes.map(d => ({ district_id: d.districtId, district_name: d.districtName, total: Number(d.total), count: Number(d.count) })),
    by_officer: officerRes.map(o => ({ officer_id: o.officerId, officer_name: o.officerName, total: Number(o.total), count: Number(o.count) })),
    recent_transactions: recent.map(c => ({
      id: c.id, nominal: Number(c.nominal), payment_method: c.paymentMethod,
      collected_at: c.collectedAt, officer_name: c.officer.fullName, owner_name: c.can.ownerName,
    })),
  };
}
