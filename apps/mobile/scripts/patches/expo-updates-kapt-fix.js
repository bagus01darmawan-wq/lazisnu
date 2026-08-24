/**
 * Patch pihak ketiga (berjalan di postinstall, lokal maupun server EAS).
 *
 * Masalah: expo-updates mengunci Room 2.4.2. Versi ini memiliki bug resolusi
 * anotasi pada Kotlin 1.9 + JDK 17 — stub kapt salah menafsir anotasi sebagai
 * NonExistentClass, sehingga kaptReleaseKotlin gagal:
 *   "error: incompatible types: NonExistentClass cannot be converted to Annotation"
 *
 * Perbaikan: naikkan Room ke 2.6.1 (rilis yang memperbaiki resolusi anotasi
 * kapt pada Kotlin 1.9). Juga membersihkan sisa jalur perkabaran keliru
 * (`kapt project(':expo-modules-core')`) bila sebelumnya pernah tertempel —
 * kapt tidak bisa menerima project Android-library sebagai anno-processor
 * (varian debug/release ambigu, Gradle menolak di task kaptClasspath).
 *
 * Sifat: idempoten; fail-fast bila anchor Room hilang/berubah format.
 */

const fs = require('fs');
const path = require('path');

const ROOM_ANCHOR_OLD = `def room_version = "2.4.2"`;
const ROOM_ANCHOR_NEW = `def room_version = "2.6.1"`;
const STALE_KAPT_LINE_TOKEN = "kapt project(':expo-modules-core')";

const pkgJsonPath = require.resolve('expo-updates/package.json');
const gradlePath = path.join(path.dirname(pkgJsonPath), 'android', 'build.gradle');

let content = fs.readFileSync(gradlePath, 'utf8');
let changed = false;

// 1. Pulihkan penempelan jalur lama kalau masih tertinggal (self-heal)
if (content.includes(STALE_KAPT_LINE_TOKEN)) {
  content = content
    .split('\n')
    .filter(line => !line.includes(STALE_KAPT_LINE_TOKEN))
    .join('\n');
  changed = true;
  console.log('[patch] expo-updates: jalur kapt-project lama dibersihkan.');
}

// 2. Naikkan Room ke versi yang memperbaiki resolusi anotasi kapt
if (content.includes(ROOM_ANCHOR_NEW)) {
  console.log('[patch] expo-updates room fix: sudah terpasang, lewati.');
} else {
  const count = content.split(ROOM_ANCHOR_OLD).length - 1;
  if (count !== 1) {
    console.error(
      `[patch] expo-updates room fix: anchor "${ROOM_ANCHOR_OLD}" ditemukan ${count}x ` +
        `(harus tepat 1) di ${gradlePath}. Versi library berubah — perlu penyesuaian manual.`,
    );
    process.exit(1);
  }
  content = content.replace(ROOM_ANCHOR_OLD, ROOM_ANCHOR_NEW);
  changed = true;
  console.log('[patch] expo-updates room fix: Room dinaikkan ke 2.6.1.');
}

if (changed) {
  fs.writeFileSync(gradlePath, content);
  console.log('[patch] expo-updates room fix tertulis ke', gradlePath);
}
