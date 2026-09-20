import { pgTable, uuid, varchar, text, timestamp, boolean, decimal, integer, json, pgEnum, uniqueIndex, index, bigint } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Enums
// C1-T0: tambah STAF_PENGUMPULAN (siapkan jadwal, pantau — tanpa FINAL/kunci/ubah nominal)
// dan STAF_KEUANGAN (pegang uang fisik, TTD kedua, unduh PDF — tanpa ubah nominal).
// Penegakan "tidak boleh" ada di server (routes/services, T4-T6), bukan cuma di UI.
export const userRoleEnum = pgEnum('user_role', ['ADMIN_KECAMATAN', 'ADMIN_RANTING', 'PETUGAS', 'STAF_PENGUMPULAN', 'STAF_KEUANGAN']);
/**
 * C1-T0: jenis cabang.
 * - RANTING     : ranting biasa (wajib setor share 30% ke MWC).
 * - PROGRAM_MWC : program milik MWC langsung (mis. Koin Taqwa — 100% ke MWC, tanpa share).
 * Default RANTING agar data lama tetap terbaca sebagai ranting; Taqwa di-backfill via migrasi.
 */
export const branchKindEnum = pgEnum('branch_kind', ['RANTING', 'PROGRAM_MWC']);
/** C1-T0: status setoran PPK — co-sign 2 HP (§14.6): DRAFT → PPK_SIGNED → FINAL. */
export const ppkSubmissionStatusEnum = pgEnum('ppk_submission_status', ['DRAFT', 'PPK_SIGNED', 'FINAL']);
/** C1-T0: status setoran ranting — FINAL_NOL = dikunci 0 pemasukan (§14.7). */
export const branchSubmissionStatusEnum = pgEnum('branch_submission_status', ['DRAFT', 'FINAL', 'FINAL_NOL']);
/** C1-T0: status kalender periode (§14.8): OPEN → TOLERANCE → LOCKED → DIBUKA_SEBAGIAN → LOCKED. */
export const periodStatusEnum = pgEnum('period_status', ['OPEN', 'TOLERANCE', 'LOCKED', 'DIBUKA_SEBAGIAN']);
/** C1-T0: alasan selisih share — wajib bila |selisih| > Rp 10.000 (§8). */
export const varianceReasonEnum = pgEnum('variance_reason', ['KURANG_BAYAR', 'LEBIH_BAYAR', 'GABUNG_PERIODE', 'KOREKSI_ADMIN', 'HP_HILANG']);
/**
 * C1-T3: status draft penugasan — robot siapkan → manusia setujui (§14.12).
 * DRAFT = menunggu persetujuan Staf (boleh diedit); APPROVED = sudah jadi
 * tugas aktif (tombol mati, tidak bisa disetujui dua kali). Tidak ada EXPIRED:
 * draft basi ditolak saat approve bila periodenya sudah dikunci (T3).
 */
