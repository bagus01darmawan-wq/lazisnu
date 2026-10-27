/**
 * Guard hapus permanen kaleng: kaleng yang masih tercatat di draft penugasan.
 *
 * MENGAPA ADA
 * Tabel `period_draft_items.can_id` memakai foreign key tanpa cascade, sehingga
 * Postgres menolak menghapus kaleng yang masih tercatat di draft mana pun.
 * Penolakan itu benar, tetapi dua hal tidak bisa dijawab oleh database:
 *   1. **periode mana** yang menahan (constraint hanya tahu nama tabel), dan
 *   2. apakah draft itu masih bisa diedit. `deleteDraftItem` menolak mengeluarkan
 *      item dari draft yang sudah APPROVED (`periodDrafts.ts`), jadi saran
 *      "keluarkan dari draft dulu" bisa mustahil dijalankan.
 * Guard ini memeriksa lebih dulu dan menjawab keduanya dengan kalimat yang benar.
 *
 * Modul ini SENGAJA tidak menyentuh database supaya kalimatnya bisa diuji tanpa
 * Postgres — query-nya ada di `canService` (`findDraftLocks`).
 */
import { AppError } from '../utils/AppError';
import { ErrorCode } from '../utils/errorCatalog';
import { periodKey } from './periodCalendar';

export interface DraftLockInfo {
  canId: string;
  periodYear: number;
  periodMonth: number;
  /** 'DRAFT' | 'APPROVED' — menentukan apakah draft masih boleh diedit. */
  status: string;
}

const MAX_PERIODS_SHOWN = 3;

/** "2026-09, 2026-10" — dipotong setelah tiga periode agar pesan tetap pendek. */
function formatPeriodList(locks: DraftLockInfo[]): string {
  const unique = [...new Set(locks.map((l) => periodKey(l.periodYear, l.periodMonth)))].sort();
  if (unique.length === 0) return '';
  if (unique.length <= MAX_PERIODS_SHOWN) return unique.join(', ');
  const shown = unique.slice(0, MAX_PERIODS_SHOWN).join(', ');
  return `${shown} (+${unique.length - MAX_PERIODS_SHOWN} periode lain)`;
}

/**
 * Bangun AppError 409 untuk kaleng yang masih terikat draft, atau `null` bila
 * tidak ada yang menahan.
 *
 * `requestedCount` diisi hanya untuk hapus massal — dipakai menyebut berapa dari
 * berapa yang terblokir. Nama pemilik sengaja TIDAK dimasukkan: pada hapus
 * massal, id yang dikirim klien belum tentu milik rantingnya, jadi menyebut nama
 * akan membocorkan data di luar cakupan pengguna.
 */
export function buildDraftLockError(
  locks: DraftLockInfo[],
  requestedCount?: number,
): AppError | null {
  if (locks.length === 0) return null;

  const periods = formatPeriodList(locks);
  const approvedPeriods = formatPeriodList(locks.filter((l) => l.status === 'APPROVED'));
  const hasApproved = approvedPeriods.length > 0;

  if (requestedCount === undefined) {
    if (hasApproved) {
      return new AppError(
        ErrorCode.CAN_IN_PERIOD_DRAFT,
        `Kaleng ini tercatat di draft penugasan ${periods} yang sudah disetujui, jadi tidak bisa dihapus permanen. Gunakan penandaan dikembalikan.`,
        409,
      );
    }
    return new AppError(
      ErrorCode.CAN_IN_PERIOD_DRAFT,
      `Kaleng ini masih tercatat di draft penugasan ${periods} yang belum disetujui. Minta Staf Bidang Pengumpulan mengeluarkan kaleng dari draft lebih dulu.`,
      409,
    );
  }

  const blocked = new Set(locks.map((l) => l.canId)).size;
  const head = `Hapus permanen dibatalkan: ${blocked} dari ${requestedCount} kaleng masih tercatat di draft penugasan (${periods}).`;
  const tail = hasApproved
    ? ` Draft ${approvedPeriods} sudah disetujui sehingga tidak bisa diedit lagi.`
    : ' Hapus satu per satu untuk melihat kaleng mana, atau keluarkan dari draft lebih dulu.';

  return new AppError(ErrorCode.CAN_IN_PERIOD_DRAFT, head + tail, 409);
}
