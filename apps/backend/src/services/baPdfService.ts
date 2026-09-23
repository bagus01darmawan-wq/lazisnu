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
import { and, eq, inArray } from 'drizzle-orm';
import { Errors } from '../utils/errorCatalog';
import { BAST_LOGO_PNG_BASE64 } from './bastLogo';
import { downloadFromR2, uploadToR2 } from './r2';
import { getAggregateTotal } from './emergencyAggregates';
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

/** F7/D-14: format tanggal ID pendek untuk blok TTD ("12 Oktober 2026"). */
function ttdDate(at: Date | null): string {
  if (!at) return '-';
  const w = new Date(at.getTime() + 7 * 3_600_000);
  const bulan = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][w.getUTCMonth() + 1];
  return `${w.getUTCDate()} ${bulan} ${w.getUTCFullYear()}`;
}

async function drawSignatures(
  p: BaPage,
  sigs: Array<{ label: string; image: Buffer | null; signerId: string | null; name: string | null; at: Date | null }>,
): Promise<void> {
  // BAST org: PIHAK KEDUA kiri, PIHAK PERTAMA kanan. Array = [Pertama, Kedua].
  const [pertama, kedua] = sigs;
  const cols = [
    { title: 'PIHAK KEDUA', s: kedua },
    { title: 'PIHAK PERTAMA', s: pertama },
  ];
  const colW = CONTENT_WIDTH / 2;
  ensureRoom(p, 150);
  const top = p.y;
  for (let i = 0; i < cols.length; i++) {
    const x = MARGIN + i * colW;
    const cx = (text: string, size: number, bold: boolean, dy: number): number => {
      const font = bold ? p.fontBold : p.font;
      const t = asciiSafe(text);
      const w = font.widthOfTextAtSize(t, size);
      p.page.drawText(t, { x: x + Math.max(0, (colW - w) / 2), y: dy, size, font, color: rgb(0, 0, 0) });
      return dy - size - 4;
    };
    let y = top;
    y = cx(cols[i].title, 10, true, y - 12);
    const s = cols[i].s;
    if (s?.image) {
      try {
        const img = await p.doc.embedPng(s.image);
        const w = 130;
        const h = Math.min((img.height / img.width) * w, 60);
        p.page.drawImage(img, { x: x + (colW - w) / 2, y: y - h, width: w, height: h });
      } catch {
        p.page.drawText(asciiSafe('(arsip coretan tidak terbaca)'), { x, y: y - 12, size: 9, font: p.font, color: rgb(0.4, 0.4, 0.4) });
      }
      y -= 68;
    } else {
      y = cx('(belum ditandatangani)', 9, false, y - 2);
      y -= 44;
    }
    y = cx(`( ${s?.name ?? '-'} )`, 10, false, y - 2);
    y = cx(ttdDate(s?.at ?? null), 9, false, y);
    void y;
  }
  p.y = top - 160;
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
  signatures: Array<{ label: string; image: Buffer | null; signerId: string | null; name: string | null; at: Date | null }>;
}

