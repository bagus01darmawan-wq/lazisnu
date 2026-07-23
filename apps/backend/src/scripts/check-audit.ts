/**
 * Script diagnostik — jalankan dengan:
 * npx ts-node --project tsconfig.json src/scripts/check-audit.ts
 *
 * (Dari folder apps/backend)
 */
import { db } from '../config/database';
import * as schema from '../database/schema';
import { desc, ilike, or, gt, and, isNotNull } from 'drizzle-orm';

async function main() {
  console.log('🔍 Menghubungkan ke database...\n');

  // 1. Cek semua log yang berhubungan dengan resubmit/koreksi
  const resubmitLogs = await db.query.activityLogs.findMany({
    where: or(
      ilike(schema.activityLogs.actionType, '%resubmit%'),
      and(
        ilike(schema.activityLogs.entityType, 'collections'),
        isNotNull(schema.activityLogs.oldData),
        isNotNull(schema.activityLogs.newData),
      )
    ),
    orderBy: [desc(schema.activityLogs.createdAt)],
    limit: 10,
    with: {
      user: { columns: { fullName: true, role: true } },
      officer: { columns: { fullName: true } },
    },
  });

  console.log('=== LOG KOREKSI / RESUBMIT ===');
  if (resubmitLogs.length === 0) {
    console.log('❌ TIDAK ADA log koreksi di database!');
    console.log('   → Kemungkinan: koreksi belum berhasil, atau auditLogger tidak berjalan.\n');
  } else {
    console.log(`✅ Ditemukan ${resubmitLogs.length} log:\n`);
    for (const log of resubmitLogs) {
      const old = log.oldData as any;
      const newD = log.newData as any;
      console.log(`  Aksi:    ${log.actionType}`);
      console.log(`  Operator: ${log.user?.fullName || log.officer?.fullName || 'Sistem'}`);
      console.log(`  Nominal: ${old?.nominal} → ${newD?.nominal}`);
      console.log(`  Waktu:   ${log.createdAt}`);
      console.log('  ---');
    }
  }

  // 2. Cek 5 log terbaru untuk pastikan audit logger aktif
  const recentLogs = await db.query.activityLogs.findMany({
    orderBy: [desc(schema.activityLogs.createdAt)],
    limit: 5,
  });

  console.log('\n=== 5 LOG TERBARU (semua jenis) ===');
  if (recentLogs.length === 0) {
    console.log('❌ Tabel activity_logs kosong total!');
  } else {
    for (const log of recentLogs) {
      console.log(`  [${log.createdAt?.toISOString()}] ${log.actionType} (${log.entityType})`);
    }
  }

  // 3. Cek apakah ada transaksi yang pernah dikoreksi (submit_sequence > 1)
  const corrected = await db.query.collections.findMany({
    where: gt(schema.collections.submitSequence, 1),
    orderBy: [desc(schema.collections.collectedAt)],
    limit: 5,
  });

  console.log('\n=== TRANSAKSI TERKOREKSI (submit_sequence > 1) ===');
  if (corrected.length === 0) {
    console.log('❌ Tidak ada transaksi yang submit_sequence > 1 di database.');
    console.log('   → Koreksi belum berhasil disimpan ke database sama sekali.\n');
  } else {
    console.log(`✅ Ditemukan ${corrected.length} transaksi:\n`);
    for (const c of corrected) {
      console.log(`  ID: ${c.id} | seq: ${c.submitSequence}`);
      console.log(`  Nominal: Rp ${Number(c.nominal).toLocaleString('id-ID')}`);
      console.log(`  Alasan: ${c.alasanResubmit || '(kosong)'}`);
      console.log('  ---');
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
