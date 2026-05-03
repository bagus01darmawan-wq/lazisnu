import { pgTable, uuid, varchar, text, timestamp, boolean, decimal, integer, json, pgEnum, uniqueIndex, bigint } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['ADMIN_KECAMATAN', 'ADMIN_RANTING', 'BENDAHARA', 'PETUGAS']);
export const collectionStatusEnum = pgEnum('collection_status', ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED']);
export const paymentMethodEnum = pgEnum('payment_method', ['CASH', 'TRANSFER']);
export const assignmentStatusEnum = pgEnum('assignment_status', ['ACTIVE', 'COMPLETED', 'POSTPONED', 'REASSIGNED']);

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
  isActive: boolean('is_active').default(true).notNull(),
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
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  unq: uniqueIndex('can_officer_period_unq').on(t.canId, t.officerId, t.periodYear, t.periodMonth),
}));

// Collections
export const collections = pgTable('collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  assignmentId: uuid('assignment_id').references(() => assignments.id).notNull(),
  canId: uuid('can_id').references(() => cans.id).notNull(),
  officerId: uuid('officer_id').references(() => officers.id).notNull(),
  nominal: bigint('nominal', { mode: 'bigint' }).notNull(),
  paymentMethod: paymentMethodEnum('payment_method').default('CASH').notNull(),
  transferReceiptUrl: varchar('transfer_receipt_url', { length: 500 }),
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
  isLatest: boolean('is_latest').default(true).notNull(),
  submitSequence: integer('submit_sequence').default(1).notNull(),
  alasanResubmit: text('alasan_resubmit'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

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
  oldData: json('old_data'),
  newData: json('new_data'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Sync Queue
export const syncQueues = pgTable('sync_queues', {
  id: uuid('id').primaryKey().defaultRandom(),
  officerId: uuid('officer_id').references(() => officers.id).notNull(),
  entityType: varchar('entity_type', { length: 50 }).notNull(),
  entityData: json('entity_data').notNull(),
  localId: varchar('local_id', { length: 100 }).notNull(),
  status: varchar('status', { length: 20 }).default('PENDING').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
});

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
  cashCount: integer('cash_count').default(0).notNull(),
  cashAmount: bigint('cash_amount', { mode: 'bigint' }).default(sql`0`).notNull(),
  transferCount: integer('transfer_count').default(0).notNull(),
  transferAmount: bigint('transfer_amount', { mode: 'bigint' }).default(sql`0`).notNull(),
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
  syncQueues: many(syncQueues),
}));

export const cansRelations = relations(cans, ({ one, many }) => ({
  branch: one(branches, { fields: [cans.branchId], references: [branches.id] }),
  dukuhDetails: one(dukuhs, { fields: [cans.dukuhId], references: [dukuhs.id] }),
  assignments: many(assignments),
  collections: many(collections),
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

