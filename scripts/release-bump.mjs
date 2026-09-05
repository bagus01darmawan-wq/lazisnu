#!/usr/bin/env node
/**
 * release-bump.mjs — satu-sumber versi untuk rilis APK (Opsi B, CI-driven).
 *
 * Pemakaian:
 *   node scripts/release-bump.mjs 1.1.2 --version-code 20 \
 *     --changelog "- Fitur baru X" [--publish]
 *
 * Tanpa --publish: hanya mengedit 3 file (dry-run, belum di-commit).
 * Dengan --publish: git add+commit → push main → buat tag vX.Y.Z (baru,
 * TANPA force-push; tag sudah ada = ABORAT) → push tag. Push tag memicu
 * release.yml (2 APK per-ABI + 1 universal via Gradle CI → R2 → deploy).
 *
 * File yang dijaga agar sinkron:
 *   1. apps/mobile/android/app/build.gradle  (versionName + versionCode literal)
 *   2. apps/mobile/src/config/appConfig.ts   (APP_VERSION)
 *   3. apps/backend/src/routes/mobile/mobileRelease.json (version/versionCode/apkUrl)
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Wrapper git TANPA shell: argumen diteruskan sebagai array (execFileSync),
// sehingga input (version/tag) tidak pernah di-interpolasi ke string perintah.
// (CodeQL js/indirect-command-line-injection #6–#9.)
const git = (args, opts = {}) => {
  const out = execFileSync('git', args, {cwd: ROOT, ...opts});
  return out ? out.toString().trim() : '';
};

// ─── Argumen ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const version = args.find((a) => /^\d+\.\d+\.\d+$/.test(a));
if (!version) {
  console.error('Pakai: node scripts/release-bump.mjs <x.y.z> --version-code <N> [--changelog "..."] [--publish]');
  process.exit(1);
}
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const versionCode = getArg('--version-code');
if (!versionCode || !/^\d+$/.test(versionCode)) {
  console.error('--version-code <N> wajib (int, HARUS > versionCode rilis sebelumnya)');
  process.exit(1);
}
const changelog = getArg('--changelog');
const publish = args.includes('--publish');

// ─── File ───────────────────────────────────────────────────────────────────
const F = {
  gradle: join(ROOT, 'apps/mobile/android/app/build.gradle'),
  appConfig: join(ROOT, 'apps/mobile/src/config/appConfig.ts'),
  release: join(ROOT, 'apps/backend/src/routes/mobile/mobileRelease.json'),
};

// ─── Guard: working tree bersih sebelum publish ─────────────────────────────
const dirty = git(['status', '--porcelain']);
if (publish && dirty) {
  console.error('Working tree TIDAK bersih — commit/simpan dulu:\n' + dirty);
  process.exit(1);
}
if (publish) {
  const tag = `v${version}`;
  const exists = git(['tag', '-l', tag]);
  if (exists) {
    console.error(`Tag ${tag} SUDAH ADA — tolak: tag tidak boleh di-force-push/dibuat ulang.`);
    process.exit(1);
  }
}

// ─── Edit build.gradle ──────────────────────────────────────────────────────
let gradle = readFileSync(F.gradle, 'utf8');
if (!/versionName\s+"[^"]+"/.test(gradle) || !/versionCode\s+\d+/.test(gradle)) {
  console.error('Pattern versionName/versionCode tidak ditemukan di build.gradle — file berubah?');
  process.exit(1);
}
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${version}"`).replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
writeFileSync(F.gradle, gradle, 'utf8');

// ─── Edit appConfig.ts ──────────────────────────────────────────────────────
let appConfig = readFileSync(F.appConfig, 'utf8');
if (!/APP_VERSION:\s*string\s*=\s*'[^']+'/.test(appConfig)) {
  console.error('Pattern APP_VERSION tidak ditemukan di appConfig.ts');
  process.exit(1);
}
appConfig = appConfig.replace(/APP_VERSION:\s*string\s*=\s*'[^']+'/, `APP_VERSION: string = '${version}'`);
writeFileSync(F.appConfig, appConfig, 'utf8');

// ─── Edit mobileRelease.json ────────────────────────────────────────────────
const release = JSON.parse(readFileSync(F.release, 'utf8'));
release.version = version;
release.versionCode = Number(versionCode);
release.apkUrl = `https://apk.lazisnu.site/lazisnu-${version}.apk`;
// Kontrak app ≥ v1.1.6: APK per-arsitektur (kunci tetap; zod di version.ts
// menolak server start bila salah satu hilang — fail-fast).
release.apkUrls = {
  arm64_v8a: `https://apk.lazisnu.site/lazisnu-${version}-arm64-v8a.apk`,
  armeabi_v7a: `https://apk.lazisnu.site/lazisnu-${version}-armeabi-v7a.apk`,
  universal: `https://apk.lazisnu.site/lazisnu-${version}.apk`,
};
if (changelog) release.changelog = changelog;
writeFileSync(F.release, JSON.stringify(release, null, 2) + '\n', 'utf8');

console.log('✔ Bump:');
console.log(`  build.gradle      → versionName "${version}", versionCode ${versionCode}`);
console.log(`  appConfig.ts      → APP_VERSION = '${version}'`);
console.log(`  mobileRelease.json → v${version} (vc ${versionCode}) apkUrl = ${release.apkUrl}`);

// ─── Publish (commit + push + tag) ──────────────────────────────────────────
if (publish) {
  const tag = `v${version}`;
  git(['add', '-A']);
  git(['commit', '-m', `chore(mobile): bump v${version} (versionCode ${versionCode}) — rilis Opsi B`]);
  git(['push', 'origin', 'HEAD'], {stdio: 'inherit'});
  git(['tag', tag]);
  git(['push', 'origin', tag], {stdio: 'inherit'});
  console.log(`✔ Tag ${tag} dibuat & di-push — release.yml membangun 2 APK per-ABI + 1 universal → R2 → deploy.`);
} else {
  console.log('(dry-run: file sudah diedit, belum di-commit. Ulangi dengan --publish untuk rilis.)');
}
