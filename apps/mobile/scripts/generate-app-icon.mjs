#!/usr/bin/env node
/**
 * generate-app-icon.mjs — generator adaptive icon LAZISNU (reproducible).
 *
 * RENCANA-IKON-APLIKASI (revisi 2026-08-26, perbaikan bug terpotong/naik):
 *   - Master: assets/logo_lazisnu.svg (wordmark hijau, VECTOR) — dipilih user
 *     "v1: wordmark hijau di putih".
 *   - KONTEN DI-TRIM DAHULU (buang padding transparan SVG). Versi lama
 *     menempatkan bounding-box mentah → konten bergeser ke atas (-83px) dan
 *     ikon tampak tidak seimbang.
 *   - MARK_SCALE = 0.60: lebar konten = 64,8dp dari 108dp → setengah-diagonal
 *     34,5dp < lingkaran terlihat 36dp (utuh, tidak terpotong).
 *     Untuk Play Store nanti → 0.56 (masuk safe zone 66dp).
 *   - Legacy (48dp, tanpa masker): LEGACY_SCALE = 0.72.
 *
 * Output (semua di android/app/src/main/res/):
 *   mipmap-{dpi}/ic_launcher.png + ic_launcher_round.png
 *   drawable-{dpi}/ic_launcher_foreground.png
 *   mipmap-anydpi-v26/ic_launcher.xml + ic_launcher_round.xml
 *   values/colors.xml
 *
 * WAJIB setelahnya: node scripts/verify-icon.mjs (gate terukur).
 */
import sharp from 'sharp';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync, writeFileSync} from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/mobile/scripts
const MOBILE = resolve(HERE, '..');
const ROOT = resolve(MOBILE, '..', '..');
const SVG = resolve(ROOT, 'assets', 'logo_lazisnu.svg');
const RES = resolve(MOBILE, 'android', 'app', 'src', 'main', 'res');

const MARK_SCALE = 0.6; // lebar konten foreground = 60% kanvas 108dp (Play Store → 0.56)
const LEGACY_SCALE = 0.72; // kotak 48dp tanpa masker → boleh lebih besar
const BG = '#FFFFFF';

// dpi → skala px per dp
const DPI = {
  mdpi: 1,
  hdpi: 1.5,
  xhdpi: 2,
  xxhdpi: 3,
  xxxhdpi: 4,
};
// Legacy launcher: 48dp. Foreground adaptive: kanvas 108dp.
const LEGACY_DP = 48;
const FOREGROUND_DP = 108;

async function main() {
  // Render master → TRIM padding transparan — konten murni untuk semua ukuran.
  const svgBuf = await sharp(SVG, {density: 300}).resize({width: 2048}).png().toBuffer();
  const trimmed = await sharp(svgBuf)
    .trim({background: {r: 0, g: 0, b: 0, alpha: 0}})
    .png()
    .toBuffer();
  const tm = await sharp(trimmed).metadata();

  const markAtWidth = async widthPx =>
    sharp(trimmed)
      .resize({width: Math.round(widthPx), kernel: 'lanczos3'})
      .png()
      .toBuffer();

  for (const [dpi, scale] of Object.entries(DPI)) {
    // ── Legacy persegi + bulat ──
    const size = Math.round(LEGACY_DP * scale);
    const markW = Math.round(size * LEGACY_SCALE);
    const mark = await markAtWidth(markW);
    const markMeta = await sharp(mark).metadata();

    const squareBase = await sharp({
      create: {width: size, height: size, channels: 4, background: BG},
    })
      .composite([
        {
          input: mark,
          left: Math.round((size - markW) / 2),
          top: Math.round((size - markMeta.height) / 2),
        },
      ])
      .png()
      .toBuffer();

    const dir = resolve(RES, `mipmap-${dpi}`);
    mkdirSync(dir, {recursive: true});
    await sharp(squareBase).toFile(resolve(dir, 'ic_launcher.png'));

    // Round: sama isi, dipotong lingkaran penuh
    const circleMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
    );
    const round = await sharp(squareBase)
      .composite([{input: circleMask, blend: 'dest-in'}])
      .png()
      .toBuffer();
    await sharp(round).toFile(resolve(dir, 'ic_launcher_round.png'));

    // ── Foreground adaptive (kanvas 108dp, transparan) ──
    const fgSize = Math.round(FOREGROUND_DP * scale);
    const fgMarkW = Math.round(fgSize * MARK_SCALE);
    const fgMark = await markAtWidth(fgMarkW);
    const fgMeta = await sharp(fgMark).metadata();
    const fgDir = resolve(RES, `drawable-${dpi}`);
    mkdirSync(fgDir, {recursive: true});
    await sharp({
      create: {
        width: fgSize,
        height: fgSize,
        channels: 4,
        background: {r: 0, g: 0, b: 0, alpha: 0},
      },
    })
      .composite([
        {
          input: fgMark,
          left: Math.round((fgSize - fgMarkW) / 2),
          top: Math.round((fgSize - fgMeta.height) / 2),
        },
      ])
      .png()
      .toFile(resolve(fgDir, 'ic_launcher_foreground.png'));

    console.log(`✓ ${dpi}: legacy ${size}px, foreground ${fgSize}px`);
  }

  // ── XML adaptive ──
  const anyDir = resolve(RES, 'mipmap-anydpi-v26');
  mkdirSync(anyDir, {recursive: true});
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`;
  writeFileSync(resolve(anyDir, 'ic_launcher.xml'), adaptiveXml);
  writeFileSync(resolve(anyDir, 'ic_launcher_round.xml'), adaptiveXml);

  // ── colors.xml (buat bila belum ada) ──
  const valuesDir = resolve(RES, 'values');
  mkdirSync(valuesDir, {recursive: true});
  writeFileSync(
    resolve(valuesDir, 'colors.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG}</color>
</resources>
`,
  );

  console.log(
    `✓ XML adaptive + colors.xml (konten ${tm.width}px × ${tm.height}px, rasio ${(tm.width / tm.height).toFixed(2)}:1)`,
  );
  console.log('Verifikasi berikutnya: node scripts/verify-icon.mjs');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
