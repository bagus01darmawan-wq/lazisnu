import { and, eq } from 'drizzle-orm';
import { db } from '../config/database';
import * as schema from '../database/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Menjaga agar jenis tugas ACTIVE selalu konsisten dengan kondisi kaleng.
 *
 * - NON_AKTIF  : PICKUP ACTIVE → VISIT (kalau belum ada VISIT untuk periode itu)
 * - AKTIF/RUSAK/HILANG : VISIT ACTIVE → PICKUP (kalau belum ada PICKUP)
 * - DIKEMBALIKAN: semua tugas ACTIVE → COMPLETED
 *
 * Tugas yang sudah COMPLETED/UNCOLLECTED tidak diubah: periode itu sudah
 * selesai dan tidak boleh menulis ulang sejarah.
 */
export async function syncActiveAssignmentKindForCan(
  tx: Tx,
  canId: string,
  condition: string,
  now: Date = new Date(),
): Promise<void> {
  if (condition === 'DIKEMBALIKAN') {
    await tx
      .update(schema.assignments)
      .set({ status: 'COMPLETED', completedAt: now, updatedAt: now })
      .where(and(eq(schema.assignments.canId, canId), eq(schema.assignments.status, 'ACTIVE')));
    return;
  }

  const targetKind = condition === 'NON_AKTIF' ? 'VISIT' : 'PICKUP';
  const sourceKind = targetKind === 'VISIT' ? 'PICKUP' : 'VISIT';

  const rows = await tx
    .select({
      id: schema.assignments.id,
      periodYear: schema.assignments.periodYear,
      periodMonth: schema.assignments.periodMonth,
    })
    .from(schema.assignments)
    .where(
      and(
        eq(schema.assignments.canId, canId),
        eq(schema.assignments.status, 'ACTIVE'),
        eq(schema.assignments.kind, sourceKind),
      ),
    );

  for (const row of rows) {
    const conflict = await tx.query.assignments.findFirst({
      where: and(
        eq(schema.assignments.canId, canId),
        eq(schema.assignments.periodYear, row.periodYear),
        eq(schema.assignments.periodMonth, row.periodMonth),
        eq(schema.assignments.kind, targetKind),
      ),
      columns: { id: true },
    });

    if (conflict) {
      // Sudah ada tugas dengan jenis tujuan untuk periode ini. Tugas lama
      // dianggap digantikan, bukan dihapus, agar jejaknya tetap ada.
      await tx
        .update(schema.assignments)
        .set({ status: 'REASSIGNED', updatedAt: now })
        .where(eq(schema.assignments.id, row.id));
      continue;
    }

    await tx
      .update(schema.assignments)
      .set({ kind: targetKind, updatedAt: now })
      .where(eq(schema.assignments.id, row.id));
  }
}
