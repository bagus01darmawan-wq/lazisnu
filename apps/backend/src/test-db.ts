import 'dotenv/config';
import { db } from './config/database';
import { users } from './database/schema';
import { eq } from 'drizzle-orm';

async function test() {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, 'admin.paninggaran@lazisnu.id')
    });
    console.log("User:", user?.email, user?.role);
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit();
}

test();
