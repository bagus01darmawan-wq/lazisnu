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
  period: string;
  branch_name: string;
  district_name: string | null;
  table: Array<{ label: string; value: string }>;
  ppk_penyusun: Array<{ officer_name: string; total: string }>;
  statements: string[];
  signatures: { ranting: BaSignatureState; mwc_bendahara: BaSignatureState };
  draft_warning: string | null;
}

export const DRAFT_WARNING = 'DRAFT — belum sah';

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
}): PpkBaText {
  const { sub, officerName, branchName } = params;
  const draft = sub.status !== 'FINAL';
  return {
    kind: 'ppk',
    title: 'BERITA ACARA PENYETORAN KOIN — PPK',
    period: periodKey(sub.periodYear, sub.periodMonth),
    officer_name: officerName,
    branch_name: branchName,
    table: [
      { label: 'Total setoran', value: formatRupiah(Number(sub.totalAmount)) },
      { label: 'Bisyaroh (10%)', value: formatRupiah(Number(sub.bisyarohAmount)) },
      { label: 'Bersih', value: formatRupiah(Number(sub.netAmount)) },
      { label: 'Jumlah kaleng', value: String(sub.collectionCount) },
    ],
    statements: [
      `Pada hari ini PPK ${officerName} (${branchName}) menyerahkan hasil penjemputan periode tersebut kepada Bendahara Ranting.`,
      'Angka di atas dihitung otomatis oleh sistem dari per kaleng; tidak ada ketik manual.',
    ],
    signatures: {
      ppk: { filled: !!sub.ppkSignerId, signer_id: sub.ppkSignerId, signed_at: sub.ppkSignedAt },
      bendahara: { filled: !!sub.bendaharaSignerId, signer_id: sub.bendaharaSignerId, signed_at: sub.bendaharaSignedAt },
    },
    draft_warning: draft ? DRAFT_WARNING : null,
  };
}

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
}): BranchBaText {
  const { sub, branchName, districtName, ppkList } = params;
  const draft = sub.status !== 'FINAL' && sub.status !== 'FINAL_NOL';
  return {
    kind: 'branch',
    title: 'BERITA ACARA REKAPITULASI RANTING',
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
      `Ranting ${branchName} menyerahkan rekapitulasi periode tersebut kepada MWC.`,
      'MWC hanya menarik data berstatus FINAL.',
    ],
    signatures: {
      ranting: { filled: !!sub.rantingSignerId, signer_id: sub.rantingSignerId, signed_at: sub.rantingSignedAt },
      mwc_bendahara: { filled: !!sub.mwcBendaharaSignerId, signer_id: sub.mwcBendaharaSignerId, signed_at: sub.mwcBendaharaSignedAt },
    },
    draft_warning: draft ? DRAFT_WARNING : null,
  };
}
