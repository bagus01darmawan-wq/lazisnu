/**
 * Dashboard Service — query agregasi dashboard dengan filter branch/district di SQL.
 *
 * Sebelumnya filter dilakukan di JavaScript setelah findMany(), yang memuat
 * semua row ke memori lalu membuang sebagian besar hasilnya. Service ini
 * memindahkan filter ke SQL join sehingga hanya data relevan yang di-load.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, gte, lt, desc, sql, SQL } from 'drizzle-orm';
import { getLatestCollectionCondition } from './collectionSubmission';

/** Drizzle SQL expression type — dipakai sebagai parameter date filter */
type SQLWhere = SQL<unknown>;

/**
 * Ambil collections untuk satu branch dengan filter tanggal + status,
 * langsung di SQL (tidak pakai .filter() JS).
 */
export async function getBranchCollectionsByPeriod(
  branchId: string,
  dateWhere: SQLWhere,
  orderBy?: 'desc'
) {
  const latestCondition = getLatestCollectionCondition();

  let query = db
    .select({
      id: schema.collections.id,
      nominal: schema.collections.nominal,
      collectedAt: schema.collections.collectedAt,
      officerId: schema.collections.officerId,
      canId: schema.collections.canId,
      canQrCode: schema.cans.qrCode,
      canOwnerName: schema.cans.ownerName,
      officerFullName: schema.officers.fullName,
    })
    .from(schema.collections)
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .leftJoin(schema.officers, eq(schema.collections.officerId, schema.officers.id))
    .where(and(
      eq(schema.cans.branchId, branchId),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      latestCondition,
      dateWhere,
    ));

  const rows = orderBy === 'desc'
    ? await query.orderBy(desc(schema.collections.collectedAt))
    : await query;

  return rows.map(r => ({
    id: r.id,
    nominal: Number(r.nominal),
    collectedAt: r.collectedAt,
    officerId: r.officerId,
    officerFullName: r.officerFullName || '',
    canQrCode: r.canQrCode,
    canOwnerName: r.canOwnerName,
  }));
}

/**
 * Ambil collections untuk satu district dengan filter tanggal + status,
 * langsung di SQL via join cans → branches.
 */
export async function getDistrictCollectionsByPeriod(
  districtId: string,
  dateWhere: SQLWhere,
) {
  const latestCondition = getLatestCollectionCondition();

  const rows = await db
    .select({
      nominal: schema.collections.nominal,
      collectedAt: schema.collections.collectedAt,
      branchId: schema.cans.branchId,
      branchName: schema.branches.name,
      ownerName: schema.cans.ownerName,
    })
    .from(schema.collections)
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
    .where(and(
      eq(schema.branches.districtId, districtId),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      latestCondition,
      dateWhere,
    ));

  return rows.map(r => ({
    nominal: Number(r.nominal),
    collectedAt: r.collectedAt,
    branchId: r.branchId,
    branchName: r.branchName,
    ownerName: r.ownerName,
  }));
}

/**
 * Ambil 5 koleksi terbaru untuk satu branch (untuk "recent collections").
 * Filter branch di SQL, bukan di JS.
 */
export async function getBranchRecentCollections(branchId: string, limit = 5) {
  const latestCondition = getLatestCollectionCondition();

  const rows = await db
    .select({
      id: schema.collections.id,
      nominal: schema.collections.nominal,
      collectedAt: schema.collections.collectedAt,
      canQrCode: schema.cans.qrCode,
      canOwnerName: schema.cans.ownerName,
      officerFullName: schema.officers.fullName,
    })
    .from(schema.collections)
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .leftJoin(schema.officers, eq(schema.collections.officerId, schema.officers.id))
    .where(and(
      eq(schema.cans.branchId, branchId),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      latestCondition,
    ))
    .orderBy(desc(schema.collections.collectedAt))
    .limit(limit);

  return rows.map(r => ({
    id: r.id,
    nominal: Number(r.nominal),
    qr_code: r.canQrCode,
    owner_name: r.canOwnerName,
    officer_name: r.officerFullName || '',
    collected_at: r.collectedAt,
  }));
}

/**
 * Aggregasi nominal per officer untuk collections dalam satu branch.
 * Gunakan SQL aggregation langsung, bukan reduce() di JS.
 */
export async function getBranchNominalByOfficer(branchId: string, dateWhere: SQLWhere) {
  const latestCondition = getLatestCollectionCondition();

  const rows = await db
    .select({
      officerId: schema.collections.officerId,
      officerName: schema.officers.fullName,
      count: sql<number>`count(*)::int`,
      totalNominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    })
    .from(schema.collections)
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .leftJoin(schema.officers, eq(schema.collections.officerId, schema.officers.id))
    .where(and(
      eq(schema.cans.branchId, branchId),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      latestCondition,
      dateWhere,
    ))
    .groupBy(schema.collections.officerId, schema.officers.fullName);

  return rows.map(r => ({
    officer_id: r.officerId,
    officer_name: r.officerName || 'Unknown',
    collected: r.count,
    nominal: Number(r.totalNominal),
    // Backward compat: juga return as object dengan key officerId
    // (untuk consumption di route yang pakai reduce)
  }));
}

/**
 * Aggregasi nominal per branch untuk collections dalam satu district.
 */
export async function getDistrictNominalByBranch(districtId: string, dateWhere: SQLWhere) {
  const latestCondition = getLatestCollectionCondition();

  const rows = await db
    .select({
      branchId: schema.cans.branchId,
      branchName: schema.branches.name,
      count: sql<number>`count(*)::int`,
      totalNominal: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
    })
    .from(schema.collections)
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
    .where(and(
      eq(schema.branches.districtId, districtId),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      latestCondition,
      dateWhere,
    ))
    .groupBy(schema.cans.branchId, schema.branches.name);

  return rows.map(r => ({
    branch_id: r.branchId,
    branch_name: r.branchName || 'Unknown',
    collected: r.count,
    nominal: Number(r.totalNominal),
  }));
}

/**
 * Agregasi total + count collections dalam satu branch untuk periode tertentu.
 * Return { total_nominal, count } — untuk summary card.
 */
export async function getBranchCollectionSummary(
  branchId: string,
  dateWhere: SQLWhere,
) {
  const latestCondition = getLatestCollectionCondition();

  const [result] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.collections)
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .where(and(
      eq(schema.cans.branchId, branchId),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      latestCondition,
      dateWhere,
    ));

  return {
    total_nominal: Number(result?.total || 0),
    count: Number(result?.count || 0),
  };
}

/**
 * Agregasi total + count collections dalam satu district untuk periode tertentu.
 */
export async function getDistrictCollectionSummary(
  districtId: string,
  dateWhere: SQLWhere,
) {
  const latestCondition = getLatestCollectionCondition();

  const [result] = await db
    .select({
      total: sql<number>`coalesce(sum(${schema.collections.nominal}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.collections)
    .innerJoin(schema.cans, eq(schema.collections.canId, schema.cans.id))
    .innerJoin(schema.branches, eq(schema.cans.branchId, schema.branches.id))
    .where(and(
      eq(schema.branches.districtId, districtId),
      eq(schema.collections.syncStatus, 'COMPLETED'),
      latestCondition,
      dateWhere,
    ));

  return {
    total_nominal: Number(result?.total || 0),
    count: Number(result?.count || 0),
  };
}
