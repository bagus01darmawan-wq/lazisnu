#!/usr/bin/env node
/**
 * icon-preview.mjs — lembar pilihan visual varian ikon launcher.
 *
 * Menghasilkan 4 PNG (varian × bentuk masker) ke folder TEMP:
 *   v1-wordmark-hijau_{circle,squircle}.png   — wordmark utuh di bg putih
 *   v2-numark-putih_{circle,squircle}.png     — mark NU putih di bg hijau NU
 *
 * Selain gambar, mencetak metrik terukur (lebar/tinggi konten, offset pusat,
 * jarak sudut vs radius terlihat) agar keputusan visual didukung angka.
 */
import sharp from 'sharp';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync} from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', '..', '..', 'assets');
const OUT = resolve(process.env.TEMP || '/tmp', 'lazisnu-icon-preview');

const CANVAS = 432; // 108dp @ xxxhdpi (4x)
const VISIBLE_R = 144; // lingkaran terlihat launcher: 72dp
const SAFE_R = 132; // safe zone Play Store: 66dp

const VARIANTS = [
  {
    label: 'v1-wordmark-hijau',
    master: 'logo_lazisnu.svg', // vektor murni, hijau
    bg: {r: 255, g: 255, b: 255},
    contentWidthDp: 0.6 * 108, // 64.8dp
  },
  {
    label: 'v2-numark-putih',
    master: 'logo-nu-putih.svg', // raster putih (tidak bisa di-recolor) — dipakai di bg gelap
    bg: {r: 11, g: 92, b: 62}, // hijau NU #0B5C3E
    contentWidthDp: 0.55 * 108, // 59.4dp — dihitung agar sudut muat lingkaran
  },
];

/** Render master → content ter-trim (buang padding transparan) → resize. */
async function contentArt(file, widthPx) {
  let buf = await sharp(resolve(ASSETS, file), {density: 300})
    .resize({width: 2048})
    .png()
    .toBuffer();
  buf = await sharp(buf)
    .trim({background: {r: 0, g: 0, b: 0, alpha: 0}})
    .png()
    .toBuffer();
  const meta = await sharp(buf).metadata();
  const art = await sharp(buf)
    .resize({width: Math.round(widthPx), kernel: 'lanczos3'})
    .png()
    .toBuffer();
  const am = await sharp(art).metadata();
  return {art, w: am.width, h: am.height};
}

function masked(bg, art, w, h, radius) {
  // Composite pada kanvas 108dp. Artis di-trim → pusat konten = pusat kanvas.
  const left = Math.round((CANVAS - w) / 2);
  const top = Math.round((CANVAS - h) / 2);
  const svgMask = Buffer.from(
    `<svg width="${CANVAS}" height="${CANVAS}"><rect width="${CANVAS}" height="${CANVAS}" fill="#fff" rx="${radius || 0}"/></svg>`,
  );
  return sharp({
    create: {width: CANVAS, height: CANVAS, channels: 4, background: bg},
  })
    .composite([{input: art, left, top}])
    .composite([{input: svgMask, blend: 'dest-in'}])
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync(OUT, {recursive: true});
  const results = [];

  for (const v of VARIANTS) {
    const widthPx = Math.round((v.contentWidthDp / 108) * CANVAS);
    const {art, w, h} = await contentArt(v.master, widthPx);

    const dpW = w / 4;
    const dpH = h / 4;
    const halfW = dpW / 2;
    const halfH = dpH / 2;
    const halfDiag = Math.hypot(halfW, halfH);

    // Metrik (dalam dp, kanvas 108dp)
    results.push({
      variant: v.label,
      contentDp: `${dpW.toFixed(1)} × ${dpH.toFixed(1)}`,
      halfDiagDp: halfDiag.toFixed(1),
      fitVisible: halfDiag <= 36 ? 'OK' : 'TERPOTONG',
      fitSafeZone: halfDiag <= 33 ? 'OK' : 'batas',
    });

    // Lingkaran penuh untuk varian circle (r = 108dp/2)
    const circlePng = await sharp({
      create: {width: CANVAS, height: CANVAS, channels: 4, background: v.bg},
    })
      .composite([
        {input: art, left: Math.round((CANVAS - w) / 2), top: Math.round((CANVAS - h) / 2)},
      ])
      .composite([
        {
          input: Buffer.from(
            `<svg width="${CANVAS}" height="${CANVAS}"><circle cx="${CANVAS / 2}" cy="${CANVAS / 2}" r="${CANVAS / 2}" fill="#fff"/></svg>`,
          ),
          blend: 'dest-in',
        },
      ])
      .png()
      .toBuffer();
    await sharp(circlePng).toFile(resolve(OUT, `${v.label}_circle.png`));
    const sqPath = resolve(OUT, `${v.label}_squircle.png`);
    const square = await masked(v.bg, art, w, h, 86);
    await sharp(square).toFile(sqPath);
    console.log(`✓ ${v.label}: ${resolve(OUT, `${v.label}_circle.png`)}`);
    console.log(`✓ ${v.label}: ${sqPath}`);
  }

  console.log('\n=== METRIK (kanvas 108dp, radius terlihat 36dp, safe zone 33dp) ===');
  for (const r of results) {
    console.log(
      `${r.variant.padEnd(18)} konten ${r.contentDp} | setengah-diagonal ${r.halfDiagDp}dp | lingkaran: ${r.fitVisible} | safe-zone: ${r.fitSafeZone}`,
    );
  }
  console.log(`\nFolder: ${OUT}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
