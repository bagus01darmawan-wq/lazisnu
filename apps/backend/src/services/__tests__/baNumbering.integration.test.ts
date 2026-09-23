/**
 * F7/D-14 — Test penomoran BA (DB nyata, tanpa fixture lain: ba_counters
 * tanpa FK). Scope acak per run agar paralel/ulang aman.
 */
import { randomUUID } from 'node:crypto';
import { db, closeDbConnection } from '../../config/database';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';
import { formatBaNumber, nextBaNumber, romanMonth } from '../baNumbering';

describe('F7 penomoran BA', () => {
  const scopeA = { scopeType: 'RANTING' as const, scopeId: randomUUID() };
  const scopeB = { scopeType: 'RANTING' as const, scopeId: randomUUID() };
  const scopeMwc = { scopeType: 'MWC' as const, scopeId: randomUUID() };
  const now = new Date(2026, 8, 25, 10, 0, 0); // 25 Sep 2026 (WIB) → IX/2026

  afterAll(async () => {
    for (const s of [scopeA, scopeB, scopeMwc]) {
      await db.delete(schema.baCounters).where(eq(schema.baCounters.scopeId, s.scopeId));
    }
    await closeDbConnection();
  });

  test('format + romawi', () => {
    expect(romanMonth(9)).toBe('IX');
    expect(romanMonth(1)).toBe('I');
    expect(formatBaNumber(1, 9, 2026)).toBe('001/BA/IX/2026');
    expect(formatBaNumber(42, 12, 2026)).toBe('042/BA/XII/2026');
    expect(() => formatBaNumber(0, 9, 2026)).toThrow();
  });

  test('sekuens jalan terus per scope, antar-scope independen', async () => {
    await expect(nextBaNumber(db, scopeA, now)).resolves.toBe('001/BA/IX/2026');
    await expect(nextBaNumber(db, scopeA, now)).resolves.toBe('002/BA/IX/2026');
    await expect(nextBaNumber(db, scopeB, now)).resolves.toBe('001/BA/IX/2026');
    await expect(nextBaNumber(db, scopeMwc, now)).resolves.toBe('001/BA/IX/2026');
    await expect(nextBaNumber(db, scopeMwc, now)).resolves.toBe('002/BA/IX/2026');
  });
});