export const draftStatusEnum = pgEnum('draft_status', ['DRAFT', 'APPROVED']);
export const collectionStatusEnum = pgEnum('collection_status', ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED']);
// POSTPONED dihapus 2026-09-16: dead enum — tidak pernah ditulis oleh alur
// manapun (generator hanya ACTIVE; transfer REASSIGNED; skip UNCOLLECTED)
// dan tidak ada baris POSTPONED di DB. "Tunda" diwakili oleh status ACTIVE
// + catatan notes; perubahan periode = assignment baru. Menghapus nilai dari
// enum di DB memerlukan rekreasi tipe (PostgreSQL tak punya DROP VALUE),
// lihat docs/ci/RENCANA-HAPUS-POSTPONED-2026-09-16.md.
export const assignmentStatusEnum = pgEnum('assignment_status', ['ACTIVE', 'COMPLETED', 'REASSIGNED', 'UNCOLLECTED']);

/**
 * Kondisi kaleng — sumber kebenaran perilaku bisnis (menggantikan makna ganda `is_active`).
 * - AKTIF        : dijemput, dihitung pada cakupan penempatan
 * - NON_AKTIF    : tidak dijemput, cukup dikunjungi untuk verifikasi
 * - RUSAK        : tetap dijemput (donasi bisa langsung ke PPK), perlu ganti unit
 * - HILANG       : tetap dijemput, punya cakupan sendiri, perlu kaleng baru
 * - DIKEMBALIKAN : keluar dari sistem (is_active = false)
 */
export const canConditionEnum = pgEnum('can_condition', [
  'AKTIF',
  'NON_AKTIF',
  'RUSAK',
  'HILANG',
  'DIKEMBALIKAN',
]);

// Districts
export const districts = pgTable('districts', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 10 }).unique().notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  regionCode: varchar('region_code', { length: 5 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Branches
export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  districtId: uuid('district_id').references(() => districts.id, { onDelete: 'cascade' }).notNull(),
  code: varchar('code', { length: 10 }).unique().notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  // C1-T0 (§8b opsi 1): diskriminator ranting vs program MWC. Default RANTING.
  kind: branchKindEnum('kind').default('RANTING').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Users
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }).unique().notNull(),
  role: userRoleEnum('role').notNull(),
  districtId: uuid('district_id').references(() => districts.id),
  branchId: uuid('branch_id').references(() => branches.id),
  isActive: boolean('is_active').default(true).notNull(),
  lastLogin: timestamp('last_login'),
  fcmToken: varchar('fcm_token', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Officers
export const officers = pgTable('officers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).unique().notNull(),
  employeeCode: varchar('employee_code', { length: 20 }).unique().notNull(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }).unique().notNull(),
  photoUrl: varchar('photo_url', { length: 500 }),
  districtId: uuid('district_id').references(() => districts.id).notNull(),
  branchId: uuid('branch_id').references(() => branches.id).notNull(),
  assignedZone: varchar('assigned_zone', { length: 100 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Dukuhs (Wilayah di bawah Ranting)
export const dukuhs = pgTable('dukuhs', {
  id: uuid('id').primaryKey().defaultRandom(),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Cans
export const cans = pgTable('cans', {
  id: uuid('id').primaryKey().defaultRandom(),
  qrCode: varchar('qr_code', { length: 50 }).unique(), // Made nullable as requested
  branchId: uuid('branch_id').references(() => branches.id).notNull(),
  dukuhId: uuid('dukuh_id').references(() => dukuhs.id),
  ownerName: varchar('owner_name', { length: 100 }).notNull(),
  ownerPhone: varchar('owner_phone', { length: 20 }),
  ownerAddress: text('owner_address'),
  dukuh: varchar('dukuh', { length: 100 }),
  rt: varchar('rt', { length: 10 }),
  rw: varchar('rw', { length: 10 }),
  ownerWhatsapp: varchar('owner_whatsapp', { length: 20 }).notNull(),
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 11, scale: 8 }),
  locationNotes: text('location_notes'),
  /**
   * is_active dipersempit maknanya menjadi satu pertanyaan saja: "masih dilacak atau tidak".
   * true  → AKTIF, NON_AKTIF, RUSAK, HILANG
   * false → DIKEMBALIKAN
   * Jangan pakai kolom ini untuk perilaku bisnis; pakai `condition`.
   */
  isActive: boolean('is_active').default(true).notNull(),
  condition: canConditionEnum('condition').default('AKTIF').notNull(),
  lastCollectedAt: timestamp('last_collected_at'),
  totalCollected: bigint('total_collected', { mode: 'bigint' }).default(sql`0`).notNull(),
  collectionCount: integer('collection_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Assignments
export const assignments = pgTable('assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  canId: uuid('can_id').references(() => cans.id, { onDelete: 'cascade' }).notNull(),
  officerId: uuid('officer_id').references(() => officers.id).notNull(),
  backupOfficerId: uuid('backup_officer_id').references(() => officers.id),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  status: assignmentStatusEnum('status').default('ACTIVE').notNull(),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  /** Kode alasan baku saat tugas tidak terjemput; `notes` tetap pelengkap bebas. */
  skipReasonCode: varchar('skip_reason_code', { length: 40 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  unq: uniqueIndex('can_officer_period_unq').on(t.canId, t.officerId, t.periodYear, t.periodMonth),
  assignmentsStatusPeriodIdx: index('assignments_status_period_idx').on(t.status, t.periodYear, t.periodMonth),
}));

// Collections
export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').references(() => assignments.id).notNull(),
  canId: uuid('can_id').references(() => cans.id).notNull(),
  officerId: uuid('officer_id').references(() => officers.id).notNull(),
  nominal: bigint('nominal', { mode: 'bigint' }).notNull(),
  collectedAt: timestamp('collected_at').notNull(),
  submittedAt: timestamp('submitted_at'),
  syncedAt: timestamp('synced_at'),
  syncStatus: collectionStatusEnum('sync_status').default('PENDING').notNull(),
  serverTimestamp: timestamp('server_timestamp'),
  deviceInfo: json('device_info'),
  latitude: decimal('latitude', { precision: 10, scale: 8 }),
  longitude: decimal('longitude', { precision: 11, scale: 8 }),
  offlineId: varchar('offline_id', { length: 100 }).unique(),
  // specific logic from GEMINI.md
  submitSequence: integer('submit_sequence').default(1).notNull(),
  alasanResubmit: text('alasan_resubmit'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  collectionVersionUnq: uniqueIndex('collection_assignment_can_sequence_unq').on(t.assignmentId, t.canId, t.submitSequence),
  collectionsOfficerStatusCollectedIdx: index('collections_officer_status_collected_idx').on(t.officerId, t.syncStatus, t.collectedAt),
}));

// Can Condition Proposals
// Usulan perubahan kondisi kaleng. Tabel ini sekaligus menjadi riwayat perubahan
// kondisi: baris APPROVED adalah catatan siapa mengubah apa, kapan, atas dasar apa.
export const canConditionProposals = pgTable('can_condition_proposals', {
  id: uuid('id').primaryKey().defaultRandom(),
  canId: uuid('can_id').references(() => cans.id, { onDelete: 'cascade' }).notNull(),

  fromCondition: canConditionEnum('from_condition').notNull(),
  toCondition: canConditionEnum('to_condition').notNull(),

  /** 'EMPTY_THRESHOLD' | 'SKIP_REASON' | 'MANUAL' */
  triggerSource: varchar('trigger_source', { length: 30 }).notNull(),

  reasonCode: varchar('reason_code', { length: 40 }).notNull(),
  reasonNote: text('reason_note'),

  /** Bukti pendukung — untuk EMPTY_THRESHOLD: jumlah penjemputan kosong berturut-turut. */
  evidenceCount: integer('evidence_count'),

  /** 'PENDING' | 'APPROVED' | 'REJECTED' */
  status: varchar('status', { length: 20 }).default('PENDING').notNull(),

  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  proposalsCanIdx: index('can_condition_proposals_can_idx').on(t.canId, t.createdAt),
  proposalsStatusIdx: index('can_condition_proposals_status_idx').on(t.status),
}));

// Can Visits
// Kunjungan yang BUKAN penjemputan. Sengaja dipisah dari `collections` agar
// ambang "enam kali kosong" dan nominal dashboard tidak tercemar kunjungan.
export const canVisits = pgTable('can_visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  canId: uuid('can_id').references(() => cans.id, { onDelete: 'cascade' }).notNull(),
  officerId: uuid('officer_id').references(() => officers.id).notNull(),
  /** 'VERIFIKASI' | 'PENGGANTIAN' */
  purpose: varchar('purpose', { length: 20 }).notNull(),
  visitedAt: timestamp('visited_at').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  visitsCanVisitedIdx: index('can_visits_can_visited_idx').on(t.canId, t.visitedAt),
}));

// Notifications
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  collectionId: uuid('collection_id').references(() => collections.id),
  recipientPhone: varchar('recipient_phone', { length: 20 }).notNull(),
  recipientName: varchar('recipient_name', { length: 100 }),
  messageTemplate: varchar('message_template', { length: 50 }),
  messageContent: text('message_content').notNull(),
  status: varchar('status', { length: 20 }).default('PENDING').notNull(),
  sentAt: timestamp('sent_at'),
  errorMessage: text('error_message'),
  waMessageId: varchar('wa_message_id', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Activity Logs
export const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  officerId: uuid('officer_id').references(() => officers.id),
  actionType: varchar('action_type', { length: 50 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }),
  entityId: uuid('entity_id'),
  requestId: varchar('request_id', { length: 100 }),
  oldData: json('old_data'),
  newData: json('new_data'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// C1-T0: submission PPK — satu baris per PPK per periode (§9.1 + §14.6/14.8/14.9/14.10).
// Total = SUM(collections.nominal) milik officer+periode, dihitung server (tanpa ketik manual).
// Unik (officer_id, period_year, period_month) agar FINAL dobel ditolak DB.
// TTD: PPK dulu (HP PPK) lalu bendahara (HP bendahara); beda userId ditegakkan
// aplikasi + CHECK DB; reopen menghanguskan TTD (T7).
// pdf_hash: SHA-256 hex PDF per versi agar unduhan lama tetap terverifikasi.
// ============================================================================
export const ppkSubmissions = pgTable('ppk_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  officerId: uuid('officer_id').references(() => officers.id).notNull(),
  branchId: uuid('branch_id').references(() => branches.id).notNull(),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  totalAmount: bigint('total_amount', { mode: 'bigint' }).default(sql`0`).notNull(),
  collectionCount: integer('collection_count').default(0).notNull(),
  bisyarohAmount: bigint('bisyaroh_amount', { mode: 'bigint' }).default(sql`0`).notNull(),
  netAmount: bigint('net_amount', { mode: 'bigint' }).default(sql`0`).notNull(),
  formulaSnapshot: json('formula_snapshot'),
  status: ppkSubmissionStatusEnum('status').default('DRAFT').notNull(),
  finalizedAt: timestamp('finalized_at'),
  finalizedBy: uuid('finalized_by').references(() => users.id),
  ppkSignerId: uuid('ppk_signer_id').references(() => users.id),
  ppkSignedAt: timestamp('ppk_signed_at'),
  ppkSignatureUrl: varchar('ppk_signature_url', { length: 500 }),
  bendaharaSignerId: uuid('bendahara_signer_id').references(() => users.id),
  bendaharaSignedAt: timestamp('bendahara_signed_at'),
  bendaharaSignatureUrl: varchar('bendahara_signature_url', { length: 500 }),
  version: integer('version').default(1).notNull(),
  pdfUrl: varchar('pdf_url', { length: 500 }),
  pdfHash: varchar('pdf_hash', { length: 128 }),
  // C1-T7 (§14.8): jendela koreksi pasca-reopen (NULL = DRAFT normal, selalu
  // boleh ditulis; terisi = DRAFT-dibuka-kembali, tulis ditolak bila lewat).
  reopenedUntil: timestamp('reopened_until'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  ppkOfficerPeriodUnq: uniqueIndex('ppk_officer_period_unq').on(t.officerId, t.periodYear, t.periodMonth),
  ppkBranchPeriodStatusIdx: index('ppk_branch_period_status_idx').on(t.branchId, t.periodYear, t.periodMonth, t.status),
}));

// ============================================================================
// C1-T0: submission ranting — satu baris per ranting per periode (§9.2 + B-4).
// share_mwc = nominal aktual disetor (boleh ≠ ekspektasi, wajib alasan bila |selisih|>10rb).
// 6 angka kaleng = snapshot kondisi saat FINAL (total + 5 keranjang §8c; ditarik tak dihitung).
// Taqwa (kind=PROGRAM_MWC) memakai tabel yang sama dengan share_mwc=0, label program.
// ============================================================================
export const branchSubmissions = pgTable('branch_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  branchId: uuid('branch_id').references(() => branches.id).notNull(),
  districtId: uuid('district_id').references(() => districts.id).notNull(),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  totalAmount: bigint('total_amount', { mode: 'bigint' }).default(sql`0`).notNull(),
  bisyarohTotal: bigint('bisyaroh_total', { mode: 'bigint' }).default(sql`0`).notNull(),
  shareMwc: bigint('share_mwc', { mode: 'bigint' }).default(sql`0`).notNull(),
  netAmount: bigint('net_amount', { mode: 'bigint' }).default(sql`0`).notNull(),
  expectedShare: bigint('expected_share', { mode: 'bigint' }).default(sql`0`).notNull(),
  shareVariance: bigint('share_variance', { mode: 'bigint' }).default(sql`0`).notNull(),
  varianceReason: varianceReasonEnum('variance_reason'),
  linkedPeriods: json('linked_periods'),
  collectionCount: integer('collection_count').default(0).notNull(),
  canTotal: integer('can_total').default(0).notNull(),
  canAktif: integer('can_aktif').default(0).notNull(),
  canNonaktif: integer('can_nonaktif').default(0).notNull(),
  canRusak: integer('can_rusak').default(0).notNull(),
  canHilang: integer('can_hilang').default(0).notNull(),
  canDikembalikan: integer('can_dikembalikan').default(0).notNull(),
  formulaSnapshot: json('formula_snapshot'),
  status: branchSubmissionStatusEnum('status').default('DRAFT').notNull(),
  finalizedAt: timestamp('finalized_at'),
  finalizedBy: uuid('finalized_by').references(() => users.id),
  rantingSignerId: uuid('ranting_signer_id').references(() => users.id),
  rantingSignedAt: timestamp('ranting_signed_at'),
  rantingSignatureUrl: varchar('ranting_signature_url', { length: 500 }),
  mwcBendaharaSignerId: uuid('mwc_bendahara_signer_id').references(() => users.id),
  mwcBendaharaSignedAt: timestamp('mwc_bendahara_signed_at'),
  mwcBendaharaSignatureUrl: varchar('mwc_bendahara_signature_url', { length: 500 }),
  version: integer('version').default(1).notNull(),
  pdfUrl: varchar('pdf_url', { length: 500 }),
  pdfHash: varchar('pdf_hash', { length: 128 }),
  // C1-T7 (§14.8): jendela koreksi pasca-reopen (NULL = DRAFT normal).
  reopenedUntil: timestamp('reopened_until'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  branchPeriodUnq: uniqueIndex('branch_period_unq').on(t.branchId, t.periodYear, t.periodMonth),
  branchDistrictPeriodStatusIdx: index('branch_district_period_status_idx').on(t.districtId, t.periodYear, t.periodMonth, t.status),
}));

// ============================================================================
// C1-T7: arsip PDF berita acara per versi (§14.8 + F1b review-T5).
// Kolom pdf_url/pdf_hash di submission hanya menyimpan versi TERAKHIR; tiap
// reopen mengarsipkan versi lama ke sini SEBELUM di-null-kan, agar PDF yang
// sudah terlanjur diunduh orang tetap terverifikasi (hash cocok = asli versi
// itu). Bytes PDF tak deterministik (doc-ID acak) sehingga regen tak bisa
// menggantikan arsip — wajib tabel riwayat, bukan kolom tunggal.
// Tanpa FK ke submission (baris arsip dipertahankan walau submission
// dihapus di test/retensi; join manual via submission_id + version).
// ============================================================================
export const baPdfArchives = pgTable('ba_pdf_archives', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 'ppk' | 'branch' — tier submission pemilik PDF. */
  tier: varchar('tier', { length: 10 }).notNull(),
  submissionId: uuid('submission_id').notNull(),
  version: integer('version').notNull(),
  /** Key R2 PDF versi itu (NULL bila versi itu tak pernah diunduh). */
  pdfKey: varchar('pdf_key', { length: 500 }),
  /** SHA-256 hex bytes PDF (NULL bila tak pernah di-generate). */
  pdfHash: varchar('pdf_hash', { length: 128 }),
  /** SHA-256 hash konten kanonis (masukan QR verifikasi) — selalu terisi. */
  contentHash: varchar('content_hash', { length: 128 }).notNull(),
  /** Status saat diarsipkan: FINAL / FINAL_NOL. */
  status: varchar('status', { length: 20 }).notNull(),
  archivedAt: timestamp('archived_at').defaultNow().notNull(),
  archivedBy: uuid('archived_by').references(() => users.id),
  reopenReason: varchar('reopen_reason', { length: 255 }),
}, (t) => ({
  baArchiveTierSubmissionVersionUnq: uniqueIndex('ba_archive_tier_submission_version_unq').on(t.tier, t.submissionId, t.version),
  baArchiveSubmissionIdx: index('ba_archive_submission_idx').on(t.tier, t.submissionId),
}));

