import { eq, inArray } from 'drizzle-orm';
import * as schema from '../database/schema';
import { db } from '../config/database';
import { JWTPayload } from '../middleware/auth';

/**
 * Generates Drizzle ORM filter conditions based on the user's role.
 * Ensures that Ranting Admins only see their branch's data,
 * and Kecamatan Admins only see their district's data.
 * 
 * @param user The current authenticated user payload
 * @param tableAlias The schema table to filter against (e.g., schema.cans, schema.officers)
 * @returns A Drizzle expression, or undefined if no specific scope
 */
export async function getRoleScope(user: JWTPayload, tableAlias: any) {
  if (user.role === 'ADMIN_RANTING' && user.branchId) {
    if (tableAlias.branchId) {
      return eq(tableAlias.branchId, user.branchId);
    }
  } else if (user.role === 'ADMIN_KECAMATAN' && user.districtId) {
    if (tableAlias.districtId) {
      return eq(tableAlias.districtId, user.districtId);
    } else if (tableAlias.branchId) {
      // For tables like `cans` that only have `branchId`
      const districtBranches = await db.select({ id: schema.branches.id })
        .from(schema.branches)
        .where(eq(schema.branches.districtId, user.districtId));
      
      const branchIds = districtBranches.map(b => b.id);
      
      if (branchIds.length === 0) {
        // Return a condition that guarantees no results
        return eq(tableAlias.branchId, '00000000-0000-0000-0000-000000000000');
      }
      return inArray(tableAlias.branchId, branchIds);
    }
  }
  
  return undefined;
}
