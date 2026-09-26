// =============================================================================
// @lazisnu/shared-types – Central Type Contract
// Source of truth: apps/backend/src/database/schema.ts
// Naming convention: snake_case (matching API response/request payloads)
// =============================================================================

// ─── Enums ────────────────────────────────────────────────────────────────────
export enum UserRole {
  ADMIN_KECAMATAN = "ADMIN_KECAMATAN",
  ADMIN_RANTING = "ADMIN_RANTING",
  PETUGAS = "PETUGAS",
  // C1-T0 (§14.13): Staf Bid. Pengumpulan (jadwal+monitor, tanpa FINAL/kunci/nominal)
  // dan Staf Bid. Adm & Keuangan (TTD kedua, unduh PDF, tanpa ubah nominal).
  STAF_PENGUMPULAN = "STAF_PENGUMPULAN",
  STAF_KEUANGAN = "STAF_KEUANGAN",
}

// C1-T0 (§8b): RANTING vs program milik MWC langsung (mis. Koin Taqwa).
export enum BranchKind {
  RANTING = "RANTING",
  PROGRAM_MWC = "PROGRAM_MWC",
}

// C1-T0 (§14.6): co-sign 2 HP — PPK dulu lalu bendahara.
export enum PpkSubmissionStatus {
  DRAFT = "DRAFT",
  PPK_SIGNED = "PPK_SIGNED",
  FINAL = "FINAL",
}

// C1-T0 (§14.7): FINAL_NOL = dikunci 0 pemasukan (ranting diam lewat 10).
export enum BranchSubmissionStatus {
  DRAFT = "DRAFT",
  FINAL = "FINAL",
  FINAL_NOL = "FINAL_NOL",
}

// C1-T0 (§14.8): OPEN → TOLERANCE → LOCKED → DIBUKA_SEBAGIAN → LOCKED.
export enum PeriodStatus {
  OPEN = "OPEN",
  TOLERANCE = "TOLERANCE",
  LOCKED = "LOCKED",
  DIBUKA_SEBAGIAN = "DIBUKA_SEBAGIAN",
}

// C1-T3 (§14.12): DRAFT = menunggu setujui (boleh diedit); APPROVED = tugas aktif.
export enum PeriodDraftStatus {
  DRAFT = "DRAFT",
  APPROVED = "APPROVED",
}

// C1-T0 (§8): alasan wajib bila |aktual − ekspektasi| > Rp 10.000.
export type VarianceReason =
  | "KURANG_BAYAR"
  | "LEBIH_BAYAR"
  | "GABUNG_PERIODE"
  | "KOREKSI_ADMIN"
  | "HP_HILANG";

export enum AssignmentStatus {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  REASSIGNED = "REASSIGNED",
  UNCOLLECTED = "UNCOLLECTED",
}

export enum SyncStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

/**
 * Kondisi kaleng — sumber kebenaran perilaku bisnis.
 * Menggantikan makna ganda `is_active` (lihat docs/audit/rancangan-skema-status-kaleng-2026-09-12.md).
 */
export enum CanCondition {
  AKTIF = "AKTIF",
  NON_AKTIF = "NON_AKTIF",
  RUSAK = "RUSAK",
  HILANG = "HILANG",
  DIKEMBALIKAN = "DIKEMBALIKAN",
}

/** Kondisi yang masuk cakupan penempatan (HILANG punya cakupan sendiri). */
export const PLACEMENT_CONDITIONS: CanCondition[] = [
  CanCondition.AKTIF,
  CanCondition.NON_AKTIF,
  CanCondition.RUSAK,
];

/** Kondisi yang boleh menerima tugas penjemputan bulanan. */
export const ASSIGNABLE_CONDITIONS: CanCondition[] = [
  CanCondition.AKTIF,
  CanCondition.RUSAK,
  CanCondition.HILANG,
];

/** Kondisi yang menunggu keputusan admin ("perlu tindakan"). */
export const ACTION_REQUIRED_CONDITIONS: CanCondition[] = [
  CanCondition.NON_AKTIF,
  CanCondition.RUSAK,
  CanCondition.HILANG,
];

// ─── Kode alasan baku ─────────────────────────────────────────────────────────
// Disimpan sebagai kode (bukan teks bebas) agar dapat dihitung antar bulan.
export type SkipReasonCode =
  | "OWNER_ABSENT"
  | "OWNER_REFUSED"
  | "ACCESS_DIFFICULT"
  | "OTHER";

