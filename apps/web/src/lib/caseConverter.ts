/**
 * caseConverter.ts — normalisasi respons API snake_case → camelCase.
 *
 * Konteks: backend selalu mengirim snake_case di kawat (sendSuccess →
 * serializeOutput). Tanpa konverter sentral, setiap komponen harus membaca
 * snake_case manual — dan komponen baru (mis. RegionCards, Sep 2026) lolos
 * dengan tipe camelCase sehingga field multi-kata jadi `undefined`.
 *
 * Aturan:
 * - Hanya untuk RESPONS yang dibaca UI. Request (body/params/query) tetap
 *   snake_case sesuai kontrak backend — jangan pakai fungsi ini untuk itu.
 * - Key ALL_CAPS (mis. `NON_AKTIF` pada map breakdown) dilewati apa adanya
 *   agar lookup enum tidak rusak.
 * - Key tanpa underscore tidak berubah.
 * - Date, File/Blob, ArrayBuffer view, dan nilai non-plain-object
 *   dikembalikan apa adanya (tidak di-clone).
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  if (typeof File !== 'undefined' && value instanceof File) return false;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return false;
  if (ArrayBuffer.isView(value)) return false;
  return true;
}

function isAllCaps(key: string): boolean {
  return /^[A-Z0-9_]+$/.test(key);
}

export function toCamelKey(key: string): string {
  if (!key || !key.includes('_') || isAllCaps(key)) return key;
  return key.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

export function toCamelCase<T = unknown>(data: T): T {
  if (Array.isArray(data)) {
    return data.map((item) => toCamelCase(item)) as unknown as T;
  }
  if (isPlainObject(data)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      out[toCamelKey(key)] = toCamelCase((data as Record<string, unknown>)[key]);
    }
    return out as unknown as T;
  }
  return data;
}
