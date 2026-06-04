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

const BASELINE_UP_TO_TAG = '0003_collection_query_indexes';
const migrationsDir = path.resolve(__dirname, 'migrations');
const journalPath = path.join(migrationsDir, 'meta', '_journal.json');

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

    const [collectionsTable] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'collections'
      ) AS exists
    `;

    const [nominalColumn] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'collections'
          AND column_name = 'nominal'
      ) AS exists
    `;

    if (!collectionsTable.exists || !nominalColumn.exists) {
      const tableList = publicTables.map((row) => row.table_name).join(', ');
      throw new Error(
        'Existing public tables were found, but this database does not look like the reviewed Lazisnu schema after the nominal rename. ' +
          `Refusing to auto-baseline Drizzle migrations. Public tables: ${tableList}`,
      );
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
