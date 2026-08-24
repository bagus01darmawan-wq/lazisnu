import {APP_VERSION} from '../../src/config/appConfig';
import {readFileSync} from 'fs';
import {join} from 'path';

/**
 * Penjaga satu-sumber versi: versionName di build.gradle (string literal —
 * keharusan EAS appVersionSource: remote) tidak boleh meleset dari
 * appConfig.json yang dipakai label Profil dan runtime version OTA.
 */
describe('sinkronisasi nomor versi aplikasi', () => {
  it('versionName di build.gradle sama dengan appConfig.json', () => {
    const gradlePath = join(__dirname, '..', '..', 'android', 'app', 'build.gradle');
    const gradle = readFileSync(gradlePath, 'utf8');
    const match = gradle.match(/versionName\s+"([^"]+)"/);

    expect(match).not.toBeNull();
    expect(match![1]).toBe(APP_VERSION);
  });
});