// ============================================================================
// C1-T0: kalender periode — satu baris per periode YYYY-MM (§9.3).
// Tanggal tetap: assign tgl 20 00:00, due tgl 27, toleransi s/d tgl 9 bln berikut
// 23:59 WIB. Semua batas dihitung server WIB (T1 memakai operationalTimeZone).
// ============================================================================
export const periodCalendar = pgTable('period_calendar', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  assignDate: timestamp('assign_date').notNull(),
  dueDate: timestamp('due_date').notNull(),
  toleranceEnd: timestamp('tolerance_end').notNull(),
  status: periodStatusEnum('status').default('OPEN').notNull(),
  lockedAt: timestamp('locked_at'),
  lockedBy: uuid('locked_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  periodCalendarYearMonthUnq: uniqueIndex('period_calendar_year_month_unq').on(t.periodYear, t.periodMonth),
}));

// ============================================================================
// C1-T3: draft penugasan — robot siapkan, manusia setujui (§14.12, §6).
// Satu draft per (periode, ranting): draft ranting (branch kind=RANTING) dan
// draft program (branch kind=PROGRAM_MWC, mis. Taqwa) — keduanya baris branches
// biasa (Opsi 1 T0), sehingga branchId selalu terisi dan unik per periode.
// Robot TIDAK PERNAH menulis tabel assignments (hanya draft + period_calendar);
// tugas aktif lahir saat approve (sekali, tombol mati) atau sapuan susulan
// pasca-approve yang sudah diaudit.
// ============================================================================
export const periodDrafts = pgTable('period_drafts', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  branchId: uuid('branch_id').references(() => branches.id).notNull(),
  districtId: uuid('district_id').references(() => districts.id).notNull(),
  status: draftStatusEnum('status').default('DRAFT').notNull(),
  preparedAt: timestamp('prepared_at').defaultNow().notNull(),
  approvedAt: timestamp('approved_at'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedByRole: varchar('approved_by_role', { length: 20 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  periodBranchUnq: uniqueIndex('period_draft_period_branch_unq').on(t.periodYear, t.periodMonth, t.branchId),
  draftsDistrictPeriodStatusIdx: index('period_drafts_district_period_status_idx').on(t.districtId, t.periodYear, t.periodMonth, t.status),
}));

// Calon (kaleng → petugas) di dalam satu draft. officerId boleh diubah Staf
// Pengumpulan sebelum approve (edit draft, §14.12); backupOfficerId diteruskan
// ke assignments saat approve.
export const periodDraftItems = pgTable('period_draft_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  draftId: uuid('draft_id').references(() => periodDrafts.id, { onDelete: 'cascade' }).notNull(),
  canId: uuid('can_id').references(() => cans.id).notNull(),
  officerId: uuid('officer_id').references(() => officers.id).notNull(),
  backupOfficerId: uuid('backup_officer_id').references(() => officers.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  draftCanUnq: uniqueIndex('period_draft_item_draft_can_unq').on(t.draftId, t.canId),
  draftItemsDraftIdx: index('period_draft_items_draft_idx').on(t.draftId),
}));

