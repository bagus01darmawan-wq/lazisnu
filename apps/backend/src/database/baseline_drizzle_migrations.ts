import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

type JournalEntry = {
  idx: number;
  when: number;
  tag: string;
};

type Journal = {
  entries: JournalEntry[];
};

type ExpectedColumn = {
  table: string;
  column: string;
  dataType?: string;
  isNullable?: 'YES' | 'NO';
};

type SchemaValidationIssue = {
  objectType: 'table' | 'column' | 'index' | 'constraint' | 'legacy-column';
  name: string;
  detail: string;
};

const REQUIRED_TABLES_AFTER_0003 = [
  'activity_logs',
  'assignments',
  'branches',
  'cans',
  'collection_summaries',
  'collections',
  'districts',
  'dukuhs',
  'notifications',
  'officers',
  'sync_queues',
  'users',
] as const;

const REQUIRED_COLUMNS_AFTER_0003: ExpectedColumn[] = [
  { table: 'collections', column: 'nominal', dataType: 'bigint', isNullable: 'NO' },
  { table: 'collections', column: 'is_latest', isNullable: 'NO' },
  { table: 'collections', column: 'submit_sequence', dataType: 'integer', isNullable: 'NO' },
  { table: 'collections', column: 'alasan_resubmit' },
  { table: 'collections', column: 'offline_id' },
  { table: 'cans', column: 'dukuh_id', dataType: 'uuid' },
  { table: 'cans', column: 'dukuh' },
  { table: 'cans', column: 'rt' },
  { table: 'cans', column: 'rw' },
  { table: 'cans', column: 'owner_whatsapp', isNullable: 'NO' },
  { table: 'cans', column: 'total_collected', dataType: 'bigint', isNullable: 'NO' },
  { table: 'collection_summaries', column: 'total_amount', dataType: 'bigint', isNullable: 'NO' },
  { table: 'collection_summaries', column: 'cash_amount', dataType: 'bigint', isNullable: 'NO' },
  { table: 'collection_summaries', column: 'transfer_amount', dataType: 'bigint', isNullable: 'NO' },
  { table: 'dukuhs', column: 'id', dataType: 'uuid', isNullable: 'NO' },
  { table: 'dukuhs', column: 'branch_id', dataType: 'uuid', isNullable: 'NO' },
  { table: 'dukuhs', column: 'name', isNullable: 'NO' },
];

const LEGACY_COLUMNS_REMOVED_AFTER_0003 = [
  { table: 'collections', column: 'amount' },
] as const;

const REQUIRED_INDEXES_AFTER_0003 = [
  'can_officer_period_unq',
  'summary_period_dist_br_off_unq',
  'collection_assignment_can_sequence_unq',
  'collections_officer_status_collected_idx',
] as const;

const REQUIRED_CONSTRAINTS_AFTER_0003 = [
  'dukuhs_branch_id_branches_id_fk',
  'cans_dukuh_id_dukuhs_id_fk',
  'collections_offline_id_unique',
] as const;

const BASELINE_UP_TO_TAG = '0003_collection_query_indexes';
const migrationsDir = path.resolve(__dirname, 'migrations');
const journalPath = path.join(migrationsDir, 'meta', '_journal.json');


