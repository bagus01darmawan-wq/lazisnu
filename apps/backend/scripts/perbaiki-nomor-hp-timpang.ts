/**
 * PERBAIKAN SEKALI JALAN: menyelaraskan `users.phone` (dan email turunannya)
 * dengan `officers.phone` untuk akun yang telanjur menyimpang.
 *
 * ⚠️ SKRIP INI MENULIS KE DATABASE. Karena itu perilaku bawaannya adalah
 * DRY-RUN: hanya menampilkan rencana perubahan. Penulisan baru terjadi bila
 * argumen `--terapkan` diberikan secara eksplisit.
 *
 * Kenapa arahnya officers → users:
 *   `officers.phone` adalah target OTP WhatsApp dan selalu yang diperbarui
 *   lebih dulu oleh form edit petugas. `users.phone` hanya ikut tersinkron
 *   sejak perbaikan 2026-10-27, sehingga untuk data lama ia yang tertinggal.
 *
 * Kenapa email ikut diubah:
 *   Email petugas dibentuk `${phone}@petugas.lazisnu.id` saat akun dibuat dan
 *   kolomnya UNIQUE. Kalau hanya phone yang diselaraskan, nomor lama tetap
 *   terkunci oleh email lama sehingga tidak bisa dipakai petugas baru.
 *   Email HANYA diubah bila nilainya masih pola hasil generate dari nomor lama
 *   — email yang pernah diubah manual tidak disentuh.
 *
 * Sifat: idempoten (dijalankan dua kali tidak mengubah apa pun di jalan kedua),
 * atomik untuk baris yang diterapkan (satu transaksi), dan melewati baris yang
 * akan bentrok dengan UNIQUE (dilaporkan, bukan dipaksa).
 *
 * Pakai:
 *   # lihat rencana saja (tidak menulis apa pun)
 *   DATABASE_URL="postgres://..." npx tsx scripts/perbaiki-nomor-hp-timpang.ts
 *
 *   # benar-benar menulis
 *   DATABASE_URL="postgres://..." npx tsx scripts/perbaiki-nomor-hp-timpang.ts --terapkan
 *
 *   # batasi ke petugas tertentu (koma = beberapa kode)
 *   DATABASE_URL="postgres://..." npx tsx scripts/perbaiki-nomor-hp-timpang.ts --kode=HR-0001
 */
import postgres from 'postgres';
import { normalizePhoneTo62 } from '../src/utils/phone';

const EMAIL_SUFFIX = '@petugas.lazisnu.id';

interface Baris {
  officer_id: string;
  user_id: string;
  employee_code: string;
  full_name: string;
  officers_phone: string;
  users_phone: string;
  email: string;
}

interface Rencana {
  baris: Baris;
  phoneBaru: string;
  emailBaru: string | null;
  masalah: string | null;
}

function bacaArgumen(): { url: string; terapkan: boolean; kode: string[] } {
  const args = process.argv.slice(2);
  const terapkan = args.includes('--terapkan');
  const kodeArg = args.find(a => a.startsWith('--kode='));
  const kode = kodeArg
    ? kodeArg
        .slice('--kode='.length)
        .split(',')
        .map(k => k.trim().toUpperCase())
        .filter(Boolean)
    : [];
  const url = args.find(a => !a.startsWith('--')) || process.env.DATABASE_URL || '';
  return { url, terapkan, kode };
}

async function ambilBarisTimpang(sql: postgres.Sql, kode: string[]): Promise<Baris[]> {
  const semua = await sql<Baris[]>`
    SELECT o.id            AS officer_id,
           u.id            AS user_id,
           o.employee_code,
           o.full_name,
           o.phone         AS officers_phone,
           u.phone         AS users_phone,
           u.email
      FROM officers o
      JOIN users u ON u.id = o.user_id
     ORDER BY o.employee_code
  `;
  const timpang = semua.filter(
    r => normalizePhoneTo62(r.officers_phone) !== normalizePhoneTo62(r.users_phone),
  );
  if (kode.length === 0) return timpang;
  return timpang.filter(r => kode.includes(r.employee_code.toUpperCase()));
}