// Collection Summary
export const collectionSummaries = pgTable('collection_summaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  districtId: uuid('district_id').references(() => districts.id),
  branchId: uuid('branch_id').references(() => branches.id),
  officerId: uuid('officer_id').references(() => officers.id),
  totalAmount: bigint('total_amount', { mode: 'bigint' }).default(sql`0`).notNull(),
  collectionCount: integer('collection_count').default(0).notNull(),
  calculatedAt: timestamp('calculated_at').defaultNow().notNull(),
}, (t) => ({
  unq: uniqueIndex('summary_period_dist_br_off_unq').on(t.periodYear, t.periodMonth, t.districtId, t.branchId, t.officerId),
}));

// Relations definition
export const usersRelations = relations(users, ({ one, many }) => ({
  district: one(districts, { fields: [users.districtId], references: [districts.id] }),
  branch: one(branches, { fields: [users.branchId], references: [branches.id] }),
  officers: many(officers),
}));

export const districtsRelations = relations(districts, ({ many }) => ({
  branches: many(branches),
  officers: many(officers),
  users: many(users),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  district: one(districts, { fields: [branches.districtId], references: [districts.id] }),
  users: many(users),
  officers: many(officers),
  cans: many(cans),
}));

export const officersRelations = relations(officers, ({ one, many }) => ({
  user: one(users, { fields: [officers.userId], references: [users.id] }),
  district: one(districts, { fields: [officers.districtId], references: [districts.id] }),
  branch: one(branches, { fields: [officers.branchId], references: [branches.id] }),
  assignments: many(assignments, { relationName: 'PrimaryOfficer' }),
  backupAssignments: many(assignments, { relationName: 'BackupOfficer' }),
  collections: many(collections),
  visits: many(canVisits),
}));

