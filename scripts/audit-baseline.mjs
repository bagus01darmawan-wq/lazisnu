#!/usr/bin/env node
/**
 * Gerbang basis audit dependensi — gagal hanya untuk kerentanan BARU.
 *
 * Latar belakang kenapa skrip ini perlu ada:
 * pnpm 10.33.2 tidak bisa diminta "gagal hanya untuk temuan baru". Tiga
 * mekanisme yang kelihatannya cocok ternyata mematikan gerbang sepenuhnya:
 *
 *   `|| true`             perintah tidak pernah gagal, temuan lama atau baru
 *   `--ignore-unfixable`  terbukti menelan advisory kritis di proyek bersih
 *   `ignoreCves`          mengabaikan SATU CVE tak terkait membuat seluruh
 *                         audit keluar 0
 *
 * Karena itu perbandingannya kita pegang sendiri:
 *   1. jalankan `pnpm audit --json`
 *   2. kumpulkan id advisory-nya (github_advisory_id)
 *   3. bandingkan dengan berkas basis yang ikut ter-commit
 *   4. gagal HANYA bila muncul id yang belum ada di basis
 *
 * Dengan begitu 8 temuan lama tidak menggagalkan CI, tetapi temuan kesembilan
 * yang muncul besok menggagalkannya.
 *
 * Pakai:
 *   node scripts/audit-baseline.mjs                 # gerbang (default)
 *   node scripts/audit-baseline.mjs --update        # tulis ulang berkas basis
 *   node scripts/audit-baseline.mjs --strict        # gagal juga bila basis usang
 *   node scripts/audit-baseline.mjs --input f.json  # pakai hasil audit lain (uji)
 *
 * Kode keluar:
 *   0  lolos — tidak ada temuan baru
 *   1  GAGAL — ada kerentanan baru yang belum ada di basis
 *   2  GAGAL — masalah konfigurasi atau audit tidak bisa dijalankan
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BASELINE_PATH = resolve(ROOT, 'security/audit-baseline.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const optValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : null;
};

const MODE_UPDATE = flag('--update');
const MODE_STRICT = flag('--strict');
const INPUT_FILE = optValue('--input');

// ─── Ambil hasil audit ────────────────────────────────────────────────────

function jalankanAudit() {
  const r = spawnSync('pnpm', ['audit', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });

  if (r.error) {
    gagal(2, `Tidak bisa menjalankan pnpm: ${r.error.message}`);
  }

  const keluar = r.status;
  const teks = (r.stdout || '').trim();

  // pnpm keluar 1 bila ada temuan — itu wajar. Keluar tanpa JSON sama sekali
  // berarti audit benar-benar gagal (misal registri tidak bisa dihubungi),
  // dan itu TIDAK boleh lolos diam-diam.
  if (!teks) {
    gagal(2, `pnpm audit keluar ${keluar} tanpa keluaran JSON.\n` +
             `  stderr: ${(r.stderr || '').trim().slice(0, 400) || '(kosong)'}\n` +
             `  Audit yang gagal tidak boleh dianggap lolos.`);
  }

  let data;
  try {
    data = JSON.parse(teks);
  } catch {
    // kadang ada baris peringatan sebelum JSON
    const mulai = teks.indexOf('{');
    if (mulai < 0) {
      gagal(2, `Keluaran pnpm audit bukan JSON yang bisa dibaca.\n` +
               `  stderr: ${(r.stderr || '').trim().slice(0, 400) || '(kosong)'}`);
    }
    try {
      data = JSON.parse(teks.slice(mulai));
    } catch (e) {
      gagal(2, `Keluaran pnpm audit rusak: ${e.message}`);
    }
  }

  return data;
}

function bacaDariBerkas(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    gagal(2, `Tidak bisa membaca ${path}: ${e.message}`);
  }
}

// ─── Olah advisory ────────────────────────────────────────────────────────

/**
 * Kunci advisory di pnpm audit berupa angka yang bisa berubah. Yang stabil
 * adalah github_advisory_id (GHSA-...). Itu yang dipakai sebagai identitas.
 */
function kumpulkan(data) {
  const hasil = new Map();
  for (const v of Object.values(data.advisories || {})) {
    const id =
      v.github_advisory_id ||
      v.npm_advisory_id ||
      (typeof v.url === 'string' ? v.url.split('/').pop() : null);
    if (!id) continue;
    hasil.set(id, {
      module: v.module_name || '(tidak diketahui)',
      severity: v.severity || '(tanpa tingkat)',
      url: v.url || '',
      patched: v.patched_versions || '',
    });
  }
  return hasil;
}

function muatBasis() {
  if (!existsSync(BASELINE_PATH)) {
    gagal(2, `Berkas basis belum ada: ${BASELINE_PATH}\n` +
             `  Buat dulu dengan: node scripts/audit-baseline.mjs --update\n` +
             `  Gerbang sengaja gagal bila basisnya hilang — jangan biarkan\n` +
             `  pemeriksaan keamanan lolos hanya karena berkasnya tidak ada.`);
  }
  try {
    const j = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
    return { advisories: j.advisories || {}, updatedAt: j.updatedAt || '(tidak diketahui)' };
  } catch (e) {
    gagal(2, `Berkas basis rusak: ${e.message}`);
  }
}

