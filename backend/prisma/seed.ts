// Seed Data - Lazisnu Collector App
// Kecamatan Paninggaran, Kabupaten Pekalongan
// Jalankan dengan: npm run seed

import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ==========================================
// DATA DUKUH PER DESA (urutan abjad)
// Digunakan sebagai referensi assignedZone petugas
// ==========================================
export const DUKUH: Record<string, string[]> = {
  'Bedagung':     ['Bedagung', 'Bulupitu', 'Sijaha'],
  'Botosari':     ['Blanding', 'Gunung', 'Gunung Surat', 'Karang Gondang', 'Karang Nangka', 'Karang Tengah', 'Kauman', 'Keturan', 'Sijambu'],
  'Domiyang':     ['Kidul', 'Kramat', 'Langkob', 'Madendo', 'Pejarakan', 'Prapatan', 'Sabrang', 'Sedayu', 'Tanggulangin', 'Tumiyang I', 'Tumiyang II'],
  'Kaliboja':     ['Kali Genteng', 'Semboja Barat', 'Semboja Timur', 'Silemud'],
  'Kaliombo':     ['Donosari', 'Jolodoro', 'Kaliombo', 'Simparsari'],
  'Krandegan':    ['Jurang Kulon', 'Kidul', 'Kulon Kali', 'Pucung', 'Rata Gunung', 'Rata Masjid', 'Sirawan', 'Sirijan', 'Tarbu', 'Wetan Kali'],
  'Lambanggelun': ['Bojongireng', 'Dlimas', 'Mandelun', 'Panumbangan', 'Sasak', 'Sengang', 'Siberuk', 'Silereng', 'Simendem'],
  'Lumeneng':     ['Barakan', 'Jomparang', 'Kaliwisnu', 'Karangsari', 'Krajan', 'Kulon', 'Sikembang', 'Sikudi', 'Sumingkir', 'Tengah', 'Wanasida', 'Wetan Atas', 'Wetan Bawah'],
  'Notogiwang':   ['Losari', 'Notowarih Atas', 'Notowarih Bawah', 'Rowadi', 'Sitisuk'],
  'Paninggaran':  ['Besuki', 'Cokrah', 'Godang', 'Gunung Atas', 'Gunung Bawah', 'Kauman Atas', 'Kauman Bawah', 'Krajan', 'Sabrang', 'Sijambu Atas', 'Sijambu Bawah', 'Sikawat', 'Sinyareng'],
  'Sawangan':     ['Kauman Barat', 'Kauman Selatan', 'Kauman Timur', 'Kauman Utara', 'Kembang', 'Sidomaju', 'Sikele', 'Tengah'],
  'Tangeran':     ['Brunyah', 'Gunung', 'Jurang', 'Tamansari', 'Tanggeran Timur'],
  'Tenogo':       ['Bandingan', 'Bumirasa', 'Gondang', 'Laren', 'Sitatah Atas', 'Sitatah Bawah', 'Tenogo'],
  'Werdi':        ['Binangun Atas', 'Binangun Bawah', 'Karangnangka', 'Sawit', 'Werdi Barat', 'Werdi Timur'],
  'Winduaji':     ['Plumbon', 'Simbang Kulon', 'Simbang Wetan', 'Sidomas', 'Winduaji Barat'],
};