export const cansRelations = relations(cans, ({ one, many }) => ({
  branch: one(branches, { fields: [cans.branchId], references: [branches.id] }),
  dukuhDetails: one(dukuhs, { fields: [cans.dukuhId], references: [dukuhs.id] }),
  assignments: many(assignments),
  collections: many(collections),
  conditionProposals: many(canConditionProposals),
  visits: many(canVisits),
}));

export const canConditionProposalsRelations = relations(canConditionProposals, ({ one }) => ({
  can: one(cans, { fields: [canConditionProposals.canId], references: [cans.id] }),
  approver: one(users, { fields: [canConditionProposals.approvedBy], references: [users.id] }),
}));

export const canVisitsRelations = relations(canVisits, ({ one }) => ({
  can: one(cans, { fields: [canVisits.canId], references: [cans.id] }),
  officer: one(officers, { fields: [canVisits.officerId], references: [officers.id] }),
}));

export const dukuhsRelations = relations(dukuhs, ({ one, many }) => ({
  branch: one(branches, { fields: [dukuhs.branchId], references: [branches.id] }),
  cans: many(cans),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  can: one(cans, { fields: [assignments.canId], references: [cans.id] }),
  officer: one(officers, { fields: [assignments.officerId], references: [officers.id], relationName: 'PrimaryOfficer' }),
  backupOfficer: one(officers, { fields: [assignments.backupOfficerId], references: [officers.id], relationName: 'BackupOfficer' }),
  collections: many(collections),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  assignment: one(assignments, { fields: [collections.assignmentId], references: [assignments.id] }),
  can: one(cans, { fields: [collections.canId], references: [cans.id] }),
  officer: one(officers, { fields: [collections.officerId], references: [officers.id] }),
  notifications: many(notifications),
  activityLogs: many(activityLogs),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  collection: one(collections, { fields: [notifications.collectionId], references: [collections.id] }),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
  officer: one(officers, { fields: [activityLogs.officerId], references: [officers.id] }),
}));

