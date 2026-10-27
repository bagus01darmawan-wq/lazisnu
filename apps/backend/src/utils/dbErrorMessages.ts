/**
 * Penerjemah error database → AppError yang bisa dibaca pengguna.
 *
 * MASALAH YANG DIPERBAIKI
 * Sebelum ini, setiap pelanggaran aturan database (foreign key, unique,
 * not-null) jatuh ke `sendInternalError` dan tampil sebagai
 * "Terjadi kesalahan server" dengan HTTP 500 — padahal datanya tidak rusak dan
 * yang salah cuma permintaannya. Contoh nyata (27 Okt 2026): hapus permanen
 * kaleng yang masih tercatat di `period_draft_items` ditolak Postgres, lalu
 * pengguna hanya melihat "Terjadi kesalahan server" tanpa tahu penyebabnya.
 *
 * CARA KERJA
 * Pesan dipilih dari NAMA CONSTRAINT, bukan hanya kode error, karena satu kode
 * (mis. 23503) bisa berarti banyak hal berbeda. Nama constraint diambil dari
 * `error.constraint` yang diisi driver `postgres` — daftar namanya diverifikasi
 * dari `src/database/migrations/*.sql`, bukan dikarang.
 *
 * ATURAN PENTING
 * - Hanya kode yang MEMANG bisa dijelaskan ke pengguna yang dipetakan. Error
 *   infrastruktur (koneksi putus, timeout, dsb.) sengaja dibiarkan 500 — bohong
 *   kalau kita bilang "data masih dipakai" padahal database-nya yang bermasalah.
 * - Jangan pernah menampilkan `error.detail`/`error.message` mentah: isinya
 *   memuat nama tabel dan nilai kolom (kebocoran data + tidak terbaca awam).
 */

import { AppError } from './AppError';
import { ErrorCode } from './errorCatalog';
import { getPostgresError } from './error-guards';

interface DbErrorTemplate {
  code: string;
  status: number;
  message: string;
  retryable?: boolean;
}

/**
 * Pelanggaran foreign key (kode 23503): data yang mau dihapus masih dirujuk
 * tabel lain. Kunci = nama constraint di database.
 */
const FOREIGN_KEY_MESSAGES: Record<string, string> = {
  // --- Kaleng ---
  collections_can_id_cans_id_fk:
    'Kaleng ini punya riwayat penjemputan, jadi tidak bisa dihapus permanen. Gunakan fitur nonaktifkan.',
  period_draft_items_can_id_cans_id_fk:
    'Kaleng ini masih tercatat di draft penugasan periode berjalan. Minta Staf Bidang Pengumpulan mengeluarkan kaleng dari draft lebih dulu.',
  // --- Wilayah ---
  cans_branch_id_branches_id_fk: 'Ranting ini masih punya data kaleng.',
  cans_dukuh_id_dukuhs_id_fk: 'Dukuh ini masih dipakai oleh kaleng. Pindahkan kaleng ke dukuh lain lebih dulu.',
  dukuhs_branch_id_branches_id_fk: 'Ranting ini masih punya data dukuh.',
  officers_branch_id_branches_id_fk: 'Ranting ini masih punya data PPK (Petugas Penjemput Koin).',
  users_branch_id_branches_id_fk: 'Ranting ini masih dipakai oleh akun pengguna.',
  branches_district_id_districts_id_fk: 'Kecamatan ini masih punya ranting.',
  users_district_id_districts_id_fk: 'Kecamatan ini masih dipakai oleh akun pengguna.',
  // --- Akun & petugas ---
  officers_user_id_users_id_fk: 'Akun ini masih terhubung dengan data PPK.',
  user_sessions_user_id_users_id_fk: 'Akun ini masih punya sesi login aktif.',
  activity_logs_user_id_users_id_fk: 'Akun ini masih tercatat di jejak audit.',
  // --- Penjemputan & setoran ---
  collections_assignment_id_assignments_id_fk: 'Tugas ini sudah punya data penjemputan.',
  notifications_collection_id_collections_id_fk: 'Penjemputan ini sudah punya data notifikasi.',
  ppk_submissions_branch_id_branches_id_fk: 'Ranting ini masih punya setoran PPK.',
  branch_submissions_branch_id_branches_id_fk: 'Ranting ini masih punya berita acara.',
  period_drafts_branch_id_branches_id_fk: 'Ranting ini masih punya draft penugasan.',
};

