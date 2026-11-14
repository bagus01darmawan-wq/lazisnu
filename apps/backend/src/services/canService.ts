import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, inArray, desc, or, ilike, sql, type SQL } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AppError } from '../utils/AppError';
import { Errors } from '../utils/errorCatalog';
import { getRoleScope } from '../utils/role-scope';
import { JWTPayload } from '../middleware/auth';
import { isTransitionAllowed, ASSIGNABLE_CONDITIONS } from './conditionRules';
import type { CanConditionValue } from './conditionRules';
import { buildDraftLockError, type DraftLockInfo } from './canDraftLock';
import { syncActiveAssignmentKindForCan } from './assignmentKindService';
import { currentOperationalPeriod } from '../utils/operationalTimeZone';
import {
  CAN_STATE_SOURCE,
  deleteCanStateHistory,
  insertCanCreatedEvent,
  lockCanRow,
  recordCanStateChange,
} from './canStateHistory';
import {
  applyStatusChange,
  deriveIsActive,
  deriveLegacyCondition,
  resolveStateInput,
  type CanState,
} from './canState';

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
  branch_id?: string | null;
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
  /**
   * Transisi kondisi eksplisit. `is_active` diisi mengikuti `isTrackedForCondition`
   * sehingga tidak mungkin terbentuk `is_active = false` dengan kondisi selain DIKEMBALIKAN.
   */
  condition?: CanConditionValue | null;
  /** Dimensi status lifecycle baru (2026-11-13). */
  lifecycle_status?: 'AKTIF' | 'NON_AKTIF' | 'DIKEMBALIKAN' | null;
  /** Dimensi kondisi fisik baru (2026-11-13). */
  physical_condition?: 'BAIK' | 'RUSAK' | 'HILANG' | null;
  /** Kode alasan baku untuk transisi kondisi (lihat conditionRules). */
  condition_reason_code?: string | null;
  /** @deprecated Alias lama. `false` dipetakan ke DIKEMBALIKAN, `true` dipetakan ke AKTIF. */
  is_active?: boolean | null;
}

export interface AccessContext extends JWTPayload {}

async function checkAccess(ctx: AccessContext, can: { branchId: string }, errorMsg: string) {
  if (ctx.role === 'ADMIN_RANTING') {
    if (can.branchId !== ctx.branchId) throw Errors.FORBIDDEN(errorMsg);
  } else if (ctx.role === 'ADMIN_KECAMATAN') {
    const branch = await db.query.branches.findFirst({ where: eq(schema.branches.id, can.branchId) });
    if (branch?.districtId !== ctx.districtId) throw Errors.FORBIDDEN(errorMsg);
  } else if (ctx.role === 'PETUGAS') {
    // Petugas lapangan hanya boleh mengakses kaleng pada rantingnya sendiri
    // (officers.branch_id NOT NULL). branchId diambil dari token, sehingga
    // tidak bisa dipalsukan lewat body/params. Tanpa cabang ini, role PETUGAS
    // lolos tanpa pemeriksaan — celah pada POST /mobile/cans/:canId/visits.
    if (!ctx.branchId || can.branchId !== ctx.branchId) throw Errors.FORBIDDEN(errorMsg);
  }
}


/**
 * Wrapper publik dari checkAccess agar service lain (usulan kondisi, kunjungan)
 * memakai pemeriksaan kepemilikan yang sama — jangan menulis ulang logika ini.
 */
export async function assertCanAccess(
  ctx: AccessContext,
  can: { branchId: string },
  errorMsg = 'Kaleng bukan milik ranting/kecamatan Anda'
): Promise<void> {
  return checkAccess(ctx, can, errorMsg);
}

