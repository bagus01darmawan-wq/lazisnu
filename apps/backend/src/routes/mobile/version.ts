import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import rawRelease from './mobileRelease.json';
import { sendSuccess } from '../../utils/response';

/**
 * Kontrak info rilis untuk aplikasi mobile — fitur update-in-app Tingkat 1.
 *
 * Sumber data: `mobileRelease.json` di folder yang sama (di-commit bersamaan
 * dengan tiap rilis; tsc menyalinnya ke dist otomatis berkat
 * resolveJsonModule). Endpoint PUBLIK (tanpa auth) — info versi + tautan APK
 * memang informasi publik, dan memungkinkan pengecekan bahkan sebelum login.
 *
 * minimumVersionCode = ambang paksa-update: aplikasi dengan versionCode
 * terpasang LEBIH KECIL dari nilai ini wajib menampilkan modal TANPA tombol
 * "Nanti". Nilai 0 = tidak ada paksaan.
 */

// Fail-fast saat boot: JSON rusak = server menolak start (lebih baik
// daripada petugas diam-diam membaca data versi yang salah).
// Catatan: objek internal bercamelCase; bentuk kawat (snake_case) dihasilkan
// sendSuccess → serializeOutput, dan dijaga oleh tes integrasi
// src/routes/__tests__/mobile-version.integration.test.ts.
export const mobileReleaseSchema = z.object({
  version: z.string().min(1),
  versionCode: z.number().int().positive(),
  apkUrl: z.string().url(),
  // APK per-arsitektur (kontrak app ≥ v1.1.6). Kunci tetap: arm64_v8a,
  // armeabi_v7a, universal. `universal` OPSIONAL sejak v1.2.0 (hanya 2 APK
  // per-ABI): app lama (< v1.1.6) hanya tahu apkUrl & tidak tahu ABI, tapi
  // apkUrl tetap wajib (lihat atas), jadi app lama tetap bisa memperbarui.
  // Fail-fast tetap berlaku untuk arm64/armeabi.
  apkUrls: z.object({
    arm64_v8a: z.string().url(),
    armeabi_v7a: z.string().url(),
    universal: z.string().url().optional(),
  }),
  changelog: z.string(),
  minimumVersionCode: z.number().int().nonnegative(),
});

export const mobileRelease = mobileReleaseSchema.parse(rawRelease);

export async function versionRoutes(fastify: FastifyInstance) {
  // GET /v1/mobile/version
  fastify.get('/version', async (_request, reply) => {
    return sendSuccess(reply, mobileRelease);
  });
}
