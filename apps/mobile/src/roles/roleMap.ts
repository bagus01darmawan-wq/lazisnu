/**
 * C1-T9 — Peta peran 1 APK (murni, tanpa RN/IO — unit-testable).
 *
 * Satu APK, tampil beda per kartu (§15): PPK penuh (tugas/scan/setor/TTD),
 * Staf Pengumpulan (setuju/monitor), Keuangan (BA/TTD/unduh), Manager
 * (baca). Penjaga tetap di server; modul ini hanya memutuskan TAMPILAN.
 */

export type RoleKey =
  | 'PETUGAS'
  | 'STAF_PENGUMPULAN'
  | 'STAF_KEUANGAN'
  | 'ADMIN_RANTING'
  | 'ADMIN_KECAMATAN'
  | 'UNKNOWN';

export function normalizeRole(role: string | null | undefined): RoleKey {
  switch (role) {
    case 'PETUGAS':
    case 'STAF_PENGUMPULAN':
    case 'STAF_KEUANGAN':
    case 'ADMIN_RANTING':
    case 'ADMIN_KECAMATAN':
      return role;
    default:
      return 'UNKNOWN';
  }
}

export const isPpk = (role: RoleKey): boolean => role === 'PETUGAS';
export const isStafPengumpulan = (role: RoleKey): boolean => role === 'STAF_PENGUMPULAN';
export const isKeuangan = (role: RoleKey): boolean => role === 'STAF_KEUANGAN';
export const isManager = (role: RoleKey): boolean =>
  role === 'ADMIN_RANTING' || role === 'ADMIN_KECAMATAN';

/** Tab Scan (FAB) hanya milik PPK — peran lain tak punya tugas jemput. */
export const canUseScan = (role: RoleKey): boolean => role === 'PETUGAS';

export type TabName =
  | 'Dashboard'
  | 'Tasks'
  | 'Scan'
  | 'History'
  | 'Profile'
  | 'Persetujuan'
  | 'Keuangan'
  | 'Rekap';

export const TAB_TITLES: Record<TabName, string> = {
  Dashboard: 'Beranda',
  Tasks: 'Tugas',
  Scan: 'Scan',
  History: 'Riwayat',
  Profile: 'Profil',
  Persetujuan: 'Setujui',
  Keuangan: 'Keuangan',
  Rekap: 'Rekap',
};

/** Susunan tab bawah per peran. PPK tidak berubah (stabilitas). */
export function tabsForRole(role: RoleKey): TabName[] {
  switch (role) {
    case 'PETUGAS':
      return ['Dashboard', 'Tasks', 'Scan', 'History', 'Profile'];
    case 'STAF_PENGUMPULAN':
      return ['Persetujuan', 'Profile'];
    case 'STAF_KEUANGAN':
      return ['Keuangan', 'Profile'];
    case 'ADMIN_RANTING':
    case 'ADMIN_KECAMATAN':
      return ['Rekap', 'Profile'];
    default:
      return ['Profile'];
  }
}

export interface PeriodInfoLike {
  period: string;
  period_status: 'OPEN' | 'TOLERANCE' | 'LOCKED' | 'DIBUKA_SEBAGIAN' | string;
  days_to_due: number;
  days_to_lock: number;
  in_tolerance: boolean;
}

/** Teks countdown jemputan: sisa ke tgl 27, lalu sisa toleransi, lalu kunci. */
export function countdownText(info: PeriodInfoLike): string {
  if (info.period_status === 'LOCKED') return `Periode ${info.period} dikunci`;
  if (info.in_tolerance || info.days_to_due <= 0) {
    return `Toleransi: sisa ${info.days_to_lock} hari`;
  }
  return `Sisa ${info.days_to_due} hari penjemputan`;
}

/** Chip toleransi: null bila tak perlu chip (OPEN jauh / LOCKED). */
export function toleranceChip(info: PeriodInfoLike): {label: string; tone: 'warn' | 'lock'} | null {
  if (info.period_status === 'LOCKED') return {label: 'Dikunci', tone: 'lock'};
  if (info.in_tolerance) return {label: `Toleransi ${info.period}`, tone: 'warn'};
  return null;
}

export type ReminderLevel = 'none' | 'info' | 'urgent';

export interface Reminder {
  level: ReminderLevel;
  text: string;
}

/**
 * Pengingat deadline di aplikasi (push asli = T11). Urgent: H-3 penjemputan
 * atau masa toleransi; info: H-7. LOCKED tanpa tunggakan → none.
 */
export function reminderFor(info: PeriodInfoLike, pendingCount: number): Reminder {
  if (info.period_status === 'LOCKED') {
    return pendingCount > 0
      ? {
          level: 'urgent',
          text: `${pendingCount} tugas periode ${info.period} belum selesai dan sudah dikunci — hubungi admin`,
        }
      : {level: 'none', text: ''};
  }
  if (pendingCount <= 0) return {level: 'none', text: ''};
  if (info.in_tolerance || info.days_to_due <= 3) {
    return {
      level: 'urgent',
      text: `${pendingCount} tugas tersisa — segera selesaikan sebelum dikunci`,
    };
  }
  if (info.days_to_due <= 7) {
    return {level: 'info', text: `${pendingCount} tugas tersisa (${info.days_to_due} hari lagi)`};
  }
  return {level: 'none', text: ''};
}

/** Judul kartu beranda per peran. */
export function homeTitle(role: RoleKey): string {
  switch (role) {
    case 'PETUGAS':
      return 'Penjemputan Koin';
    case 'STAF_PENGUMPULAN':
      return 'Persetujuan Tugas';
    case 'STAF_KEUANGAN':
      return 'Keuangan & BA';
    case 'ADMIN_RANTING':
      return 'Ranting';
    case 'ADMIN_KECAMATAN':
      return 'Rekap MWC';
    default:
      return 'Lazisnu';
  }
}
