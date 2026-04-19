
const { db } = require('./apps/backend/src/config/database');
const schema = require('./apps/backend/src/database/schema');

async function checkUsers() {
  try {
    const users = await db.query.users.findMany();
    console.log(JSON.stringify(users, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

checkUsers();
