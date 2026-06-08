import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, inArray, desc, or, ilike, sql } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { Errors } from '../utils/errorCatalog';
import { getRoleScope } from '../utils/role-scope';
import { JWTPayload } from '../middleware/auth';

export interface CreateCanInput {
  branch_id?: string | null;
  owner_name: string;
  owner_whatsapp?: string | null;
  owner_phone?: string | null;
  owner_address?: string | null;
  dukuh_id?: string | null;
  rt?: string | null;
  rw?: string | null;
  qr_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface UpdateCanInput {
  owner_name?: string | null;
  owner_whatsapp?: string | null;
  owner_phone?: string | null;
  owner_address?: string | null;
  dukuh_id?: string | null;
  rt?: string | null;
  rw?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_notes?: string | null;
  is_active?: boolean | null;
}

export interface AccessContext extends JWTPayload {}

async function checkAccess(ctx: AccessContext, can: { branchId: string }, errorMsg: string) {
  if (ctx.role === 'ADMIN_RANTING') {
    if (can.branchId !== ctx.branchId) throw Errors.FORBIDDEN(errorMsg);
  } else if (ctx.role === 'ADMIN_KECAMATAN') {
    const branch = await db.query.branches.findFirst({ where: eq(schema.branches.id, can.branchId) });
    if (branch?.districtId !== ctx.districtId) throw Errors.FORBIDDEN(errorMsg);
  }
}

export async function getCans(
  params: { page: number; limit: number; offset: number; search?: string; status?: string; branch_id?: string },
  ctx: AccessContext
) {
  const searchCondition = params.search ? or(
    ilike(schema.cans.ownerName, `%${params.search}%`),
    ilike(schema.cans.qrCode, `%${params.search}%`),
    ilike(schema.cans.dukuh, `%${params.search}%`)
  ) : undefined;

  const roleScope = await getRoleScope(ctx, schema.cans);

  const conditions = [
    roleScope,
    params.branch_id ? eq(schema.cans.branchId, params.branch_id) : undefined,
    searchCondition,
  ];

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (params.status === 'NON_ACTIVE' || params.status === 'INACTIVE') {
    conditions.push(eq(schema.cans.isActive, false));
  } else if (params.status === 'ASSIGNED') {
    conditions.push(eq(schema.cans.isActive, true));
    
    const assignedSubquery = db
      .select({ id: schema.assignments.canId })
      .from(schema.assignments)
      .where(
        and(
          eq(schema.assignments.periodYear, currentYear),
          eq(schema.assignments.periodMonth, currentMonth)
        )
      );
      
    conditions.push(inArray(schema.cans.id, assignedSubquery));
  } else if (params.status === 'ACTIVE') {
    conditions.push(eq(schema.cans.isActive, true));
    
    const assignedSubquery = db
      .select({ id: schema.assignments.canId })
      .from(schema.assignments)
      .where(
        and(
          eq(schema.assignments.periodYear, currentYear),
          eq(schema.assignments.periodMonth, currentMonth)
        )
      );
      
    conditions.push(sql`${schema.cans.id} NOT IN (${assignedSubquery})`);
  }

  const whereClause = and(...conditions.filter(Boolean));

  const [cans, total] = await Promise.all([
    db.query.cans.findMany({
      where: whereClause,
      limit: params.limit,
      offset: params.offset,
      orderBy: [desc(schema.cans.createdAt)],
      with: {
        branch: { columns: { name: true } },
        dukuhDetails: { columns: { name: true } },
        assignments: {
          where: and(
            eq(schema.assignments.periodYear, currentYear),
            eq(schema.assignments.periodMonth, currentMonth)
          ),
          limit: 1,
          columns: { id: true }
        }
      }
    }),
    db.select({ count: sql<number>`count(*)` })
      .from(schema.cans)
      .where(whereClause)
      .then(res => Number(res[0].count))
  ]);

  return { cans, total };
}

export async function createCan(body: CreateCanInput, ctx: AccessContext) {
  const targetBranchId = (ctx.role === 'ADMIN_KECAMATAN' ? body.branch_id : ctx.branchId);
  if (!targetBranchId) {
    throw Errors.VALIDATION_ERROR('ID Ranting tidak valid');
  }

  const branchId = targetBranchId as string;
  const branch = await db.query.branches.findFirst({ where: eq(schema.branches.id, branchId) });
  if (!branch) throw new AppError('NOT_FOUND', 'Ranting tidak ditemukan', 404);

  const regionCode = branch.code || 'XX';

  let qrCode = body.qr_code;
  if (!qrCode || qrCode === '') {
    const countRes = await db.select({ count: sql<number>`count(*)` })
      .from(schema.cans)
      .where(eq(schema.cans.branchId, branchId));

    const count = Number(countRes[0]?.count || 0);
    const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    qrCode = `LAZ-${regionCode}-${String(count + 1).padStart(5, '0')}-${suffix}`;
  }

  let dukuhName = '';
  if (body.dukuh_id && body.dukuh_id !== '') {
    const dukuhRecord = await db.query.dukuhs.findFirst({ where: eq(schema.dukuhs.id, body.dukuh_id) });
    if (dukuhRecord) dukuhName = dukuhRecord.name;
  }

  const inserted = await db.insert(schema.cans).values({
    branchId: branchId,
    dukuhId: (body.dukuh_id && body.dukuh_id !== '') ? body.dukuh_id : null,
    qrCode: qrCode.substring(0, 50),
    ownerName: body.owner_name.substring(0, 100),
    ownerPhone: (body.owner_whatsapp || body.owner_phone || '').substring(0, 20),
    ownerWhatsapp: (body.owner_whatsapp || body.owner_phone || '0000000000').substring(0, 20),
    ownerAddress: body.owner_address,
    rt: (body.rt || '').substring(0, 10),
    rw: (body.rw || '').substring(0, 10),
    dukuh: dukuhName || null,
    latitude: (body.latitude !== undefined && body.latitude !== null) ? body.latitude.toString() : null,
    longitude: (body.longitude !== undefined && body.longitude !== null) ? body.longitude.toString() : null,
  }).returning();

  return inserted[0];
}

export async function getCanDetail(canId: string, ctx: AccessContext) {
  const can = await db.query.cans.findFirst({
    where: eq(schema.cans.id, canId),
    with: {
      branch: { columns: { name: true } },
      dukuhDetails: { columns: { name: true } },
      collections: {
        orderBy: [desc(schema.collections.collectedAt)],
        limit: 10,
        with: { officer: { columns: { fullName: true } } },
      },
    },
  });

  if (!can) throw Errors.COLLECTION_NOT_FOUND('Kaleng tidak ditemukan');
  await checkAccess(ctx, can, 'Bukan milik ranting/kecamatan ini');

  return can;
}

export async function updateCan(canId: string, body: UpdateCanInput, ctx: AccessContext) {
  const existing = await db.query.cans.findFirst({ where: eq(schema.cans.id, canId) });
  if (!existing) throw Errors.COLLECTION_NOT_FOUND('Kaleng tidak ditemukan');

  await checkAccess(ctx, existing, 'Kaleng bukan milik ranting/kecamatan Anda');

  let newDukuhName = existing.dukuh;
  let newDukuhId = existing.dukuhId;
  if (body.dukuh_id !== undefined) {
    if (body.dukuh_id === '') {
      newDukuhId = null;
      newDukuhName = null;
    } else {
      newDukuhId = body.dukuh_id;
      const dukuhRecord = await db.query.dukuhs.findFirst({ where: eq(schema.dukuhs.id, body.dukuh_id as string) });
      if (dukuhRecord) newDukuhName = dukuhRecord.name;
    }
  }

  const updated = await db.update(schema.cans).set({
    ownerName: body.owner_name ?? existing.ownerName,
    ownerPhone: body.owner_whatsapp || body.owner_phone || existing.ownerPhone,
    ownerAddress: body.owner_address !== undefined ? body.owner_address : existing.ownerAddress,
    ownerWhatsapp: body.owner_whatsapp ?? existing.ownerWhatsapp,
    dukuhId: newDukuhId,
    dukuh: newDukuhName,
    rt: body.rt !== undefined ? body.rt : existing.rt,
    rw: body.rw !== undefined ? body.rw : existing.rw,
    latitude: body.latitude !== undefined ? (body.latitude ? String(body.latitude) : null) : existing.latitude,
    longitude: body.longitude !== undefined ? (body.longitude ? String(body.longitude) : null) : existing.longitude,
    locationNotes: body.location_notes !== undefined ? body.location_notes : existing.locationNotes,
    isActive: body.is_active ?? existing.isActive,
  }).where(eq(schema.cans.id, canId)).returning();

  return { can: updated[0], oldData: existing };
}

export async function deleteCan(canId: string, permanent: boolean, ctx: AccessContext) {
  const existing = await db.query.cans.findFirst({ where: eq(schema.cans.id, canId) });
  if (!existing) throw Errors.COLLECTION_NOT_FOUND('Kaleng tidak ditemukan');

  await checkAccess(ctx, existing, 'Kaleng bukan milik ranting/kecamatan Anda');

  if (permanent) {
    if ((existing as any).collectionCount > 0) {
      throw new AppError('HAS_COLLECTION_HISTORY', 'Kaleng dengan riwayat penjemputan tidak dapat dihapus permanen. Gunakan fitur nonaktifkan (soft delete).', 409);
    }
    await db.delete(schema.cans).where(eq(schema.cans.id, canId));
    return { deleted: true, oldData: existing };
  }

  await db.update(schema.cans).set({ isActive: false }).where(eq(schema.cans.id, canId));
  return { deleted: false, oldData: existing, newData: { ...existing, isActive: false } };
}

export async function createBulkCans(branch_id: string, items: any[], ctx: AccessContext) {
  if (ctx.role === 'ADMIN_RANTING' && branch_id !== ctx.branchId) {
    throw Errors.FORBIDDEN('Bukan milik ranting Anda');
  }

  const branch = await db.query.branches.findFirst({ where: eq(schema.branches.id, branch_id) });
  if (!branch) throw new AppError('NOT_FOUND', 'Ranting tidak ditemukan', 404);

  const regionCode = branch.code || 'XX';
  const initialCountRes = await db.select({ count: sql<number>`count(*)` })
    .from(schema.cans)
    .where(eq(schema.cans.branchId, branch_id));
  let count = Number(initialCountRes[0]?.count || 0);

  const dukuhRecords = await db.query.dukuhs.findMany({ where: eq(schema.dukuhs.branchId, branch_id) });
  const dukuhMap = new Map(dukuhRecords.map(d => [d.id, d.name]));

  const toInsert = items.map((item, index) => {
    let qrCode = item.qr_code;
    if (!qrCode || qrCode === '') {
      const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      qrCode = `LAZ-${regionCode}-${String(count + index + 1).padStart(5, '0')}-${suffix}`;
    }

    return {
      branchId: branch_id,
      dukuhId: item.dukuh_id || null,
      qrCode: qrCode.substring(0, 50),
      ownerName: (item.owner_name || 'Tanpa Nama').substring(0, 100),
      ownerWhatsapp: (item.owner_whatsapp || '0000000000').toString().substring(0, 20),
      ownerPhone: (item.owner_whatsapp || '').toString().substring(0, 20),
      rt: (item.rt || '').toString().substring(0, 10),
      rw: (item.rw || '').toString().substring(0, 10),
      ownerAddress: '',
      dukuh: item.dukuh_id ? (dukuhMap.get(item.dukuh_id) || null) : null,
      isActive: true,
    };
  });

  const inserted = await db.insert(schema.cans).values(toInsert).returning();
  return inserted;
}

export async function deleteBulkCans(ids: string[], permanent: boolean, ctx: AccessContext) {
  if (permanent) {
    const cansWithHistory = await db.query.cans.findMany({
      where: and(inArray(schema.cans.id, ids), sql`${schema.cans.collectionCount} > 0`),
    });

    if (cansWithHistory.length > 0) {
      throw new AppError('HAS_COLLECTION_HISTORY', 'Beberapa kaleng memiliki riwayat penjemputan dan tidak dapat dihapus permanen. Gunakan fitur nonaktifkan (soft delete).', 409);
    }
  }

  if (ctx.role === 'ADMIN_RANTING' && ctx.branchId) {
    if (permanent) {
      await db.delete(schema.cans)
        .where(and(inArray(schema.cans.id, ids), eq(schema.cans.branchId, ctx.branchId)));
    } else {
      await db.update(schema.cans)
        .set({ isActive: false })
        .where(and(inArray(schema.cans.id, ids), eq(schema.cans.branchId, ctx.branchId)));
    }
  } else if (ctx.role === 'ADMIN_KECAMATAN' && ctx.districtId) {
    const branchIds = (await db.select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.districtId, ctx.districtId)))
      .map(b => b.id);

    if (branchIds.length > 0) {
      if (permanent) {
        await db.delete(schema.cans)
          .where(and(inArray(schema.cans.id, ids), inArray(schema.cans.branchId, branchIds)));
      } else {
        await db.update(schema.cans)
          .set({ isActive: false })
          .where(and(inArray(schema.cans.id, ids), inArray(schema.cans.branchId, branchIds)));
      }
    }
  } else if (ctx.role === 'ADMIN_KECAMATAN' || ctx.role === 'ADMIN_RANTING') {
    throw Errors.FORBIDDEN('Tidak memiliki akses untuk menghapus data ini');
  } else {
    if (permanent) {
      await db.delete(schema.cans).where(inArray(schema.cans.id, ids));
    } else {
      await db.update(schema.cans)
        .set({ isActive: false })
        .where(inArray(schema.cans.id, ids));
    }
  }

  return { deleted: ids.length };
}
