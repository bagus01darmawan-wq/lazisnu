import {API_BASE_URL} from '../api';
import {MobileVersionInfo} from '@lazisnu/shared-types';

export const VERSION_CHECK_TIMEOUT_MS = 5000;

/**
 * Ambil info rilis dari endpoint publik GET /v1/mobile/version.
 * Sengaja memakai fetch MENTAH (bukan apiFetch) karena endpoint ini publik:
 * tidak butuh token, dan tidak boleh memicu logika refresh token / session
 * expired milik interceptor.
 */
export async function fetchMobileVersion(
  timeoutMs = VERSION_CHECK_TIMEOUT_MS,
): Promise<MobileVersionInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}/mobile/version`, {
      signal: controller.signal,
      headers: {Accept: 'application/json'},
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = await response.json();
    if (!body?.success || !body?.data) {
      throw new Error('Bentuk respons tidak sesuai');
    }
    return body.data as MobileVersionInfo;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Apakah modal pembaruan perlu tampil?
 * - versi server harus lebih baru dari yang terpasang, DAN
 * - versi itu belum pernah dipilih "Nanti" (dismissed).
 */
export function shouldShowUpdate(
  installedVersionCode: number,
  release: MobileVersionInfo,
  dismissedVersionCode: number,
): boolean {
  if (release.version_code <= installedVersionCode) {
    return false;
  }
  if (dismissedVersionCode >= release.version_code) {
    return false;
  }
  return true;
}

/**
 * Paksa-update: versi terpasang di bawah ambang minimum yang ditetapkan
 * server (mis. perbaikan data kritis). Modal tampil TANPA tombol "Nanti".
 */
export function isForcedUpdate(installedVersionCode: number, release: MobileVersionInfo): boolean {
  return release.minimum_version_code > 0 && installedVersionCode < release.minimum_version_code;
}
