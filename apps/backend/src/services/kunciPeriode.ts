/**
 * C1-T6 — Kunci berlapis MWC (§14.7 KUNCI BERLAPIS C-4, 2 tahap).
 *
 * - Fase ditentukan murni oleh waktu via `resolveKunciPeriodePhase`
 *   (BELUM_SAATNYA < 27 00:00 → tolak; REKAP 27 00:00–9 23:59 → tarik FINAL
 *   saja; KUNCI_KERAS ≥10 00:00 → boleh FINAL_NOL massal + LOCKED).
 * - Scope: ADMIN_KECAMATAN (MWC) sedistrik; massal hanya `kind=RANTING`
 *   (PROGRAM_MWC/Taqwa dikecualikan — 100% milik MWC, tanpa share §8b).
 * - FINAL_NOL massal hanya untuk ranting yang benar-benar diam: TANPA baris
 *   `branch_submissions` periode itu DAN TANPA baris `ppk_submissions` apa pun
 *   (DRAFT sekalipun). Ranting dengan DRAFT / PPK parsial dibiarkan pending
 *   untuk penanganan manual (aman: tidak menghapus uang).
 * - Encoding FINAL_NOL (keputusan F6 review-T5): total 0 + share 0 +
 *   `varianceReason=KOREKSI_ADMIN` + status FINAL_NOL + `finalizedBy=MWC` +
 *   audit `reason_detail="tidak ada laporan penjemputan (massal MWC)"`.
 *   Memakai enum yang ada (tanpa migrasi — disiplin T4/T5). Turunan
 *   `total 0 + alasan` = NOL eksplisit aman karena variance 0 normalnya tak
 *   butuh alasan, sehingga alasan hanya ada bila niat NOL di-sign-time.
 * - Massal adalah kunci SISTEM (bukan co-sign): kedua kolom signer NULL.
 *   BA tetap bisa diunduh (FINAL_NOL boleh, TTD tampil kosong) — TTD massal
 *   bukan persetujuan dua orang melainkan segel administratif MWC.
 * - FINAL_NOL TIDAK dihitung "sudah lapor" (flag merah UI T10): respons
 *   memisahkan `final_count` (lapor) vs `final_nol_count` (bukan lapor) vs
 *   `pending`.
 * - Idempoten: insert `onConflictDoNothing` + baca ulang; KUNCI_KERAS kedua
 *   kali menciptakan 0 baris baru. `period_calendar` di-LOCKED aman-ganda.
 * - Notifikasi push/WA = T11 (tiket ini hanya audit + daftar untuk UI T10).
 * - Tanpa migrasi; tanpa R2; audit tidak boleh menggagalkan kunci yang sah.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq, sql } from 'drizzle-orm';
import { Errors } from '../utils/errorCatalog';
import { insertActivityLog } from './auditLogService';
import {
  buildPeriodBoundaries,
  periodKey,
  resolveKunciPeriodePhase,
  resolvePeriodStatus,
  type KunciPeriodePhase,
} from './periodCalendar';
import { BRANCH_FORMULA_SNAPSHOT, type SubmissionActor } from './ppkSubmissions';

export interface KunciPeriodeInput {
  year: number;
  month: number;
}

export interface KunciPeriodePendingItem {
  branch_id: string;
  branch_name: string;
  submission_status: 'TANPA_BARIS' | 'DRAFT' | 'PPK_BELUM_FINAL';
  has_ppk_rows: boolean;
}

export interface KunciPeriodeCreatedItem {
  branch_id: string;
  branch_name: string;
  submission_id: string;
}

export interface KunciPeriodeResult {
  period: string;
  period_year: number;
  period_month: number;
  /** Fase waktu saat eksekusi: REKAP (27–9) atau KUNCI_KERAS (10+). */
  phase: Extract<KunciPeriodePhase, 'REKAP' | 'KUNCI_KERAS'>;
  period_status: string;
  total_ranting: number;
  final_count: number;
  final_nol_count: number;
  /** Yang dihitung "sudah lapor" = FINAL saja (FINAL_NOL = flag merah, bukan lapor). */
  reported_count: number;
  pending_count: number;
  pending: KunciPeriodePendingItem[];
  /** Hanya terisi pada fase KUNCI_KERAS (REKAP selalu []). */
  created_final_nol: KunciPeriodeCreatedItem[];
  /** Program MWC (mis. Taqwa) — dilaporkan terpisah, tidak ikut massal. */
  program_mwc_total: number;
  program_mwc_final: number;
  calendar_locked: boolean;
}

