// WhatsApp Notification Service
// Integrates with WhatsApp Business API (Meta Graph API)
// and logs all messages to the Notification table.

import { db } from '../config/database';
import * as schema from '../database/schema';
import { config } from '../config/env';
import { addWhatsAppJob } from './queues';

interface WhatsAppResponse {
  message_id: string;
  status: 'SENT' | 'FAILED';
}

// WhatsApp Business API configuration
const WA_API_URL = config.WA_BUSINESS_API_URL || 'https://graph.facebook.com/v18.0';
const PHONE_NUMBER_ID = config.WA_PHONE_NUMBER_ID;
const ACCESS_TOKEN = config.WA_ACCESS_TOKEN;

/**
 * Format phone number to WhatsApp international format (62xxx)
 */
function formatPhoneNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  }
  if (!digits.startsWith('62')) {
    digits = '62' + digits;
  }
  return digits;
}

/**
 * Construct Indonesian thank-you message for can collection
 */
function buildCollectionMessage(
  ownerName: string,
  nominal: number | bigint,
  officerName: string,
  collectedAt?: string,
  isResubmit: boolean = false
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

  let message = `Assalamu'alaikum, Bapak/Ibu ${ownerName}.
Kami dari Lazisnu telah menjemput kotak infaq/sodaqoh Bapak/Ibu.
Nominal yang diterima: ${formattedAmount}
Tanggal: ${dateStr}
Jazakumullahu khairan.`;

  if (isResubmit) {
    message += '\nCatatan: Pesan ini menggantikan pesan sebelumnya sebagai data yang berlaku.';
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
  }
): Promise<any> {
  console.log(`[WhatsApp Service] Queueing notification to ${phone}`);
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
  }
): Promise<WhatsAppResponse> {
  const formattedPhone = formatPhoneNumber(phone);
  const messageContent = buildCollectionMessage(ownerName, nominal, officerName, options?.collectedAt, options?.isResubmit);

  let result: WhatsAppResponse;

  // Development mode: skip actual API call
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.log(`[WhatsApp Dev] To: ${formattedPhone}`);
    console.log(`[WhatsApp Dev] Message:\n${messageContent}`);
    result = {
      message_id: `dev-${Date.now()}`,
      status: 'SENT',
    };
  } else {
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
          type: 'text',
          text: { body: messageContent },
        }),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        console.error('WhatsApp API Error:', data);
        throw new Error(data.error?.message || 'WhatsApp API request failed');
      }

      result = {
        message_id: data.messages?.[0]?.id || `wa-${Date.now()}`,
        status: 'SENT',
      };
    } catch (error) {
      console.error('WhatsApp send error:', error);
      result = {
        message_id: `failed-${Date.now()}`,
        status: 'FAILED',
      };
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
    console.error('Failed to log WhatsApp notification to DB:', dbError);
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

  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.log(`[WhatsApp Dev] Template: ${templateName} → ${formattedPhone}`, variables);
    return { message_id: `dev-${Date.now()}`, status: 'SENT' };
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
      throw new Error(data.error?.message || 'Template API request failed');
    }

    result = {
      message_id: data.messages?.[0]?.id || `wa-${Date.now()}`,
      status: 'SENT',
    };
  } catch (error) {
    console.error('WhatsApp template error:', error);
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
    console.error('Failed to log template notification to DB:', dbError);
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
      console.error('Failed to enqueue bulk message:', err);
    }
  }

  return { enqueued };
}

export default {
  sendWhatsAppNotification,
  sendTemplateMessage,
  sendBulkNotifications,
};