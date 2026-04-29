import { 
  BarChart3, 
  Box, 
  Users, 
  ClipboardList, 
  FileText, 
  History, 
  ShieldAlert, 
  MessageSquare
} from 'lucide-react';

export type UserRole = 'ADMIN_KECAMATAN' | 'ADMIN_RANTING' | 'BENDAHARA' | 'PETUGAS';

export interface MenuItem {
  title: string;
  path: string;
  icon: any;
  roles: UserRole[];
}

export const MENU_ITEMS: MenuItem[] = [
  {
    title: 'Overview',
    path: '/dashboard/overview',
    icon: BarChart3,
    roles: ['ADMIN_KECAMATAN', 'ADMIN_RANTING', 'BENDAHARA'],
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
    roles: ['ADMIN_KECAMATAN'],
  },
  {
    title: 'Laporan',
    path: '/dashboard/reports',
    icon: FileText,
    roles: ['ADMIN_KECAMATAN', 'ADMIN_RANTING', 'BENDAHARA'],
  },
  {
    title: 'Re-submit',
    path: '/dashboard/resubmit',
    icon: History,
    roles: ['ADMIN_KECAMATAN', 'BENDAHARA'],
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
    roles: ['ADMIN_KECAMATAN', 'BENDAHARA'],
  },
];

export const getMenuItems = (role: UserRole) => {
  return MENU_ITEMS.filter(item => item.roles.includes(role));
};