export async function getCans(
  params: { page: number; limit: number; offset: number; search?: string; status?: string; branch_id?: string; dukuh_id?: string; period?: { year: number; month: number } },
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
    // Layer kartu admin ranting menyaring per dukuh, bukan per ranting.
    params.dukuh_id ? eq(schema.cans.dukuhId, params.dukuh_id) : undefined,
    searchCondition,
  ];

  const currentPeriod = params.period ?? currentOperationalPeriod();
  const currentYear = currentPeriod.year;
  const currentMonth = currentPeriod.month;

  // Filter kondisi bisnis — memakai `condition`, bukan `is_active`.
  // Alias lama dipertahankan agar UI lama tidak putus:
  //   NON_ACTIVE/INACTIVE → NON_AKTIF (sebelumnya is_active = false)
  if (params.status === 'NON_ACTIVE' || params.status === 'INACTIVE') {
    conditions.push(eq(schema.cans.condition, 'NON_AKTIF'));
    conditions.push(eq(schema.cans.isActive, true));
  } else if (
    params.status === 'AKTIF' ||
    params.status === 'RUSAK' ||
    params.status === 'HILANG' ||
    params.status === 'DIKEMBALIKAN'
  ) {
    conditions.push(eq(schema.cans.condition, params.status as CanConditionValue));
  } else if (params.status === 'ASSIGNED') {
    // Masih dilacak + menerima tugas periode berjalan.
    conditions.push(inArray(schema.cans.condition, ASSIGNABLE_CONDITIONS as CanConditionValue[]));
    conditions.push(eq(schema.cans.isActive, true));

    const assignedSubquery = db
      .select({ id: schema.assignments.canId })
      .from(schema.assignments)
      .where(
        and(
          eq(schema.assignments.periodYear, currentYear),
          eq(schema.assignments.periodMonth, currentMonth),
          eq(schema.assignments.status, 'ACTIVE')
        )
      );

    conditions.push(inArray(schema.cans.id, assignedSubquery));
  } else if (params.status === 'COMPLETED') {
    conditions.push(inArray(schema.cans.condition, ASSIGNABLE_CONDITIONS as CanConditionValue[]));
    conditions.push(eq(schema.cans.isActive, true));

    const completedSubquery = db
      .select({ id: schema.assignments.canId })
      .from(schema.assignments)
      .where(
        and(
          eq(schema.assignments.periodYear, currentYear),
          eq(schema.assignments.periodMonth, currentMonth),
          eq(schema.assignments.status, 'COMPLETED')
        )
      );

    conditions.push(inArray(schema.cans.id, completedSubquery));
  } else if (params.status === 'ACTIVE') {
    conditions.push(inArray(schema.cans.condition, ASSIGNABLE_CONDITIONS as CanConditionValue[]));
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
          // orderBy eksplisit: `limit: 1` tanpa urutan membuat assignment yang
          // ditampilkan bisa berubah-ubah antar request.
          orderBy: [desc(schema.assignments.assignedAt), desc(schema.assignments.createdAt)],
          limit: 1,
          columns: { id: true, status: true, skipReasonCode: true }
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

  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.cans).values({
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
      // Kaleng baru selalu mulai sebagai AKTIF + BAIK (tidak ada input yang boleh mengubahnya).
      condition: 'AKTIF',
      isActive: true,
      lifecycleStatus: 'AKTIF',
      physicalCondition: 'BAIK',
      physicalConditionSource: 'OBSERVED',
    }).returning();

    await insertCanCreatedEvent(tx, {
      id: row.id,
      branchId: row.branchId,
      createdAt: row.createdAt,
      lifecycleStatus: row.lifecycleStatus,
      physicalCondition: row.physicalCondition,
      physicalConditionSource: row.physicalConditionSource ?? 'OBSERVED',
      canVersion: row.canVersion,
    }, ctx.userId ?? null);

    return row;
  });

  return inserted;
}

