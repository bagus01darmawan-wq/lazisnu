// Drizzle Database Configuration

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../database/schema';

// Connection string setup
const connectionString = process.env.DATABASE_URL as string;

// Disable prefetch as it is not supported for "Transaction" pool mode if using PgBouncer
// But we use direct connection usually here.
const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });

// Database connection test
export async function testConnection(): Promise<boolean> {
  try {
    // simple query to test connection
    await client`SELECT 1`;
    console.log('✅ Database connected successfully via Drizzle/Postgres');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

export default db;