// G2 (tinjauan-T6): baris yang baru lahir memakai status waktu berjalan
// (bukan selalu OPEN) agar tak ada OPEN-vs-waktu yang meleset di REKAP-akhir.
async function ensurePeriodCalendarRow(year: number, month: number, now: Date): Promise<void> {
  const b = buildPeriodBoundaries(year, month);
  await db
    .insert(schema.periodCalendar)
    .values({
      periodYear: year,
      periodMonth: month,
      assignDate: b.assignDate,
      dueDate: b.dueDate,
      toleranceEnd: b.toleranceEnd,
      status: resolvePeriodStatus(now, b),
    })
    .onConflictDoNothing({
      target: [schema.periodCalendar.periodYear, schema.periodCalendar.periodMonth],
    });
}

async function auditKunci(
  actor: SubmissionActor,
  actionType: string,
  period: string,
  newData: Record<string, unknown>,
): Promise<void> {
  try {
    await insertActivityLog({
      userId: actor.userId,
      officerId: null,
      actionType,
      entityType: 'period',
      entityId: null,
      oldData: null,
      newData: { period, ...newData },
      ipAddress: 'kunci-periode',
      userAgent: null,
    });
  } catch {
    // Audit tidak boleh menggagalkan kunci yang sah (pola T4/T5).
  }
}

