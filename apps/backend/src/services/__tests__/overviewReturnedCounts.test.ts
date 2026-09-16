/**
 * Regression test untuk bug overview staging (2026-09-15).
 *
 * Gejala: halaman overview web staging menampilkan "Gagal memuat overview /
 * Terjadi kesalahan koneksi ke server". Backend log 500:
 *
 *   DrizzleQueryError: Failed query: select count(*)::int, count(*) filter
 *   (where "cans"."updated_at" >= $1 and ...) from "cans" where ...
 *   caused by: TypeError [ERR_INVALID_ARG_TYPE]: The "string" argument must
 *   be of type string or an instance of Buffer or ArrayBuffer.
 *   Received an instance of Date
 *
 * Akar masalah: `getReturnedCounts` menginterpolasi objek Date langsung ke
 * template literal `sql\`...\`` (`${start}` / `${end}`). Driver postgres-js
 * memanggil `Buffer.byteLength()` pada tiap parameter bind dan menolak Date.
 * Seluruh `getOverview` adalah `Promise.all` yang mencakup fungsi ini, jadi
 * satu query yang melempar = seluruh endpoint 500.
 *
 * Perbaikan: filter tanggal memakai operator Drizzle `gte`/`lt` (terikat
 * parameter dan di-serialize driver ke ISO string sebelum dikirim).
 *
 * Tes ini meniru pemeriksaan yang dilakukan driver postgres-js asli pada
 * parameter bind, tanpa perlu database. Setiap parameter harus string (atau
 * number/buffer); objek Date mentah meniru persis kegagalan produksi.
 */
import { getReturnedCounts } from '../overviewService.js';

// Ambil parameter yang diteruskan driver postgres-js ke koneksi.
const capturedQueries: { sql: string; params: unknown[] }[] = [];

/**
 * Replikasi pembongkaran parameter driver postgres-js (postgres@3.4.9,
 * bytes.js: `Buffer.byteLength(str, 'utf-8')` untuk tiap parameter).
 * Disitulah ERR_INVALID_ARG_TYPE dilemparkan — di sini kita tiru tanpa
 * network/DB, jadi tes deterministik dan cepat.
 */
function assertBindable(params: unknown[]) {
  for (const p of params) {
    if (typeof p === 'string') continue;
    if (p instanceof Buffer || p instanceof ArrayBuffer) continue;
    if (typeof p === 'number' && Number.isFinite(p)) continue;
    if (p instanceof Uint8Array) continue;
    throw new TypeError(
      `The "string" argument must be of type string or an instance of Buffer or ArrayBuffer. Received an instance of ${p?.constructor?.name ?? typeof p}`,
    );
  }
}

// Mock driver postgres-js: koneksi yang "berhasil" selama parameternya bisa
// di-bind, dan menolak dengan TypeError bila ada objek Date mentah — persis
// seperti produksi. Drizzle memanggil client.unsafe(sql, params).values().
//
// Drizzle postgres-js driver() menulis client.options.parsers/serializers
// untuk beberapa tipe; mock ini menyediakannya agar driver() tidak crash.
jest.mock('postgres', () => {
  const mock = jest.fn(() => {
    const client = {
      options: { parsers: {}, serializers: {} },
      unsafe: (sql: string, params: unknown[] = []) => {
        capturedQueries.push({ sql, params });
        return {
          values: () => Promise.resolve([['1'], ['1']]),
        };
      },
    };
    return client;
  });
  return { __esModule: true, default: mock };
});

describe('getReturnedCounts — parameter bind driver postgres-js', () => {
  // Impor ditunda ke dalam isolateModules supaya mock `postgres` (dideklarasikan
  // di atas via jest.mock) sudah terpasang saat module overviewService dimuat.
  const loadService = async () => {
    let svc: typeof import('../overviewService.js') | null = null;
    jest.isolateModules(() => {
      svc = require('../overviewService.js');
    });
    return svc!;
  };

  it('mengikat tanggal via operator Drizzle, tidak menyisipkan Date mentah', async () => {
    const { getReturnedCounts } = await loadService();

    await getReturnedCounts({ districtId: 'district-1' }, { year: 2026, month: 9 });

    // Pastikan fungsi benar-benar memicu query (mock jalan).
    expect(capturedQueries.length).toBeGreaterThan(0);

    // Replikasi cek driver pada tiap parameter. Sebelum perbaikan, satu
    // parameter adalah objek Date → ERR_INVALID_ARG_TYPE → 500.
    for (const q of capturedQueries) {
      expect(() => assertBindable(q.params)).not.toThrow();
      expect(q.params).not.toContainEqual(expect.any(Date));
    }
  });

  it('batas bulan menjadi placeholder $N, bukan tanggal inline di SQL', async () => {
    const { getReturnedCounts } = await loadService();

    capturedQueries.length = 0;
    await getReturnedCounts({ districtId: 'district-1', branchId: 'branch-1' }, { year: 2026, month: 9 });

    expect(capturedQueries.length).toBe(2);

    // Query total: tanpa filter tanggal → tidak ada placeholder tanggal.
    const totalQuery = capturedQueries.find((q) => !q.sql.includes('updated_at'));
    // Query bulan: filter tanggal ADA dan harus sebagai placeholder terikat.
    const monthQuery = capturedQueries.find((q) => q.sql.includes('updated_at'));

    expect(totalQuery).toBeDefined();
    expect(monthQuery).toBeDefined();
    expect(monthQuery!.sql).toMatch(/"updated_at" >= \$/);
    expect(monthQuery!.sql).toMatch(/"updated_at" < \$/);
    // Tanggal di-bind sebagai ISO string, bukan objek Date mentah.
    const dateParams = monthQuery!.params.filter((p) => p instanceof Date || (typeof p === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p)));
    expect(dateParams.length).toBe(2);
    expect(dateParams).not.toContainEqual(expect.any(Date));
  });
});
