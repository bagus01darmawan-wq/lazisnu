/**
 * C1-T5 — Berita acara teks readable + util konten (§10, §14.9).
 *
 * Modul MURNI (tanpa DB/IO): builder teks dari snapshot baris submission
 * (bukan hitung ulang), format rupiah, sanitasi WinAnsi untuk pdf-lib,
 * hash SHA-256, dan payload QR verifikasi minimal. Dipakai `cosign.ts`
 * (endpoint teks) dan `baPdfService.ts` (render PDF + verifikasi).
 */
import { createHash } from 'node:crypto';
import { periodKey } from './periodCalendar';
import { terbilangRupiah } from './baTerbilang';

/** SHA-256 hex (hash bytes PDF untuk arsip + hash konten untuk QR). */
export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Payload QR verifikasi minimal (§14.9): id + version + hash → halaman
 * SAH/TIDAK, tanpa nominal/nama/pihak. `hash` = hash KONTEN (lihat
 * baContentHash), bukan hash bytes PDF.
 */
export function buildBaVerifyPayload(params: {
  type: 'ppk' | 'branch';
  id: string;
  version: number;
  hash: string;
}): string {
  return `/v1/verify/ba?type=${params.type}&id=${params.id}&version=${params.version}&hash=${params.hash}`;
}

/**
 * Hash konten BA (deterministik dari snapshot): yang dijamin QR dan
 * diverifikasi endpoint. Beda dari `pdf_hash` (hash bytes PDF untuk arsip
 * T7/V1-V2) — bytes PDF bisa diregenerasi, kontennya yang otentik.
 */
export function baContentHash(type: 'ppk' | 'branch', snapshot: unknown): string {
  return sha256Hex(JSON.stringify({ type, snapshot }));
}

/**
 * pdf-lib (StandardFonts) hanya mendukung WinAnsi — sanitasi teks agar draw
 * tidak meledak pada nama/pernyataan berkarakter khusus.
 */
const ASCII_FALLBACKS: Array<[RegExp, string]> = [
  [/[—–]/g, '-'],
  [/[“”]/g, '"'],
  [/[‘’]/g, "'"],
  [/[…]/g, '...'],
  [/[•]/g, '-'],
  [/[^\x20-\x7E]/g, '?'],
];

export function asciiSafe(s: string): string {
  let out = s;
  for (const [re, sub] of ASCII_FALLBACKS) out = out.replace(re, sub);
  return out;
}

export function formatRupiah(n: number): string {
  return `Rp ${new Intl.NumberFormat('id-ID').format(n)}`;
}

export interface BaSignatureState {
  filled: boolean;
  signer_id: string | null;
  signed_at: Date | null;
}

export interface PpkBaText {
  kind: 'ppk';
  title: string;
  /** F-NUCARE/PYL-10 Rev. 0 (kop formulir org). */
  form_code: string;
  /** Nomor BA org (001/BA/IX/2026) — null sebelum FINAL pertama. */
  ba_number: string | null;
  period: string;
  officer_name: string;
  branch_name: string;
  table: Array<{ label: string; value: string }>;
  statements: string[];
  signatures: { ppk: BaSignatureState; bendahara: BaSignatureState };
  /** Non-null = belum sah (tampilkan sebagai cap). */
  draft_warning: string | null;
}

export interface BranchBaText {
  kind: 'branch';
  title: string;
  /** F-NUCARE/PYL-10 Rev. 0 (kop formulir org). */
  form_code: string;
  /** Nomor BA org (001/BA/IX/2026) — null sebelum FINAL pertama. */
  ba_number: string | null;
  period: string;
  branch_name: string;
  district_name: string | null;
  table: Array<{ label: string; value: string }>;
  ppk_penyusun: Array<{ officer_name: string; total: string }>;
  statements: string[];
  signatures: { ranting: BaSignatureState; mwc_bendahara: BaSignatureState };
  draft_warning: string | null;
}

export const BA_FORM_CODE = 'F-NUCARE/PYL-10 Rev. 0';

const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** WIB wall-clock dari Date (server boleh UTC — hasil tetap hari Jakarta). */
export function wibParts(d: Date): { day: string; dd: string; month: string; mm: string; yyyy: string } {
  const w = new Date(d.getTime() + 7 * 3_600_000);
  return {
    day: HARI_ID[w.getUTCDay()],
    dd: String(w.getUTCDate()).padStart(2, '0'),
    month: BULAN_ID[w.getUTCMonth() + 1],
    mm: String(w.getUTCMonth() + 1).padStart(2, '0'),
    yyyy: String(w.getUTCFullYear()),
  };
}

