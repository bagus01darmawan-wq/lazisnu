/**
 * Validator: deteksi file SQL di folder migrations/ yang tidak terdaftar di _journal.json.
 * 
 * File orphan = dibuat manual, tidak ikut workflow drizzle-kit migrate.
 * Deployment ke environment baru akan melewatkan file ini → drift database.
 * 
 * Dipanggil saat: pre-commit hook, CI pipeline.
 * Exit code 1 = ada file orphan (build gagal).
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'src', 'database', 'migrations');
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, 'meta', '_journal.json');

// Baca journal
let journal;
try {
  journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf-8'));
} catch {
  console.error('ERROR: Tidak bisa membaca _journal.json');
  process.exit(1);
}

const registeredTags = new Set(journal.entries.map(e => e.tag));

// Baca semua file .sql di folder migrations (bukan subfolder)
const allFiles = fs.readdirSync(MIGRATIONS_DIR);
const sqlFiles = allFiles.filter(f => f.endsWith('.sql'));

// Cek setiap file .sql: apakah tag-nya (nama file tanpa .sql) terdaftar di journal?
const orphans = sqlFiles.filter(file => {
  const tag = file.replace('.sql', '');
  return !registeredTags.has(tag);
});

if (orphans.length > 0) {
  console.error(`\n❌ DITEMUKAN ${orphans.length} FILE SQL ORPHAN (tidak terdaftar di _journal.json):\n`);
  orphans.forEach(f => console.error(`   • ${f}`));
  console.error(`\nFile-file ini TIDAK akan dijalankan oleh drizzle-kit migrate.`);
  console.error(`Daftarkan ke journal atau hapus dari folder migrations.\n`);
  process.exit(1);
}

console.log(`✅ Semua ${sqlFiles.length} file .sql terdaftar di _journal.json.`);
