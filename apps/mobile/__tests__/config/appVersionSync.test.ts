import {APP_VERSION} from '../../src/config/appConfig';
import {readFileSync} from 'fs';
import {join} from 'path';

/**
 * Penjaga satu-sumber versi: versionName WAJIB string literal di
 * android/app/build.gradle (keharusan EAS appVersionSource: remote)
 * dan tidak boleh meleset dari appConfig.json (label versi di Profil).
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