/** Susun rencana + deteksi bentrok UNIQUE sebelum menyentuh apa pun. */
async function susunRencana(sql: postgres.Sql, baris: Baris[]): Promise<Rencana[]> {
  const rencana: Rencana[] = [];

  for (const b of baris) {
    const phoneBaru = b.officers_phone;

    // Email hanya diganti kalau saat ini masih pola hasil generate dari nomor
    // LAMA. Kalau tidak cocok, email dianggap sudah diubah manual.
    const emailTerbentuk = `${b.users_phone}${EMAIL_SUFFIX}`;
    const emailBaru =
      b.email === emailTerbentuk ? `${phoneBaru}${EMAIL_SUFFIX}` : null;

    let masalah: string | null = null;

    // 1) Nomor tujuan sudah dipakai akun lain?
    const bentrokPhone = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE phone = ${phoneBaru} AND id <> ${b.user_id} LIMIT 1
    `;
    if (bentrokPhone.length > 0) {
      masalah = 'nomor sudah dipakai akun lain (users.phone)';
    }

    // 2) Email tujuan sudah dipakai akun lain?
    if (!masalah && emailBaru) {
      const bentrokEmail = await sql<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${emailBaru} AND id <> ${b.user_id} LIMIT 1
      `;
      if (bentrokEmail.length > 0) {
        masalah = 'email turunan sudah dipakai akun lain (users.email)';
      }
    }

    rencana.push({ baris: b, phoneBaru, emailBaru, masalah });
  }

  return rencana;
}

async function main(): Promise<void> {
  const { url, terapkan, kode } = bacaArgumen();
  if (!url) {
    console.error(
      'DATABASE_URL belum diisi. Contoh:\n' +
        '  DATABASE_URL="postgres://user:sandi@host:5432/db" npx tsx scripts/perbaiki-nomor-hp-timpang.ts\n' +
        'Tambahkan --terapkan untuk benar-benar menulis.',
    );
    process.exit(2);
  }

  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5 });
  try {
    const timpang = await ambilBarisTimpang(sql, kode);

    console.log(`Mode            : ${terapkan ? 'TERAPKAN (menulis)' : 'DRY-RUN (tidak menulis)'}`);
    console.log(`Petugas timpang : ${timpang.length}`);
    if (kode.length > 0) console.log(`Difilter kode   : ${kode.join(', ')}`);

    if (timpang.length === 0) {
      console.log('\nTidak ada yang perlu diperbaiki.');
      return;
    }

    const rencana = await susunRencana(sql, timpang);
    const siap = rencana.filter(r => !r.masalah);
    const dilewati = rencana.filter(r => r.masalah);

    console.log('\n== Rencana perubahan ==');
    for (const r of rencana) {
      const b = r.baris;
      const email = r.emailBaru ? ` | email ${b.email} → ${r.emailBaru}` : ' | email tetap';
      const status = r.masalah ? `DILEWATI (${r.masalah})` : 'siap';
      console.log(
        `- ${b.employee_code} ${b.full_name}: users.phone ${b.users_phone} → ${r.phoneBaru}${email} [${status}]`,
      );
    }

    console.log(`\nSiap diterapkan: ${siap.length} | Dilewati: ${dilewati.length}`);

    if (!terapkan) {
      console.log(
        '\nDRY-RUN selesai — tidak ada data yang diubah.\n' +
          'Jalankan ulang dengan --terapkan untuk menulis.',
      );
      return;
    }

    if (siap.length === 0) {
      console.log('\nTidak ada baris yang aman diterapkan.');
      return;
    }

    await sql.begin(async tx => {
      for (const r of siap) {
        if (r.emailBaru) {
          await tx`
            UPDATE users
               SET phone = ${r.phoneBaru},
                   email = ${r.emailBaru},
                   updated_at = now()
             WHERE id = ${r.baris.user_id}
          `;
        } else {
          await tx`
            UPDATE users
               SET phone = ${r.phoneBaru},
                   updated_at = now()
             WHERE id = ${r.baris.user_id}
          `;
        }
      }
    });

    console.log(`\nDiterapkan: ${siap.length} baris (satu transaksi).`);

    // Verifikasi ulang dari sumbernya, bukan dari ingatan.
    const sisa = await ambilBarisTimpang(sql, kode);
    console.log(`Sisa petugas timpang setelah perbaikan: ${sisa.length}`);
    for (const s of sisa) {
      console.log(`  masih timpang: ${s.employee_code} (${s.users_phone} vs ${s.officers_phone})`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch(err => {
  console.error('Gagal:', err instanceof Error ? err.message : err);
  process.exit(2);
});
