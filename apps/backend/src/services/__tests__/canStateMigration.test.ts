/**
 * Guard migrasi 0020 — pemisahan status/kondisi + ledger.
 *
 * Tanpa database: memeriksa isi migrasi additive dan registrasi journal agar
 * file tidak menjadi orphan (drizzle-kit migrate akan melewatkannya). Pemetaan
 * backfill murni diuji di canState.test.ts.
 */
import * as fs from 'fs';
import * as path from 'path';

const backendRoot = path.join(__dirname, '..', '..', '..');
const migrationPath = path.join(
  backendRoot,
  'src',
  'database',
  'migrations',
  '0020_can_state_history.sql',
);
const journalPath = path.join(
  backendRoot,
  'src',
  'database',
  'migrations',
  'meta',
  '_journal.json',
);

const sql = fs.readFileSync(migrationPath, 'utf8');
const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
  entries: Array<{ idx: number; tag: string }>;
};

describe('migrasi 0020 can_state_history', () => {
  it('terdaftar di journal dan tidak menjadi orphan', () => {
    const entry = journal.entries.find((item) => item.tag === '0020_can_state_history');
    expect(entry).toBeDefined();
    expect(entry?.idx).toBe(20);
  });

  it('additive: enum dan kolom baru tanpa menghapus condition lama', () => {
    expect(sql).toContain(`CREATE TYPE "can_lifecycle_status"`);
    expect(sql).toContain(`CREATE TYPE "can_physical_condition"`);
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "lifecycle_status"`);
    expect(sql).toContain(`ADD COLUMN IF NOT EXISTS "physical_condition"`);
    expect(sql).not.toMatch(/DROP COLUMN "condition"/);
  });

  it('backfill memetakan lima nilai legacy dan menandai asumsi BAIK', () => {
    expect(sql).toContain(`WHEN 'NON_AKTIF' THEN 'NON_AKTIF'::"can_lifecycle_status"`);
    expect(sql).toContain(`WHEN 'DIKEMBALIKAN' THEN 'DIKEMBALIKAN'::"can_lifecycle_status"`);
    expect(sql).toContain(`WHEN 'RUSAK' THEN 'RUSAK'::"can_physical_condition"`);
    expect(sql).toContain(`WHEN 'HILANG' THEN 'HILANG'::"can_physical_condition"`);
    expect(sql).toContain(`'LEGACY_ASSUMPTION_BAIK'::"can_physical_condition_source"`);
  });

  it('membuat tepat satu baseline CUTOVER_BASELINE per kaleng pada satu cutover', () => {
    expect(sql).toMatch(/source_type"[\s\S]*'CUTOVER_BASELINE'/);
    expect(sql).toContain(`SELECT date_trunc('second', now()) AS "cutover_at"`);
    expect(sql).toContain(`ON CONFLICT ("source_type", "source_id", "can_id") DO NOTHING`);
  });

  it('menjalankan rekonsiliasi baseline sebelum ledger dibaca', () => {
    expect(sql).toContain('Cutover can_state_history gagal');
    expect(sql).toContain('mismatch_count');
  });

  it('ledger wajib mengubah minimal satu dimensi', () => {
    expect(sql).toContain('can_state_history_dimension_check');
    expect(sql).toMatch(
      /CHECK \("lifecycle_status" IS NOT NULL OR "physical_condition" IS NOT NULL OR "branch_id" IS NOT NULL\)/,
    );
  });

  it('ledger tidak menjadi orphan saat kaleng dihapus permanen', () => {
    expect(sql).toMatch(/"can_id" uuid NOT NULL REFERENCES "cans"\("id"\) ON DELETE CASCADE/);
  });
});
