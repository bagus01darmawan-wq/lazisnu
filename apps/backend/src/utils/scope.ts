/**
 * Scope utility — menentukan scope akses user berdasarkan role.
 *
 * Dipakai untuk filter list query (bukan ownership per-record).
 * Contoh: `getRoleScope(user)` → `{ branchIds: [1,2], districtIds: [3] }`
 */
import { JWTPayload } from '../middleware/auth';

export interface RoleScope {
  branchIds: string[];
  districtIds: string[];
  officerId?: string;
}

/**
 * Dapatkan scope role user untuk digunakan dalam filter query.
 * - ADMIN_PUSAT: scope kosong → lihat semua
 * - ADMIN_KABUPATEN: districtId miliknya
 * - ADMIN_RANTING/BENDAHARA: branchId miliknya
 * - PETUGAS: officerId miliknya + branchId miliknya
 */
export function getRoleScope(user: JWTPayload): RoleScope {
  const scope: RoleScope = {
    branchIds: [],
    districtIds: [],
    officerId: undefined,
  };

  if (!user) return scope;

  switch (user.role) {
    case 'ADMIN_PUSAT':
    case 'ADMIN_KABUPATEN':
      // Kosong = tanpa filter (lihat semua)
      break;
    case 'ADMIN_KECAMATAN':
      if (user.districtId) scope.districtIds = [user.districtId];
      break;
    case 'ADMIN_RANTING':
    case 'BENDAHARA':
      if (user.branchId) scope.branchIds = [user.branchId];
      break;
    case 'PETUGAS':
      if (user.branchId) scope.branchIds = [user.branchId];
      if (user.officerId) scope.officerId = user.officerId;
      break;
  }

  return scope;
}