// ==========================================
// DATA BRANCH - 15 Desa (urutan abjad)
// ==========================================
const BRANCHES = [
  { code: 'RNT-PNG-01', name: 'Ranting Bedagung',    desa: 'Bedagung' },
  { code: 'RNT-PNG-02', name: 'Ranting Botosari',    desa: 'Botosari' },
  { code: 'RNT-PNG-03', name: 'Ranting Domiyang',    desa: 'Domiyang' },
  { code: 'RNT-PNG-04', name: 'Ranting Kaliboja',    desa: 'Kaliboja' },
  { code: 'RNT-PNG-05', name: 'Ranting Kaliombo',    desa: 'Kaliombo' },
  { code: 'RNT-PNG-06', name: 'Ranting Krandegan',   desa: 'Krandegan' },
  { code: 'RNT-PNG-07', name: 'Ranting Lambanggelun', desa: 'Lambanggelun' },
  { code: 'RNT-PNG-08', name: 'Ranting Lumeneng',    desa: 'Lumeneng' },
  { code: 'RNT-PNG-09', name: 'Ranting Notogiwang',  desa: 'Notogiwang' },
  { code: 'RNT-PNG-10', name: 'Ranting Paninggaran', desa: 'Paninggaran' },
  { code: 'RNT-PNG-11', name: 'Ranting Sawangan',    desa: 'Sawangan' },
  { code: 'RNT-PNG-12', name: 'Ranting Tangeran',    desa: 'Tangeran' },
  { code: 'RNT-PNG-13', name: 'Ranting Tenogo',      desa: 'Tenogo' },
  { code: 'RNT-PNG-14', name: 'Ranting Werdi',       desa: 'Werdi' },
  { code: 'RNT-PNG-15', name: 'Ranting Winduaji',    desa: 'Winduaji' },
];

// ==========================================
// ADMIN KECAMATAN
// ==========================================
const ADMIN_KEC = {
  fullName: 'Den Bagus',
  phone: '6282134536151',
  email: 'denbagus@lazisnu-paninggaran.id',
  password: 'Lazisnu2024!',
};

// ==========================================
// SEED FUNCTION
// ==========================================
async function main() {
  console.log('ðŸŒ± Mulai seeding database Lazisnu Paninggaran...\n');

  const passwordHash = await bcrypt.hash(ADMIN_KEC.password, 10);

  // 1. DISTRICT â€” Kecamatan Paninggaran
  console.log('ðŸ“ District...');
  const district = await prisma.district.upsert({
    where: { code: 'KEC-PNG' },
    update: { name: 'Kecamatan Paninggaran', regionCode: 'PKL' },
    create: {
      code: 'KEC-PNG',
      name: 'Kecamatan Paninggaran',
      regionCode: 'PKL',
    },
  });
  console.log(`  âœ… ${district.name} (${district.code})`);

  // 2. BRANCHES â€” 15 Desa (urutan abjad)
  console.log('\nðŸ¢ 15 Ranting / Desa (urutan abjad)...');
  for (const b of BRANCHES) {
    const branch = await prisma.branch.upsert({
      where: { code: b.code },
      update: { name: b.name },
      create: { districtId: district.id, code: b.code, name: b.name },
    });
    const dukuhList = DUKUH[b.desa] ?? [];
    console.log(`  âœ… ${branch.name} â€” ${dukuhList.length} dukuh: ${dukuhList.join(', ')}`);
  }

  // 3. ADMIN KECAMATAN â€” Den Bagus
  console.log('\nðŸ‘¤ Admin Kecamatan...');
  await prisma.user.upsert({
    where: { email: ADMIN_KEC.email },
    update: { fullName: ADMIN_KEC.fullName, phone: ADMIN_KEC.phone },
    create: {
      email: ADMIN_KEC.email,
      passwordHash,
      fullName: ADMIN_KEC.fullName,
      phone: ADMIN_KEC.phone,
      role: UserRole.ADMIN_KECAMATAN,
      districtId: district.id,
    },
  });
  console.log(`  âœ… ${ADMIN_KEC.fullName} â€” ${ADMIN_KEC.email}`);

  // ==========================================
  // RINGKASAN
  // ==========================================
  console.log('\n' + '='.repeat(55));
  console.log('âœ… Seeding Kecamatan Paninggaran selesai!\n');
  console.log('ðŸ“ District  : Kecamatan Paninggaran (KEC-PNG)');
  console.log('ðŸ¢ Ranting   : 15 Desa (Bedagung s/d Winduaji)');
  console.log('ðŸ‘¤ Admin Kec : Den Bagus');
  console.log('\nðŸ“‹ LOGIN ADMIN KECAMATAN:');
  console.log(`   Email    : ${ADMIN_KEC.email}`);
  console.log(`   Password : ${ADMIN_KEC.password}`);
  console.log('\nðŸ’¡ Bendahara & Admin Ranting ditambahkan via Dashboard Admin');
  console.log('='.repeat(55));
}

main()
  .catch((e) => {
    console.error('âŒ Seeding gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

