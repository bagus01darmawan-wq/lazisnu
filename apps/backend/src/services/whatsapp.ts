// WhatsApp Notification Service
// Integrates with WhatsApp Business API (Meta Graph API)
// and logs all messages to the Notification table.

import { db } from '../config/database';
import * as schema from '../database/schema';
import { config } from '../config/env';
import { addWhatsAppJob } from './queues';
import { Errors } from '../utils/errorCatalog';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { normalizePhoneTo62 } from '../utils/phone';

interface WhatsAppResponse {
  message_id: string;
  status: 'SENT' | 'FAILED';
}

const WA_PROVIDER = config.WA_PROVIDER;
const WA_API_URL = config.WA_BUSINESS_API_URL || (WA_PROVIDER === 'fonnte' ? 'https://api.fonnte.com' : 'https://graph.facebook.com/v18.0');
const PHONE_NUMBER_ID = config.WA_PHONE_NUMBER_ID;
const ACCESS_TOKEN = config.WA_ACCESS_TOKEN;

/**
 * Format phone number to WhatsApp international format (62xxx).
 * Delegasi ke util bersama (dipakai juga untuk lookup OTP/login).
 */
const formatPhoneNumber = normalizePhoneTo62;

/**
 * Construct Indonesian thank-you message for can collection
 */
function buildCollectionMessage(
  ownerName: string,
  nominal: number | bigint,
  officerName: string,
  collectedAt?: string,
  isResubmit: boolean = false,
  branchName?: string
): string {
  const dateStr = new Date(collectedAt || Date.now()).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const formattedAmount = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(BigInt(nominal));

  const branchDisplay = branchName ? `Ranting ${branchName}` : '';
  let message = `_*Assalamualaikum warahmatullahi wabarakatuh*_, Bapak/Ibu *${ownerName}*.

Kami dari Lazisnu ${branchDisplay}`.trim() + ` telah menjemput kotak infaq/sodaqoh Bapak/Ibu.
Nominal yang diterima: *${formattedAmount}*
Tanggal: _${dateStr}_

Semoga  setiap rupiah yang disedekahkan menjadi amal jariyah, membawa keberkahan, serta diganti dengan rezeki yang berlipat ganda oleh Allah SWT. _Jazakumullahu khairan._`;

  if (isResubmit) {
    message += '\n\n_*Catatan:* Pesan ini menggantikan pesan sebelumnya sebagai data yang berlaku._';
  }

  return message;
}

/**
 * Public function to queue a WhatsApp notification (Asynchronous)
 */
export async function sendWhatsAppNotification(
  phone: string,
  ownerName: string,
  nominal: number | bigint,
  officerName: string,
  options?: {
    collectionId?: string;
    collectedAt?: string;
    isResubmit?: boolean;
    branchName?: string;
  }
): Promise<any> {
  return addWhatsAppJob({
    phone,
    ownerName,
    nominal,
    officerName,
    ...options
  });
}

/**
 * Internal function to actually send the API request (Synchronous)
 * Used by BullMQ Worker.
 */
