import 'dotenv/config';
import postgres from 'postgres';

async function main() {
  const connectionString = process.env.DATABASE_URL as string;
  const sql = postgres(connectionString);

  console.log('🚀 Starting manual migration...');

  try {
    // 1. Apply Immutability Rules
    console.log('Applying PostgreSQL Rules...');
    await sql`CREATE OR REPLACE RULE disable_delete_koleksi AS ON DELETE TO collections DO INSTEAD NOTHING`;
    await sql`CREATE OR REPLACE RULE disable_update_nominal_koleksi AS ON UPDATE TO collections WHERE NEW.nominal <> OLD.nominal DO INSTEAD NOTHING`;

    console.log('✅ Rules applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await sql.end();
  }
}

main();
