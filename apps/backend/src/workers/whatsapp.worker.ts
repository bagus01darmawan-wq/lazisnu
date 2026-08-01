import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { sendWhatsAppNotificationSync } from '../services/whatsapp';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { logger } from '../config/logger';

/**
 * Worker to process WhatsApp notifications
 */
export const whatsappWorker = new Worker(
  'whatsapp-notifications',
  async (job: Job) => {
    const { phone, ownerName, nominal, officerName, ...options } = job.data;
    
    logger.info({ jobId: job.id }, 'Processing WhatsApp job');
    
    return sendWhatsAppNotificationSync(
        phone, 
        ownerName, 
        BigInt(nominal), 
        officerName, 
        options
    );
  },
  {
    connection: redisConnection,
    limiter: {
      max: 2,
      duration: 1000,
    },
    concurrency: 1,
  }
);

whatsappWorker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'WhatsApp job completed');
});

whatsappWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, errMsg: err.message }, 'WhatsApp job failed');
  if (job) {
    void handleJobFailure(job, err);
  }
});

/**
 * Catat kegagalan job ke tabel notifications — HANYA pada attempt terakhir
 * (attemptsMade >= opts.attempts). Retry BullMQ memicu event 'failed' berulang,
 * tapi baris FAILED hanya boleh muncul 1x per job (P2-C3).
 */
export async function handleJobFailure(job: Job, err?: Error): Promise<void> {
  if (job.attemptsMade >= (job.opts.attempts || 1)) {
    const { phone, ownerName, nominal, officerName, collectionId } = job.data;
    const formattedPhone = phone;
    const formattedAmount = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(BigInt(nominal));
    const messageContent = `Notifikasi gagal: ${formattedAmount}`;

    await db.insert(schema.notifications).values({
      collectionId: collectionId ?? null,
      recipientPhone: formattedPhone,
      recipientName: ownerName,
      messageTemplate: 'collection_receipt',
      messageContent,
      status: 'FAILED',
      errorMessage: err?.message || 'Provider rejected or could not deliver the message',
    }).catch(() => {});
  }
}

logger.info('WhatsApp Worker initialized and ready');

export default whatsappWorker;