export async function getCanDetail(canId: string, ctx: AccessContext) {
  const can = await db.query.cans.findFirst({
    where: eq(schema.cans.id, canId),
    with: {
      branch: { columns: { name: true } },
      dukuhDetails: { columns: { name: true } },
      // Penjemputan (nominal) — tetap terpisah dari kunjungan verifikasi/penggantian.
      collections: {
        orderBy: [desc(schema.collections.collectedAt)],
        limit: 10,
        with: { officer: { columns: { fullName: true } } },
      },
      // Riwayat usulan perubahan kondisi — sekaligus jejak siapa mengubah apa dan kapan.
      conditionProposals: {
        orderBy: [desc(schema.canConditionProposals.createdAt)],
        limit: 10,
      },
      // Kunjungan non-penjemputan: verifikasi non-aktif dan penggantian unit.
      visits: {
        orderBy: [desc(schema.canVisits.visitedAt)],
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
  // Validasi tujuan pindah ranting (read-only) sebelum transaksi; state kaleng
  // sendiri baru dibaca setelah lock agar validasi transisi memakai snapshot
  // yang tidak bisa berubah di tengah jalan.
  const requestedBranchId = (typeof body.branch_id === 'string' && body.branch_id !== '')
    ? body.branch_id
    : undefined;
  let targetBranch: { id: string; districtId: string } | null = null;
  if (requestedBranchId !== undefined) {
    if (ctx.role === 'ADMIN_RANTING') {
      throw Errors.FORBIDDEN('Ranting tidak dapat memindahkan kaleng ke ranting lain');
    }
    const found = await db.query.branches.findFirst({ where: eq(schema.branches.id, requestedBranchId) });
    if (!found) throw new AppError('NOT_FOUND', 'Ranting tujuan tidak ditemukan', 404);
    if (ctx.role === 'ADMIN_KECAMATAN' && found.districtId !== ctx.districtId) {
      throw Errors.FORBIDDEN('Ranting tujuan bukan dalam kecamatan Anda');
    }
    targetBranch = found;
  }

  return db.transaction(async (tx) => {
    const existing = await lockCanRow(tx, canId);
    await checkAccess(ctx, existing, 'Kaleng bukan milik ranting/kecamatan Anda');

    const newBranchId = targetBranch && targetBranch.id !== existing.branchId
      ? targetBranch.id
      : existing.branchId;
    const isBranchMove = newBranchId !== existing.branchId;

    let newDukuhName = existing.dukuh;
    let newDukuhId = existing.dukuhId;
    if (body.dukuh_id !== undefined) {
      if (body.dukuh_id === '' || body.dukuh_id === null) {
        newDukuhId = null;
        newDukuhName = null;
      } else {
        const dukuhRecord = await tx.query.dukuhs.findFirst({
          where: eq(schema.dukuhs.id, body.dukuh_id as string),
        });
        if (!dukuhRecord) throw Errors.VALIDATION_ERROR('Dukuh tidak ditemukan');
        if (dukuhRecord.branchId !== newBranchId) throw Errors.VALIDATION_ERROR('Dukuh bukan milik ranting tujuan');
        newDukuhId = dukuhRecord.id;
        newDukuhName = dukuhRecord.name;
      }
    } else if (isBranchMove) {
      // Pindah ranting tanpa dukuh baru: jangan gantung ke dukuh ranting lama.
      newDukuhId = null;
      newDukuhName = null;
    }

    // --- Transisi dua dimensi (status lifecycle + kondisi fisik) ---
    // Alias lama dipetakan, bukan dihapus: `is_active = false` → DIKEMBALIKAN,
    // `is_active = true` → AKTIF. Request campuran yang bertentangan ditolak.
    const legacyCondition: CanConditionValue | null =
      body.is_active === undefined || body.is_active === null
        ? null
        : (body.is_active ? 'AKTIF' : 'DIKEMBALIKAN');

    const currentState: CanState = {
      lifecycleStatus: existing.lifecycleStatus,
      physicalCondition: existing.physicalCondition,
      physicalConditionSource: existing.physicalConditionSource ?? 'OBSERVED',
    };
    const resolution = resolveStateInput(
      {
        condition: body.condition ?? legacyCondition,
        lifecycleStatus: body.lifecycle_status,
        physicalCondition: body.physical_condition,
      },
      currentState,
    );
    if (!resolution.ok) throw Errors.VALIDATION_ERROR(resolution.message);

    const nextState = resolution.state;
    const currentLegacy = deriveLegacyCondition(currentState.lifecycleStatus, currentState.physicalCondition);
    const nextLegacy = deriveLegacyCondition(nextState.lifecycleStatus, nextState.physicalCondition);

    // State machine lama tetap mengikat status/legacy projection. Perubahan
    // kondisi fisik yang tidak mengubah proyeksi legacy (mis. NON_AKTIF
    // BAIK→RUSAK) tetap diizinkan karena dua dimensi memang independen.
    if (nextLegacy !== currentLegacy && !isTransitionAllowed(currentLegacy, nextLegacy)) {
      throw Errors.VALIDATION_ERROR(
        `Transisi kondisi ${currentLegacy} → ${nextLegacy} tidak diizinkan`,
      );
    }

    const now = new Date();
    const [updated] = await tx.update(schema.cans).set({
      branchId: newBranchId,
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
      lifecycleStatus: nextState.lifecycleStatus,
      physicalCondition: nextState.physicalCondition,
      physicalConditionSource: nextState.physicalConditionSource,
      condition: nextLegacy,
      isActive: deriveIsActive(nextState.lifecycleStatus),
      updatedAt: now,
    }).where(eq(schema.cans.id, canId)).returning();

    await recordCanStateChange(tx, {
      canId,
      before: { ...currentState, branchId: existing.branchId },
      after: { ...nextState, branchId: newBranchId },
      effectiveAt: now,
      sourceType: CAN_STATE_SOURCE.ADMIN_UPDATE,
      sourceId: randomUUID(),
      actorId: ctx.userId ?? null,
      reasonCode: body.condition_reason_code ?? null,
    });

    if (nextLegacy !== currentLegacy) {
      await syncActiveAssignmentKindForCan(tx, canId, nextLegacy, now);
    }

    return { can: updated[0], oldData: existing };
  });
}

/**
 * Baris draft penugasan yang masih menunjuk kaleng-kaleng ini. Dipakai guard
 * hapus permanen — alasan dan kalimatnya ada di `canDraftLock.ts`.
 *
 * Catatan performa: `period_draft_items` hanya punya index gabungan
 * (`draft_id`, `can_id`), jadi pencarian per `can_id` memindai tabel. Tabelnya
 * kecil (± jumlah kaleng × jumlah periode) dan fungsi ini hanya dipanggil saat
 * hapus permanen — bukan di jalur baca.
 */
async function findDraftLocks(canIds: string[]): Promise<DraftLockInfo[]> {
  if (canIds.length === 0) return [];
  const rows = await db
    .select({
      canId: schema.periodDraftItems.canId,
      periodYear: schema.periodDrafts.periodYear,
      periodMonth: schema.periodDrafts.periodMonth,
      status: schema.periodDrafts.status,
    })
    .from(schema.periodDraftItems)
    .innerJoin(schema.periodDrafts, eq(schema.periodDraftItems.draftId, schema.periodDrafts.id))
    .where(inArray(schema.periodDraftItems.canId, canIds));
  return rows;
}

export async function deleteCan(canId: string, permanent: boolean, ctx: AccessContext) {
  return db.transaction(async (tx) => {
    const existing = await lockCanRow(tx, canId);
    await checkAccess(ctx, existing, 'Kaleng bukan milik ranting/kecamatan Anda');

    if (permanent) {
      // Sumber kebenaran = baris `collections`, BUKAN kolom cache
      // `cans.collection_count`. Cache itu hanya bertambah di jalur submit
      // tertentu, jadi bisa meleset; salah hitung di sini berarti menghapus
      // riwayat uang yang sebenarnya ada.
      const hasCollectionHistory = await tx
        .select({ id: schema.collections.id })
        .from(schema.collections)
        .where(eq(schema.collections.canId, canId))
        .limit(1);
      if (hasCollectionHistory.length > 0) {
        throw new AppError('HAS_COLLECTION_HISTORY', 'Kaleng dengan riwayat penjemputan tidak dapat dihapus permanen. Gunakan penandaan dikembalikan.', 409);
      }
      // Guard draft: tanpa ini Postgres tetap menolak (FK `period_draft_items`),
      // tetapi pesannya tidak bisa menyebut periode maupun membedakan draft yang
      // masih boleh diedit dari yang sudah disetujui.
      const draftError = buildDraftLockError(await findDraftLocks([canId]));
      if (draftError) throw draftError;
      // Keputusan eksplisit: ledger ikut dihapus hanya untuk penghapusan
      // permanen yang sudah lolos guard (FK RESTRICT mencegah orphan diam-diam).
      await deleteCanStateHistory(tx, [canId]);
      await tx.delete(schema.cans).where(eq(schema.cans.id, canId));
      return { deleted: true, oldData: existing };
    }

    // Soft delete = penarikan kaleng. Status menjadi DIKEMBALIKAN; kondisi fisik
    // terakhir dipertahankan sebagai dimensi independen.
    const now = new Date();
    const currentState: CanState = {
      lifecycleStatus: existing.lifecycleStatus,
      physicalCondition: existing.physicalCondition,
      physicalConditionSource: existing.physicalConditionSource ?? 'OBSERVED',
    };
    const nextState = applyStatusChange(currentState, 'DIKEMBALIKAN');

    await tx.update(schema.cans)
      .set({
        isActive: false,
        condition: 'DIKEMBALIKAN',
        lifecycleStatus: nextState.lifecycleStatus,
        physicalCondition: nextState.physicalCondition,
        physicalConditionSource: nextState.physicalConditionSource,
        updatedAt: now,
      })
      .where(eq(schema.cans.id, canId));

    await recordCanStateChange(tx, {
      canId,
      before: { ...currentState, branchId: existing.branchId },
      after: { ...nextState, branchId: existing.branchId },
      effectiveAt: now,
      sourceType: CAN_STATE_SOURCE.ADMIN_DELETE,
      sourceId: randomUUID(),
      actorId: ctx.userId ?? null,
    });

    await syncActiveAssignmentKindForCan(tx, canId, 'DIKEMBALIKAN', now);
    return {
      deleted: false,
      oldData: existing,
      newData: { ...existing, isActive: false, condition: 'DIKEMBALIKAN' as CanConditionValue },
    };
  });
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
      condition: 'AKTIF' as CanConditionValue,
    };
  });

  const inserted = await db.transaction(async (tx) => {
    const rows = await tx.insert(schema.cans).values(toInsert).returning();
    for (const row of rows) {
      await insertCanCreatedEvent(tx, {
        id: row.id,
        branchId: row.branchId,
        createdAt: row.createdAt,
        lifecycleStatus: row.lifecycleStatus,
        physicalCondition: row.physicalCondition,
        physicalConditionSource: row.physicalConditionSource ?? 'OBSERVED',
        canVersion: row.canVersion,
      }, ctx.userId ?? null);
    }
    return rows;
  });
  return inserted;
}

export async function deleteBulkCans(ids: string[], permanent: boolean, ctx: AccessContext) {
  if (permanent) {
    // Sama seperti hapus tunggal: hitung baris `collections` yang benar-benar
    // ada, jangan percaya kolom cache `collection_count`.
    const cansWithHistory = await db
      .select({ canId: schema.collections.canId })
      .from(schema.collections)
      .where(inArray(schema.collections.canId, ids))
      .groupBy(schema.collections.canId);

    if (cansWithHistory.length > 0) {
      throw new AppError('HAS_COLLECTION_HISTORY', `Hapus permanen dibatalkan: ${cansWithHistory.length} dari ${ids.length} kaleng punya riwayat penjemputan, jadi tidak bisa dihapus permanen. Gunakan penandaan dikembalikan.`, 409);
    }

    // Satu kaleng yang masih di draft menggagalkan SELURUH perintah DELETE
    // (satu statement `IN (...)`), dan tanpa guard ini pengguna tidak tahu
    // berapa maupun periode mana yang menahan.
    const draftError = buildDraftLockError(await findDraftLocks(ids), ids.length);
    if (draftError) throw draftError;
  }

  return db.transaction(async (tx) => {
    let scope: SQL | undefined;

    if (ctx.role === 'ADMIN_RANTING' && ctx.branchId) {
      scope = eq(schema.cans.branchId, ctx.branchId);
    } else if (ctx.role === 'ADMIN_KECAMATAN' && ctx.districtId) {
      const branchIds = (await tx.select({ id: schema.branches.id })
        .from(schema.branches)
        .where(eq(schema.branches.districtId, ctx.districtId)))
        .map((b) => b.id);
      if (branchIds.length === 0) return { deleted: ids.length };
      scope = inArray(schema.cans.branchId, branchIds);
    } else if (ctx.role === 'ADMIN_KECAMATAN' || ctx.role === 'ADMIN_RANTING') {
      throw Errors.FORBIDDEN('Tidak memiliki akses untuk menghapus data ini');
    }

    const rows = await tx.select()
      .from(schema.cans)
      .where(and(inArray(schema.cans.id, ids), scope))
      .for('update');
    if (rows.length === 0) return { deleted: ids.length };

    const allowedIds = rows.map((row) => row.id);

    if (permanent) {
      // Ledger ikut dihapus eksplisit setelah guard lolos (FK CASCADE juga
      // menjamin tidak ada baris orphan).
      await deleteCanStateHistory(tx, allowedIds);
      await tx.delete(schema.cans).where(inArray(schema.cans.id, allowedIds));
      return { deleted: ids.length };
    }

    const now = new Date();
    for (const row of rows) {
      const currentState: CanState = {
        lifecycleStatus: row.lifecycleStatus,
        physicalCondition: row.physicalCondition,
        physicalConditionSource: row.physicalConditionSource ?? 'OBSERVED',
      };
      const nextState = applyStatusChange(currentState, 'DIKEMBALIKAN');

      await tx.update(schema.cans)
        .set({
          isActive: false,
          condition: 'DIKEMBALIKAN',
          lifecycleStatus: nextState.lifecycleStatus,
          physicalCondition: nextState.physicalCondition,
          physicalConditionSource: nextState.physicalConditionSource,
          updatedAt: now,
        })
        .where(eq(schema.cans.id, row.id));

      await recordCanStateChange(tx, {
        canId: row.id,
        before: { ...currentState, branchId: row.branchId },
        after: { ...nextState, branchId: row.branchId },
        effectiveAt: now,
        sourceType: CAN_STATE_SOURCE.ADMIN_DELETE,
        sourceId: randomUUID(),
        actorId: ctx.userId ?? null,
      });

      await syncActiveAssignmentKindForCan(tx, row.id, 'DIKEMBALIKAN', now);
    }

    return { deleted: ids.length };
  });
}
