import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, asc, notInArray } from 'drizzle-orm';

/**
 * Cari kaleng aktif yang belum punya assignment untuk periode tertentu
 */
export async function findCansWithoutAssignment(year: number, month: number) {
  const existingAssignments = await db.query.assignments.findMany({
    where: and(
      eq(schema.assignments.periodYear, year),
      eq(schema.assignments.periodMonth, month)
    ),
    columns: { canId: true },
  });
  const assignedCanIds = existingAssignments.map((a) => a.canId);

  const cansToAssign = await db.query.cans.findMany({
    where: and(
      eq(schema.cans.isActive, true),
      assignedCanIds.length > 0 ? notInArray(schema.cans.id, assignedCanIds) : undefined
    ),
    with: {
      branch: {
        with: {
          officers: {
            where: eq(schema.officers.isActive, true),
            orderBy: [asc(schema.officers.createdAt)],
          },
        },
      },
    },
  });

  return { cansToAssign, assignedCanIds };
}

type CanWithOfficers = typeof schema.cans.$inferSelect & {
  branch: typeof schema.branches.$inferSelect & {
    officers: (typeof schema.officers.$inferSelect)[];
  } | null;
};

type AssignmentInsert = typeof schema.assignments.$inferInsert;

/**
 * Generate assignment data menggunakan round-robin per ranting
 * Setiap kaleng di-round-robin ke petugas aktif di ranting yang sama
 * O(N) dengan Map<branchId, counter>
 */
export function buildRoundRobinAssignments(
  cansToAssign: CanWithOfficers[],
  year: number,
  month: number
): AssignmentInsert[] {
  const assignmentData: AssignmentInsert[] = [];
  const branchCounter = new Map<string, number>();

  for (const can of cansToAssign) {
    const officers = can.branch?.officers ?? [];
    if (officers.length === 0) continue;

    const branchId = can.branchId;
    const currentCount = branchCounter.get(branchId) ?? 0;
    const idx = currentCount % officers.length;
    const assignedOfficer = officers[idx] ?? officers[0];
    branchCounter.set(branchId, currentCount + 1);

    assignmentData.push({
      canId: can.id,
      officerId: assignedOfficer.id,
      periodYear: year,
      periodMonth: month,
      status: 'ACTIVE' as const,
    });
  }

  return assignmentData;
}

/**
 * Generate assignment data menggunakan first-officer (ambil petugas pertama)
 */
export function buildFirstOfficerAssignments(
  cansToAssign: CanWithOfficers[],
  year: number,
  month: number
): AssignmentInsert[] {
  const assignmentData: AssignmentInsert[] = [];

  for (const can of cansToAssign) {
    const officers = can.branch?.officers ?? [];
    if (officers.length === 0) continue;

    const primaryOfficer = officers[0];
    const backupOfficer = officers.length > 1 ? officers[1] : null;

    assignmentData.push({
      canId: can.id,
      officerId: primaryOfficer.id,
      backupOfficerId: backupOfficer?.id || null,
      periodYear: year,
      periodMonth: month,
      status: 'ACTIVE' as const,
      assignedAt: new Date(),
    });
  }

  return assignmentData;
}

/**
 * Batch insert assignments ke database
 */
export async function insertAssignments(
  assignmentData: AssignmentInsert[],
  useOnConflictDoNothing = false
) {
  if (assignmentData.length === 0) return { created: 0 };

  const chunkSize = 50;
  const chunks: AssignmentInsert[][] = [];
  for (let i = 0; i < assignmentData.length; i += chunkSize) {
    chunks.push(assignmentData.slice(i, i + chunkSize));
  }

  await Promise.all(
    chunks.map((chunk) => {
      if (useOnConflictDoNothing) {
        return db.insert(schema.assignments).values(chunk as any).onConflictDoNothing();
      } else {
        return db.insert(schema.assignments).values(chunk as any);
      }
    })
  );

  return { created: assignmentData.length };
}