/** "September 2026" dari periode assignment (waktu penghimpunan, D-14). */
export function periodLong(year: number, month: number): string {
  return `${BULAN_ID[month]} ${year}`;
}

export const DRAFT_WARNING = 'DRAFT — belum sah';

/**
 * BA PPK → ranting. Para pihak (diluruskan Pion, 23 Sep 2026):
 *   PIHAK PERTAMA = PPK (petugas amil / relawan penghimpun koin)
 *   PIHAK KEDUA   = Bendahara Ranting
 *
 * Nama tiap pihak diambil dari data AKUN penandatangan (bukan diketik),
 * lihat `signerDisplayNames` di baPdfService.
 */
export function buildPpkBaText(params: {
  sub: {
    periodYear: number;
    periodMonth: number;
    totalAmount: bigint;
    collectionCount: number;
    bisyarohAmount: bigint;
    netAmount: bigint;
    status: string;
    ppkSignerId: string | null;
    ppkSignedAt: Date | null;
    bendaharaSignerId: string | null;
    bendaharaSignedAt: Date | null;
  };
  officerName: string;
  branchName: string;
  /** C1-T8: bila >0 tampil baris rincian agregat darurat (transparansi). */
  aggregateTotal?: number;
  /** F7/D-14: nomor BA org — null = belum bernomor (pra-FINAL). */
  baNumber?: string | null;
  /** F7/D-14: tanggal kejadian/pengesahan (default: sekarang). */
  eventAt?: Date;
  /** F7/D-14: nama bendahara penandatangan (tampil di BA, bukan UUID). */
  bendaharaName?: string | null;
}): PpkBaText {
  const { sub, officerName, branchName, aggregateTotal = 0 } = params;
  const draft = sub.status !== 'FINAL';
  const total = Number(sub.totalAmount);
  const ev = wibParts(params.eventAt ?? new Date());
  const baNumber = params.baNumber ?? null;
  const table = [
    { label: 'Total setoran', value: formatRupiah(Number(sub.totalAmount)) },
    { label: 'Bisyaroh (10%)', value: formatRupiah(Number(sub.bisyarohAmount)) },
    { label: 'Bersih', value: formatRupiah(Number(sub.netAmount)) },
    { label: 'Jumlah kaleng', value: String(sub.collectionCount) },
  ];
  if (aggregateTotal > 0) {
    table.push({ label: 'Termasuk agregat darurat', value: formatRupiah(aggregateTotal) });
  }
  return {
    kind: 'ppk',
    title: 'BERITA ACARA SERAH TERIMA (BAST)',
    form_code: BA_FORM_CODE,
    ba_number: baNumber,
    period: periodKey(sub.periodYear, sub.periodMonth),
    officer_name: officerName,
    branch_name: branchName,
    table,
    statements: [
      `Pada hari ini ${ev.day} tanggal ${ev.dd} bulan ${ev.month} tahun ${ev.yyyy} (${ev.dd}/${ev.mm}/${ev.yyyy}) diserah terimakan hasil penghimpunan infaq/sedekah Koin NU oleh :`,
      `Nama Petugas Amil / Relawan : ${officerName}`,
      `Alamat : ${branchName}`,
      `No. SK / Surat Tugas : -`,
      `Bertindak sebagai petugas amil atau relawan penghimpun koin NU Ranting ${branchName} yang selanjutnya disebut PIHAK PERTAMA`,
      `Nama : ${params.bendaharaName ?? 'Bendahara Ranting'}`,
      `Jabatan NU Care Lazisnu : Bendahara Ranting`,
      `Alamat : ${branchName}`,
      `Bertindak sebagai pengurus / manajemen NU Care Lazisnu Ranting ${branchName} yang selanjutnya disebut PIHAK KEDUA`,
      `PIHAK PERTAMA telah menyerahkan uang hasil penghimpunan koin NU kepada PIHAK KEDUA sejumlah ${terbilangRupiah(total)} (${formatRupiah(total)}) yang telah dihimpun pada ${periodLong(sub.periodYear, sub.periodMonth)}.`,
      'Angka di atas dihitung otomatis oleh sistem dari per kaleng; tidak ada ketik manual.',
    ],
    signatures: {
      ppk: { filled: !!sub.ppkSignerId, signer_id: sub.ppkSignerId, signed_at: sub.ppkSignedAt },
      bendahara: { filled: !!sub.bendaharaSignerId, signer_id: sub.bendaharaSignerId, signed_at: sub.bendaharaSignedAt },
    },
    draft_warning: draft ? DRAFT_WARNING : null,
  };
}

