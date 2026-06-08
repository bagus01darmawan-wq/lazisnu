/**
 * Collection Report Service — detail & summary reports.
 *
 * Diekstrak dari reportService.ts.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, desc, sql } from 'drizzle-orm';

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
    nominal: Number(collection.nominal), payment_method: collection.paymentMethod,
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
