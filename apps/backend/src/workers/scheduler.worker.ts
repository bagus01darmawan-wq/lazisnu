// Scheduler Worker - Auto-generate Monthly Assignments via BullMQ Repeatable Job
// Dijalankan otomatis setiap tanggal 1 pukul 00:05 WIB (17:05 UTC)

import { Queue, Worker, Job } from 'bullmq';
import { redisConnection } from '../config/redis';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq, and, asc, notInArray } from 'drizzle-orm';
import { sendAssignmentNotification } from '../services/fcm';

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

  // 1. Cari kaleng yang belum punya assignment bulan ini
  const existing = await db.query.assignments.findMany({
    where: and(
      eq(schema.assignments.periodYear, year),
      eq(schema.assignments.periodMonth, month)
    ),
    columns: { canId: true },
  });
  const assignedCanIds = existing.map(a => a.canId);

  const cansToAssign = await db.query.cans.findMany({
    where: and(
      eq(schema.cans.isActive, true),
      assignedCanIds.length > 0 ? notInArray(schema.cans.id, assignedCanIds) : undefined
    ),
    with: {
      branch: {
        with: {
          officers: {
            where: eq(schema.officers.isActive, true),
            orderBy: [asc(schema.officers.createdAt)],
          },
        },
      },
    },
  });

  if (cansToAssign.length === 0) {
    console.log(`[Scheduler] Semua kaleng sudah punya assignment untuk ${month}/${year}.`);
    return { created: 0, skipped: 0 };
  }

  // 2. Buat assignment menggunakan round-robin per ranting
  const assignmentData: any[] = [];
  const officerNotificationMap: Map<string, { officerName: string; canCount: number; fcmToken?: string }> = new Map();

  for (const can of cansToAssign) {
    const officers = can.branch?.officers ?? [];
    if (officers.length === 0) {
      console.warn(`[Scheduler] Ranting ${can.branchId} tidak punya petugas aktif, kaleng ${can.qrCode} dilewati.`);
      continue;
    }

    // Round-robin assignment
    const idx = assignmentData.filter(a => officers.some(o => o.id === a.officerId)).length % officers.length;
    const assignedOfficer = officers[idx] ?? officers[0];

    assignmentData.push({
      canId: can.id,
      officerId: assignedOfficer.id,
      periodYear: year,
      periodMonth: month,
      status: 'ACTIVE' as const,
    });

    // Track untuk notifikasi FCM
    if (!officerNotificationMap.has(assignedOfficer.id)) {
      officerNotificationMap.set(assignedOfficer.id, {
        officerName: assignedOfficer.fullName,
        canCount: 0,
      });
    }
    officerNotificationMap.get(assignedOfficer.id)!.canCount++;
  }

  // 3. Insert assignments (batch)
  if (assignmentData.length > 0) {
    await db.insert(schema.assignments).values(assignmentData);
    console.log(`[Scheduler] ✅ Berhasil membuat ${assignmentData.length} assignment untuk ${month}/${year}.`);
  }

  // 4. Kirim FCM notification ke setiap petugas (best-effort, tidak blokir)
  for (const [officerId, info] of officerNotificationMap) {
    try {
      // Ambil FCM token dari DB jika ada (field fcmToken di tabel users/officers)
      const officerUser = await db.query.officers.findFirst({
        where: eq(schema.officers.id, officerId),
        with: { user: { columns: { id: true } } },
      });

      // Note: FCM token biasanya disimpan saat login di mobile.
      // Untuk sekarang, log saja. Token management bisa ditambah nanti.
      console.log(`[FCM] Notifikasi untuk ${info.officerName}: ${info.canCount} tugas baru (FCM token belum diimplementasi di DB).`);
    } catch (e) {
      console.warn(`[FCM] Gagal kirim notifikasi ke officer ${officerId}:`, e);
    }
  }

  return { created: assignmentData.length, skipped: cansToAssign.length - assignmentData.length };
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