export async function sendWhatsAppNotificationSync(
  phone: string,
  ownerName: string,
  nominal: number | bigint,
  officerName: string,
  options?: {
    collectionId?: string;
    collectedAt?: string;
    isResubmit?: boolean;
    branchName?: string;
  }
): Promise<WhatsAppResponse> {
  const formattedPhone = formatPhoneNumber(phone);
  const messageContent = buildCollectionMessage(
    ownerName, 
    nominal, 
    officerName, 
    options?.collectedAt, 
    options?.isResubmit,
    options?.branchName
  );

  let result: WhatsAppResponse;

  // Development mode: skip actual API call
  if ((WA_PROVIDER === 'fonnte' && !ACCESS_TOKEN) || (WA_PROVIDER !== 'fonnte' && (!PHONE_NUMBER_ID || !ACCESS_TOKEN))) {
    logger.info('WhatsApp notification queued in dry-run mode');
    result = {
      message_id: `dev-${Date.now()}`,
      status: 'SENT',
    };
  } else {
    try {
      const isFonnte = WA_PROVIDER === 'fonnte';
      let response: globalThis.Response;

      if (isFonnte) {
        response = await fetch(`${WA_API_URL}/send`, {
          method: 'POST',
          headers: {
            Authorization: ACCESS_TOKEN!,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            target: formattedPhone,
            message: messageContent,
            countryCode: '0',
          }),
        });
      } else {
        response = await fetch(`${WA_API_URL}/${PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: formattedPhone,
            type: 'text',
            text: { body: messageContent },
          }),
        });
      }

      const data = await response.json() as any;

      if (!response.ok || (isFonnte && (data.status === false || data.Status === false))) {
        logger.error({ waResponse: data }, 'WhatsApp API error');
        throw Errors.WA_SEND_FAILED(data.error?.message || data.reason || 'WhatsApp API request failed');
      }

      result = {
        message_id: isFonnte ? (data.id?.[0] || data.id || `fn-${Date.now()}`) : (data.messages?.[0]?.id || `wa-${Date.now()}`),
        status: 'SENT',
      };
    } catch (error) {
      // FAILED log dipindahkan ke worker (whatsapp.worker.ts) agar hanya dicatat 1x di attempt terakhir (P2-C)
      throw error;
    }
  }

  // Always log to Notification table
  try {
    await db.insert(schema.notifications).values({
        collectionId: options?.collectionId ?? null,
        recipientPhone: formattedPhone,
        recipientName: ownerName,
        messageTemplate: 'collection_receipt',
        messageContent,
        status: result.status,
        sentAt: result.status === 'SENT' ? new Date() : null,
        waMessageId: result.status === 'SENT' ? result.message_id : null,
        errorMessage: result.status === 'FAILED' ? `Failed to send: ${result.message_id}` : null,
    });
  } catch (dbError) {
    // Log DB error but don't fail the main operation
    logger.error({ err: dbError }, 'Failed to log WhatsApp notification to DB');
  }

  return result;
}

/**
 * Send a template-based WhatsApp message
 */
export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  variables: Record<string, string>,
  collectionId?: string
): Promise<WhatsAppResponse> {
  const formattedPhone = formatPhoneNumber(phone);

  if ((WA_PROVIDER === 'fonnte' && !ACCESS_TOKEN) || (WA_PROVIDER !== 'fonnte' && (!PHONE_NUMBER_ID || !ACCESS_TOKEN))) {
    logger.info({ templateName, phone: formattedPhone, variables }, 'WhatsApp template dry-run');
    return { message_id: `dev-${Date.now()}`, status: 'SENT' };
  }

  if (WA_PROVIDER === 'fonnte') {
    throw new AppError('UNSUPPORTED_OPERATION', 'Template message tidak didukung oleh Fonnte provider. Gunakan Meta.', 400, false);
  }

  let result: WhatsAppResponse;

  try {
    const response = await fetch(`${WA_API_URL}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'id' },
          components: [
            {
              type: 'body',
              parameters: Object.values(variables).map((v) => ({ type: 'text', text: v })),
            },
          ],
        },
      }),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      throw Errors.WA_SEND_FAILED(data.error?.message || 'Template API request failed');
    }

    result = {
      message_id: data.messages?.[0]?.id || `wa-${Date.now()}`,
      status: 'SENT',
    };
  } catch (error) {
    logger.error({ err: error }, 'WhatsApp template send failed');
    result = { message_id: `failed-${Date.now()}`, status: 'FAILED' };
  }

  // Log to DB
  try {
    await db.insert(schema.notifications).values({
        collectionId: collectionId ?? null,
        recipientPhone: formattedPhone,
        messageTemplate: templateName,
        messageContent: JSON.stringify(variables),
        status: result.status,
        sentAt: result.status === 'SENT' ? new Date() : null,
        waMessageId: result.status === 'SENT' ? result.message_id : null,
        errorMessage: result.status === 'FAILED' ? `Template send failed` : null,
    });
  } catch (dbError) {
    logger.error({ err: dbError }, 'Failed to log template notification to DB');
  }

  return result;
}