// User Sessions
export const userSessions = pgTable('user_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  jti: varchar('jti', { length: 255 }).unique().notNull(),
  deviceId: varchar('device_id', { length: 100 }),
  deviceLabel: varchar('device_label', { length: 100 }),
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }),
  lastUsedAt: timestamp('last_used_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  revokedAt: timestamp('revoked_at'),
});

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, { fields: [userSessions.userId], references: [users.id] }),
}));

export const ppkSubmissionsRelations = relations(ppkSubmissions, ({ one }) => ({
  officer: one(officers, { fields: [ppkSubmissions.officerId], references: [officers.id] }),
  branch: one(branches, { fields: [ppkSubmissions.branchId], references: [branches.id] }),
  ppkSigner: one(users, { fields: [ppkSubmissions.ppkSignerId], references: [users.id] }),
  bendaharaSigner: one(users, { fields: [ppkSubmissions.bendaharaSignerId], references: [users.id] }),
}));

export const branchSubmissionsRelations = relations(branchSubmissions, ({ one }) => ({
  branch: one(branches, { fields: [branchSubmissions.branchId], references: [branches.id] }),
  district: one(districts, { fields: [branchSubmissions.districtId], references: [districts.id] }),
  rantingSigner: one(users, { fields: [branchSubmissions.rantingSignerId], references: [users.id] }),
  mwcBendaharaSigner: one(users, { fields: [branchSubmissions.mwcBendaharaSignerId], references: [users.id] }),
}));

export const periodCalendarRelations = relations(periodCalendar, ({ one }) => ({
  locker: one(users, { fields: [periodCalendar.lockedBy], references: [users.id] }),
}));

export const periodDraftsRelations = relations(periodDrafts, ({ one, many }) => ({
  branch: one(branches, { fields: [periodDrafts.branchId], references: [branches.id] }),
  district: one(districts, { fields: [periodDrafts.districtId], references: [districts.id] }),
  approver: one(users, { fields: [periodDrafts.approvedBy], references: [users.id] }),
  items: many(periodDraftItems),
}));

export const periodDraftItemsRelations = relations(periodDraftItems, ({ one }) => ({
  draft: one(periodDrafts, { fields: [periodDraftItems.draftId], references: [periodDrafts.id] }),
  can: one(cans, { fields: [periodDraftItems.canId], references: [cans.id] }),
  officer: one(officers, { fields: [periodDraftItems.officerId], references: [officers.id] }),
}));

