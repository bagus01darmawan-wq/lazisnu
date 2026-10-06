/**
 * Penyapu label QR R2 (`r2Cleanup`) — diuji tanpa R2 sungguhan.
 *
 * Yang dikunci di sini: penyapu hanya menghapus yang lebih tua dari retensi,
 * tidak pernah menghapus berkas yang umurnya tak bisa dipastikan, punya lantai
 * pengaman terhadap salah ketik retensi, dan hanya menyentuh prefix `qr-pdfs/`
 * (arsip BA di `ba-pdfs/` tidak boleh tersentuh).
 */
import { sweepQrPdfs, DEFAULT_QR_RETENTION_DAYS, QR_PDF_PREFIX } from '../r2Cleanup';
import { listObjectsFromR2, deleteManyFromR2 } from '../r2';

jest.mock('../r2', () => ({
  listObjectsFromR2: jest.fn(),
  deleteManyFromR2: jest.fn(),
}));

const mockList = listObjectsFromR2 as jest.MockedFunction<typeof listObjectsFromR2>;
const mockDelete = deleteManyFromR2 as jest.MockedFunction<typeof deleteManyFromR2>;

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

function listOf(objects: Array<{ key: string; days: number | null; size?: number }>, truncated = false) {
  return {
    objects: objects.map((o) => ({
      key: o.key,
      size: o.size ?? 1000,
      lastModified: o.days === null ? null : daysAgo(o.days),
    })),
    truncated,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDelete.mockResolvedValue({ deleted: 0, failed: 0 });
});

describe('sweepQrPdfs', () => {
  test('hanya menghapus objek yang lebih tua dari retensi', async () => {
    mockList.mockResolvedValue(listOf([
      { key: 'qr-pdfs/R001/qr-A.pdf', days: 30 },  // kedaluwarsa
      { key: 'qr-pdfs/R001/qr-B.pdf', days: 1 },   // masih segar
      { key: 'qr-pdfs/R001/qr-C.pdf', days: 20 },  // kedaluwarsa
    ]));
    mockDelete.mockResolvedValue({ deleted: 2, failed: 0 });

    const res = await sweepQrPdfs({ retentionDays: 7 });

    expect(res.scanned).toBe(3);
    expect(res.expired).toBe(2);
    expect(res.deleted).toBe(2);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith([
      'qr-pdfs/R001/qr-A.pdf',
      'qr-pdfs/R001/qr-C.pdf',
    ]);
  });

  test('hanya memindai prefix qr-pdfs/ — arsip BA tidak pernah disentuh', async () => {
    mockList.mockResolvedValue(listOf([]));

    await sweepQrPdfs();

    expect(mockList).toHaveBeenCalledWith(QR_PDF_PREFIX, expect.anything());
    expect(QR_PDF_PREFIX).toBe('qr-pdfs/');
  });

  test('objek tanpa lastModified TIDAK dihapus (umur tak bisa dipastikan)', async () => {
    mockList.mockResolvedValue(listOf([
      { key: 'qr-pdfs/R001/qr-tanpa-tanggal.pdf', days: null },
    ]));

    const res = await sweepQrPdfs({ retentionDays: 1 });

    expect(res.expired).toBe(0);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('tidak ada yang kedaluwarsa → tidak memanggil hapus', async () => {
    mockList.mockResolvedValue(listOf([
      { key: 'qr-pdfs/R001/qr-A.pdf', days: 0 },
    ]));

    const res = await sweepQrPdfs({ retentionDays: 7 });

    expect(res.expired).toBe(0);
    expect(res.deleted).toBe(0);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('dry_run melaporkan tanpa menghapus', async () => {
    mockList.mockResolvedValue(listOf([
      { key: 'qr-pdfs/R001/qr-A.pdf', days: 90, size: 2048 },
    ]));

    const res = await sweepQrPdfs({ retentionDays: 7, dryRun: true });

    expect(res.dry_run).toBe(true);
    expect(res.expired).toBe(1);
    expect(res.deleted).toBe(0);
    expect(res.bytes_freed_estimate).toBe(2048);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test('lantai pengaman: retensi 0 / negatif dinaikkan ke 1 hari', async () => {
    mockList.mockResolvedValue(listOf([
      { key: 'qr-pdfs/R001/qr-A.pdf', days: 2 },
    ]));
    mockDelete.mockResolvedValue({ deleted: 1, failed: 0 });

    const nol = await sweepQrPdfs({ retentionDays: 0 });
    expect(nol.retention_days).toBe(1);
    expect(nol.expired).toBe(1);

    mockDelete.mockClear();
    const negatif = await sweepQrPdfs({ retentionDays: -30 });
    expect(negatif.retention_days).toBe(1);
  });

  test('retensi tidak sah (NaN) jatuh ke bawaan 7 hari', async () => {
    mockList.mockResolvedValue(listOf([]));

    const res = await sweepQrPdfs({ retentionDays: Number.NaN });

    expect(res.retention_days).toBe(DEFAULT_QR_RETENTION_DAYS);
  });

  test('kegagalan sebagian diteruskan apa adanya, bukan disembunyikan', async () => {
    mockList.mockResolvedValue(listOf([
      { key: 'qr-pdfs/R001/qr-A.pdf', days: 30 },
      { key: 'qr-pdfs/R001/qr-B.pdf', days: 30 },
    ]));
    mockDelete.mockResolvedValue({ deleted: 1, failed: 1 });

    const res = await sweepQrPdfs({ retentionDays: 7 });

    expect(res.expired).toBe(2);
    expect(res.deleted).toBe(1);
    expect(res.failed).toBe(1);
  });

  test('capped diteruskan supaya pemanggil tahu masih ada sisa', async () => {
    mockList.mockResolvedValue(listOf([
      { key: 'qr-pdfs/R001/qr-A.pdf', days: 1 },
    ], true));

    const res = await sweepQrPdfs({ retentionDays: 7 });

    expect(res.capped).toBe(true);
  });

  test('R2 tidak dikonfigurasi (daftar kosong) → hasil nol, tidak melempar', async () => {
    mockList.mockResolvedValue({ objects: [], truncated: false });

    const res = await sweepQrPdfs();

    expect(res.scanned).toBe(0);
    expect(res.deleted).toBe(0);
    expect(res.failed).toBe(0);
  });
});
