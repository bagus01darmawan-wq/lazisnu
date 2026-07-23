import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { sendWhatsAppNotificationSync } from '../services/whatsapp';
import { db } from '../config/database';
import * as schema from '../database/schema';

/**
 * Worker to process WhatsApp notifications
 */
export const whatsappWorker = new Worker(
  'whatsapp-notifications',
  async (job: Job) => {
    const { phone, ownerName, nominal, officerName, ...options } = job.data;
    
    console.log(`[Worker] Processing WhatsApp job ${job.id}`);
    
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
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

whatsappWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);

  if (job && job.attemptsMade >= (job.opts.attempts || 1)) {
    const { phone, ownerName, nominal, officerName, collectionId } = job.data;
    const formattedPhone = phone;
    const formattedAmount = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(BigInt(nominal));
    const messageContent = `Notifikasi gagal: ${formattedAmount}`;

    db.insert(schema.notifications).values({
      collectionId: collectionId ?? null,
      recipientPhone: formattedPhone,
      recipientName: ownerName,
      messageTemplate: 'collection_receipt',
      messageContent,
      status: 'FAILED',
      errorMessage: err.message || 'Provider rejected or could not deliver the message',
    }).catch(() => {});
  }
});

console.log('🚀 WhatsApp Worker initialized and ready.');

export default whatsappWorker;
