/**
 * C1-T5 — PDF berita acara lazy + hash + verifikasi (§10, §14.8–14.9).
 *
 * Prinsip:
 * - Sumber = snapshot baris submission (+ builder teks `beritaAcara.ts`),
 *   BUKAN hitung ulang (§10) — PDF = data saat ditandatangani.
 * - Generate HANYA saat tombol Unduh ditekan (lazy); FINAL tidak bergantung
 *   R2 (§14.10) — ensure hanya dipanggil jalur unduh, gagal = pesan "belum
 *   siap", bukan FINAL gagal.
 * - Idempoten: versi sama + `pdf_url`/`pdf_hash` terisi → pakai tersimpan
 *   (hash sama, uji §12.8). `pdf_url` menyimpan KEY R2 (bukan URL publik).
 * - Metadata tanggal PDF difiksasi untuk mengurangi variasi bytes; bytes TIDAK
 *   dijamin identik antar-generate (doc-ID pdf-lib acak) — idempotensi dijamin
 *   `pdf_hash`/`pdf_url` tersimpan, bukan determinisme renderer (koreksi F5).
 * - Dua hash, dua guna (terdokumentasi eksplisit):
 *   - `pdf_hash` = SHA-256 bytes PDF → integritas arsip (banding V1/V2, T7).
 *   - hash QR = `baContentHash` atas snapshot kanonis → otentisitas ISI,
 *     diverifikasi endpoint tanpa bocor nominal/pihak.
 */
import { randomUUID } from 'node:crypto';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { and, eq } from 'drizzle-orm';
import { Errors } from '../utils/errorCatalog';
import { downloadFromR2, uploadToR2 } from './r2';
import {
  asciiSafe,
  baContentHash,
  buildBaVerifyPayload,
  buildBranchBaText,
  buildPpkBaText,
  sha256Hex,
  type BranchBaText,
  type PpkBaText,
} from './beritaAcara';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = A4_WIDTH - MARGIN * 2;

/** Key R2 acak berversi (§14.9). */
export function baPdfKey(tier: 'ppk' | 'branch', submissionId: string, version: number): string {
  return `ba-pdfs/${tier}/${submissionId}/v${version}-${randomUUID()}.pdf`;
}

type BaFont = Awaited<ReturnType<PDFDocument['embedFont']>>;

interface BaPage {
  page: ReturnType<PDFDocument['addPage']>;
  doc: PDFDocument;
  font: BaFont;
  fontBold: BaFont;
  y: number;
}

async function newBaDoc(title: string): Promise<{ doc: PDFDocument; pages: BaPage; font: BaFont; fontBold: BaFont }> {
  const doc = await PDFDocument.create();
  // Metadata difiksasi demi determinisme bytes (tanggal benar tampil sbg teks).
  const fixed = new Date('2026-01-01T00:00:00Z');
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);
  doc.setTitle(asciiSafe(title));
  doc.setProducer(asciiSafe('LAZISNU BA Service'));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  return { doc, pages: { page, doc, font, fontBold, y: A4_HEIGHT - MARGIN }, font, fontBold };
}

function ensureRoom(p: BaPage, needed: number): void {
  if (p.y - needed < MARGIN + 120) {
    p.page = p.doc.addPage([A4_WIDTH, A4_HEIGHT]);
    p.y = A4_HEIGHT - MARGIN;
  }
}

function drawLine(p: BaPage, text: string, opts: { size?: number; bold?: boolean; gap?: number } = {}): void {
  const size = opts.size ?? 10;
  ensureRoom(p, size + (opts.gap ?? 6));
  p.page.drawText(asciiSafe(text), {
    x: MARGIN,
    y: p.y - size,
    size,
    font: opts.bold ? p.fontBold : p.font,
    color: rgb(0, 0, 0),
    maxWidth: CONTENT_WIDTH,
  });
  p.y -= size + (opts.gap ?? 6);
}

function drawTable(p: BaPage, rows: Array<{ label: string; value: string }>): void {
  for (const r of rows) {
    ensureRoom(p, 18);
    p.page.drawText(asciiSafe(r.label), { x: MARGIN, y: p.y - 11, size: 10, font: p.font, color: rgb(0, 0, 0) });
    const v = asciiSafe(r.value);
    const w = p.fontBold.widthOfTextAtSize(v, 10);
    p.page.drawText(v, { x: MARGIN + CONTENT_WIDTH - w, y: p.y - 11, size: 10, font: p.fontBold, color: rgb(0, 0, 0) });
    p.y -= 18;
  }
  p.y -= 6;
}

