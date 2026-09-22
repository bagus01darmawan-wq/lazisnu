import { 
  BarChart3, 
  Box, 
  Users, 
  ClipboardList, 
  FileText, 
  History, 
  ShieldAlert, 
  MessageSquare,
  Database,
  ClipboardCheck,
  FileSignature,
  PieChart,
  LucideIcon
} from 'lucide-react';

// C1-T0 (§14.13): 2 role staf baru dikenali agar cocok dengan enum UserRole
// shared-types. Belum punya menu dashboard (getMenuItems mengembalikan []
// untuk mereka) sampai UI T4-T6 selesai.
export type UserRole = 'ADMIN_KECAMATAN' | 'ADMIN_RANTING' | 'PETUGAS' | 'STAF_PENGUMPULAN' | 'STAF_KEUANGAN';

export interface MenuItem {
  title: string;
  path: string;
  icon: LucideIcon;
  roles: UserRole[];
}

export const MENU_ITEMS: MenuItem[] = [
  {
    title: 'Overview',
    path: '/dashboard/overview',
    icon: BarChart3,
    roles: ['ADMIN_KECAMATAN', 'ADMIN_RANTING'],
  },
  {
    title: 'Kelola Kaleng',
    path: '/dashboard/cans',
    icon: Box,
    roles: ['ADMIN_KECAMATAN', 'ADMIN_RANTING'],
  },
  {
    title: 'Penugasan',
    path: '/dashboard/assignments',
    icon: ClipboardList,
    roles: ['ADMIN_KECAMATAN', 'ADMIN_RANTING'],
  },
  {
    title: 'Manajemen User',
    path: '/dashboard/users',
    icon: Users,
    roles: ['ADMIN_KECAMATAN', 'ADMIN_RANTING'],
  },
  {
    title: 'Laporan',
    path: '/dashboard/reports',
    icon: FileText,
    roles: ['ADMIN_KECAMATAN', 'ADMIN_RANTING'],
  },
  {
    title: 'Re-submit',
    path: '/dashboard/resubmit',
    icon: History,
    roles: ['ADMIN_KECAMATAN', 'ADMIN_RANTING'],
  },
  {
    title: 'Log Aktivitas',
    path: '/dashboard/audit-log',
    icon: ShieldAlert,
    roles: ['ADMIN_KECAMATAN'],
  },
  {
    title: 'WA Monitor',
    path: '/dashboard/wa-monitor',
    icon: MessageSquare,
    roles: ['ADMIN_KECAMATAN', 'ADMIN_RANTING'],
  },
  {
    title: 'Data Master',
    path: '/dashboard/master',
    icon: Database,
    roles: ['ADMIN_KECAMATAN'],
  },
  // C1-T10 (§15): menu peran siklus periode — Staf (monitor/setuju),
  // Ranting (kunci), MWC (tarik). Penjaga tetap di server.
  {
    title: 'Persetujuan',
    path: '/dashboard/persetujuan',
    icon: ClipboardCheck,
    roles: ['STAF_PENGUMPULAN', 'STAF_KEUANGAN'],
  },
  {
    title: 'Setoran Ranting',
    path: '/dashboard/setoran',
    icon: FileSignature,
    roles: ['ADMIN_RANTING'],
  },
  {
    title: 'Rekap MWC',
    path: '/dashboard/rekap-mwc',
    icon: PieChart,
    roles: ['ADMIN_KECAMATAN'],
  },
];

export const getMenuItems = (role: UserRole) => {
  return MENU_ITEMS.filter(item => item.roles.includes(role));
};
