/**
 * C1-T8 — Rekap MWC (§8 + §7.2 + §8b).
 *
 * "MWC hanya bisa menarik yang FINAL. Data DRAFT tidak muncul di laporan MWC."
 * Dua kartu (§8b): Perolehan Ranting (kind=RANTING, dengan share 30%) dan
 * Perolehan Program MWC (kind=PROGRAM_MWC, bruto penuh, tanpa share).
 *
 * - Sumber angka = SNAPSHOT beku di `branch_submissions` (bukan hitung ulang —
 *   laporan lama tak ikut berubah bila rumus berubah, pola §8).
 * - Read-only: TANPA ensure/upsert (beda dengan daftar T4 yang menulis DRAFT).
 * - Flag merah otomatis (§8): selisih besar tanpa alasan (defensif — gerbang
 *   tulis T4/T5 sudah menolaknya, tapi laporan tetap memverifikasi) +
 *   ranting hilang dari rekonsiliasi (daftar `belum_lapor`).
 * - Selisih > Rp 10.000 wajib alasan — tertulis di tiap baris (alasan +
 *   periode terkait GABUNG_PERIODE); baris bermasalah ditandai, bukan
 *   disembunyikan.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq } from 'drizzle-orm';
import { Errors } from '../utils/errorCatalog';
import { needsVarianceReason } from '../utils/c1Math';
import { periodKey } from './periodCalendar';
import type { SubmissionActor } from './ppkSubmissions';

export interface RecapBranchRow {
  branch_id: string;
  branch_name: string;
  kind: 'RANTING' | 'PROGRAM_MWC';
  status: 'FINAL' | 'FINAL_NOL' | 'BELUM_LAPOR';
  total: number;
  bisyaroh: number;
  share_mwc: number;
  bersih: number;
  ekspektasi_share: number;
  selisih_share: number;
  variance_reason: string | null;
  linked_periods: string[] | null;
  collection_count: number;
  version: number;
  aggregate_total: number;
  flags: string[];
}

export interface MwcRecap {
  period: string;
  period_year: number;
  period_month: number;
  kartu_ranting: {
    total: number;
    bisyaroh: number;
    ekspektasi_share: number;
    share_mwc: number;
    bersih: number;
    reported_count: number;
    final_nol_count: number;
    belum_lapor_count: number;
  };
  kartu_program: {
    total: number;
    bisyaroh: number;
    bersih: number;
    reported_count: number;
    belum_lapor_count: number;
  };
  rows: RecapBranchRow[];
}

function emptyRow(branchId: string, branchName: string, kind: 'RANTING' | 'PROGRAM_MWC'): RecapBranchRow {
  return {
    branch_id: branchId,
    branch_name: branchName,
    kind,
    status: 'BELUM_LAPOR',
    total: 0,
    bisyaroh: 0,
    share_mwc: 0,
    bersih: 0,
    ekspektasi_share: 0,
    selisih_share: 0,
    variance_reason: null,
    linked_periods: null,
    collection_count: 0,
    version: 0,
    aggregate_total: 0,
    flags: kind === 'RANTING' ? ['BELUM_LAPOR'] : [],
  };
}

export async function getMwcRecap(
  actor: SubmissionActor,
  year: number,
  month: number,
): Promise<MwcRecap> {
  if (actor.role !== 'ADMIN_KECAMATAN' || !actor.districtId) {
    throw Errors.FORBIDDEN('Hanya MWC yang menarik rekap ini');
  }
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw Errors.VALIDATION_ERROR('Periode tidak valid (year 2020–2100, month 1–12).');
  }
  const districtId = actor.districtId;

  const branches = await db
    .select({ id: schema.branches.id, name: schema.branches.name, kind: schema.branches.kind })
    .from(schema.branches)
    .where(eq(schema.branches.districtId, districtId));

  const recap: MwcRecap = {
    period: periodKey(year, month),
    period_year: year,
    period_month: month,
    kartu_ranting: { total: 0, bisyaroh: 0, ekspektasi_share: 0, share_mwc: 0, bersih: 0, reported_count: 0, final_nol_count: 0, belum_lapor_count: 0 },
    kartu_program: { total: 0, bisyaroh: 0, bersih: 0, reported_count: 0, belum_lapor_count: 0 },
    rows: [],
  };

  for (const b of branches) {
    const kind = (b.kind ?? 'RANTING') as 'RANTING' | 'PROGRAM_MWC';
    const sub = await db.query.branchSubmissions.findFirst({
      where: and(
        eq(schema.branchSubmissions.branchId, b.id),
        eq(schema.branchSubmissions.periodYear, year),
        eq(schema.branchSubmissions.periodMonth, month),
      ),
    });
    // Hanya FINAL/FINAL_NOL yang tampil berangka (§7.2). DRAFT = belum lapor.
    if (!sub || (sub.status !== 'FINAL' && sub.status !== 'FINAL_NOL')) {
      const row = emptyRow(b.id, b.name, kind);
      if (sub && sub.status === 'DRAFT') row.flags.push('MASIH_DRAFT');
      recap.rows.push(row);
      if (kind === 'RANTING') recap.kartu_ranting.belum_lapor_count += 1;
      else recap.kartu_program.belum_lapor_count += 1;
      continue;
    }

    const total = Number(sub.totalAmount);
    const bisyaroh = Number(sub.bisyarohTotal);
    const share = Number(sub.shareMwc);
    const bersih = Number(sub.netAmount);
    const ekspektasi = Number(sub.expectedShare);
    const selisih = Number(sub.shareVariance);
    const flags: string[] = [];
    if (needsVarianceReason(selisih) && !sub.varianceReason) {
      flags.push('SELISIH_TANPA_ALASAN');
    }
    if (sub.varianceReason === 'GABUNG_PERIODE') flags.push('GABUNG_PERIODE');
    if (sub.varianceReason === 'HP_HILANG' || sub.varianceReason === 'KOREKSI_ADMIN') flags.push('INSIDEN_' + sub.varianceReason);

    // Agregat darurat cabang+periode (transparansi T8; angka sudah di total).
    const aggs = await db
      .select({ amount: schema.ppkEmergencyAggregates.amount })
      .from(schema.ppkEmergencyAggregates)
      .where(
        and(
          eq(schema.ppkEmergencyAggregates.branchId, b.id),
          eq(schema.ppkEmergencyAggregates.periodYear, year),
          eq(schema.ppkEmergencyAggregates.periodMonth, month),
        ),
      );
    const aggregateTotal = aggs.reduce((a, r) => a + Number(r.amount), 0);
    if (aggregateTotal > 0) flags.push('MEMUAT_AGREGAT');

    recap.rows.push({
      branch_id: b.id,
      branch_name: b.name,
      kind,
      status: sub.status,
      total,
      bisyaroh,
      share_mwc: share,
      bersih,
      ekspektasi_share: ekspektasi,
      selisih_share: selisih,
      variance_reason: sub.varianceReason,
      linked_periods: (sub.linkedPeriods as string[] | null) ?? null,
      collection_count: sub.collectionCount,
      version: sub.version,
      aggregate_total: aggregateTotal,
      flags,
    });

    if (kind === 'RANTING') {
      const k = recap.kartu_ranting;
      k.total += total;
      k.bisyaroh += bisyaroh;
      k.ekspektasi_share += ekspektasi;
      k.share_mwc += share;
      k.bersih += bersih;
      if (sub.status === 'FINAL') k.reported_count += 1;
      else k.final_nol_count += 1;
    } else {
      const k = recap.kartu_program;
      k.total += total;
      k.bisyaroh += bisyaroh;
      k.bersih += bersih;
      k.reported_count += 1;
    }
  }

  recap.rows.sort((a, b) => a.branch_name.localeCompare(b.branch_name, 'id'));
  return recap;
}