async function drawSignatures(
  p: BaPage,
  sigs: Array<{ label: string; filled: boolean; image: Buffer | null; signerId: string | null; at: Date | null }>,
): Promise<void> {
  for (const s of sigs) {
    ensureRoom(p, 110);
    drawLine(p, s.label, { size: 10, bold: true, gap: 2 });
    if (s.image) {
      try {
        const img = await p.doc.embedPng(s.image);
        const w = 160;
        const h = (img.height / img.width) * w;
        p.page.drawImage(img, { x: MARGIN, y: p.y - Math.min(h, 70), width: w, height: Math.min(h, 70) });
      } catch {
        p.page.drawText(asciiSafe('(arsip coretan tidak terbaca)'), { x: MARGIN, y: p.y - 12, size: 9, font: p.font, color: rgb(0.4, 0.4, 0.4) });
      }
      p.y -= 78;
    } else {
      drawLine(p, '(belum ditandatangani)', { size: 9, gap: 2 });
    }
    const meta = `${s.signerId ?? '-'}${s.at ? ` @ ${s.at.toISOString()}` : ''}`;
    drawLine(p, asciiSafe(meta), { size: 8, gap: 8 });
  }
}

async function drawQr(p: BaPage, payload: string): Promise<void> {
  const buf = await QRCode.toBuffer(payload, { type: 'png', margin: 1, width: 140 });
  const img = await p.doc.embedPng(buf);
  const y = MARGIN + 10;
  p.page.drawImage(img, { x: MARGIN, y, width: 110, height: 110 });
  p.page.drawText(asciiSafe('Pindai untuk verifikasi SAH/TIDAK'), {
    x: MARGIN + 120, y: y + 50, size: 9, font: p.font, color: rgb(0, 0, 0),
  });
}

export interface BaPdfInput {
  ba: PpkBaText | BranchBaText;
  qrPayload: string;
  signatures: Array<{ label: string; image: Buffer | null; signerId: string | null; at: Date | null }>;
}

export async function renderBaPdf(input: BaPdfInput): Promise<Buffer> {
  const { doc, pages: p } = await newBaDoc(input.ba.kind === 'ppk' ? 'BA PPK' : 'BA Ranting');
  drawLine(p, 'LAZISNU', { size: 16, bold: true, gap: 2 });
  drawLine(p, input.ba.title, { size: 12, bold: true, gap: 2 });
  drawLine(p, `Periode: ${input.ba.period}`, { size: 10, gap: 10 });
  if (input.ba.kind === 'ppk') {
    drawLine(p, `PPK: ${input.ba.officer_name}`, { size: 10, gap: 2 });
    drawLine(p, `Ranting: ${input.ba.branch_name}`, { size: 10, gap: 8 });
  } else {
    drawLine(p, `Ranting: ${input.ba.branch_name}`, { size: 10, gap: 2 });
    if (input.ba.district_name) drawLine(p, `MWC: ${input.ba.district_name}`, { size: 10, gap: 2 });
    p.y -= 6;
  }
  drawTable(p, input.ba.table);
  if (input.ba.kind === 'branch' && input.ba.ppk_penyusun.length > 0) {
    drawLine(p, 'PPK penyusun:', { size: 10, bold: true, gap: 2 });
    drawTable(p, input.ba.ppk_penyusun.map((x) => ({ label: x.officer_name, value: x.total })));
  }
  for (const s of input.ba.statements) {
    ensureRoom(p, 26);
    const wrapped = asciiSafe(s);
    p.page.drawText(wrapped.substring(0, 95), { x: MARGIN, y: p.y - 11, size: 9, font: p.font, color: rgb(0, 0, 0), maxWidth: CONTENT_WIDTH });
    p.y -= 20;
  }
  if (input.ba.draft_warning) {
    drawLine(p, input.ba.draft_warning, { size: 12, bold: true, gap: 8 });
  }
  const ordered = input.ba.kind === 'ppk'
    ? [
      { label: 'PPK', filled: input.ba.signatures.ppk.filled, image: input.signatures[0]?.image ?? null, signerId: input.ba.signatures.ppk.signer_id, at: input.ba.signatures.ppk.signed_at },
      { label: 'Bendahara Ranting', filled: input.ba.signatures.bendahara.filled, image: input.signatures[1]?.image ?? null, signerId: input.ba.signatures.bendahara.signer_id, at: input.ba.signatures.bendahara.signed_at },
    ]
    : [
      { label: 'Admin Ranting', filled: input.ba.signatures.ranting.filled, image: input.signatures[0]?.image ?? null, signerId: input.ba.signatures.ranting.signer_id, at: input.ba.signatures.ranting.signed_at },
      { label: 'Bendahara MWC', filled: input.ba.signatures.mwc_bendahara.filled, image: input.signatures[1]?.image ?? null, signerId: input.ba.signatures.mwc_bendahara.signer_id, at: input.ba.signatures.mwc_bendahara.signed_at },
    ];
  await drawSignatures(p, ordered);
  await drawQr(p, input.qrPayload);
  return Buffer.from(await doc.save());
}

