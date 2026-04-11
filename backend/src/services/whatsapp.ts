// WhatsApp Notification Service

import { config } from '../config/env';

interface WhatsAppMessage {
  phone: string;
  templateName: string;
  variables: Record<string, string>;
}

interface WhatsAppResponse {
  message_id: string;
  status: 'SENT' | 'FAILED';
}

// WhatsApp Business API configuration
const WA_API_URL = config.WA_BUSINESS_API_URL || 'https://graph.facebook.com/v18.0';
const PHONE_NUMBER_ID = config.WA_PHONE_NUMBER_ID;
const ACCESS_TOKEN = config.WA_ACCESS_TOKEN;

// Send WhatsApp notification
export async function sendWhatsAppNotification(
  phone: string,
  ownerName: string,
  amount: number,
  officerName: string,
  collectedAt?: string
): Promise<WhatsAppResponse> {
  // Format phone number (ensure 62 prefix for Indonesia)
  const formattedPhone = formatPhoneNumber(phone);

  // Construct message
  const message = constructThankYouMessage(ownerName, amount, officerName, collectedAt);

  // If no WA API configured, log and return success (for development)
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.log(`[WhatsApp Dev] Sending to ${formattedPhone}:`, message);
    return {
      message_id: `dev-${Date.now()}`,
      status: 'SENT',
    };
  }

  try {
    const response = await fetch(`${WA_API_URL}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: {
          body: message,
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('WhatsApp API Error:', result);
      throw new Error(result.error?.message || 'Failed to send WhatsApp message');
    }

    return {
      message_id: result.messages?.[0]?.id || `wa-${Date.now()}`,
      status: 'SENT',
    };
  } catch (error) {
    console.error('WhatsApp send error:', error);
    throw error;
  }
}

// Send template message
export async function sendTemplateMessage(
  phone: string,
  templateName: string,
  variables: Record<string, string>
): Promise<WhatsAppResponse> {
  const formattedPhone = formatPhoneNumber(phone);

  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.log(`[WhatsApp Dev] Template ${templateName} to ${formattedPhone}:`, variables);
    return {
      message_id: `dev-${Date.now()}`,
      status: 'SENT',
    };
  }

  try {
    const response = await fetch(`${WA_API_URL}/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
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
              parameters: Object.values(variables).map(v => ({ type: 'text', text: v })),
            },
          ],
        },
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to send template message');
    }

    return {
      message_id: result.messages?.[0]?.id || `wa-${Date.now()}`,
      status: 'SENT',
    };
  } catch (error) {
    console.error('Template send error:', error);
    throw error;
  }
}

// Format phone number for WhatsApp
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');

  // If starts with 0, replace with 62
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  }

  // If doesn't start with 62, add it
  if (!digits.startsWith('62')) {
    digits = '62' + digits;
  }

  return digits;
}

// Construct thank you message
function constructThankYouMessage(
  ownerName: string,
  amount: number,
  officerName: string,
  collectedAt?: string
): string {
  const dateStr = collectedAt
    ? new Date(collectedAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

  const formattedAmount = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);

  return `Assalamualaikum Warahmatullahi Wabarakatuh,

Terima kasih atas kebaikan dan kedermawanan Bapak/Ibu *${ownerName}*.

Kami informasikan bahwa infaq/sodaqoh dari kaleng kotak infaq Anda telah dijemput pada:

📅 Tanggal: ${dateStr}
💰 Nominal: *${formattedAmount}*
👤 Petugas: ${officerName}

Semogaamal baik Bapak/Ibu mendapatkan pahala yang berlimpah dari Allah SWT.

Jazakumullahu khairan,
LAZISNU

---
Pesan ini dikirim otomatis oleh sistem. Jika ada pertanyaan, silakan hubungi LAZISNU terdekat.`;
}

// Send notification to multiple recipients
export async function sendBulkNotifications(
  messages: WhatsAppMessage[]
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (const msg of messages) {
    try {
      await sendTemplateMessage(msg.phone, msg.templateName, msg.variables);
      succeeded++;
    } catch {
      failed++;
    }

    // Rate limiting - wait between messages
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return { succeeded, failed };
}

export default {
  sendWhatsAppNotification,
  sendTemplateMessage,
  sendBulkNotifications,
};