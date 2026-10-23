export type AssignmentTab = 'kelola' | 'riwayat';

export type RegionKind = 'branch' | 'dukuh';

export type WorkQueueGroupKind = 'dukuh' | 'rt' | 'can';

export interface WorkQueueGroup {
  kind: WorkQueueGroupKind;
  id: string;
  name: string;
  totalCans: number;
  assignedCans: number;
  unassignedCans: number;
  canIds: string[] | null;
}

export interface WorkQueueOfficer {
  id: string;
  fullName: string;
  employeeCode: string;
  isActive: boolean;
  dukuhId: string | null;
  dukuhName: string | null;
  assignedCount: number;
  completedCount: number;
  uncollectedCount: number;
}

export interface WorkQueueSummary {
  totalCans: number;
  assignableCans: number;
  assignedAssignableCans: number;
  unassignedAssignableCans: number;
  nonAssignableCans: number;
  completed: number;
  uncollected: number;
  officerCount: number;
  activeOfficerCount: number;
  groupCount: number;
}

export interface WorkQueueRegion {
  kind: RegionKind;
  id: string;
  name: string;
  branchId: string;
  branchName: string;
}

export interface WorkQueueResponse {
  period: { year: number; month: number };
  region: WorkQueueRegion;
  summary: WorkQueueSummary;
  groups: WorkQueueGroup[];
  officers: WorkQueueOfficer[];
}

export type AssignmentStatus = 'ACTIVE' | 'COMPLETED' | 'REASSIGNED' | 'UNCOLLECTED';

export interface AssignmentHistoryItem {
  id: string;
  canId: string;
  officerId: string;
  periodMonth: number;
  periodYear: number;
  status: AssignmentStatus;
  assignedAt: string;
  can: {
    qrCode: string;
    ownerName: string;
    branchId: string;
    branchName?: string;
    rt?: string;
    rw?: string;
    dukuh?: string;
    dukuhName?: string;
  };
  officer: {
    fullName: string;
    employeeCode?: string;
    branchName?: string;
  };
}

export interface AssignmentHistoryPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const STATUS_LABELS: Record<AssignmentStatus, string> = {
  ACTIVE: 'ASSIGNED',
  COMPLETED: 'SELESAI',
  REASSIGNED: 'RE-ASSIGN',
  UNCOLLECTED: 'TERLEWAT',
};

export const STATUS_STYLES: Record<AssignmentStatus, string> = {
  ACTIVE: 'text-[#DE6F4A] border-[#DE6F4A]/30 bg-[#DE6F4A]/10',
  COMPLETED: 'text-[#1F8243] border-[#1F8243]/30 bg-[#1F8243]/10',
  REASSIGNED: 'text-[#EAD19B] border-[#EAD19B]/30 bg-[#EAD19B]/10',
  UNCOLLECTED: 'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10',
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as AssignmentStatus] ?? status;
}

export function statusStyle(status: string): string {
  return STATUS_STYLES[status as AssignmentStatus] ?? STATUS_STYLES.ACTIVE;
}
