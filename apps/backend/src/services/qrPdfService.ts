/**
 * QR PDF Service — generate QR code + PDF untuk kaleng.
 *
 * Diekstrak dari admin/cans.ts (bulk-generate-qr, single generate-qr).
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import QRCode from 'qrcode';
import { signQRCode } from '../utils/qr';
import { uploadToR2, getSignedDownloadUrl } from './r2';
import { Errors } from '../utils/errorCatalog';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 40;
const MARGIN_Y = 40;
const COLUMNS = 2;
const ROWS = 5;
const QR_SIZE = 80;

const cellWidth = (A4_WIDTH - (MARGIN_X * 2)) / COLUMNS;
const cellHeight = (A4_HEIGHT - (MARGIN_Y * 2)) / ROWS;

export interface QRCanData {
  qrCode?: string | null;
  ownerName: string;
  dukuhName?: string | null;
  rt?: string | null;
  rw?: string | null;
}

/**
 * Generate single QR PDF untuk satu kaleng.
 * Return signedToken, qrDataUrl (PNG preview), dan PDF buffer + R2 URL.
 */
export async function generateSingleQRPDF(canId: string): Promise<{
  qr_code: string;
  signed_token: string;
  qr_image_url: string;
  print_url: string;
  r2_url: string | null;
}> {
  const can = await db.query.cans.findFirst({
    where: eq(schema.cans.id, canId),
    with: { branch: { columns: { code: true } }, dukuhDetails: { columns: { name: true } } },
  });

  if (!can) throw Errors.COLLECTION_NOT_FOUND('Kaleng tidak ditemukan');
  if (!can.qrCode) throw Errors.VALIDATION_ERROR('Kaleng tidak memiliki nomor QR');

  const qrCode = can.qrCode;
  const signedToken = signQRCode(qrCode);
  const qrDataUrl = await QRCode.toDataURL(signedToken, {
    width: 300, margin: 2, color: { dark: '#000000', light: '#ffffff' },
  });

  // Buat PDF A4 single label
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  const x = MARGIN_X;
  const y = A4_HEIGHT - MARGIN_Y - cellHeight;

  const qrPngBuffer = await QRCode.toBuffer(signedToken, { type: 'png', margin: 1, width: 100 });
  const qrImage = await pdfDoc.embedPng(qrPngBuffer);

  const qrX = x + 10;
  const qrY = y + cellHeight - QR_SIZE - 15;

  page.drawRectangle({
    x: x + 5, y: y + 5, width: cellWidth - 10, height: cellHeight - 10,
    borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1,
  });

  page.drawImage(qrImage, { x: qrX, y: qrY, width: QR_SIZE, height: QR_SIZE });

  const textX = qrX + QR_SIZE + 10;
  let textY = qrY + QR_SIZE - 10;

  page.drawText('KOTAK INFAQ LAZISNU', { x: textX, y: textY, size: 10, font: fontBold, color: rgb(0, 0.5, 0) });
  textY -= 15;
  page.drawText(can.ownerName.substring(0, 25), { x: textX, y: textY, size: 11, font: fontBold });
  textY -= 15;
  page.drawText(`ID: ${can.qrCode}`, { x: textX, y: textY, size: 8, font: font });
  textY -= 12;

  const dukuh = can.dukuhDetails?.name || can.dukuh || '';
  const addressText = `${dukuh} RT ${can.rt || '-'} / RW ${can.rw || '-'}`;
  page.drawText(addressText.substring(0, 35), { x: textX, y: textY, size: 8, font: font });

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  // Upload ke R2
  let r2SignedUrl: string | undefined;
  try {
    const branchCode = can.branch?.code || 'XX';
    const r2Result = await uploadToR2({
      key: `qr-pdfs/${branchCode}/qr-${qrCode}-${Date.now()}.pdf`,
      body: pdfBuffer,
      contentType: 'application/pdf',
    });
    if (r2Result.success && r2Result.key) {
      r2SignedUrl = await getSignedDownloadUrl(r2Result.key) || undefined;
    }
  } catch (_) {
    // R2 fallback: gunakan base64
  }

  let printUrl = r2SignedUrl || '';
  if (!printUrl) {
    printUrl = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;
  }

  return {
    qr_code: qrCode,
    signed_token: signedToken,
    qr_image_url: qrDataUrl,
    print_url: printUrl,
    r2_url: r2SignedUrl || null,
  };
}

/**
 * Generate batch QR PDF untuk banyak kaleng.
 * Return PDF buffer + R2 key.
 */
export async function generateBatchQRPDF(
  cans: Array<QRCanData>,
  branchCode: string,
): Promise<{ pdfBuffer: Buffer; r2Key: string }> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let itemIndexOnPage = 0;

  for (const can of cans) {
    if (!can.qrCode) continue;

    if (itemIndexOnPage === COLUMNS * ROWS) {
      page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      itemIndexOnPage = 0;
    }

    const col = itemIndexOnPage % COLUMNS;
    const row = Math.floor(itemIndexOnPage / COLUMNS);

    const x = MARGIN_X + (col * cellWidth);
    const y = A4_HEIGHT - MARGIN_Y - ((row + 1) * cellHeight);

    const signedToken = signQRCode(can.qrCode);
    const qrPngBuffer = await QRCode.toBuffer(signedToken, { type: 'png', margin: 1, width: 100 });
    const qrImage = await pdfDoc.embedPng(qrPngBuffer);

    const qrX = x + 10;
    const qrY = y + cellHeight - QR_SIZE - 15;

    page.drawRectangle({
      x: x + 5, y: y + 5, width: cellWidth - 10, height: cellHeight - 10,
      borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1,
    });

    page.drawImage(qrImage, { x: qrX, y: qrY, width: QR_SIZE, height: QR_SIZE });

    const textX = qrX + QR_SIZE + 10;
    let textY = qrY + QR_SIZE - 10;

    page.drawText('KOTAK INFAQ LAZISNU', { x: textX, y: textY, size: 10, font: fontBold, color: rgb(0, 0.5, 0) });
    textY -= 15;
    page.drawText(can.ownerName.substring(0, 25), { x: textX, y: textY, size: 11, font: fontBold });
    textY -= 15;
    page.drawText(`ID: ${can.qrCode}`, { x: textX, y: textY, size: 8, font: font });
    textY -= 12;

    const addressText = `${can.dukuhName || ''} RT ${can.rt || '-'} / RW ${can.rw || '-'}`;
    page.drawText(addressText.substring(0, 35), { x: textX, y: textY, size: 8, font: font });

    itemIndexOnPage++;
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBuffer = Buffer.from(pdfBytes);

  const timestamp = Date.now();
  const r2Key = `qr-pdfs/batch/${branchCode}/batch-${timestamp}.pdf`;

  await uploadToR2({
    key: r2Key,
    body: pdfBuffer,
    contentType: 'application/pdf',
  });

  return { pdfBuffer, r2Key };
}
