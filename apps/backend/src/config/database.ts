// Drizzle Database Configuration

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../database/schema';

// Connection string setup
const connectionString = process.env.DATABASE_URL as string;

// Disable prefetch as it is not supported for "Transaction" pool mode if using PgBouncer
// But we use direct connection usually here.
//
// Pool tuning (08-D1, 2026-07-30): disesuaikan dengan kapasitas nyata Supabase
// (max_connections=60, penggunaan app terukur ≤ 10, mayoritas koneksi server adalah internal Supabase).
// D4 rencana trustProxy (keputusan 2 Nov 2026): 10 → 20, prasyarat tahap 3
// (batas 200/menit per IP + pemutus arus 3.000/menit). Dengan pool 10 dan
// latensi SELECT 1 ≈ 82 ms ke Supavisor Seoul, hukum Little membuat 3.000/menit
// berada di tepi kapasitas bila satu permintaan memakai ≥2 kueri
// (10 ÷ 0,082s ≈ 122/detik untuk 1 kueri, ≈ 61/detik untuk 2). Pool 20
// memberi ≈ 81/detik untuk 3 kueri per permintaan. Supavisor (port 6543,
// transaction mode) memultipleks koneksi klien ke DEFAULT_POOL_SIZE=15 koneksi
// Postgres yang sama — beban Postgres TIDAK bertambah; 20 = 10% dari batas
// Pooler Max Clients (200) Supabase.
const client = postgres(connectionString, {
  max: 20,                    // D4 (2 Nov 2026): prasyarat tahap 3; 10% dari batas 200 klien Supavisor
  idle_timeout: 20,           // tutup koneksi idle >20 detik — lepas slot kembali ke pooler
  max_lifetime: 60 * 30,      // recycle koneksi tiap 30 menit — cegah koneksi stale lewat Supavisor
  connect_timeout: 10,        // gagal cepat bila pooler tidak reachable (default 30 detik terlalu lama bagi request handler)
});

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

export async function closeDbConnection() {
  await client.end();
}

export default db;