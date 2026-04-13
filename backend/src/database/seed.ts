import 'dotenv/config';
import { db } from '../config/database';
import * as schema from './schema';
import * as bcrypt from 'bcryptjs';

async function main() {
  console.log('Seeding database...');

  // 1. Create District (Kecamatan)
  const [district] = await db.insert(schema.districts).values({
    name: 'Kecamatan Paninggaran',
    code: 'PNG',
    regionCode: '33.26',
  }).returning();
  console.log(`Created District: ${district.name}`);

  // 2. Create Branches (Ranting / Kelurahan)
  const branchNames = [
    'Ranting Paninggaran',
    'Ranting Sawangan',
    'Ranting Domiyang',
    'Ranting Kaliombo',
    'Ranting Botosari'
  ];

  const branches = await Promise.all(
    branchNames.map((name, index) => 
      db.insert(schema.branches).values({
        districtId: district.id,
        name,
        code: `PNG-${String(index + 1).padStart(2, '0')}`,
      }).returning().then(res => res[0])
    )
  );
  console.log(`Created ${branches.length} Branches`);

  // 3. Create Admin Kecamatan
  const passwordHash = await bcrypt.hash('admin123', 10);
  const [adminKec] = await db.insert(schema.users).values({
    email: 'admin.paninggaran@lazisnu.id',
    phone: '081234567890',
    passwordHash,
    fullName: 'Admin MWC NU Paninggaran',
    role: 'ADMIN_KECAMATAN',
    districtId: district.id,
  }).returning();
  console.log(`Created Admin Kecamatan: ${adminKec.email}`);

  // 4. Create Admin Ranting for first branch
  const [adminRanting] = await db.insert(schema.users).values({
    email: 'admin.sawangan@lazisnu.id',
    phone: '081234567891',
    passwordHash,
    fullName: 'Admin Ranting Sawangan',
    role: 'ADMIN_RANTING',
    districtId: district.id,
    branchId: branches[1].id,
  }).returning();
  console.log(`Created Admin Ranting: ${adminRanting.email}`);

  // 5. Create Petugas for first branch
  const [userPetugas] = await db.insert(schema.users).values({
    email: 'petugas01@lazisnu.id',
    phone: '081234567892',
    passwordHash,
    fullName: 'Ahmad Petugas',
    role: 'PETUGAS',
    districtId: district.id,
    branchId: branches[1].id,
  }).returning();

  const [officer] = await db.insert(schema.officers).values({
    userId: userPetugas.id,
    districtId: district.id,
    branchId: branches[1].id,
    employeeCode: 'PNG-02-0001',
    fullName: 'Ahmad Petugas',
    phone: '081234567892',
    assignedZone: 'Dusun 1 Sawangan',
  }).returning();
  console.log(`Created Petugas: ${officer.fullName}`);

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
