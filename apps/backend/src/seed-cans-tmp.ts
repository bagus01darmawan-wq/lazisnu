import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env
dotenv.config({ path: resolve(process.cwd(), '.env') });

async function seedCans() {
  console.log('--- Seeding Simulation Cans ---');
  console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
  
  const { db } = await import('./config/database');
  const schema = await import('./database/schema');
  const { eq } = await import('drizzle-orm');

  // 1. Find a branch
  const branches = await db.select().from(schema.branches).limit(5);
  if (branches.length === 0) {
    console.log('No branches found. Please create a branch first.');
    return;
  }
  
  const branch = branches[0];
  console.log(`Using branch: ${branch.name} (${branch.id})`);
  
  // 2. Insert simulation cans
  const cansToInsert = [
    {
      qrCode: `LZNU-${branch.code}-00001`,
      branchId: branch.id,
      ownerName: 'H. Ahmad Fauzi',
      ownerPhone: '081234567890',
      ownerAddress: 'Jl. Mawar No. 10, RT 01/02',
      totalCollected: BigInt(50000),
      collectionCount: 2,
    },
    {
      qrCode: `LZNU-${branch.code}-00002`,
      branchId: branch.id,
      ownerName: 'Ibu Siti Aminah',
      ownerPhone: '081298765432',
      ownerAddress: 'Dusun Krajan RT 05/01',
      totalCollected: BigInt(25000),
      collectionCount: 1,
    },
    {
      qrCode: `LZNU-${branch.code}-00003`,
      branchId: branch.id,
      ownerName: 'Bapak Bambang',
      ownerPhone: '081311223344',
      ownerAddress: 'Perum Asri Blok C-12',
      totalCollected: BigInt(0),
      collectionCount: 0,
    }
  ];
  
  for (const can of cansToInsert) {
    try {
      const existing = await db.query.cans.findFirst({
        where: eq(schema.cans.qrCode, can.qrCode)
      });
      
      if (!existing) {
        await db.insert(schema.cans).values(can as any);
        console.log(`✅ Inserted can: ${can.qrCode} for ${can.ownerName}`);
      } else {
        console.log(`ℹ️ Can ${can.qrCode} already exists.`);
      }
    } catch (err) {
      console.error(`❌ Failed to insert can ${can.qrCode}:`, err);
    }
  }
  
  process.exit(0);
}

seedCans();
