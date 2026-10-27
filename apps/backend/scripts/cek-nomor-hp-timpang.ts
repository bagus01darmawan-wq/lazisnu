/**
 * LAPORAN BACA-SAJA: akun yang `users.phone` dan `officers.phone`-nya berbeda.
 *
 * Latar belakang (kasus 2026-10-27): nomor HP disimpan di dua tempat —
 * `officers.phone` adalah target OTP WhatsApp, sedangkan `users.phone` adalah
 * yang tampil di layar Profil aplikasi dan dipakai login sandi. Selama bertahun
 * edit, kedua kolom bisa menyimpang. Perbaikan di `PUT /admin/officers`
 * menghentikan divergensi BARU, tetapi tidak membereskan yang sudah telanjur.
 *
 * Skrip ini TIDAK PERNAH mengubah data. Isinya hanya SELECT. Jangan tambahkan
 * UPDATE/DELETE di sini — kalau perlu memperbaiki, buat skrip terpisah dan
 * minta persetujuan dulu.
 *
 * Pakai:
 *   DATABASE_URL="postgres://..." npx tsx scripts/cek-nomor-hp-timpang.ts
 *   npx tsx scripts/cek-nomor-hp-timpang.ts "postgres://..." --ketat
 *
 *   --ketat   keluar dengan kode 1 bila ada temuan (untuk dipakai di CI)
 */
import postgres from 'postgres';
import { normalizePhoneTo62 } from '../src/utils/phone';

const EMAIL_SUFFIX = '@petugas.lazisnu.id';

interface BarisPetugas {
  employee_code: string;
  full_name: string;
  officers_phone: string;
  users_phone: string;
  email: string;
  is_active: boolean;
}

function argValue(): { url: string; ketat: boolean } {
  const args = process.argv.slice(2);
  const ketat = args.includes('--ketat');
  const urlDariArg = args.find(a => !a.startsWith('--'));
  const url = urlDariArg || process.env.DATABASE_URL || '';
  return { url, ketat };
}

async function main(): Promise<void> {
  const { url, ketat } = argValue();
  if (!url) {
    console.error(
      'DATABASE_URL belum diisi. Contoh:\n' +
        '  DATABASE_URL="postgres://user:sandi@host:5432/db" npx tsx scripts/cek-nomor-hp-timpang.ts',
    );
    process.exit(2);
  }

  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });
  let baris: BarisPetugas[] = [];
  try {
    baris = await sql<BarisPetugas[]>`
      SELECT o.employee_code,
             o.full_name,
             o.phone  AS officers_phone,
             u.phone  AS users_phone,
             u.email,
             u.is_active
        FROM officers o
        JOIN users u ON u.id = o.user_id
       ORDER BY o.employee_code
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }

  // Pembanding memakai normalisasi 62xxx supaya "0821..." dan "62821..."
  // tidak dilaporkan sebagai temuan palsu.
  const nomorTimpang = baris.filter(
    r => normalizePhoneTo62(r.officers_phone) !== normalizePhoneTo62(r.users_phone),
  );

  // Email dibentuk dari nomor HP saat petugas dibuat. Bila nomornya sudah
  // berubah tetapi email masih memakai nomor lama, nomor lama itu tetap
  // "terkunci" oleh UNIQUE users.email.
  const emailTertinggal = baris.filter(r => {
    if (!r.email.endsWith(EMAIL_SUFFIX)) return false;
    const nomorDiEmail = r.email.slice(0, -EMAIL_SUFFIX.length);
    return normalizePhoneTo62(nomorDiEmail) !== normalizePhoneTo62(r.users_phone);
  });

  console.log(`Total petugas diperiksa : ${baris.length}`);
  console.log(`Nomor HP timpang        : ${nomorTimpang.length}`);
  console.log(`Email memakai nomor lama: ${emailTertinggal.length}`);

  if (nomorTimpang.length > 0) {
    console.log('\n== Nomor HP timpang (target OTP vs yang tampil di aplikasi) ==');
    console.log(
      ['Kode', 'Nama', 'officers.phone (OTP)', 'users.phone (Profil)', 'Aktif'].join('\t'),
    );
    for (const r of nomorTimpang) {
      console.log(
        [r.employee_code, r.full_name, r.officers_phone, r.users_phone, r.is_active ? 'ya' : 'tidak'].join('\t'),
      );
    }
    console.log(
      '\nCatatan: OTP dikirim ke officers.phone; layar Profil membaca users.phone.\n' +
        'Kalau officers.phone sudah nomor baru, login OTP tetap bisa walau Profil tampak lama.',
    );
  }

  if (emailTertinggal.length > 0) {
    console.log('\n== Email masih memakai nomor lama ==');
    console.log(['Kode', 'Nama', 'Email', 'Nomor sekarang'].join('\t'));
    for (const r of emailTertinggal) {
      console.log([r.employee_code, r.full_name, r.email, r.users_phone].join('\t'));
    }
    console.log(
      '\nCatatan: nomor lama pada email membuat nomor itu tidak bisa dipakai petugas\n' +
        'baru (users.email UNIQUE). Perbaikan di PUT /admin/officers sudah menutup\n' +
        'kasus baru; baris di atas adalah sisa yang perlu dibereskan manual.',
    );
  }

  if (nomorTimpang.length === 0 && emailTertinggal.length === 0) {
    console.log('\nTidak ada temuan. Semua nomor dan email petugas konsisten.');
  }

  const adaTemuan = nomorTimpang.length > 0 || emailTertinggal.length > 0;
  process.exit(ketat && adaTemuan ? 1 : 0);
}

main().catch(err => {
  console.error('Gagal menjalankan laporan:', err instanceof Error ? err.message : err);
  process.exit(2);
});
