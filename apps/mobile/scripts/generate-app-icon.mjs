#!/usr/bin/env node
/**
 * generate-app-icon.mjs — generator adaptive icon LAZISNU (reproducible).
 *
 * RENCANA-IKON-APLIKASI-2026-08-26:
 *   - Background putih solid, mark hijau tua dari assets/logo_lazisnu.svg
 *   - MARK_SCALE = 0.90 (lebar art 90% kanvas 108dp). Untuk Play Store di
 *     masa depan → turunkan ke 0.61 (safe zone 66dp) lalu jalankan ulang.
 *
 * Output (semua di android/app/src/main/res/):
 *   mipmap-{dpi}/ic_launcher.png        legacy persegi (putih full-bleed)
 *   mipmap-{dpi}/ic_launcher_round.png  legacy lingkaran
 *   drawable-{dpi}/ic_launcher_foreground.png  adaptive (transparan)
 *   mipmap-anydpi-v26/ic_launcher.xml + ic_launcher_round.xml
 *   values/colors.xml
 *
 * Deterministik: render master besar sekali lalu LANCZOS resize.
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

const MARK_SCALE = 0.9; // Play Store → 0.61
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
  // Render master mark lebar 2048px sekali (kualitas sumber untuk semua ukuran)
  const svgBuf = await sharp(SVG, {density: 300}).resize({width: 2048}).png().toBuffer();
  const meta = await sharp(svgBuf).metadata();

  const markAtWidth = async widthPx =>
    sharp(svgBuf)
      .resize({width: Math.round(widthPx), kernel: 'lanczos3'})
      .png()
      .toBuffer();

  for (const [dpi, scale] of Object.entries(DPI)) {
    // ── Legacy persegi + bulat ──
    const size = Math.round(LEGACY_DP * scale);
    const markW = Math.round(size * MARK_SCALE);
    const mark = await sharp(svgBuf).resize({width: markW, kernel: 'lanczos3'}).png().toBuffer();
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
    `✓ XML adaptive + colors.xml (mark master ${meta.width}px, rasio ${(meta.width / meta.height).toFixed(2)}:1)`,
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
