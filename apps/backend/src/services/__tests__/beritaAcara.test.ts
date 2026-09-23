/**
 * C1-T5 — unit murni: validator coretan, hash, payload QR, sanitasi PDF,
 * builder teks BA (§10). Tanpa DB/R2.
 */
import {
  asciiSafe,
  baContentHash,
  buildBaVerifyPayload,
  buildBranchBaText,
  buildPpkBaText,
  formatRupiah,
  sha256Hex,
} from '../beritaAcara';
import { parseSignaturePng, SIGNATURE_MAX_BYTES } from '../cosign';
import { ErrorCode } from '../../utils/errorCatalog';

/** PNG 1x1 transparan (68 byte) — magic valid. */
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('parseSignaturePng', () => {
  test('PNG valid lolos', () => {
    const buf = parseSignaturePng(TINY_PNG_B64);
    // Magic PNG: 89 50 4E 47 hex (awas: 0x47 = 71 desimal, bukan 47).
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  test('bukan PNG ditolak', () => {
    const notPng = Buffer.from('hello world, bukan gambar').toString('base64');
    try {
      parseSignaturePng(notPng);
      throw new Error('seharusnya ditolak');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  test('base64 rusak ditolak', () => {
    try {
      parseSignaturePng('!!!');
      throw new Error('seharusnya ditolak');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  test('melebihi 50KB ditolak', () => {
    const big = Buffer.alloc(SIGNATURE_MAX_BYTES + 1);
    Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(big, 0);
    try {
      parseSignaturePng(big.toString('base64'));
      throw new Error('seharusnya ditolak');
    } catch (err: any) {
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(err.message).toContain('50KB');
    }
  });

  test('batas konstanta 50KB', () => {
    expect(SIGNATURE_MAX_BYTES).toBe(50 * 1024);
  });
});

describe('sha256Hex + QR payload + content hash', () => {
  test('hex 64 deterministik', () => {
    const h1 = sha256Hex('abc');
    const h2 = sha256Hex(Buffer.from('abc'));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('abd')).not.toBe(h1);
  });

  test('payload QR minimal: hanya id/version/hash', () => {
    const p = buildBaVerifyPayload({ type: 'ppk', id: 'some-id', version: 2, hash: 'ab'.repeat(32) });
    expect(p).toBe(`/v1/verify/ba?type=ppk&id=some-id&version=2&hash=${'ab'.repeat(32)}`);
    expect(p).not.toMatch(/nominal|nama|total/i);
  });

  test('content hash deterministik & sensitif isi', () => {
    const snap = { id: 'x', version: 1 };
    expect(baContentHash('ppk', snap)).toBe(baContentHash('ppk', { id: 'x', version: 1 }));
    expect(baContentHash('ppk', snap)).not.toBe(baContentHash('branch', snap));
    expect(baContentHash('ppk', snap)).not.toBe(baContentHash('ppk', { id: 'x', version: 2 }));
  });
});

describe('asciiSafe + formatRupiah', () => {
  test('em-dash &uin rawan WinAnsi disanitasi', () => {
    expect(asciiSafe('BERITA ACARA — PPK “Satu” • …')).toBe('BERITA ACARA - PPK "Satu" - ...');
    expect(asciiSafe('Rp 1.000')).toBe('Rp 1.000');
  });

  test('rupiah format id-ID', () => {
    expect(formatRupiah(1042500)).toBe('Rp 1.042.500');
    expect(formatRupiah(0)).toBe('Rp 0');
  });
});

describe('builder teks BA (§10)', () => {
  const ppkSub = {
    periodYear: 2026, periodMonth: 9,
    totalAmount: BigInt(175000), collectionCount: 2,
    bisyarohAmount: BigInt(18000), netAmount: BigInt(157000),
    status: 'FINAL',
    ppkSignerId: 'u-ppk', ppkSignedAt: new Date('2026-10-01T10:00:00Z'),
    bendaharaSignerId: 'u-ben', bendaharaSignedAt: new Date('2026-10-01T10:05:00Z'),
  };

  test('BA PPK: angka snapshot + tanpa cap DRAFT saat FINAL', () => {
    const ba = buildPpkBaText({ sub: ppkSub, officerName: 'Petugas Satu', branchName: 'Ranting A' });
    expect(ba.draft_warning).toBeNull();
    expect(ba.table.map((r) => r.value)).toEqual(['Rp 175.000', 'Rp 18.000', 'Rp 157.000', '2']);
    expect(ba.signatures.ppk).toMatchObject({ filled: true, signer_id: 'u-ppk' });
    expect(ba.signatures.bendahara.filled).toBe(true);
  });

  test('BA PPK DRAFT: cap belum sah + TTD kosong terbaca', () => {
    const ba = buildPpkBaText({
      sub: { ...ppkSub, status: 'DRAFT', ppkSignerId: null, ppkSignedAt: null, bendaharaSignerId: null, bendaharaSignedAt: null },
      officerName: 'Petugas Satu', branchName: 'Ranting A',
    });
    expect(ba.draft_warning).toBe('DRAFT — belum sah');
    expect(ba.signatures.ppk.filled).toBe(false);
  });

  test('BA ranting: agregat + penyusun + FINAL_NOL tanpa cap', () => {
    const sub = {
      periodYear: 2026, periodMonth: 9,
      totalAmount: BigInt(0), bisyarohTotal: BigInt(0), shareMwc: BigInt(0), netAmount: BigInt(0),
      canAktif: 0, canNonaktif: 0, canRusak: 0, canHilang: 0,
      status: 'FINAL_NOL',
      rantingSignerId: 'u-adm', rantingSignedAt: new Date(),
      mwcBendaharaSignerId: 'u-mwc', mwcBendaharaSignedAt: new Date(),
    };
    const ba = buildBranchBaText({
      sub, branchName: 'Ranting A', districtName: 'MWC X',
      ppkList: [{ officerName: 'Petugas Satu', total: 175000 }],
    });
    expect(ba.draft_warning).toBeNull();
    expect(ba.ppk_penyusun).toEqual([{ officer_name: 'Petugas Satu', total: 'Rp 175.000' }]);
    expect(ba.table[4].value).toContain('Aktif 0');
  });

  test('F7 BAST PPK: nomor + terbilang + hari + pihak (tanpa potong kalimat)', () => {
    const ba = buildPpkBaText({
      sub: ppkSub, officerName: 'Petugas Satu', branchName: 'Ranting A',
      baNumber: '001/BA/X/2026', eventAt: new Date('2026-10-12T02:00:00Z'), // 12 Okt 09:00 WIB = Senin
      bendaharaName: 'Bendahara Rini',
    });
    expect(ba.form_code).toBe('F-NUCARE/PYL-10 Rev. 0');
    expect(ba.ba_number).toBe('001/BA/X/2026');
    expect(ba.statements[0]).toContain('Senin tanggal 12 bulan Oktober tahun 2026 (12/10/2026)');
    expect(ba.statements.join('\n')).toContain('Seratus Tujuh Puluh Lima Ribu Rupiah (Rp 175.000)');
    expect(ba.statements.join('\n')).toContain('September 2026');
    expect(ba.statements.join('\n')).toContain('PIHAK PERTAMA');
    expect(ba.statements.join('\n')).toContain('Bendahara Rini');
    // F7: kalimat utuh — tidak ada lagi pemenggal 95 huruf di builder.
    for (const s of ba.statements) expect(s.length).toBeGreaterThan(0);
  });

  test('F7 BAST ranting: nomor + pihak kedua MWC + tanpa Mengetahui', () => {
    const sub = {
      periodYear: 2026, periodMonth: 9,
      totalAmount: BigInt(80000), bisyarohTotal: BigInt(8000), shareMwc: BigInt(21600), netAmount: BigInt(50400),
      canAktif: 2, canNonaktif: 0, canRusak: 0, canHilang: 0,
      status: 'FINAL',
      rantingSignerId: 'u-adm', rantingSignedAt: new Date('2026-10-12T02:00:00Z'),
      mwcBendaharaSignerId: 'u-mwc', mwcBendaharaSignedAt: new Date('2026-10-12T03:00:00Z'),
    };
    const ba = buildBranchBaText({
      sub, branchName: 'Ranting A', districtName: 'MWC X',
      ppkList: [],
      baNumber: '001/BA/X/2026', eventAt: new Date('2026-10-12T02:00:00Z'),
      rantingName: 'Admin Agus', mwcName: 'Bendahara MWC Budi',
    });
    expect(ba.ba_number).toBe('001/BA/X/2026');
    const all = ba.statements.join('\n');
    expect(all).toContain('Delapan Puluh Ribu Rupiah (Rp 80.000)');
    expect(all).toContain('Admin Agus');
    expect(all).toContain('Bendahara MWC Budi');
    expect(all).not.toMatch(/mengetahui/i);
  });
});
