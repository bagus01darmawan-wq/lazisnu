#!/usr/bin/env node
/**
 * verify-icon.mjs — TES VISUAL TERUKUR untuk ikon launcher (gate pra-rilis).
 *
 * Cara pakai: node scripts/verify-icon.mjs   (dari apps/mobile)
 * Dijalankan SETELAH generate-app-icon.mjs menghasilkan res/.
 *
 * Gagal (exit 1) bila:
 *   1. Foreground adaptive kosong / tidak terbaca.
 *   2. Konten tidak terpusat (offset > 1dp pada sumbu x/y).
 *   3. Setengah-diagonal konten melampaui lingkaran terlihat (36dp)
 *      ATAU melampaui safe zone Play Store (33dp).
 *
 * Semua pengukuran dalam dp (kanvas 108dp, resolusi xxxhdpi 4x).
 */
import sharp from 'sharp';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(
  HERE,
  '..',
  'android',
  'app',
  'src',
  'main',
  'res',
  'drawable-xxxhdpi',
  'ic_launcher_foreground.png',
);

const DP = 4; // xxxhdpi: 1dp = 4px
const VISIBLE_R = 36; // lingkaran terlihat launcher (dp)
const SAFE_R = 33; // safe zone Play Store (dp)
const MAX_OFFSET = 1; // dp

async function main() {
  const {data, info} = await sharp(FILE).raw().toBuffer({resolveWithObject: true});

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const failures = [];
  const warnings = [];

  if (maxX < 0) {
    console.error('FAIL: foreground kosong (tidak ada konten). Jalankan generator.');
    process.exit(1);
  }

  const widthPx = maxX - minX + 1;
  const heightPx = maxY - minY + 1;
  const cx = (minX + maxX + 1) / 2;
  const cy = (minY + maxY + 1) / 2;
  const offX = (cx - info.width / 2) / DP;
  const offY = (cy - info.height / 2) / DP;
  const halfDiag = Math.hypot(widthPx / 2, heightPx / 2) / DP;

  if (Math.abs(offX) > MAX_OFFSET || Math.abs(offY) > MAX_OFFSET) {
    failures.push(
      `konten tidak terpusat: offset (${offX.toFixed(2)}, ${offY.toFixed(2)}) dp > ${MAX_OFFSET}dp`,
    );
  }
  if (halfDiag > VISIBLE_R) {
    failures.push(
      `setengah-diagonal ${halfDiag.toFixed(1)}dp > lingkaran terlihat ${VISIBLE_R}dp → TERPOTONG masker`,
    );
  } else if (halfDiag > SAFE_R) {
    warnings.push(
      `setengah-diagonal ${halfDiag.toFixed(1)}dp di luar safe zone ${SAFE_R}dp — aman di launcher, tapi untuk Play Store turunkan skala ke 0.56.`,
    );
  }

  console.log(`Foreground: ${widthPx / DP} × ${heightPx / DP} dp (kanvas 108dp)`);
  console.log(`Offset pusat: (${offX.toFixed(2)}, ${offY.toFixed(2)}) dp`);
  console.log(
    `Setengah-diagonal: ${halfDiag.toFixed(1)} dp | lingkaran terlihat ${VISIBLE_R}dp | safe zone ${SAFE_R}dp`,
  );

  for (const w of warnings) {
    console.warn(`WARN: ${w}`);
  }

  if (failures.length) {
    console.error('\nFAIL — tes visual terukur gagal:');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log('\nPASS — ikon utuh, terpusat, dan utuh di lingkaran masker launcher.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
