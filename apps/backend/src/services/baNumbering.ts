/**
 * F7/D-14 — Penomoran BA org `001/BA/IX/2026`.
 * - BA PPK (penyerahan PPK → ranting): sekuens PER RANTING jalan terus
 *   lintas bulan (scopeType 'RANTING', scopeId = branchId).
 * - BA ranting (ranting → MWC): sekuens PER MWC jalan terus lintas bulan
 *   (scopeType 'MWC', scopeId = districtId).
 * - Bulan romawi + tahun = bulan/tahun PENGESAHAN (tanggal FINAL, zona WIB).
 * - Bump counter atomik (INSERT .. ON CONFLICT DO UPDATE .. RETURNING) di
 *   dalam tx finalize — dua FINAL berbarengan tak dapat nomor sama.
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { sql } from 'drizzle-orm';
import { type PgTransaction } from 'drizzle-orm/pg-core';
import { type ExtractTablesWithRelations } from 'drizzle-orm';

type Transaction = PgTransaction<any, typeof schema, ExtractTablesWithRelations<typeof schema>>;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function romanMonth(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Bulan romawi 1-12.');
  return ROMAN[month];
}

/** 1, 9/2026 → "001/BA/IX/2026". */
export function formatBaNumber(seq: number, month: number, year: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error('Sekuens nomor BA mulai 1.');
  return `${String(seq).padStart(3, '0')}/BA/${romanMonth(month)}/${year}`;
}

export type BaScope = { scopeType: 'RANTING' | 'MWC'; scopeId: string };

/** Bump counter scope + kembalikan nomor BA lengkap. Wajib dalam tx finalize. */
export async function nextBaNumber(
  dbOrTx: Transaction | typeof db,
  scope: BaScope,
  now: Date = new Date(),
): Promise<string> {
  // WIB operasional: bulan/tahun pengesahan mengikuti hari Jakarta.
  const wib = new Date(now.getTime() + 7 * 3_600_000);
  const rows = await dbOrTx
    .insert(schema.baCounters)
    .values({ scopeType: scope.scopeType, scopeId: scope.scopeId, lastSeq: 1 })
    .onConflictDoUpdate({
      target: [schema.baCounters.scopeType, schema.baCounters.scopeId],
      set: { lastSeq: sql`${schema.baCounters.lastSeq} + 1`, updatedAt: new Date() },
    })
    .returning({ lastSeq: schema.baCounters.lastSeq });
  const seq = rows[0]?.lastSeq;
  if (!seq) throw new Error('Counter nomor BA gagal bertambah.');
  return formatBaNumber(seq, wib.getUTCMonth() + 1, wib.getUTCFullYear());
}