/**
 * Pelanggaran nilai unik (kode 23505): nilai yang seharusnya tunggal sudah
 * dipakai baris lain. Kunci = nama constraint/index unik.
 */
const UNIQUE_MESSAGES: Record<string, string> = {
  cans_qr_code_unique:
    'Nomor QR ini sudah dipakai kaleng lain. Kosongkan kolom QR agar sistem membuat nomor baru.',
  users_email_unique: 'Email ini sudah terdaftar pada akun lain.',
  users_phone_unique: 'Nomor HP ini sudah terdaftar pada akun lain.',
  officers_phone_unique: 'Nomor HP ini sudah dipakai PPK lain.',
  officers_employee_code_unique: 'Kode petugas ini sudah dipakai PPK lain.',
  officers_user_id_unique: 'Akun ini sudah terhubung ke PPK lain.',
  collections_offline_id_unique: 'Penjemputan ini sudah pernah terkirim (penanda offline sama).',
  can_officer_period_unq: 'Kaleng ini sudah punya tugas pada periode tersebut.',
  ppk_officer_period_unq: 'PPK ini sudah punya setoran pada periode tersebut.',
  period_draft_item_draft_can_unq: 'Kaleng ini sudah ada di draft penugasan tersebut.',
  branches_code_unique: 'Kode ranting ini sudah dipakai.',
  districts_code_unique: 'Kode kecamatan ini sudah dipakai.',
};

/**
 * Pesan umum per kode error Postgres. Dipakai bila nama constraint tidak
 * dikenali — lebih baik kalimat umum yang benar daripada 500 yang buta.
 */
const GENERIC_BY_CODE: Record<string, DbErrorTemplate> = {
  '23503': {
    code: ErrorCode.DATA_IN_USE,
    status: 409,
    message: 'Data ini masih dipakai oleh data lain sehingga tidak bisa dihapus. Periksa dulu keterkaitannya.',
  },
  '23505': {
    code: ErrorCode.DUPLICATE_DATA,
    status: 409,
    message: 'Data dengan nilai yang sama sudah ada. Periksa kembali isian Anda.',
  },
  '23502': {
    code: ErrorCode.VALIDATION_ERROR,
    status: 400,
    message: 'Ada isian wajib yang belum terisi.',
  },
  '23514': {
    code: ErrorCode.VALIDATION_ERROR,
    status: 400,
    message: 'Nilai yang dikirim tidak memenuhi aturan data.',
  },
  '22P02': {
    code: ErrorCode.VALIDATION_ERROR,
    status: 400,
    message: 'Format data tidak dikenali. Periksa kembali isian Anda.',
  },
  // Konflik transaksi: dua permintaan menyentuh baris yang sama. Bukan salah
  // pengguna dan aman diulang.
  '40001': {
    code: ErrorCode.CONFLICT,
    status: 409,
    message: 'Data sedang diubah oleh permintaan lain. Muat ulang lalu coba lagi.',
    retryable: true,
  },
  '40P01': {
    code: ErrorCode.CONFLICT,
    status: 409,
    message: 'Data sedang diubah oleh permintaan lain. Muat ulang lalu coba lagi.',
    retryable: true,
  },
};

/**
 * Terjemahkan error database menjadi AppError, atau `null` bila error itu tidak
 * termasuk yang bisa dijelaskan ke pengguna (pemanggil lalu memakai jalur 500).
 *
 * Menerima error mentah maupun `DrizzleQueryError` (kode ada di `cause`).
 */
export function translateDatabaseError(error: unknown): AppError | null {
  const pg = getPostgresError(error);
  if (!pg) return null;

  const template = GENERIC_BY_CODE[pg.code];
  if (!template) return null;

  const constraint = pg.constraint ?? null;

  // Pesan spesifik hanya dipilih bila nama constraint-nya dikenali. Selain itu
  // pakai kalimat umum per kode — tetap benar, hanya kurang spesifik.
  let specific: string | undefined;
  if (constraint && pg.code === '23503') {
    specific = FOREIGN_KEY_MESSAGES[constraint];
  } else if (constraint && pg.code === '23505') {
    specific = UNIQUE_MESSAGES[constraint];
  }

  return new AppError(
    template.code,
    specific ?? template.message,
    template.status,
    template.retryable ?? false,
    // Detail mesin tetap dibawa untuk log/observability, bukan untuk pengguna.
    { db_code: pg.code, constraint },
  );
}