export type InactiveReasonCode =
  | "MOVED_HOUSE"
  | "OWNER_UNABLE"
  | "OWNER_REFUSED_CONTINUE"
  | "OTHER";

export type ReturnedReasonCode = "OWNER_REQUEST" | "CAN_INACTIVE";

/** Hasil tindakan petugas terhadap kaleng NON_AKTIF. */
export type CanVisitOutcome = "ISI" | "KOSONG" | "DIKEMBALIKAN" | "TIDAK_DIKUNJUNGI";


/** Pemicu usulan perubahan kondisi. */
export type CanProposalTriggerSource = "EMPTY_THRESHOLD" | "SKIP_REASON" | "MANUAL";

export type CanProposalStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Jenis kunjungan non-penjemputan. */
export type CanVisitPurpose = "VERIFIKASI" | "PENGGANTIAN" | "PENCABUTAN";

// ─── District ─────────────────────────────────────────────────────────────────
export interface District {
  id: string;
  code: string;
  name: string;
  region_code: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Branch (Ranting / Program MWC) ──────────────────────────────────────────
export interface Branch {
  id: string;
  district_id: string;
  code: string;
  name: string;
  /** C1-T0: RANTING vs PROGRAM_MWC (Taqwa). Default RANTING. */
  kind?: BranchKind;
  created_at?: string;
  updated_at?: string;
}

// ─── C1-T0: Submission PPK (1 PPK × 1 periode) ───────────────────────────────
export interface PpkSubmission {
  id: string;
  officer_id: string;
  branch_id: string;
  period_year: number;
  period_month: number;
  total_amount: number;
  collection_count: number;
  bisyaroh_amount: number;
  net_amount: number;
  formula_snapshot?: { bisyaroh_pct: number; rounding: string } | null;
  status: PpkSubmissionStatus;
  version: number;
  pdf_url?: string | null;
  pdf_hash?: string | null;
}

// ─── C1-T0: Submission ranting (1 ranting × 1 periode) ───────────────────────
export interface BranchSubmission {
  id: string;
  branch_id: string;
  district_id: string;
  period_year: number;
  period_month: number;
  total_amount: number;
  bisyaroh_total: number;
  share_mwc: number;
  net_amount: number;
  expected_share: number;
  share_variance: number;
  variance_reason?: VarianceReason | null;
  linked_periods?: string[] | null;
  collection_count: number;
  can_total: number;
  can_aktif: number;
  can_nonaktif: number;
  can_rusak: number;
  can_hilang: number;
  can_dikembalikan: number;
  status: BranchSubmissionStatus;
  version: number;
  pdf_url?: string | null;
  pdf_hash?: string | null;
}

// ─── C1-T0: Kalender periode (1 baris = 1 bulan) ─────────────────────────────
export interface PeriodCalendar {
  period_year: number;
  period_month: number;
  assign_date: string;
  due_date: string;
  tolerance_end: string;
  status: PeriodStatus;
}

// ─── C1-T3: Draft penugasan (1 draft = 1 ranting/program × 1 periode) ─────────
export interface PeriodDraft {
  id: string;
  period: string;
  period_year: number;
  period_month: number;
  branch_id: string;
  branch_name: string;
  branch_kind: BranchKind;
  status: PeriodDraftStatus;
  prepared_at: string;
  item_count: number;
  /** PENDING = menunggu Staf; ESCALATED = lewat 24 jam, giliran Keuangan. */
  event_kind: "APPROVED" | "ESCALATED" | "PENDING";
  period_status: PeriodStatus;
}

export interface PeriodDraftItem {
  id: string;
  can_id: string;
  qr_code?: string | null;
  owner_name: string;
  officer_id: string;
  officer_name: string;
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
  /** Masih dilacak sistem atau tidak (true: AKTIF/NON_AKTIF/RUSAK/HILANG, false: DIKEMBALIKAN). */
  is_active: boolean;
  /** Kondisi bisnis kaleng — pakai kolom ini untuk perilaku, bukan `is_active`. */
  condition: CanCondition;
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
  /** Kode alasan baku saat tugas tidak terjemput (UNCOLLECTED). */
  skip_reason_code?: string | null;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Can Condition Proposal (usulan + riwayat perubahan kondisi) ─────────────
export interface CanConditionProposal {
  id: string;
  can_id: string;
  from_condition: CanCondition;
  to_condition: CanCondition;
  trigger_source: CanProposalTriggerSource;
  reason_code: string;
  reason_note?: string | null;
  evidence_count?: number | null;
  status: CanProposalStatus;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
}

// ─── Can Visit (kunjungan non-penjemputan) ───────────────────────────────────
export interface CanVisit {
  id: string;
  can_id: string;
  officer_id: string;
  purpose: CanVisitPurpose;
  visited_at: string;
  notes?: string | null;
  created_at: string;
}

// ─── Collection (Setoran) ────────────────────────────────────────────────────
export interface Collection {
  id: string;
  assignment_id: string;
  can_id: string;
  officer_id: string;
  nominal: number;
  collected_at: string;
  submitted_at?: string;
  synced_at?: string;
  sync_status: SyncStatus;
  /** Kondisi bisnis kaleng saat riwayat dibaca; mengikuti kondisi kaleng saat ini. */
  condition?: CanCondition;
  whatsapp_status?: string;
  submit_sequence?: number;
  alasan_resubmit?: string | null;
  retry_attempts?: number;
  error_message?: string;
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
  // Mobile-only flag: koreksi nominal sudah disimpan di antrean offline
  // tetapi belum dibuang ke server (nominal di sini adalah nilai optimistis).
  pending_correction?: boolean;
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
  /** Kondisi kaleng (B2): menentukan perlakuan — NON_AKTIF butuh kunjungan, bukan penjemputan. */
  condition?: CanCondition;
  is_active?: boolean;
  status: AssignmentStatus;
  assigned_at: string;
  period: string;
  /**
   * C1-T2: true bila hasil scan berasal dari periode toleransi (bulan lalu,
   * masih dalam jendela s/d tgl 9). Dipakai chip "Toleransi" + countdown (T9).
   */
  tolerance?: boolean;
  last_collection?: {
    nominal: number;
    date: string;
  };
  /**
   * B2: true jika tugas ini berasal dari daftar "Perlu Dikunjungi" (kaleng
   * NON_AKTIF), bukan dari assignment asli. `id` mungkin berisi assignment_id
   * asli bila backend menyediakannya — jika tidak, id TIDAK boleh dipakai
   * sebagai assignment_id (lihat isVisitTask guard di TaskDetailScreen).
   */
  is_visit_task?: boolean;
  /**
   * B2 (khusus visit-task): status assignment periode berjalan kaleng ini.
   * null/undefined = belum ada assignment (dibuat on-demand saat penjemputan).
   * Selain ACTIVE = sudah dijemput periode ini → penjemputan baru ditolak.
   */
  assignment_status?: AssignmentStatus | null;
}

/** B2: kaleng NON_AKTIF di wilayah petugas yang perlu dikunjungi (bukan assignment). */
export interface VisitTask {
  can_id: string;
  qr_code: string;
  owner_name: string;
  owner_address: string;
  latitude?: number;
  longitude?: number;
  condition: CanCondition;
  /** Status pelacakan aktual; jangan diasumsikan true hanya dari label NON_AKTIF. */
  is_active?: boolean;
  /**
   * B2: assignment periode berjalan untuk kaleng NON_AKTIF, bila ada.
   * Kaleng NON_AKTIF tidak diberi assignment saat dibuat (ASSIGNABLE_CONDITIONS),
   * tapi penjemputan berisi butuh assignment (collections.assignment_id NOT NULL).
   * null = belum ada assignment; app wajib membuatnya on-demand sebelum submit.
   */
  assignment_id?: string | null;
  assignment_status?: string | null;
  last_visit: string | null;
  last_visit_purpose: CanVisitPurpose | null;
  last_visit_outcome: CanVisitOutcome | null;
  /** Visit pengembalian yang masih menunggu tombol Terima admin. */
  pending_return_visit_id?: string | null;
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

export interface MonthStats {
  collected: number;
  total_nominal: number;
  /** Total tugas pada periode berjalan (seluruh assignment scope + periode). */
  task_total: number;
  /**
   * COMPLETED saja (kontrak lama, dipertahankan untuk APK lama).
   * UI baru memakai `task_closed` bila ada.
   */
  task_completed: number;
  /** ACTIVE — tugas yang masih perlu dikerjakan. */
  task_active?: number;
  /** COMPLETED + UNCOLLECTED — tugas yang sudah ditutup operasional. */
  task_closed?: number;
  task_uncollected?: number;
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
  collected_at: string;
  latitude?: number;
  longitude?: number;
  condition: Extract<CanCondition, 'AKTIF' | 'RUSAK' | 'HILANG'>;
  /** ISI berarti kunjungan NON_AKTIF, bukan ordinary batch. */
  visit_outcome?: 'ISI';
  device_info?: DeviceInfo;
  submit_sequence?: number;
  is_latest?: boolean;
  error_type?: "VALIDATION" | "SERVER";
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
  sync_status: SyncStatus;
  officer_name: string;
  officer_code: string;
  branch_name: string;
  district_name: string;
  owner_name: string;
  owner_address: string;
  qr_code: string;
}

// ─── API Response Shapes (snake_case — match backend) ─────────────────────────
// Digunakan sebagai type parameter <T> di api.ts. Store melakukan mapping
// snake_case → camelCase di level consumed, bukan di level tipe.

export interface AuthLoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email?: string;
    full_name: string;
    role: string;
    branch_id?: string;
    district_id?: string;
  };
}

export interface MeResponse {
  id: string;
  email?: string;
  full_name: string;
  phone: string;
  role: string;
  branch_id?: string;
  district_id?: string;
  is_active: boolean;
  last_login?: string;
  officer?: {
    id: string;
    employee_code: string;
    photo_url?: string;
    assigned_zone?: string;
    is_active: boolean;
  };
}

// Dashboard response dari GET /mobile/dashboard
export interface DashboardResponse {
  today_stats: TodayStats;
  week_stats: WeekStats;
  /** Opsional untuk kompatibilitas aplikasi lama yang masih berjalan. */
  month_stats?: MonthStats;
  pending_tasks: DashboardTaskItem[];
  /** B2: kaleng NON_AKTIF yang perlu dikunjungi (bukan assignment). Opsional demi APK lama. */
  visit_tasks?: { total: number; completed: number };
  recent_collections: RecentCollectionSummary[];
}

// Response GET /mobile/tasks/stats-range — akumulasi dalam rentang tanggal.
// Progres tugas dihitung dari seluruh periode (bulan) yang tersentuh rentang.
export interface RangeStatsResponse {
  collected: number;
  total_nominal: number;
  task_active: number;
  task_completed: number;
  task_total: number;
  /** COMPLETED + UNCOLLECTED (opsional untuk kompatibilitas server lama). */
  task_closed?: number;
  task_uncollected?: number;
  /** Periode yang tersentuh rentang, format "YYYY-MM". */
  months_covered: string[];
}

// Response GET /mobile/assignments/:id/proposal-status — proyeksi status
// usulan kondisi untuk petugas (bukan detail penuh admin).
export interface ProposalStatusResponse {
  assignment_id: string;
  can_id: string;
  proposal: {
    id: string;
    from_condition: string;
    to_condition: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    reason_code?: string;
    action_label?: string;
    created_at: string;
    decided_at?: string | null;
  } | null;
}

export interface DashboardTaskItem {
  id: string;
  can_id: string;
  qr_code: string;
  owner_name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  assigned_at: string;
}

export interface RecentCollectionSummary {
  id: string;
  qr_code: string;
  owner_name: string;
  nominal: number;
  collected_at: string;
}

// GET /mobile/tasks — paginated
export interface TaskListResponse {
  tasks: Task[];
  total_nominal?: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

// GET /mobile/profile
export interface ProfileResponse {
  id: string;
  employee_code: string;
  full_name: string;
  phone: string;
  photo_url?: string;
  branch: { id: string; name: string };
  district: { id: string; name: string };
  assigned_zone?: string;
  stats: { total_collections: number; total_amount: number };
}

export interface ResubmitTrackerItem {
  id: string;
  collected_at: string;
  corrected_at?: string | null;
  submit_sequence: number;
  original_nominal: number;
  corrected_nominal: number;
  difference: number;
  alasan_resubmit: string;
  officer_name: string;
  officer_code: string;
  qr_code: string;
  owner_name: string;
  branch_name: string;
  district_name: string;
}
// GET /mobile/visits — riwayat kunjungan non-penjemputan milik petugas.
// Kunjungan bukan collection: tanpa nominal, tidak memengaruhi angka infak.
export interface CanVisitHistoryItem {
  id: string;
  can_id: string;
  qr_code: string;
  owner_name: string;
  purpose: 'VERIFIKASI' | 'PENGGANTIAN';
  outcome: CanVisitOutcome;
  condition: CanCondition;
  visited_at: string;
  notes?: string | null;
  received_at?: string | null;
}

// GET /mobile/collections (history) — paginated
export interface HistoryItem {
  id: string;
  offline_id?: string | null;
  assignment_id: string;
  can_id: string;
  qr_code: string;
  owner_name: string;
  owner_address: string;
  nominal: number;
  collected_at: string;
  condition: CanCondition;
  sync_status: SyncStatus;
  submit_sequence?: number;
}

export interface HistoryResponse {
  items: HistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface BatchCollectionRequestItem {
  offline_id: string;
  assignment_id: string;
  can_id: string;
  nominal: number;
  collected_at: string;
  latitude?: number;
  longitude?: number;
  condition: Extract<CanCondition, 'AKTIF' | 'RUSAK' | 'HILANG'>;
  /** ISI berarti kunjungan NON_AKTIF, bukan ordinary batch. */
  visit_outcome?: 'ISI';
  device_info?: DeviceInfo;
}

// POST /mobile/collections/batch — batch sync
export interface BatchItemResult {
  offline_id: string;
  server_id?: string;
  status: "COMPLETED" | "ALREADY_SYNCED" | "FAILED";
  error?: string;
  error_code?: string;
  error_type?: "VALIDATION" | "SERVER";
  can_retry?: boolean;
}

export interface BatchSyncResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchItemResult[];
}

// GET /v1/mobile/version — kontrak fitur update-in-app (Tingkat 1).
// Endpoint publik: info versi + tautan APK memang informasi publik,
// dan memungkinkan pengecekan sebelum login. Sumber data backend:
// routes/mobile/mobileRelease.json (di-commit tiap rilis).
export interface MobileVersionInfo {
  version: string;
  version_code: number;
  /** APK universal (nama lama) — dipakai app lama & fallback. */
  apk_url: string;
  /**
   * APK per-arsitektur: kunci `arm64_v8a` | `armeabi_v7a` | `universal`.
   * App ≥ v1.1.6 memilih sesuai ABI perangkat; kunci tak dikenal = fallback apk_url.
   */
  apk_urls: Record<string, string>;
  changelog: string;
  minimum_version_code: number;
}

// =============================================================================
// Overview operasional kaleng (GET /admin/branch/dashboard & /admin/district/dashboard)
//
// Definisi metrik tunggal — jangan dihitung ulang di browser:
// - placement_coverage  : AKTIF + NON_AKTIF + RUSAK (is_active = true)
// - lost_cans           : HILANG (cakupan terpisah, bukan bagian penempatan)
// - action_required     : NON_AKTIF + RUSAK + HILANG yang masih dilacak
// - task_closed         : assignment COMPLETED + UNCOLLECTED pada periode
// - task_total          : seluruh assignment pada scope + periode
// - successful_collections / collection_nominal : collection sync COMPLETED pada
//   periode, hanya versi submit terbaru (getLatestCollectionCondition)
// =============================================================================

export interface OverviewScope {
  type: "branch" | "district";
  district_id: string;
  branch_id?: string;
  branch_name?: string;
}

export interface OverviewPeriod {
  year: number;
  month: number;
  timezone: string;
  generated_at: string;
}

export interface OverviewSummary {
  placement_coverage: number;
  active_cans: number;
  inactive_cans: number;
  damaged_cans: number;
  lost_cans: number;
  returned_this_month: number;
  returned_total: number;
  action_required: number;
  total_officers: number;
  collection_nominal: number;
  successful_collections: number;
  task_active: number;
  task_closed: number;
  task_completed: number;
  task_uncollected: number;
  task_total: number;
}

export interface OverviewConditionBreakdownItem {
  condition: CanCondition;
  count: number;
}

export interface OverviewActionItem {
  can_id: string;
  owner_name: string;
  branch_id: string;
  branch_name: string;
  condition: CanCondition;
  proposal_id?: string;
  reason_code?: string;
  since: string;
  action_label: string;
}

export interface OverviewMonthlyTrendItem {
  /** Format "YYYY-MM". */
  month: string;
  collected: number;
  empty: number;
  uncollected: number;
  task_closed: number;
  task_total: number;
  nominal: number;
}

export interface OverviewBranchComparisonItem {
  branch_id: string;
  branch_name: string;
  placement_coverage: number;
  lost_cans: number;
  action_required: number;
  task_closed: number;
  task_total: number;
  collection_nominal: number;
}

export interface OverviewResponse {
  scope: OverviewScope;
  period: OverviewPeriod;
  summary: OverviewSummary;
  condition_breakdown: OverviewConditionBreakdownItem[];
  action_items: OverviewActionItem[];
  monthly_trend: OverviewMonthlyTrendItem[];
  branch_comparison?: OverviewBranchComparisonItem[];
}
