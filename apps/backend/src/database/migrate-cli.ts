/**
 * migrate-cli.ts — menjalankan migrasi Drizzle dari dalam image produksi.
 *
 * Mengapa berkas ini perlu ada:
 *   Image produksi dipasang dengan `pnpm install --prod`, sehingga `drizzle-kit`
 *   — yang berstatus devDependency — TIDAK ada di dalam container. Padahal
 *   folder migrations sudah ikut tersalin (lihat apps/backend/Dockerfile).
 *   Untungnya `drizzle-orm` adalah dependency produksi dan memiliki migrator
 *   bawaan, jadi migrasi tetap bisa dijalankan tanpa menambah devDependency
 *   ke image produksi.
 *
 * Cara pakai di VM:
 *   docker run --rm --env-file apps/backend/.env \
 *     ghcr.io/<repo>/backend:<tag> \
 *     node apps/backend/dist/database/migrate-cli.js
 *
 * Berkas ini sengaja keluar dengan kode 1 bila gagal, supaya pipeline berhenti
 * dan tidak melanjutkan deploy di atas skema yang belum siap.
 */

import 'dotenv/config';
import path from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// __dirname = /app/apps/backend/dist/database
// sehingga ../../src/database/migrations = /app/apps/backend/src/database/migrations
// — persis lokasi folder migrasi di dalam image.
const MIGRATIONS_FOLDER = path.resolve(__dirname, '../../src/database/migrations');

async function main(): Promise<void> {
  // Utamakan koneksi langsung: Supavisor (pooler Supabase) tidak mendukung
  // prepared statement yang dipakai migrator, sama seperti drizzle.config.ts.
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ DATABASE_URL (atau DIRECT_URL) tidak ditemukan. Migrasi dibatalkan.');
    process.exit(1);
  }

  console.log('📁 Folder migrasi :', MIGRATIONS_FOLDER);

  const client = postgres(connectionString, { max: 1, connect_timeout: 10 });
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log('✅ Migrasi selesai — skema sudah mutakhir.');
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('❌ Migrasi gagal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
