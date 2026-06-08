/**
 * Ownership guard — memastikan user hanya bisa mengakses resource miliknya sendiri.
 *
 * Aturan akses:
 * - ADMIN_PUSAT: boleh akses apa pun.
 * - ADMIN_KABUPATEN: hanya districtId miliknya.
 * - ADMIN_RANTING: hanya branchId miliknya.
 * - BENDAHARA: hanya branchId miliknya.
 * - PETUGAS: hanya collection miliknya (officerId).
 *
 * Gunakan di route handler (bukan middleware Express) karena butuh DB lookup.
 */
import { AppError } from '../utils/AppError';
import { Errors } from '../utils/errorCatalog';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { JWTPayload } from './auth';

type AuthContext = JWTPayload & { userId: string };

/**
 * Lempar FORBIDDEN_SCOPE jika user tidak punya akses ke branchId.
 */
export async function assertBranchAccess(ctx: AuthContext, branchId: string): Promise<void> {
  if (!branchId) throw Errors.FORBIDDEN_SCOPE('branchId tidak diberikan');

  switch (ctx.role) {
    case 'ADMIN_PUSAT':
      return; // boleh semua
    case 'ADMIN_RANTING':
    case 'BENDAHARA':
      if (ctx.branchId !== branchId) {
        throw Errors.FORBIDDEN_SCOPE('Tidak punya akses ke ranting ini');
      }
      return;
    case 'ADMIN_KECAMATAN': {
      // Cek apakah branch milik district yang sama
      const branch = await db.query.branches.findFirst({
        where: eq(schema.branches.id, branchId),
        columns: { districtId: true },
      });
      if (!branch || branch.districtId !== ctx.districtId) {
        throw Errors.FORBIDDEN_SCOPE('Tidak punya akses ke ranting ini');
      }
      return;
    }
    default:
      throw Errors.FORBIDDEN_SCOPE();
  }
}

/**
 * Lempar FORBIDDEN_SCOPE jika user tidak punya akses ke districtId.
 */
export async function assertDistrictAccess(ctx: AuthContext, districtId: string): Promise<void> {
  if (!districtId) throw Errors.FORBIDDEN_SCOPE('districtId tidak diberikan');

  switch (ctx.role) {
    case 'ADMIN_PUSAT':
      return;
    case 'ADMIN_KABUPATEN':
      if (ctx.districtId !== districtId) {
        throw Errors.FORBIDDEN_SCOPE('Tidak punya akses ke kecamatan ini');
      }
      return;
    default:
      // ADMIN_RANTING, BENDAHARA, PETUGAS — tidak boleh akses district lain
      if (ctx.districtId && ctx.districtId !== districtId) {
        throw Errors.FORBIDDEN_SCOPE('Tidak punya akses ke kecamatan ini');
      }
      throw Errors.FORBIDDEN_SCOPE();
  }
}

/**
 * Lempar FORBIDDEN_SCOPE jika user tidak punya akses ke collectionId.
 * PETUGAS hanya bisa lihat collection miliknya.
 * BENDAHARA/ADMIN_RANTING hanya bisa lihat collection di branch-nya.
 * ADMIN_KECAMATAN hanya bisa lihat collection di district-nya.
 */
export async function assertCollectionAccess(ctx: AuthContext, collectionId: string): Promise<void> {
  if (!collectionId) throw Errors.FORBIDDEN_SCOPE('collectionId tidak diberikan');

  const collection = await db.query.collections.findFirst({
    where: eq(schema.collections.id, collectionId),
    columns: { officerId: true },
    with: {
      can: {
        columns: { branchId: true },
        with: { branch: { columns: { districtId: true } } },
      },
    },
  });

  if (!collection) throw Errors.COLLECTION_NOT_FOUND();

  switch (ctx.role) {
    case 'ADMIN_PUSAT':
      return;
    case 'PETUGAS':
      if (collection.officerId !== ctx.officerId) {
        throw Errors.FORBIDDEN_SCOPE('Tidak punya akses ke perolehan ini');
      }
      return;
    case 'ADMIN_RANTING':
    case 'BENDAHARA':
      if (collection.can.branchId !== ctx.branchId) {
        throw Errors.FORBIDDEN_SCOPE('Tidak punya akses ke perolehan ini');
      }
      return;
    case 'ADMIN_KECAMATAN': {
      const districtId = collection.can.branch?.districtId;
      if (districtId !== ctx.districtId) {
        throw Errors.FORBIDDEN_SCOPE('Tidak punya akses ke perolehan ini');
      }
      return;
    }
    default:
      throw Errors.FORBIDDEN_SCOPE();
  }
}

/**
 * Lempar FORBIDDEN_SCOPE jika user tidak punya akses ke dukuhId.
 */
export async function assertDukuhAccess(ctx: AuthContext, dukuhId: string): Promise<void> {
  if (!dukuhId) throw Errors.FORBIDDEN_SCOPE('dukuhId tidak diberikan');

  const dukuh = await db.query.dukuhs.findFirst({
    where: eq(schema.dukuhs.id, dukuhId),
    columns: { branchId: true },
  });

  if (!dukuh) {
    throw new AppError('NOT_FOUND', 'Dukuh tidak ditemukan', 404);
  }

  await assertBranchAccess(ctx, dukuh.branchId);
}
