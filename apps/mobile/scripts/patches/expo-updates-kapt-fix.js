/**
 * Patch pihak ketiga (berjalan di postinstall, lokal maupun server EAS):
 * menambahkan dependensi `kapt project(':expo-modules-core')` ke
 * build.gradle milik expo-updates.
 *
 * Tanpa ini, kapt Room gagal mengenali anotasi khas Expo (@ExpoFunction,
 * @AsyncFunction) saat membuat Java stubs di modul expo-updates —
 * error: "NonExistentClass cannot be converted to Annotation".
 *
 * Sifat-sifat:
 * - Idempoten: aman dijalankan berulang (postinstall dipanggil tiap install)
 * - Fail-fast: bila EXPO versi baru mengubah format file, script berhenti
 *   dengan pesan jelas daripada diam-diam menulis file rusak.
 * - Anchor tunggal: pastikan hanya satu `implementation project(':expo-modules-core')`
 */

const fs = require('fs');
const path = require('path');

const ANCHOR = `implementation project(':expo-modules-core')`;
const FIX_LINE = `  kapt project(':expo-modules-core')`;
const MARKER = `kapt project(':expo-modules-core')`;

const pkgJsonPath = require.resolve('expo-updates/package.json');
const gradlePath = path.join(path.dirname(pkgJsonPath), 'android', 'build.gradle');

const before = fs.readFileSync(gradlePath, 'utf8');

if (before.includes(MARKER)) {
  console.log('[patch] expo-updates kapt fix: sudah terpasang, lewati.');
  process.exit(0);
}

const anchorCount = before.split(ANCHOR).length - 1;
if (anchorCount !== 1) {
  console.error(
    `[patch] expo-updates kapt fix: anchor "${ANCHOR}" ditemukan ${anchorCount}x ` +
      `(harus tepat 1) di ${gradlePath}. Format file berubah di versi baru — ` +
      `perlu penyesuaian manual sebelum build.`,
  );
  process.exit(1);
}

const after = before.replace(ANCHOR, `${ANCHOR}\n${FIX_LINE}`);
fs.writeFileSync(gradlePath, after);
console.log('[patch] expo-updates kapt fix: diterapkan ke', gradlePath);
