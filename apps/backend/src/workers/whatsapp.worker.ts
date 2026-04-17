import { Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { sendWhatsAppNotificationSync } from '../services/whatsapp';

/**
 * Worker to process WhatsApp notifications
 */
export const whatsappWorker = new Worker(
  'whatsapp-notifications',
  async (job: Job) => {
    const { phone, ownerName, nominal, officerName, ...options } = job.data;
    
    console.log(`[Worker] Processing WhatsApp to ${phone} (Job ID: ${job.id})`);
    
    // We call the 'Sync' version of the service which does the actual API call
    // Note: nominal is passed as string from queue, converted back
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
    // Rate limit: 2 messages per second (1000ms)
    limiter: {
      max: 2,
      duration: 1000,
    },
    concurrency: 1, // Process one by one to respect rate limit precisely
  }
);

// Event listeners for monitoring
whatsappWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

whatsappWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});

console.log('🚀 WhatsApp Worker initialized and ready.');

export default whatsappWorker;