/**
 * BA ranting → MWC. Para pihak (diluruskan Pion, 23 Sep 2026):
 *   PIHAK PERTAMA = Bendahara Ranting (penyerah)
 *   PIHAK KEDUA   = Bendahara MWC (penerima)
 *
 * Sebelumnya blok PIHAK PERTAMA memakai kata-kata milik BA PPK
 * ("Nama Petugas Amil / Relawan", "petugas amil atau relawan penghimpun koin")
 * — itu deskripsi PPK, bukan bendahara. Sudah diperbaiki; jangan dikembalikan.
 */
export function buildBranchBaText(params: {
  sub: {
    periodYear: number;
    periodMonth: number;
    totalAmount: bigint;
    bisyarohTotal: bigint;
    shareMwc: bigint;
    netAmount: bigint;
    canAktif: number;
    canNonaktif: number;
    canRusak: number;
    canHilang: number;
    status: string;
    rantingSignerId: string | null;
    rantingSignedAt: Date | null;
    mwcBendaharaSignerId: string | null;
    mwcBendaharaSignedAt: Date | null;
  };
  branchName: string;
  districtName: string | null;
  ppkList: Array<{ officerName: string; total: number }>;
  /** F7/D-14: nomor BA org — null = belum bernomor (pra-FINAL). */
  baNumber?: string | null;
  /** F7/D-14: tanggal kejadian/pengesahan (default: sekarang). */
  eventAt?: Date;
  /** F7/D-14: nama penandatangan (tampil di BA, bukan UUID). */
  rantingName?: string | null;
  mwcName?: string | null;
}): BranchBaText {
  const { sub, branchName, districtName, ppkList } = params;
  const draft = sub.status !== 'FINAL' && sub.status !== 'FINAL_NOL';
  const total = Number(sub.totalAmount);
  const ev = wibParts(params.eventAt ?? new Date());
  return {
    kind: 'branch',
    title: 'BERITA ACARA SERAH TERIMA (BAST)',
    form_code: BA_FORM_CODE,
    ba_number: params.baNumber ?? null,
    period: periodKey(sub.periodYear, sub.periodMonth),
    branch_name: branchName,
    district_name: districtName,
    table: [
      { label: 'Total', value: formatRupiah(Number(sub.totalAmount)) },
      { label: 'Bisyaroh', value: formatRupiah(Number(sub.bisyarohTotal)) },
      { label: 'Share MWC (30%)', value: formatRupiah(Number(sub.shareMwc)) },
      { label: 'Bersih', value: formatRupiah(Number(sub.netAmount)) },
      {
        label: 'Kaleng',
        value: `Aktif ${sub.canAktif} / Non-aktif ${sub.canNonaktif} / Rusak ${sub.canRusak} / Hilang ${sub.canHilang}`,
      },
    ],
    ppk_penyusun: ppkList.map((p) => ({ officer_name: p.officerName, total: formatRupiah(p.total) })),
    statements: [
      `Pada hari ini ${ev.day} tanggal ${ev.dd} bulan ${ev.month} tahun ${ev.yyyy} (${ev.dd}/${ev.mm}/${ev.yyyy}) diserah terimakan hasil penghimpunan infaq/sedekah Koin NU oleh :`,
      `Nama : ${params.rantingName ?? `Bendahara Ranting ${branchName}`}`,
      `Jabatan NU Care Lazisnu : Bendahara Ranting`,
      `Alamat : ${branchName}`,
      `Bertindak sebagai pengurus / manajemen NU Care Lazisnu Ranting ${branchName} yang selanjutnya disebut PIHAK PERTAMA`,
      `Nama : ${params.mwcName ?? 'Bendahara MWC'}`,
      `Jabatan NU Care Lazisnu : Bendahara MWC`,
      `Alamat : ${branchName}`,
      `Bertindak sebagai pengurus / manajemen NU Care Lazisnu Ranting ${branchName} yang selanjutnya disebut PIHAK KEDUA`,
      `PIHAK PERTAMA telah menyerahkan uang hasil penghimpunan koin NU kepada PIHAK KEDUA sejumlah ${terbilangRupiah(total)} (${formatRupiah(total)}) yang telah dihimpun pada ${periodLong(sub.periodYear, sub.periodMonth)}.`,
      'Angka di atas dihitung otomatis oleh sistem dari per kaleng; tidak ada ketik manual.',
    ],
    signatures: {
      ranting: { filled: !!sub.rantingSignerId, signer_id: sub.rantingSignerId, signed_at: sub.rantingSignedAt },
      mwc_bendahara: { filled: !!sub.mwcBendaharaSignerId, signer_id: sub.mwcBendaharaSignerId, signed_at: sub.mwcBendaharaSignedAt },
    },
    draft_warning: draft ? DRAFT_WARNING : null,
  };
}