/** F7/D-14: bungkus kata (pengganti potong-95-huruf yang memenggal kalimat). */
function wrapText(text: string, font: BaFont, size: number, maxWidth: number): string[] {
  const words = asciiSafe(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (!cur || font.widthOfTextAtSize(t, size) <= maxWidth) {
      cur = t;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawParagraph(p: BaPage, text: string, opts: { size?: number; bold?: boolean; gap?: number } = {}): void {
  const size = opts.size ?? 10;
  const font = opts.bold ? p.fontBold : p.font;
  for (const line of wrapText(text, font, size, CONTENT_WIDTH)) {
    ensureRoom(p, size + 2);
    p.page.drawText(line, { x: MARGIN, y: p.y - size, size, font, color: rgb(0, 0, 0) });
    p.y -= size + 2;
  }
  p.y -= opts.gap ?? 4;
}

/** F7/D-14: kop formulir org — logo + judul + kode, dalam kotak. */
async function drawKop(p: BaPage, title: string, formCode: string): Promise<void> {
  const boxH = 66;
  ensureRoom(p, boxH + 4);
  const top = p.y;
  p.page.drawRectangle({
    x: MARGIN,
    y: top - boxH,
    width: CONTENT_WIDTH,
    height: boxH,
    borderColor: rgb(0, 0, 0),
    borderWidth: 1,
  });
  try {
    const logo = await p.doc.embedPng(Buffer.from(BAST_LOGO_PNG_BASE64, 'base64'));
    const lh = 50;
    const lw = (logo.width / logo.height) * lh;
    p.page.drawImage(logo, { x: MARGIN + 8, y: top - boxH + 8, width: lw, height: lh });
  } catch {
    // Kop tetap sah tanpa logo (teks judul + kode cukup).
  }
  const cx = MARGIN + 130;
  const cw = CONTENT_WIDTH - 130;
  const t1 = asciiSafe(title);
  const w1 = p.fontBold.widthOfTextAtSize(t1, 13);
  p.page.drawText(t1, { x: cx + Math.max(0, (cw - w1) / 2), y: top - 28, size: 13, font: p.fontBold, color: rgb(0, 0, 0) });
  const t2 = asciiSafe(formCode);
  const w2 = p.font.widthOfTextAtSize(t2, 10);
  p.page.drawText(t2, { x: cx + Math.max(0, (cw - w2) / 2), y: top - 46, size: 10, font: p.font, color: rgb(0, 0, 0) });
  p.y = top - boxH - 10;
}

export async function renderBaPdf(input: BaPdfInput): Promise<Buffer> {
  const { doc, pages: p } = await newBaDoc(input.ba.kind === 'ppk' ? 'BAST PPK' : 'BAST Ranting');
  await drawKop(p, 'BERITA ACARA SERAH TERIMA', input.ba.form_code);
  if (input.ba.ba_number) drawParagraph(p, `Nomor : ${input.ba.ba_number}`, { size: 11, bold: true, gap: 6 });
  drawParagraph(p, `Periode: ${input.ba.period}`, { size: 10, gap: 8 });
  drawTable(p, input.ba.table);
  if (input.ba.kind === 'branch' && input.ba.ppk_penyusun.length > 0) {
    drawLine(p, 'PPK penyusun:', { size: 10, bold: true, gap: 2 });
    drawTable(p, input.ba.ppk_penyusun.map((x) => ({ label: x.officer_name, value: x.total })));
  }
  for (const s of input.ba.statements) {
    drawParagraph(p, s, { size: 10, gap: 4 });
  }
  if (input.ba.draft_warning) {
    drawLine(p, input.ba.draft_warning, { size: 12, bold: true, gap: 8 });
  }
  const ordered = input.ba.kind === 'ppk'
    ? [
      { label: 'PPK', image: input.signatures[0]?.image ?? null, signerId: input.ba.signatures.ppk.signer_id, name: input.signatures[0]?.name ?? null, at: input.ba.signatures.ppk.signed_at },
      { label: 'Bendahara Ranting', image: input.signatures[1]?.image ?? null, signerId: input.ba.signatures.bendahara.signer_id, name: input.signatures[1]?.name ?? null, at: input.ba.signatures.bendahara.signed_at },
    ]
    : [
      { label: 'Admin Ranting', image: input.signatures[0]?.image ?? null, signerId: input.ba.signatures.ranting.signer_id, name: input.signatures[0]?.name ?? null, at: input.ba.signatures.ranting.signed_at },
      { label: 'Bendahara MWC', image: input.signatures[1]?.image ?? null, signerId: input.ba.signatures.mwc_bendahara.signer_id, name: input.signatures[1]?.name ?? null, at: input.ba.signatures.mwc_bendahara.signed_at },
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
  baNumber: string | null;
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
    baNumber: row.baNumber,
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
  baNumber: string | null;
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
    baNumber: row.baNumber,
  };
}

/** Nama tampil penandatangan (ganti UUID di BA org). */
export async function signerDisplayNames(userIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await db.query.users.findMany({
    where: inArray(schema.users.id, ids),
    columns: { id: true, fullName: true },
  });
  for (const r of rows) out.set(r.id, r.fullName);
  return out;
}

/**
 * Nomor BA org: finalize mengisi duluan; baris FINAL lama (pra-F7) yang
 * belum bernomor diberi nomor saat pertama diunduh (transisi satu kali).
 */
export async function ensureBaNumber(
  tier: 'ppk' | 'branch',
  sub: { id: string; version: number; baNumber: string | null; branchId: string; districtId?: string | null; finalizedAt: Date | null },
  now: Date = new Date(),
): Promise<string> {
  if (sub.baNumber) return sub.baNumber;
  const { nextBaNumber } = await import('./baNumbering.js');
  const eventAt = sub.finalizedAt ?? now;
  const scope = tier === 'ppk'
    ? { scopeType: 'RANTING' as const, scopeId: sub.branchId }
    : { scopeType: 'MWC' as const, scopeId: sub.districtId ?? sub.branchId };
  const baNumber = await nextBaNumber(db, scope, eventAt);
  const table = tier === 'ppk' ? schema.ppkSubmissions : schema.branchSubmissions;
  await db.update(table).set({ baNumber, updatedAt: now })
    .where(and(eq(table.id, sub.id), eq(table.version, sub.version)));
  return baNumber;
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
  const baNumber = await ensureBaNumber('ppk', {
    id: sub.id, version: sub.version, baNumber: sub.baNumber, branchId: sub.branchId, finalizedAt: sub.finalizedAt,
  });
  const snapshot = ppkContentSnapshot({ ...sub, baNumber });
  const contentHash = baContentHash('ppk', snapshot);
  const qrPayload = buildBaVerifyPayload({ type: 'ppk', id: sub.id, version: sub.version, hash: contentHash });
  const [ppkImg, bendaharaImg] = await fetchSignatureImages([sub.ppkSignatureUrl, sub.bendaharaSignatureUrl]);
  const names = await signerDisplayNames([sub.ppkSignerId, sub.bendaharaSignerId]);
  const { total: aggregateTotal } = await getAggregateTotal(db, sub.officerId, sub.periodYear, sub.periodMonth);
  const ba = buildPpkBaText({
    sub,
    officerName: sub.officer?.fullName ?? sub.officerId,
    branchName: sub.branch?.name ?? '',
    aggregateTotal,
    baNumber,
    eventAt: sub.finalizedAt ?? sub.ppkSignedAt ?? new Date(),
    bendaharaName: (sub.bendaharaSignerId && names.get(sub.bendaharaSignerId)) || null,
  });
  const pdf = await renderBaPdf({
    ba,
    qrPayload,
    signatures: [
      { label: 'PPK', image: ppkImg, signerId: sub.ppkSignerId, name: (sub.ppkSignerId && (names.get(sub.ppkSignerId) ?? sub.officer?.fullName)) || null, at: sub.ppkSignedAt },
      { label: 'Bendahara', image: bendaharaImg, signerId: sub.bendaharaSignerId, name: (sub.bendaharaSignerId && names.get(sub.bendaharaSignerId)) || null, at: sub.bendaharaSignedAt },
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
  const baNumber = await ensureBaNumber('branch', {
    id: sub.id, version: sub.version, baNumber: sub.baNumber, branchId: sub.branchId, districtId: sub.districtId, finalizedAt: sub.finalizedAt,
  });
  const snapshot = branchContentSnapshot({ ...sub, baNumber });
  const contentHash = baContentHash('branch', snapshot);
  const qrPayload = buildBaVerifyPayload({ type: 'branch', id: sub.id, version: sub.version, hash: contentHash });
  const [rantingImg, mwcImg] = await fetchSignatureImages([sub.rantingSignatureUrl, sub.mwcBendaharaSignatureUrl]);
  const names = await signerDisplayNames([sub.rantingSignerId, sub.mwcBendaharaSignerId]);
  const ba = buildBranchBaText({
    sub,
    branchName: sub.branch?.name ?? '',
    districtName: sub.district?.name ?? null,
    ppkList: ppks.map((p) => ({ officerName: p.officer?.fullName ?? p.officerId, total: Number(p.totalAmount) })),
    baNumber,
    eventAt: sub.finalizedAt ?? sub.rantingSignedAt ?? new Date(),
    rantingName: (sub.rantingSignerId && names.get(sub.rantingSignerId)) || null,
    mwcName: (sub.mwcBendaharaSignerId && names.get(sub.mwcBendaharaSignerId)) || null,
  });
  const pdf = await renderBaPdf({
    ba,
    qrPayload,
    signatures: [
      { label: 'Admin Ranting', image: rantingImg, signerId: sub.rantingSignerId, name: (sub.rantingSignerId && names.get(sub.rantingSignerId)) || null, at: sub.rantingSignedAt },
      { label: 'Bendahara MWC', image: mwcImg, signerId: sub.mwcBendaharaSignerId, name: (sub.mwcBendaharaSignerId && names.get(sub.mwcBendaharaSignerId)) || null, at: sub.mwcBendaharaSignedAt },
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
 * C1-T7: versi lama yang sudah di-reopen tetap terverifikasi via
 * `ba_pdf_archives` (hash konten versi itu vs status saat diarsipkan).
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
    if (row && row.version === version) {
      if (row.status !== 'FINAL') return false;
      return baContentHash('ppk', ppkContentSnapshot(row)) === hash;
    }
    // Versi lama pasca-reopen T7: cocokkan arsip (seragam false bila tak ada).
    const arch = await db.query.baPdfArchives.findFirst({
      where: and(
        eq(schema.baPdfArchives.tier, 'ppk'),
        eq(schema.baPdfArchives.submissionId, id),
        eq(schema.baPdfArchives.version, version),
      ),
    });
    if (!arch || (arch.status !== 'FINAL' && arch.status !== 'FINAL_NOL')) return false;
    return arch.contentHash === hash;
  }
  const row = await db.query.branchSubmissions.findFirst({ where: eq(schema.branchSubmissions.id, id) });
  if (row && row.version === version) {
    if (row.status !== 'FINAL' && row.status !== 'FINAL_NOL') return false;
    return baContentHash('branch', branchContentSnapshot(row)) === hash;
  }
  const arch = await db.query.baPdfArchives.findFirst({
    where: and(
      eq(schema.baPdfArchives.tier, 'branch'),
      eq(schema.baPdfArchives.submissionId, id),
      eq(schema.baPdfArchives.version, version),
    ),
  });
  if (!arch || (arch.status !== 'FINAL' && arch.status !== 'FINAL_NOL')) return false;
  return arch.contentHash === hash;
}

// ---------------------------------------------------------------------------
// C1-T9 (H3 review-T7) — riwayat versi BA untuk UI (unduh versi + verifikasi).
// Tanpa pdf_key (R2 key tak diekspos; unduh tetap via endpoint pdf + audit).
// `pdf_hash` NULL = versi itu belum pernah diunduh (bukan rusak — UI dilarang
// menyimpulkan sebaliknya). Urut versi menanjak; entri live terakhir.
// ---------------------------------------------------------------------------

export interface BaVersionItem {
  version: number;
  status: string;
  pdf_hash: string | null;
  content_hash: string;
  verify_url: string;
  archived_at: Date | null;
  is_current: boolean;
}

export async function listPpkBaVersions(submissionId: string): Promise<BaVersionItem[]> {
  const sub = await db.query.ppkSubmissions.findFirst({
    where: eq(schema.ppkSubmissions.id, submissionId),
  });
  if (!sub) throw Errors.VALIDATION_ERROR('Setoran PPK tidak ditemukan');
  const liveHash = baContentHash('ppk', ppkContentSnapshot(sub));
  const out: BaVersionItem[] = [{
    version: sub.version,
    status: sub.status,
    pdf_hash: sub.pdfHash,
    content_hash: liveHash,
    verify_url: buildBaVerifyPayload({ type: 'ppk', id: sub.id, version: sub.version, hash: liveHash }),
    archived_at: null,
    is_current: true,
  }];
  const archs = await db.query.baPdfArchives.findMany({
    where: and(eq(schema.baPdfArchives.tier, 'ppk'), eq(schema.baPdfArchives.submissionId, submissionId)),
  });
  for (const a of archs) {
    if (a.version === sub.version) continue;
    // K2 (review-T9, preventif): arsip non-FINAL tak ditampilkan (hari ini
    // arsip hanya lahir dari FINAL/FINAL_NOL — filter ini pengaman masa depan).
    if (a.status !== 'FINAL' && a.status !== 'FINAL_NOL') continue;
    out.push({
      version: a.version,
      status: a.status,
      pdf_hash: a.pdfHash,
      content_hash: a.contentHash,
      verify_url: buildBaVerifyPayload({ type: 'ppk', id: submissionId, version: a.version, hash: a.contentHash }),
      archived_at: a.archivedAt,
      is_current: false,
    });
  }
  out.sort((x, y) => x.version - y.version);
  return out;
}

export async function listBranchBaVersions(submissionId: string): Promise<BaVersionItem[]> {
  const sub = await db.query.branchSubmissions.findFirst({
    where: eq(schema.branchSubmissions.id, submissionId),
  });
  if (!sub) throw Errors.VALIDATION_ERROR('Setoran ranting tidak ditemukan');
  const liveHash = baContentHash('branch', branchContentSnapshot(sub));
  const out: BaVersionItem[] = [{
    version: sub.version,
    status: sub.status,
    pdf_hash: sub.pdfHash,
    content_hash: liveHash,
    verify_url: buildBaVerifyPayload({ type: 'branch', id: sub.id, version: sub.version, hash: liveHash }),
    archived_at: null,
    is_current: true,
  }];
  const archs = await db.query.baPdfArchives.findMany({
    where: and(eq(schema.baPdfArchives.tier, 'branch'), eq(schema.baPdfArchives.submissionId, submissionId)),
  });
  for (const a of archs) {
    if (a.version === sub.version) continue;
    // K2 (review-T9, preventif): arsip non-FINAL tak ditampilkan.
    if (a.status !== 'FINAL' && a.status !== 'FINAL_NOL') continue;
    out.push({
      version: a.version,
      status: a.status,
      pdf_hash: a.pdfHash,
      content_hash: a.contentHash,
      verify_url: buildBaVerifyPayload({ type: 'branch', id: submissionId, version: a.version, hash: a.contentHash }),
      archived_at: a.archivedAt,
      is_current: false,
    });
  }
  out.sort((x, y) => x.version - y.version);
  return out;
}