async function validateSchemaMatchesBaseline(sql: postgres.Sql) {
  const issues: SchemaValidationIssue[] = [];

  const tableRows = await sql<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `;
  const existingTables = new Set(tableRows.map((row) => row.table_name));

  for (const tableName of REQUIRED_TABLES_AFTER_0003) {
    if (!existingTables.has(tableName)) {
      issues.push({
        objectType: 'table',
        name: tableName,
        detail: 'Required table is missing.',
      });
    }
  }

  const columnRows = await sql<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: 'YES' | 'NO';
  }[]>`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `;
  const columnsByName = new Map(
    columnRows.map((row) => [`${row.table_name}.${row.column_name}`, row]),
  );

  for (const expected of REQUIRED_COLUMNS_AFTER_0003) {
    const key = `${expected.table}.${expected.column}`;
    const actual = columnsByName.get(key);

    if (!actual) {
      issues.push({
        objectType: 'column',
        name: key,
        detail: 'Required column is missing.',
      });
      continue;
    }

    if (expected.dataType && actual.data_type !== expected.dataType) {
      issues.push({
        objectType: 'column',
        name: key,
        detail: `Expected data_type=${expected.dataType}, found ${actual.data_type}.`,
      });
    }

    if (expected.isNullable && actual.is_nullable !== expected.isNullable) {
      issues.push({
        objectType: 'column',
        name: key,
        detail: `Expected is_nullable=${expected.isNullable}, found ${actual.is_nullable}.`,
      });
    }
  }

  for (const legacyColumn of LEGACY_COLUMNS_REMOVED_AFTER_0003) {
    const key = `${legacyColumn.table}.${legacyColumn.column}`;
    if (columnsByName.has(key)) {
      issues.push({
        objectType: 'legacy-column',
        name: key,
        detail: 'Legacy column should already be removed before baselining through 0003.',
      });
    }
  }

  const indexRows = await sql<{ indexname: string }[]>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
  `;
  const existingIndexes = new Set(indexRows.map((row) => row.indexname));

  for (const indexName of REQUIRED_INDEXES_AFTER_0003) {
    if (!existingIndexes.has(indexName)) {
      issues.push({
        objectType: 'index',
        name: indexName,
        detail: 'Required index is missing.',
      });
    }
  }

  const constraintRows = await sql<{ constraint_name: string }[]>`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
  `;
  const existingConstraints = new Set(constraintRows.map((row) => row.constraint_name));

  for (const constraintName of REQUIRED_CONSTRAINTS_AFTER_0003) {
    if (!existingConstraints.has(constraintName)) {
      issues.push({
        objectType: 'constraint',
        name: constraintName,
        detail: 'Required constraint is missing.',
      });
    }
  }

  return issues;
}

function formatSchemaValidationError(publicTables: { table_name: string }[], issues: SchemaValidationIssue[]) {
  const tableList = publicTables.map((row) => row.table_name).join(', ');
  const issueList = issues
    .map((issue) => `- ${issue.objectType} ${issue.name}: ${issue.detail}`)
    .join('\n');

  return (
    'Existing public tables were found, but this database does not match the complete Lazisnu schema after 0003_collection_query_indexes. ' +
    'Refusing to auto-baseline Drizzle migrations because doing so would make drizzle-kit skip schema repair migrations that are still needed.\n' +
    `Public tables: ${tableList}\n` +
    `Missing or mismatched objects:\n${issueList}`
  );
}

function readBaselineMigrations() {
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Journal;
  const baselineEndIndex = journal.entries.findIndex((entry) => entry.tag === BASELINE_UP_TO_TAG);

  if (baselineEndIndex === -1) {
    throw new Error(`Cannot find ${BASELINE_UP_TO_TAG} in ${journalPath}`);
  }

  return journal.entries.slice(0, baselineEndIndex + 1).map((entry) => {
    const sqlPath = path.join(migrationsDir, `${entry.tag}.sql`);
    const sqlText = fs.readFileSync(sqlPath, 'utf8');

    return {
      tag: entry.tag,
      hash: crypto.createHash('sha256').update(sqlText).digest('hex'),
      createdAt: entry.when,
    };
  });
}

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required before running Drizzle migration baseline.');
  }

  const sql = postgres(connectionString, { max: 1 });

  try {
    await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
    await sql`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `;

    const [migrationState] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM drizzle.__drizzle_migrations
    `;

    if (migrationState.count > 0) {
      console.log('Drizzle migrations already recorded; skipping baseline backfill.');
      return;
    }

    const publicTables = await sql<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    if (publicTables.length === 0) {
      console.log('No existing public tables found; fresh database will run all journaled migrations.');
      return;
    }

    const schemaIssues = await validateSchemaMatchesBaseline(sql);

    if (schemaIssues.length > 0) {
      throw new Error(formatSchemaValidationError(publicTables, schemaIssues));
    }

    const migrations = readBaselineMigrations();

    await sql.begin(async (tx) => {
      for (const migration of migrations) {
        await tx`
          INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
          VALUES (${migration.hash}, ${migration.createdAt})
        `;
      }
    });

    console.log(
      `Backfilled Drizzle migration baseline through ${BASELINE_UP_TO_TAG}; drizzle-kit migrate will now apply newer repairs only.`,
    );
  } finally {
    await sql.end();
  }
}

void main();
