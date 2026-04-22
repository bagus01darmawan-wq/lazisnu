// User Types
export enum UserRole {
  ADMIN_KECAMATAN = 'ADMIN_KECAMATAN',
  ADMIN_RANTING = 'ADMIN_RANTING',
  BENDAHARA = 'BENDAHARA',
  PETUGAS = 'PETUGAS',
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  branch_id?: string;
  district_id?: string;
  last_login?: string;
  is_active?: boolean;
}

export interface Officer {
  id: string;
  employee_code: string;
  full_name: string;
  phone: string;
  photo_url?: string;
  district_id: string;
  branch_id: string;
  assigned_zone?: string;
  is_active: boolean;
}

// Can (Kaleng) Types
export interface Can {
  id: string;
  qr_code: string;
  branch_id: string;
  owner_name: string;
  owner_phone: string;
  owner_address: string;
  owner_whatsapp?: string;
  latitude?: number;
  longitude?: number;
  location_notes?: string;
  is_active: boolean;
  last_collected_at?: string;
  total_collected: number;
  collection_count: number;
}

// Assignment Types
export enum AssignmentStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  POSTPONED = 'POSTPONED',
  REASSIGNED = 'REASSIGNED',
}

export interface Assignment {
  id: string;
  can_id: string;
  officer_id: string;
  backup_officer_id?: string;
  period_year: number;
  period_month: number;
  status: AssignmentStatus;
  assigned_at: string;
  completed_at?: string;
  notes?: string;
}

// Collection Types
export enum PaymentMethod {
  CASH = 'CASH',
  TRANSFER = 'TRANSFER',
}
export enum SyncStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface Collection {
  id: string;
  assignment_id: string;
  can_id: string;
  officer_id: string;
  nominal: number;
  payment_method: PaymentMethod;
  transfer_receipt_url?: string;
  collected_at: string;
  submitted_at?: string;
  synced_at?: string;
  sync_status: SyncStatus;
  whatsapp_status?: string;
  whatsapp_sent?: boolean;
  notes?: string;
  can?: {
    qr_code: string;
    owner_name: string;
    owner_address: string;
  };
  server_timestamp?: string;
  device_info?: DeviceInfo;
  latitude?: number;
  longitude?: number;
  offline_id?: string;
}

export interface DeviceInfo {
  model: string;
  os_version: string;
  app_version: string;
}

// Task (for mobile display)
export interface Task {
  id: string;
  qr_code: string;
  owner_name: string;
  owner_phone: string;
  owner_address: string;
  latitude?: number;
  longitude?: number;
  status: AssignmentStatus;
  assigned_at: string;
  period: string;
  last_collection?: {
    nominal: number;
    date: string;
  };
}

// Dashboard Stats
export interface TodayStats {
  collected: number;
  total_amount: number;
  remaining: number;
}

export interface WeekStats {
  collected: number;
  total_amount: number;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// Offline Types
export interface OfflineCollection {
  offline_id: string;
  assignment_id: string;
  can_id: string;
  nominal: number;
  payment_method: PaymentMethod;
  transfer_receipt_url?: string;
  collected_at: string;
  latitude?: number;
  longitude?: number;
  device_info?: DeviceInfo;
  synced: boolean;
  sync_error?: string;
}

// Report Types
export interface CollectionReport {
  id: string;
  collected_at: string;
  nominal: number;
  payment_method: PaymentMethod;
  sync_status: SyncStatus;
  officer_name: string;
  officer_code: string;
  branch_name: string;
  district_name: string;
  owner_name: string;
  qr_code: string;
}

// Branch & District
export interface District {
  id: string;
  code: string;
  name: string;
  region_code: string;
}

export interface Branch {
  id: string;
  district_id: string;
  code: string;
  name: string;
}