/**
 * Send bulk WhatsApp notifications with rate limiting (1 per second)
 */
export function getWhatsAppQueue() {
  const { whatsappQueue } = require('./queues');
  return whatsappQueue;
}

export async function sendBulkNotifications(
  messages: Array<{
    phone: string;
    ownerName: string;
    nominal: number | bigint;
    officerName: string;
    collectionId?: string;
    collectedAt?: string;
  }>
): Promise<{ enqueued: number }> {
  let enqueued = 0;

  for (const msg of messages) {
    try {
      await sendWhatsAppNotification(
        msg.phone,
        msg.ownerName,
        msg.nominal,
        msg.officerName,
        { collectionId: msg.collectionId, collectedAt: msg.collectedAt }
      );
      enqueued++;
    } catch (err) {
      logger.error({ err }, 'Failed to enqueue bulk message');
    }
  }

  return { enqueued };
}

export default {
  sendWhatsAppNotification,
  sendTemplateMessage,
  sendBulkNotifications,
  sendOtpMessage,
};

/**
 * Kirim pesan OTP via WhatsApp Business API.
 * DIPANGGIL LANGSUNG (bukan via queue) — OTP time-sensitive (TTL 5 menit).
 * OTP TIDAK PERNAH di-log.
 */
export async function sendOtpMessage(
  phone: string,
  otp: string,
): Promise<WhatsAppResponse> {
  const formattedPhone = formatPhoneNumber(phone);
  const messageContent = `Kode OTP Lazisnu Anda: *${otp}*\n\nKode berlaku 5 menit. JANGAN berikan kode ini kepada siapa pun, termasuk pihak Lazisnu.`;

  // Development mode: skip actual API call
  if ((WA_PROVIDER === 'fonnte' && !ACCESS_TOKEN) || (WA_PROVIDER !== 'fonnte' && (!PHONE_NUMBER_ID || !ACCESS_TOKEN))) {
    logger.info({ phone: formatPhoneNumber(phone).slice(0, 6) + '***' }, 'OTP dry-run (tidak dikirim)');
    return { message_id: `dev-otp-${Date.now()}`, status: 'SENT' };
  }

  try {
    const isFonnte = WA_PROVIDER === 'fonnte';
    let response: globalThis.Response;

    if (isFonnte) {
      response = await fetch(`${WA_API_URL}/send`, {
        method: 'POST',
        headers: {
          Authorization: ACCESS_TOKEN!,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          target: formattedPhone,
          message: messageContent,
          countryCode: '0',
        }),
      });
    } else {
      response = await fetch(`${WA_API_URL}/${PHONE_NUMBER_ID}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'text',
          text: { body: messageContent },
        }),
      });
    }

    const data = await response.json() as any;

    if (!response.ok || (isFonnte && (data.status === false || data.Status === false))) {
      // TIDAK LOG OTP — hanya catat metadata
      logger.error({ phone: formatPhoneNumber(phone).slice(0, 6) + '***', waResponse: { status: data.status, error: data.reason } }, 'OTP WhatsApp API error');
      return { message_id: `otp-failed-${Date.now()}`, status: 'FAILED' };
    }

    return {
      message_id: isFonnte ? (data.id?.[0] || data.id || `otp-fn-${Date.now()}`) : (data.messages?.[0]?.id || `otp-wa-${Date.now()}`),
      status: 'SENT',
    };
  } catch (error) {
    logger.error({ phone: formatPhoneNumber(phone).slice(0, 6) + '***', err: error }, 'OTP send exception');
    return { message_id: `otp-error-${Date.now()}`, status: 'FAILED' };
  }
}