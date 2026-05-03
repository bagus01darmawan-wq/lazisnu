import { db } from '../apps/backend/src/config/database';
import * as schema from '../apps/backend/src/database/schema';
import { ilike, eq } from 'drizzle-orm';

async function checkBotosari() {
  const branches = await db.select().from(schema.branches).where(ilike(schema.branches.name, '%Botosari%'));
  console.log('--- BRANCHES ---');
  console.table(branches);

  if (branches.length > 0) {
    const branchId = branches[0].id;
    const dukuhs = await db.select().from(schema.dukuhs).where(eq(schema.dukuhs.branchId, branchId));
    console.log('\n--- DUKUHS IN BOTOSARI ---');
    console.table(dukuhs);
  }
}

checkBotosari().then(() => process.exit());
