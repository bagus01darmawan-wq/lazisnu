/**
 * Patch pihak ketiga (postinstall, lokal maupun EAS) — tiga perbaikan saling
 * berjenjang untuk kapt stub pada modul expo-updates.
 *
 * Masalah: stub kapt `kaptReleaseKotlin` gagal dengan pesan
 *   "error: incompatible types: NonExistentClass cannot be converted to Annotation"
 * karena anotasi Kotlin-based khas Expo pada `UpdatesModule.@ExpoMethod` tidak
 * diterjemahkan resolusi oleh generator stub.
 *
 * Perbaikan:
 * 1. kapt { correctErrorTypes = true } — instruksi resmi Kotlin agar stub
 *    generator menerjemahkan tipe anotasi ke represesni kompilabel Java.
 * 2. Room dinaikkan ke 2.6.1 — versi ini memperbaiki resolusi anotasi kapt
 *    pada Kotlin 1.9 + JDK 17.
 * 3. Jalur perkabaran keliru lama dibersihkan: kapt tidak bisa menerima
 *    project correction-library (kapt project(':expo-modules-core')).
 *
 * Seluruhnya idempoten, fail-fast bila anchor berubah format di rilis baru.
 */

const fs = require('fs');
const path = require('path');

const ROOM_ANCHOR_OLD = `def room_version = "2.4.2"`;
const ROOM_ANCHOR_NEW = `def room_version = "2.6.1"`;
const KAPT_FLAG = `correctErrorTypes = true`;
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

// 3. Aktifkan koreksi tipe error kapt agar stub expo-annotation diubah menjadi
// representasi kompilabel Java untuk anotasi Kotlin pada kelas lintas-modul.
if (content.includes(KAPT_FLAG)) {
  console.log('[patch] kapt correctErrorTypes: sudah aktif, lewati.');
} else {
  const anchor = "apply plugin: 'kotlin-kapt'";
  const count = content.split(anchor).length - 1;
  if (count !== 1) {
    console.error(
      `[patch] kapt correctErrorTypes: anchor "${anchor}" ditemukan ${count}x (harus 1).`,
    );
    process.exit(1);
  }
  content = content.replace(anchor, `${anchor}\n\nkapt {\n    ${KAPT_FLAG}\n}`);
  changed = true;
  console.log('[patch] kapt correctErrorTypes: diaktifkan.');
}

if (changed) {
  fs.writeFileSync(gradlePath, content);
  console.log('[patch] kapt+room fix tertulis ke', gradlePath);
}
