import { createHash } from 'node:crypto';
import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis';

// Define the WhatsApp Notification Queue
export const whatsappQueue = new Queue('whatsapp-notifications', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: 'exponential',
      delay: 3000, // 3→6→12→24→48→96→192→384→768 detik (~25.5 menit total)
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
  branchName?: string;
}) {
  // Convert nominal to string if it's a bigint for serializability
  const jobData = {
    ...data,
    nominal: data.nominal.toString(),
  };

  return whatsappQueue.add('send-notification', jobData, {
    ...(data.collectionId ? { jobId: `collection-${data.collectionId}` } : {}),
  });
}

/**
 * C1-T11 — Antrekan teks staf (fallback push). jobId deterministik per
 * (template, entity, user) agar sapuan ganda tak mengantre duplikat selagi
 * job masih menunggu; dedup lintas-waktu tetap via tabel notifications.
 *
 * M1 (backlog T11): jobId ikut hash ISI pesan — kirim ulang yang identik
 * tetap dedup (satu antrean), tetapi revisi alasan (isi berubah) menjadi
 * job baru sehingga pesan terbaru tidak ditelan dedup BullMQ.
 */
export function buildStaffJobId(data: { template: string; entityId: string; userId: string; body: string }): string {
  const contentHash = createHash('sha1').update(data.body, 'utf8').digest('hex').slice(0, 8);
  return `staff-${data.template}-${data.entityId}-${data.userId}-${contentHash}`;
}

export async function addStaffTextJob(data: {
  phone: string;
  body: string;
  template: string;
  entityId: string;
  userId: string;
}) {
  return whatsappQueue.add('send-text', data, {
    jobId: buildStaffJobId(data),
  });
}

export default {
  whatsappQueue,
  addWhatsAppJob,
};