// ---------------------------------------------------------------------------
// Snapshot kanonis (masukan hash konten QR + verifikasi).
// ---------------------------------------------------------------------------

export function ppkContentSnapshot(row: {
  id: string;
  version: number;
  periodYear: number;
  periodMonth: number;
  totalAmount: bigint;
  bisyarohAmount: bigint;
  netAmount: bigint;
  collectionCount: number;
  ppkSignerId: string | null;
  ppkSignedAt: Date | null;
  bendaharaSignerId: string | null;
  bendaharaSignedAt: Date | null;
}): Record<string, unknown> {
  return {
    id: row.id,
    version: row.version,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    total: row.totalAmount.toString(),
    bisyaroh: row.bisyarohAmount.toString(),
    net: row.netAmount.toString(),
    count: row.collectionCount,
    ppk: row.ppkSignerId,
    ppkAt: row.ppkSignedAt?.toISOString() ?? null,
    bendahara: row.bendaharaSignerId,
    bendaharaAt: row.bendaharaSignedAt?.toISOString() ?? null,
  };
}

export function branchContentSnapshot(row: {
  id: string;
  version: number;
  periodYear: number;
  periodMonth: number;
  totalAmount: bigint;
  bisyarohTotal: bigint;
  shareMwc: bigint;
  netAmount: bigint;
  rantingSignerId: string | null;
  rantingSignedAt: Date | null;
  mwcBendaharaSignerId: string | null;
  mwcBendaharaSignedAt: Date | null;
}): Record<string, unknown> {
  return {
    id: row.id,
    version: row.version,
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    total: row.totalAmount.toString(),
    bisyaroh: row.bisyarohTotal.toString(),
    share: row.shareMwc.toString(),
    net: row.netAmount.toString(),
    ranting: row.rantingSignerId,
    rantingAt: row.rantingSignedAt?.toISOString() ?? null,
    mwc: row.mwcBendaharaSignerId,
    mwcAt: row.mwcBendaharaSignedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Ensure lazy (hanya jalur unduh) + verifikasi minimal.
// ---------------------------------------------------------------------------

export interface EnsuredPdf {
  key: string;
  hash: string;
  reused: boolean;
}

async function fetchSignatureImages(urls: Array<string | null>): Promise<Array<Buffer | null>> {
  return Promise.all(
    urls.map(async (u) => {
      if (!u) return null;
      try {
        return await downloadFromR2(u);
      } catch {
        return null;
      }
    }),
  );
}

async function storePdf(
  table: 'ppk' | 'branch',
  id: string,
  version: number,
  pdf: Buffer,
): Promise<EnsuredPdf> {
  const hash = sha256Hex(pdf);
  const key = baPdfKey(table === 'ppk' ? 'ppk' : 'branch', id, version);
  const uploaded = await uploadToR2({
    key,
    body: pdf,
    contentType: 'application/pdf',
    cacheControl: 'private',
    metadata: { submissionId: id, version: String(version) },
  });
  if (!uploaded.success || !uploaded.key) {
    // FINAL tidak bergantung R2 (§14.10): lempar agar rute unduh membalas
    // "berkas belum siap", bukan menggagalkan apa pun yang sudah sah.
    throw Errors.INTERNAL_ERROR('Berkas BA belum siap — coba unduh lagi.');
  }
  if (table === 'ppk') {
    await db
      .update(schema.ppkSubmissions)
      .set({ pdfUrl: key, pdfHash: hash, updatedAt: new Date() })
      .where(and(eq(schema.ppkSubmissions.id, id), eq(schema.ppkSubmissions.version, version)));
  } else {
    await db
      .update(schema.branchSubmissions)
      .set({ pdfUrl: key, pdfHash: hash, updatedAt: new Date() })
      .where(and(eq(schema.branchSubmissions.id, id), eq(schema.branchSubmissions.version, version)));
  }
  return { key, hash, reused: false };
}

export async function ensurePpkBaPdf(submissionId: string, opts: { force?: boolean } = {}): Promise<EnsuredPdf> {
  const sub = await db.query.ppkSubmissions.findFirst({
    where: eq(schema.ppkSubmissions.id, submissionId),
    with: {
      officer: { columns: { fullName: true } },
      branch: { columns: { name: true } },
    },
  });
  if (!sub) throw Errors.VALIDATION_ERROR('Setoran PPK tidak ditemukan');
  if (sub.status !== 'FINAL') {
    throw Errors.VALIDATION_ERROR('BA belum sah — belum kedua TTD (FINAL).');
  }
  if (!opts.force && sub.pdfUrl && sub.pdfHash) {
    return { key: sub.pdfUrl, hash: sub.pdfHash, reused: true };
  }
  const snapshot = ppkContentSnapshot(sub);
  const contentHash = baContentHash('ppk', snapshot);
  const qrPayload = buildBaVerifyPayload({ type: 'ppk', id: sub.id, version: sub.version, hash: contentHash });
  const [ppkImg, bendaharaImg] = await fetchSignatureImages([sub.ppkSignatureUrl, sub.bendaharaSignatureUrl]);
  const ba = buildPpkBaText({
    sub,
    officerName: sub.officer?.fullName ?? sub.officerId,
    branchName: sub.branch?.name ?? '',
  });
  const pdf = await renderBaPdf({
    ba,
    qrPayload,
    signatures: [
      { label: 'PPK', image: ppkImg, signerId: sub.ppkSignerId, at: sub.ppkSignedAt },
      { label: 'Bendahara', image: bendaharaImg, signerId: sub.bendaharaSignerId, at: sub.bendaharaSignedAt },
    ],
  });
  return storePdf('ppk', sub.id, sub.version, pdf);
}

export async function ensureBranchBaPdf(submissionId: string, opts: { force?: boolean } = {}): Promise<EnsuredPdf> {
  const sub = await db.query.branchSubmissions.findFirst({
    where: eq(schema.branchSubmissions.id, submissionId),
    with: {
      branch: { columns: { name: true } },
      district: { columns: { name: true } },
    },
  });
  if (!sub) throw Errors.VALIDATION_ERROR('Setoran ranting tidak ditemukan');
  if (sub.status !== 'FINAL' && sub.status !== 'FINAL_NOL') {
    throw Errors.VALIDATION_ERROR('BA belum sah — belum kedua TTD (FINAL).');
  }
  if (!opts.force && sub.pdfUrl && sub.pdfHash) {
    return { key: sub.pdfUrl, hash: sub.pdfHash, reused: true };
  }
  const ppks = await db.query.ppkSubmissions.findMany({
    where: and(
      eq(schema.ppkSubmissions.branchId, sub.branchId),
      eq(schema.ppkSubmissions.periodYear, sub.periodYear),
      eq(schema.ppkSubmissions.periodMonth, sub.periodMonth),
    ),
    with: { officer: { columns: { fullName: true } } },
  });
  const snapshot = branchContentSnapshot(sub);
  const contentHash = baContentHash('branch', snapshot);
  const qrPayload = buildBaVerifyPayload({ type: 'branch', id: sub.id, version: sub.version, hash: contentHash });
  const [rantingImg, mwcImg] = await fetchSignatureImages([sub.rantingSignatureUrl, sub.mwcBendaharaSignatureUrl]);
  const ba = buildBranchBaText({
    sub,
    branchName: sub.branch?.name ?? '',
    districtName: sub.district?.name ?? null,
    ppkList: ppks.map((p) => ({ officerName: p.officer?.fullName ?? p.officerId, total: Number(p.totalAmount) })),
  });
  const pdf = await renderBaPdf({
    ba,
    qrPayload,
    signatures: [
      { label: 'Admin Ranting', image: rantingImg, signerId: sub.rantingSignerId, at: sub.rantingSignedAt },
      { label: 'Bendahara MWC', image: mwcImg, signerId: sub.mwcBendaharaSignerId, at: sub.mwcBendaharaSignedAt },
    ],
  });
  return storePdf('branch', sub.id, sub.version, pdf);
}

/**
 * Verifikasi minimal (§14.9 + F3 review-T5): hanya `{ valid }`. Seragam untuk
 * id tak dikenal / format salah / hash salah — tidak membocorkan nominal,
 * nama, pihak, atau keberadaan id.
 *
 * C1-T6 (F3): `valid` berarti "BA SAH + konten cocok hash" — baris harus
 * `FINAL`/`FINAL_NOL` (QR hanya dicetak di PDF FINAL). Hash benar + status
 * DRAFT/PPK_SIGNED → `false`.
 */
export async function verifyBaRecord(
  type: 'ppk' | 'branch',
  id: string,
  version: number,
  hash: string,
): Promise<boolean> {
  if (!/^[0-9a-fA-F-]{36}$/.test(id) || !Number.isInteger(version) || version < 1 || typeof hash !== 'string' || hash.length === 0) {
    return false;
  }
  if (type === 'ppk') {
    const row = await db.query.ppkSubmissions.findFirst({ where: eq(schema.ppkSubmissions.id, id) });
    if (!row || row.version !== version) return false;
    if (row.status !== 'FINAL') return false;
    return baContentHash('ppk', ppkContentSnapshot(row)) === hash;
  }
  const row = await db.query.branchSubmissions.findFirst({ where: eq(schema.branchSubmissions.id, id) });
  if (!row || row.version !== version) return false;
  if (row.status !== 'FINAL' && row.status !== 'FINAL_NOL') return false;
  return baContentHash('branch', branchContentSnapshot(row)) === hash;
}
