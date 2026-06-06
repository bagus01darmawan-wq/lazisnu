// =============================================================================
// @lazisnu/shared-types – Central Type Contract
// Source of truth: apps/backend/src/database/schema.ts
// Naming convention: snake_case (matching API response/request payloads)
// =============================================================================

// ─── Enums ────────────────────────────────────────────────────────────────────
export enum UserRole {
  ADMIN_KECAMATAN = 'ADMIN_KECAMATAN',
  ADMIN_RANTING   = 'ADMIN_RANTING',
  BENDAHARA       = 'BENDAHARA',
  PETUGAS         = 'PETUGAS',
}

export enum AssignmentStatus {
  ACTIVE     = 'ACTIVE',
  COMPLETED  = 'COMPLETED',
  POSTPONED  = 'POSTPONED',
  REASSIGNED = 'REASSIGNED',
}

export enum PaymentMethod {
  CASH     = 'CASH',
  TRANSFER = 'TRANSFER',
}

export enum SyncStatus {
  PENDING   = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED    = 'FAILED',
  CANCELLED = 'CANCELLED',
}

// ─── District ─────────────────────────────────────────────────────────────────
export interface District {
  id: string;
  code: string;
  name: string;
  region_code: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Branch (Ranting) ────────────────────────────────────────────────────────
export interface Branch {
  id: string;
  district_id: string;
  code: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

// ─── User ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  district_id?: string;
  branch_id?: string;
  is_active: boolean;
  last_login?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Officer (Petugas) ───────────────────────────────────────────────────────
export interface Officer {
  id: string;
  user_id?: string;
  employee_code: string;
  full_name: string;
  phone: string;
  photo_url?: string;
  district_id: string;
  branch_id: string;
  assigned_zone?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// ─── Dukuh ────────────────────────────────────────────────────────────────────
export interface Dukuh {
  id: string;
  branch_id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Can (Kaleng) ─────────────────────────────────────────────────────────────
export interface Can {
  id: string;
  qr_code?: string;
  branch_id: string;
  dukuh_id?: string;
  owner_name: string;
  owner_phone?: string;
  owner_address?: string;
  dukuh?: string;
  rt?: string;
  rw?: string;
  owner_whatsapp: string;
  latitude?: number;
  longitude?: number;
  location_notes?: string;
  is_active: boolean;
  last_collected_at?: string;
  total_collected: number;
  collection_count: number;
  created_at?: string;
  updated_at?: string;
}

// ─── Assignment (Penugasan) ──────────────────────────────────────────────────
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
  created_at?: string;
  updated_at?: string;
}

// ─── Collection (Setoran) ────────────────────────────────────────────────────
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
  submit_sequence?: number;
  alasan_resubmit?: string | null;
  // joined / computed fields
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

// ─── DeviceInfo ───────────────────────────────────────────────────────────────
export interface DeviceInfo {
  model: string;
  os_version: string;
  app_version: string;
}

// ─── Notification ─────────────────────────────────────────────────────────────
export interface Notification {
  id: string;
  collection_id?: string;
  recipient_phone: string;
  recipient_name?: string;
  message_template?: string;
  message_content: string;
  status: string;
  sent_at?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── CollectionSummary ────────────────────────────────────────────────────────
export interface CollectionSummary {
  id: string;
  period_year: number;
  period_month: number;
  district_id?: string;
  branch_id?: string;
  officer_id?: string;
  total_amount: number;
  collection_count: number;
  cash_count: number;
  cash_amount: number;
  transfer_count: number;
  transfer_amount: number;
}

// ─── Task (for mobile display – joined view) ─────────────────────────────────
export interface Task {
  id: string;
  can_id: string;
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

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
export interface TodayStats {
  collected: number;
  total_nominal: number;
  remaining: number;
}

export interface WeekStats {
  collected: number;
  total_nominal: number;
}

// ─── API Response Types ──────────────────────────────────────────────────────
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

// ─── Offline Types ────────────────────────────────────────────────────────────
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
  submit_sequence?: number;
  is_latest?: boolean;
  error_type?: 'VALIDATION' | 'SERVER';
  can_retry?: boolean;
  error_message?: string;
  synced?: boolean;
  sync_error?: string;
}

// ─── Report Types ─────────────────────────────────────────────────────────────
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
  owner_address: string;
  qr_code: string;
}