// ─── Lapor ────────────────────────────────────────────────────────────────

function gagal(kode, pesan) {
  process.stderr.write(`\n❌ ${pesan}\n`);
  process.exit(kode);
}

function baris(s = '', n = 66) {
  const sisa = Math.max(0, n - [...s].length);
  return s + ' ' + '─'.repeat(Math.max(0, sisa - 1));
}

// ─── Utama ────────────────────────────────────────────────────────────────

const data = INPUT_FILE ? bacaDariBerkas(resolve(ROOT, INPUT_FILE)) : jalankanAudit();
const sekarang = kumpulkan(data);

if (MODE_UPDATE) {
  const isi = {};
  for (const [id, v] of [...sekarang].sort()) {
    isi[id] = {
      module: v.module,
      severity: v.severity,
      url: v.url,
      patched: v.patched,
    };
  }
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(
    BASELINE_PATH,
    JSON.stringify(
      {
        _caraPakai:
          'Daftar kerentanan yang sudah dikenal dan diterima. Gerbang CI gagal ' +
          'hanya bila muncul id yang BELUM ada di sini. Perbarui dengan: ' +
          'node scripts/audit-baseline.mjs --update',
        updatedAt: new Date().toISOString(),
        advisories: isi,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  console.log(`✅ Basis ditulis: ${BASELINE_PATH}`);
  console.log(`   ${Object.keys(isi).length} advisory tercatat.`);
  for (const [id, v] of Object.entries(isi)) {
    console.log(`     ${v.severity.padEnd(9)} ${v.module.padEnd(18)} ${id}`);
  }
  process.exit(0);
}

const basis = muatBasis();
const idBasis = new Set(Object.keys(basis.advisories));

const baru = [...sekarang].filter(([id]) => !idBasis.has(id));
const usang = [...idBasis].filter((id) => !sekarang.has(id));

console.log('');
console.log(baris('Gerbang audit dependensi'));
console.log(`  temuan sekarang : ${sekarang.size}`);
console.log(`  di basis        : ${idBasis.size}  (diperbarui ${basis.updatedAt})`);

// Kalau pnpm sedang menyembunyikan sesuatu lewat ignoreCves, itu harus kelihatan.
const disembunyikan = Array.isArray(data.muted) ? data.muted.length : 0;
if (disembunyikan > 0) {
  console.log(`  ⚠️  ${disembunyikan} temuan disembunyikan oleh konfigurasi pnpm (muted).`);
  console.log(`     Periksa auditConfig.ignoreCves di pnpm-workspace.yaml.`);
}

// Entri usang tidak berbahaya bagi keamanan (temuan lebih sedikit dari
// sebelumnya), jadi default-nya hanya diberitahukan. Mode --strict mengubahnya
// jadi kegagalan supaya basis tidak menumpuk sampah: kalau dibiarkan, basis
// akan berisi advisory yang sudah lama hilang, dan kita kehilangan gambaran
// tentang apa yang sebenarnya masih mengganjal.
if (usang.length) {
  console.log(baris('BASIS USANG'));
  for (const id of usang) {
    const b = basis.advisories[id];
    console.log(`  ${id}  ${b?.module || ''} — sudah tidak muncul di audit.`);
    console.log(`     Hapus dari basis: sudah tidak relevan.`);
  }
  if (MODE_STRICT) {
    console.log('─'.repeat(67));
    console.log(`  ${usang.length} entri basis usang. Mode --strict menggagalkan CI.`);
    console.log(`  Bersihkan dengan: node scripts/audit-baseline.mjs --update`);
    process.exit(1);
  }
}

if (baru.length) {
  console.log(baris('KERENTANAN BARU'));
  for (const [id, v] of baru) {
    console.log(`  [${v.severity.toUpperCase()}] ${v.module}  ${id}`);
    if (v.patched) console.log(`     versi tertambal: ${v.patched}`);
    if (v.url) console.log(`     ${v.url}`);
  }
  console.log('─'.repeat(67));
  console.log(`  ${baru.length} kerentanan baru di luar basis. CI digagalkan.`);
  console.log(`  Kalau memang sudah ditangani atau belum ada patch, tambahkan ke basis:`);
  console.log(`     node scripts/audit-baseline.mjs --update`);
  process.exit(1);
}

console.log(baris('HASIL'));
console.log('  ✅ Tidak ada kerentanan baru di luar basis.');
if (usang.length && !MODE_STRICT) {
  console.log(`  ℹ️  ${usang.length} entri basis sudah usang (tidak menggagalkan CI).`);
  console.log(`     Bersihkan dengan --update bila sudah tidak relevan.`);
}
console.log('─'.repeat(67));
process.exit(0);
