/**
 * Collection Query Service — query builder & list untuk collections.
 *
 * Diekstrak dari reportService.ts (sebelumnya mencampur 6 concern).
 * Fokus: query building dengan scope, search, pagination.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, desc, gte, lte, inArray, ilike, or } from 'drizzle-orm';
import { getLatestCollectionCondition } from './collectionSubmission';

export interface CollectionScope {
  branchId?: string;
  districtId?: string;
}

/** Utility: scope role ke branchId/districtId */
export function getCollectionScope(role: string, branchId?: string, districtId?: string): CollectionScope {
  if (role === 'ADMIN_RANTING') return { branchId };
  if (role === 'ADMIN_KECAMATAN') return { districtId };
  return {};
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

  const items = collections.map((c) => ({
    id: c.id, qr_code: c.can.qrCode, owner_name: c.can.ownerName,
    owner_address: c.can.ownerAddress, nominal: Number(c.nominal),
    payment_method: c.paymentMethod, collected_at: c.collectedAt,
    officer_name: c.officer.fullName, officer_code: c.officer.employeeCode,
    branch_name: c.can.branch.name, district_name: c.can.branch.district.name,
  }));

  return {
    items,
    collections: items,
    pagination: { page: params.page, limit: params.limit, total, total_pages: Math.ceil(total / params.limit) },
  };
}
