/**
 * Terapkan migration SQL mentah ke database test lokal.
 * Dipakai karena tidak ada psql di laptop dan drizzle-kit push tidak
 * praktis untuk satu migration. Hanya untuk DB test, bukan staging/produksi.
 *
 * Jalankan: npx tsx scripts/apply-migration-to-testdb.ts <file.sql>
 */
import * as fs from 'fs';
import * as path from 'path';
import postgres from 'postgres';

const envPath = path.resolve(__dirname, '..', '.env.test');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1);
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx scripts/apply-migration-to-testdb.ts <file.sql>');
  process.exit(1);
}

/**
 * Pecah file SQL menjadi statement.
 *
 * `split(';')` saja tidak cukup: blok `DO $$ ... $$` dari drizzle mengandung
 * titik koma di dalam body-nya, jadi pemecahannya harus melacak status
 * dollar-quoting.
 */
function splitStatements(ddl: string): string[] {
  const out: string[] = [];
  let buf = '';
  let inDollar = false;
  for (const line of ddl.split('\n')) {
    const ticks = (line.match(/\$/g) || []).length;
    if (!inDollar && line.trim().startsWith('--')) continue;
    buf += (buf ? '\n' : '') + line;
    for (let i = 0; i < ticks; i += 2) inDollar = !inDollar;
    if (!inDollar && line.trimEnd().endsWith(';')) {
      const stmt = buf.trim().replace(/;$/, '').trim();
      if (stmt) out.push(stmt);
      buf = '';
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

const ddl = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const sql = postgres(process.env.DATABASE_URL as string, { max: 1 });

(async () => {
  for (const stmt of splitStatements(ddl)) {
    await sql.unsafe(stmt);
    console.log('OK:', stmt.split('\n')[0].slice(0, 70));
  }
  await sql.end();
  console.log('SELESAI');
})().catch(async (e) => {
  console.error('FAIL:', e.message);
  await sql.end().catch(() => undefined);
  process.exit(1);
});
