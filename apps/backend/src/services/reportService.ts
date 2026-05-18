import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, desc, gte, lte, inArray, sql, ilike, or } from 'drizzle-orm';
import { getLatestCollectionCondition } from './collectionSubmission';

export interface CollectionScope {
  branchId?: string;
  districtId?: string;
}

export function getCollectionScope(role: string, branchId?: string, districtId?: string): CollectionScope {
  if (role === 'ADMIN_RANTING') return { branchId };
  if (role === 'ADMIN_KECAMATAN') return { districtId };
  return {};
}

export async function getDashboardData() {
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

async function getCanIdsByBranch(branchId: string): Promise<string[]> {
  const cans = await db.select({ id: schema.cans.id }).from(schema.cans).where(eq(schema.cans.branchId, branchId));
  return cans.map(c => c.id);
}

async function getCanIdsByDistrict(districtId: string): Promise<string[]> {
  const branches = await db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.districtId, districtId));
  const branchIds = branches.map(b => b.id);
  if (branchIds.length === 0) return [];
  const cans = await db.select({ id: schema.cans.id }).from(schema.cans).where(inArray(schema.cans.branchId, branchIds));
  return cans.map(c => c.id);
}

export async function buildCollectionsQuery(params: {
  startDate?: string;
  endDate?: string;
  officerId?: string;
  districtId?: string;
  branchId?: string;
  search?: string;
  scope: CollectionScope;
}) {
  const latestCollectionCondition = getLatestCollectionCondition();
  const conditions: any[] = [eq(schema.collections.syncStatus, 'COMPLETED')];

  if (params.startDate && params.endDate) {
    conditions.push(and(
      gte(schema.collections.collectedAt, new Date(params.startDate)),
      lte(schema.collections.collectedAt, new Date(params.endDate))
    )!);
  }
  if (params.officerId) conditions.push(eq(schema.collections.officerId, params.officerId));

  if (params.search) {
    const keyword = `%${params.search}%`;
    const matchingOfficers = await db.select({ id: schema.officers.id }).from(schema.officers)
      .where(or(ilike(schema.officers.fullName, keyword), ilike(schema.officers.phone, keyword), ilike(schema.officers.employeeCode, keyword))!);
    const officerIds = matchingOfficers.map(o => o.id);

    const matchingCans = await db.select({ id: schema.cans.id }).from(schema.cans)
      .where(or(ilike(schema.cans.qrCode, keyword), ilike(schema.cans.ownerName, keyword), ilike(schema.cans.ownerPhone, keyword))!);
    const canIds = matchingCans.map(c => c.id);

    if (officerIds.length > 0 || canIds.length > 0) {
      const orConditions: any[] = [];
      if (officerIds.length > 0) orConditions.push(inArray(schema.collections.officerId, officerIds));
      if (canIds.length > 0) orConditions.push(inArray(schema.collections.canId, canIds));
      conditions.push(or(...orConditions)!);
    } else {
      return { whereClause: undefined, emptyResult: true };
    }
  }

  if (params.branchId) {
    const canIds = await getCanIdsByBranch(params.branchId);
    if (canIds.length === 0) return { whereClause: undefined, emptyResult: true };
    conditions.push(inArray(schema.collections.canId, canIds));
  }

  if (params.districtId) {
    const canIds = await getCanIdsByDistrict(params.districtId);
    if (canIds.length === 0) return { whereClause: undefined, emptyResult: true };
    conditions.push(inArray(schema.collections.canId, canIds));
  }

  if (params.scope.branchId) {
    const canIds = await getCanIdsByBranch(params.scope.branchId);
    if (canIds.length === 0) return { whereClause: undefined, emptyResult: true };
    conditions.push(inArray(schema.collections.canId, canIds));
  } else if (params.scope.districtId) {
    const canIds = await getCanIdsByDistrict(params.scope.districtId);
    if (canIds.length === 0) return { whereClause: undefined, emptyResult: true };
    conditions.push(inArray(schema.collections.canId, canIds));
  }

  return { whereClause: and(...conditions, latestCollectionCondition), emptyResult: false };
}

export async function getCollectionsList(params: {
  whereClause: any;
  page: number;
  limit: number;
  skip: number;
}) {
  const [collections, total] = await Promise.all([
    db.query.collections.findMany({
      where: params.whereClause,
      with: { can: { with: { branch: { with: { district: true } } } }, officer: { columns: { fullName: true, employeeCode: true } } },
      orderBy: [desc(schema.collections.collectedAt)],
      offset: params.skip,
      limit: params.limit,
    }),
    db.$count(schema.collections, params.whereClause),
  ]);

  return {
    collections: collections.map((c) => ({
      id: c.id, qr_code: c.can.qrCode, owner_name: c.can.ownerName,
      owner_address: c.can.ownerAddress, nominal: Number(c.nominal),
      payment_method: c.paymentMethod, collected_at: c.collectedAt,
      officer_name: c.officer.fullName, officer_code: c.officer.employeeCode,
      branch_name: c.can.branch.name, district_name: c.can.branch.district.name,
    })),
    pagination: { page: params.page, limit: params.limit, total, total_pages: Math.ceil(total / params.limit) },
  };
}

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
