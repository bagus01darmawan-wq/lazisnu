/**
 * C1-T8 — Agregat darurat PPK (§14 C-1/C-2 #5c + §8).
 *
 * HP + catatan kertas hilang → admin catat 1 angka total dari uang fisik +
 * saksi bendahara + alasan HP_HILANG. Masuk total setoran (computePpkTotals),
 * TIDAK masuk rincian kaleng (collection_count tak bertambah).
 *
 * - Satu baris aktif per officer+periode (upsert-ganti + audit old→new).
 * - Pencatat: ADMIN_RANTING pemilik / ADMIN_KECAMATAN sedistrik.
 * - Saksi: STAF_KEUANGAN seranting (aturan sama dengan countersign T5).
 * - Alasan: HP_HILANG | KOREKSI_ADMIN (subset enum variance_reason).
 * - Kunci: submission FINAL → tolak; jendela reopen lewat → tolak.
 * - Audit EMERGENCY_AGGREGATE_RECORDED tidak boleh menggagalkan catat sah.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq } from 'drizzle-orm';
import { Errors } from '../utils/errorCatalog';
import { insertActivityLog } from './auditLogService';
import { assertReopenWindowOpen } from './collectionSubmission';
import { ensurePpkSubmission, assertPpkBendaharaScope, type SubmissionActor } from './ppkSubmissions';
import { periodKey } from './periodCalendar';
import type { DbOrTx } from './ppkSubmissions';

export type EmergencyReason = 'HP_HILANG' | 'KOREKSI_ADMIN';

export interface EmergencyAggregateInput {
  officerId: string;
  year: number;
  month: number;
  amount: number;
  reason: EmergencyReason;
  witnessUserId: string;
  note: string;
}

export interface EmergencyAggregateRow {
  id: string;
  officer_id: string;
  branch_id: string;
  period: string;
  amount: number;
  reason: EmergencyReason;
  witness_user_id: string;
  recorded_by: string;
  note: string;
}

function toEmergencyResponse(r: typeof schema.ppkEmergencyAggregates.$inferSelect): EmergencyAggregateRow {
  return {
    id: r.id,
    officer_id: r.officerId,
    branch_id: r.branchId,
    period: periodKey(r.periodYear, r.periodMonth),
    amount: Number(r.amount),
    reason: r.reason as EmergencyReason,
    witness_user_id: r.witnessUserId,
    recorded_by: r.createdBy,
    note: r.note,
  };
}

/** Jumlah agregat aktif satu officer+periode (0 bila tak ada). */
export async function getAggregateTotal(
  dbOrTx: DbOrTx,
  officerId: string,
  year: number,
  month: number,
): Promise<{ total: number; count: number }> {
  const rows = await dbOrTx
    .select({ amount: schema.ppkEmergencyAggregates.amount })
    .from(schema.ppkEmergencyAggregates)
    .where(
      and(
        eq(schema.ppkEmergencyAggregates.officerId, officerId),
        eq(schema.ppkEmergencyAggregates.periodYear, year),
        eq(schema.ppkEmergencyAggregates.periodMonth, month),
      ),
    );
  return { total: rows.reduce((a, r) => a + Number(r.amount), 0), count: rows.length };
}

export async function recordEmergencyAggregate(
  actor: SubmissionActor,
  input: EmergencyAggregateInput,
  now: Date = new Date(),
): Promise<EmergencyAggregateRow> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw Errors.VALIDATION_ERROR('Nominal agregat harus bilangan bulat > 0.');
  }
  if (input.reason !== 'HP_HILANG' && input.reason !== 'KOREKSI_ADMIN') {
    throw Errors.VALIDATION_ERROR('Alasan agregat hanya HP_HILANG / KOREKSI_ADMIN.');
  }
  const note = (input.note ?? '').trim();
  if (note.length < 10) {
    throw Errors.VALIDATION_ERROR('Keterangan agregat wajib min 10 karakter.');
  }
  if (input.year < 2020 || input.year > 2100 || input.month < 1 || input.month > 12) {
    throw Errors.VALIDATION_ERROR('Periode tidak valid (year 2020–2100, month 1–12).');
  }

  const officer = await db.query.officers.findFirst({
    where: eq(schema.officers.id, input.officerId),
    columns: { id: true, branchId: true, districtId: true },
  });
  if (!officer) throw Errors.VALIDATION_ERROR('Petugas tidak ditemukan');

  const branch = await db.query.branches.findFirst({
    where: eq(schema.branches.id, officer.branchId),
    columns: { id: true, districtId: true },
  });
  if (!branch) throw Errors.VALIDATION_ERROR('Ranting petugas tidak ditemukan');

  // Scope pencatat di server (pola T5): ranting pemilik / MWC sedistrik.
  if (actor.role === 'ADMIN_RANTING') {
    if (!actor.branchId || actor.branchId !== officer.branchId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan petugas ranting Anda');
    }
  } else if (actor.role === 'ADMIN_KECAMATAN') {
    if (!actor.districtId || actor.districtId !== branch.districtId) {
      throw Errors.FORBIDDEN_SCOPE('Bukan petugas distrik Anda');
    }
  } else {
    throw Errors.FORBIDDEN('Hanya Admin Ranting / MWC yang mencatat agregat darurat');
  }

  // Saksi = bendahara seranting (aturan countersign T5) — dicatat siapa.
  await assertPpkBendaharaScope(db, input.witnessUserId, officer.branchId);

  // Baris submission dipakai sebagai gerbang kunci (FINAL/jendela).
  const sub = await ensurePpkSubmission(input.officerId, officer.branchId, input.year, input.month);
  if (sub.status === 'FINAL') {
    throw Errors.CONFLICT('Setoran sudah FINAL — reopen dulu bila agregat berubah.');
  }
  assertReopenWindowOpen(sub, now);

  const old = await db.query.ppkEmergencyAggregates.findFirst({
    where: and(
      eq(schema.ppkEmergencyAggregates.officerId, input.officerId),
      eq(schema.ppkEmergencyAggregates.periodYear, input.year),
      eq(schema.ppkEmergencyAggregates.periodMonth, input.month),
    ),
  });

  const [saved] = await db
    .insert(schema.ppkEmergencyAggregates)
    .values({
      officerId: input.officerId,
      branchId: officer.branchId,
      periodYear: input.year,
      periodMonth: input.month,
      amount: BigInt(input.amount),
      reason: input.reason,
      witnessUserId: input.witnessUserId,
      createdBy: actor.userId,
      note,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        schema.ppkEmergencyAggregates.officerId,
        schema.ppkEmergencyAggregates.periodYear,
        schema.ppkEmergencyAggregates.periodMonth,
      ],
      set: {
        amount: BigInt(input.amount),
        reason: input.reason,
        witnessUserId: input.witnessUserId,
        createdBy: actor.userId,
        note,
        updatedAt: now,
      },
    })
    .returning();

  try {
    await insertActivityLog({
      userId: actor.userId,
      officerId: input.officerId,
      actionType: 'EMERGENCY_AGGREGATE_RECORDED',
      entityType: 'ppk_emergency_aggregate',
      entityId: saved.id,
      oldData: old ? { amount: Number(old.amount), reason: old.reason } : null,
      newData: {
        period: periodKey(input.year, input.month),
        amount: input.amount,
        reason: input.reason,
        witness_user_id: input.witnessUserId,
        replaced: !!old,
      },
      ipAddress: 'emergency-aggregate',
      userAgent: null,
    });
  } catch {
    // Audit tidak boleh menggagalkan catat yang sah.
  }

  return toEmergencyResponse(saved);
}
