import {APP_VERSION} from '../../src/config/appConfig';
import {readFileSync} from 'fs';
import {join} from 'path';

const PROJECT_ID = '6b596ee2-44f9-492e-ba9a-a4082a7730ed';

const readRoot = (relativePath: string) =>
  readFileSync(join(__dirname, '..', '..', relativePath), 'utf8');

/**
 * Penjaga satu-sumber versi & konfigurasi EAS Update. versionName WAJIB
 * string literal di build.gradle (keharusan appVersionSource: remote) dan
 * runtimeVersion WAJIB literal di app.json (bare workflow tidak mendukung
 * policy) — tes ini memaksa ketiga tempat tidak pernah saling meleset.
 */
describe('sinkronisasi versi & konfigurasi EAS Update', () => {
  const gradle = readRoot(join('android', 'app', 'build.gradle'));
  const appJson = JSON.parse(readRoot('app.json'));

  it('versionName di build.gradle sama dengan appConfig.json', () => {
    const match = gradle.match(/versionName\s+"([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(APP_VERSION);
  });

  it('expo.version & expo.runtimeVersion di app.json sama dengan appConfig.json (literal)', () => {
    expect(appJson.expo.version).toBe(APP_VERSION);
    // Bare workflow: policy TIDAK didukung — wajib string literal
    expect(appJson.expo.runtimeVersion).toBe(APP_VERSION);
  });

  it('updates.url konsisten antara app.json dan AndroidManifest placeholder', () => {
    expect(appJson.expo.updates?.url).toBe(`https://u.expo.dev/${PROJECT_ID}`);
    expect(gradle).toContain(`https://u.expo.dev/${PROJECT_ID}`);
  });

  it('projectId EAS tersedia untuk tooling', () => {
    expect(appJson.extra.eas.projectId).toBe(PROJECT_ID);
  });
});
