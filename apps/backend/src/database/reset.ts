import 'dotenv/config';
import { db } from '../config/database';
import { sql } from 'drizzle-orm';

async function resetDatabase() {
  console.log('Resetting public schema...');
  try {
    await db.execute(sql`DROP SCHEMA public CASCADE;`);
    await db.execute(sql`CREATE SCHEMA public;`);
    await db.execute(sql`GRANT ALL ON SCHEMA public TO postgres;`);
    await db.execute(sql`GRANT ALL ON SCHEMA public TO public;`);
    console.log('Schema reset successfully!');
  } catch (error) {
    console.error('Error resetting schema:', error);
  }
  process.exit(0);
}

resetDatabase();