export async function kunciPeriode(
  actor: SubmissionActor,
  input: KunciPeriodeInput,
  now: Date = new Date(),
): Promise<KunciPeriodeResult> {
  if (actor.role !== 'ADMIN_KECAMATAN' || !actor.districtId) {
    throw Errors.FORBIDDEN('Hanya MWC (Admin Kecamatan) yang mengunci periode');
  }
  const districtId = actor.districtId;

  let b: ReturnType<typeof buildPeriodBoundaries>;
  try {
    b = buildPeriodBoundaries(input.year, input.month);
  } catch {
    throw Errors.VALIDATION_ERROR('Periode tidak valid (year 2020–2100, month 1–12).');
  }
  // Guard masa depan (pola preparePeriodDraft T3): robot/MWC tidak mengunci
  // periode yang belum berjalan.
  const nowY = now.getFullYear();
  const nowM = now.getMonth() + 1;
  if (input.year > nowY || (input.year === nowY && input.month > nowM)) {
    throw Errors.VALIDATION_ERROR(
      `Periode ${periodKey(input.year, input.month)} belum berjalan — tidak bisa dikunci.`,
    );
  }

  const phase = resolveKunciPeriodePhase(now, b);
  if (phase === 'BELUM_SAATNYA') {
    throw Errors.VALIDATION_ERROR(
      `Kunci Periode aktif sejak 27 ${periodKey(input.year, input.month)} 00:00 — belum saatnya.`,
    );
  }
  const periodStatus = resolvePeriodStatus(now, b);

  await ensurePeriodCalendarRow(input.year, input.month, now);

  const branches = await db
    .select({ id: schema.branches.id, name: schema.branches.name, kind: schema.branches.kind })
    .from(schema.branches)
    .where(eq(schema.branches.districtId, districtId));
  const rantings = branches.filter((x) => x.kind === 'RANTING');
  const programs = branches.filter((x) => x.kind !== 'RANTING');

  let programMwcFinal = 0;
  for (const p of programs) {
    const sub = await db.query.branchSubmissions.findFirst({
      where: and(
        eq(schema.branchSubmissions.branchId, p.id),
        eq(schema.branchSubmissions.periodYear, input.year),
        eq(schema.branchSubmissions.periodMonth, input.month),
      ),
      columns: { status: true },
    });
    if (sub && (sub.status === 'FINAL' || sub.status === 'FINAL_NOL')) programMwcFinal += 1;
  }

  let finalCount = 0;
  let finalNolCount = 0;
  const pending: KunciPeriodePendingItem[] = [];
  // Kandidat massal (fase KUNCI_KERAS): ranting tanpa baris + tanpa PPK.
  const silentCandidates: typeof rantings = [];

  for (const r of rantings) {
    const sub = await db.query.branchSubmissions.findFirst({
      where: and(
        eq(schema.branchSubmissions.branchId, r.id),
        eq(schema.branchSubmissions.periodYear, input.year),
        eq(schema.branchSubmissions.periodMonth, input.month),
      ),
    });
    if (sub && sub.status === 'FINAL') {
      finalCount += 1;
      continue;
    }
    if (sub && sub.status === 'FINAL_NOL') {
      finalNolCount += 1;
      continue;
    }
    // Belum FINAL: cek apakah ada jejak PPK (DRAFT/PPK_SIGNED/FINAL parsial).
    const [{ n: ppkRows }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.ppkSubmissions)
      .where(
        and(
          eq(schema.ppkSubmissions.branchId, r.id),
          eq(schema.ppkSubmissions.periodYear, input.year),
          eq(schema.ppkSubmissions.periodMonth, input.month),
        ),
      );
    const hasPpk = ppkRows > 0;
    if (!sub && !hasPpk) {
      if (phase === 'KUNCI_KERAS') {
        silentCandidates.push(r);
      } else {
        pending.push({
          branch_id: r.id,
          branch_name: r.name,
          submission_status: 'TANPA_BARIS',
          has_ppk_rows: false,
        });
      }
      continue;
    }
    // Ada DRAFT atau ada PPK non-FINAL → pending manual (tidak di-nol-kan otomatis).
    if (!sub) {
      pending.push({
        branch_id: r.id,
        branch_name: r.name,
        submission_status: 'PPK_BELUM_FINAL',
        has_ppk_rows: hasPpk,
      });
    } else {
      pending.push({
        branch_id: r.id,
        branch_name: r.name,
        submission_status: 'DRAFT',
        has_ppk_rows: hasPpk,
      });
    }
  }

  if (phase === 'REKAP') {
    await auditKunci(actor, 'KUNCI_PERIODE_REKAP', periodKey(input.year, input.month), {
      period_status: periodStatus,
      total_ranting: rantings.length,
      final_count: finalCount,
      final_nol_count: finalNolCount,
      pending_count: pending.length,
    });
    return {
      period: periodKey(input.year, input.month),
      period_year: input.year,
      period_month: input.month,
      phase: 'REKAP',
      period_status: periodStatus,
      total_ranting: rantings.length,
      final_count: finalCount,
      final_nol_count: finalNolCount,
      reported_count: finalCount,
      pending_count: pending.length,
      pending,
      created_final_nol: [],
      program_mwc_total: programs.length,
      program_mwc_final: programMwcFinal,
      calendar_locked: false,
    };
  }

  // Fase KUNCI_KERAS: buat FINAL_NOL untuk yang diam + LOCKED kalender.
  const created: KunciPeriodeCreatedItem[] = [];
  for (const r of silentCandidates) {
    // Snapshot kaleng saat kunci (5 keranjang §8c; ditarik tidak dihitung di total? tetap snapshot).
    const canRows = await db
      .select({ condition: schema.cans.condition, n: sql<number>`count(*)::int` })
      .from(schema.cans)
      .where(eq(schema.cans.branchId, r.id))
      .groupBy(schema.cans.condition);
    const cans: Record<string, number> = { AKTIF: 0, NON_AKTIF: 0, RUSAK: 0, HILANG: 0, DIKEMBALIKAN: 0 };
    for (const row of canRows) cans[row.condition] = row.n;
    const canTotal = cans.AKTIF + cans.NON_AKTIF + cans.RUSAK + cans.HILANG + cans.DIKEMBALIKAN;

    const [inserted] = await db
      .insert(schema.branchSubmissions)
      .values({
        branchId: r.id,
        districtId,
        periodYear: input.year,
        periodMonth: input.month,
        totalAmount: BigInt(0),
        bisyarohTotal: BigInt(0),
        shareMwc: BigInt(0),
        netAmount: BigInt(0),
        expectedShare: BigInt(0),
        shareVariance: BigInt(0),
        varianceReason: 'KOREKSI_ADMIN',
        linkedPeriods: null,
        collectionCount: 0,
        canTotal,
        canAktif: cans.AKTIF,
        canNonaktif: cans.NON_AKTIF,
        canRusak: cans.RUSAK,
        canHilang: cans.HILANG,
        canDikembalikan: cans.DIKEMBALIKAN,
        formulaSnapshot: { ...BRANCH_FORMULA_SNAPSHOT },
        status: 'FINAL_NOL',
        finalizedAt: now,
        finalizedBy: actor.userId,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [
          schema.branchSubmissions.branchId,
          schema.branchSubmissions.periodYear,
          schema.branchSubmissions.periodMonth,
        ],
      })
      .returning({ id: schema.branchSubmissions.id });
    if (inserted) {
      created.push({ branch_id: r.id, branch_name: r.name, submission_id: inserted.id });
    } else {
      // Balapan kunci ganda: baca pemenangnya untuk klasifikasi akhir.
      const winner = await db.query.branchSubmissions.findFirst({
        where: and(
          eq(schema.branchSubmissions.branchId, r.id),
          eq(schema.branchSubmissions.periodYear, input.year),
          eq(schema.branchSubmissions.periodMonth, input.month),
        ),
        columns: { id: true, status: true },
      });
      if (winner && winner.status === 'FINAL') {
        finalCount += 1;
      } else if (winner && winner.status === 'FINAL_NOL') {
        finalNolCount += 1;
      } else {
        pending.push({
          branch_id: r.id,
          branch_name: r.name,
          submission_status: 'DRAFT',
          has_ppk_rows: false,
        });
      }
    }
  }

  // Kunci kalender (idempoten; DIBUKA_SEBAGIAN milik T7 — jangan timpa).
  await db
    .update(schema.periodCalendar)
    .set({ status: 'LOCKED', lockedAt: now, lockedBy: actor.userId, updatedAt: now })
    .where(
      and(
        eq(schema.periodCalendar.periodYear, input.year),
        eq(schema.periodCalendar.periodMonth, input.month),
        sql`${schema.periodCalendar.status} IN ('OPEN', 'TOLERANCE')`,
      ),
    );

  await auditKunci(actor, 'KUNCI_PERIODE_FINAL_NOL_MASSAL', periodKey(input.year, input.month), {
    period_status: periodStatus,
    total_ranting: rantings.length,
    created_final_nol: created.length,
    created_ids: created.map((c) => c.submission_id),
    reason_detail: 'tidak ada laporan penjemputan (massal MWC)',
    variance_reason: 'KOREKSI_ADMIN',
  });

  return {
    period: periodKey(input.year, input.month),
    period_year: input.year,
    period_month: input.month,
    phase: 'KUNCI_KERAS',
    period_status: periodStatus,
    total_ranting: rantings.length,
    final_count: finalCount,
    final_nol_count: finalNolCount + created.length,
    reported_count: finalCount,
    pending_count: pending.length,
    pending,
    created_final_nol: created,
    program_mwc_total: programs.length,
    program_mwc_final: programMwcFinal,
    calendar_locked: true,
  };
}
