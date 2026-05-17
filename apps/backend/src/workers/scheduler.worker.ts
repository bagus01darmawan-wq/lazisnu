// Scheduler Worker - Auto-generate Monthly Assignments via BullMQ Repeatable Job
// Dijalankan otomatis setiap tanggal 1 pukul 00:05 WIB (17:05 UTC)

import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';
import { sendAssignmentNotification } from '../services/fcm';
import { findCansWithoutAssignment, buildRoundRobinAssignments, insertAssignments } from '../services/assignmentGenerator';

const SCHEDULER_QUEUE_NAME = 'lazisnu-scheduler';

// ── Queue ──────────────────────────────────────────────────────────────────────
export const schedulerQueue = new Queue(SCHEDULER_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 50,
  },
});

/**
 * Daftarkan cron job untuk auto-generate assignment bulanan.
 * Pattern: setiap tanggal 1 pukul 00:05 WIB (UTC+7 → 17:05 UTC sehari sebelumnya)
 * Menggunakan cron timezone-safe: "5 17 28-31 * *" digabung "5 17 1 * *"
 * Untuk kemudahan, gunakan: setiap tanggal 1 pukul 17:05 UTC
 */
export async function registerMonthlyAssignmentCron() {
  await schedulerQueue.upsertJobScheduler(
    'monthly-generate-assignments',
    { pattern: '5 17 1 * *' }, // Setiap tanggal 1 pukul 17:05 UTC (= 00:05 WIB)
    {
      name: 'generate-monthly-assignments',
      data: { triggeredBy: 'cron' },
    }
  );
  console.log('✅ [Scheduler] Monthly assignment cron job terdaftar: setiap tgl 1 pukul 00:05 WIB');
  
  // Cleanup Redis DLQ cron (Setiap Senin pukul 02:00)
  await schedulerQueue.upsertJobScheduler(
    'weekly-cleanup-redis-dlq',
    { pattern: '0 2 * * 1' },
    {
      name: 'cleanup-redis-dlq',
      data: { triggeredBy: 'cron' },
    }
  );
  console.log('✅ [Scheduler] Redis DLQ cleanup cron job terdaftar: setiap Senin pukul 02:00');
}

// ── Job Logic ──────────────────────────────────────────────────────────────────

async function generateMonthlyAssignments(year: number, month: number) {
  console.log(`[Scheduler] Memulai generate assignment untuk ${month}/${year}...`);

  const { cansToAssign } = await findCansWithoutAssignment(year, month);

  if (cansToAssign.length === 0) {
    console.log(`[Scheduler] Semua kaleng sudah punya assignment untuk ${month}/${year}.`);
    return { created: 0, skipped: 0 };
  }

  const assignmentData = buildRoundRobinAssignments(cansToAssign, year, month);
  const skipped = cansToAssign.length - assignmentData.length;

  const { created } = await insertAssignments(assignmentData);
  console.log(`[Scheduler] ✅ Berhasil membuat ${created} assignment untuk ${month}/${year}.`);

  // Kirim FCM notification ke setiap petugas (best-effort)
  const officerCanCount: Record<string, { officerName: string; canCount: number }> = {};
  for (const can of cansToAssign) {
    const officers = can.branch?.officers ?? [];
    if (officers.length === 0) continue;
    const idx = assignmentData.filter((a: any) => officers.some((o: any) => o.id === a.officerId)).length % officers.length;
    const assignedOfficer = officers[idx] ?? officers[0];
    if (!officerCanCount[assignedOfficer.id]) {
      officerCanCount[assignedOfficer.id] = { officerName: assignedOfficer.fullName, canCount: 0 };
    }
    officerCanCount[assignedOfficer.id].canCount++;
  }

  for (const [officerId, info] of Object.entries(officerCanCount)) {
    try {
      await db.query.officers.findFirst({
        where: eq(schema.officers.id, officerId),
        with: { user: { columns: { id: true } } },
      });
      console.log(`[FCM] Notifikasi untuk ${info.officerName}: ${info.canCount} tugas baru (FCM token belum diimplementasi di DB).`);
    } catch (e) {
      console.warn(`[FCM] Gagal kirim notifikasi ke officer ${officerId}:`, e);
    }
  }

  return { created, skipped };
}

// ── Worker ─────────────────────────────────────────────────────────────────────
export const schedulerWorker = new Worker(
  SCHEDULER_QUEUE_NAME,
  async (job: Job) => {
    console.log(`[Scheduler] Memproses job: ${job.name} (ID: ${job.id})`);

    if (job.name === 'generate-monthly-assignments') {
      const now = new Date();
      // Generate untuk bulan BERIKUTNYA (job jalan tgl 1, generate untuk bulan tsb)
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      const result = await generateMonthlyAssignments(year, month);
      console.log(`[Scheduler] Selesai: ${result.created} dibuat, ${result.skipped} dilewati.`);
      return result;
    } else if (job.name === 'cleanup-redis-dlq') {
      try {
        const { getWhatsAppQueue } = require('../services/whatsapp');
        const queue = getWhatsAppQueue();
        const gracePeriod = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
        await queue.clean(gracePeriod, 1000, 'failed');
        console.log(`[Scheduler] Selesai: Failed jobs older than 7 days cleaned up.`);
        return { success: true };
      } catch (e) {
        console.error('Failed to cleanup Redis DLQ', e);
        return { success: false };
      }
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

schedulerWorker.on('completed', (job, result) => {
  console.log(`[Scheduler] Job ${job.id} selesai:`, result);
});

schedulerWorker.on('failed', (job, err) => {
  console.error(`[Scheduler] Job ${job?.id} gagal: ${err.message}`);
});

console.log('🕐 Scheduler Worker diinisialisasi.');
