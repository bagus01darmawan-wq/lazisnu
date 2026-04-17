import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';

// Define the WhatsApp Notification Queue
export const whatsappQueue = new Queue('whatsapp-notifications', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5 seconds initial delay
    },
    removeOnComplete: true, // Keep it clean
    removeOnFail: false,   // Keep failed jobs for debugging
  },
});

/**
 * Add a WhatsApp notification job to the queue
 */
export async function addWhatsAppJob(data: {
  phone: string;
  ownerName: string;
  nominal: number | bigint;
  officerName: string;
  collectionId?: string;
  collectedAt?: string;
  isResubmit?: boolean;
}) {
  // Convert nominal to string if it's a bigint for serializability
  const jobData = {
    ...data,
    nominal: data.nominal.toString(),
  };

  return whatsappQueue.add('send-notification', jobData);
}

export default {
  whatsappQueue,
  addWhatsAppJob,
};
