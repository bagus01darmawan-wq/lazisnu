import { z } from 'zod';

const optionalAddressSchema = z.string().optional().nullable().transform((value) => value?.trim() ?? '');

export const createCanSchema = z.object({
  owner_name: z.string().min(1).max(100),
  owner_whatsapp: z.string().min(10).max(20),
  branch_id: z.preprocess((v) => v === '' ? undefined : v, z.string().uuid().optional().nullable()),
  dukuh_id: z.preprocess((v) => v === '' ? undefined : v, z.string().uuid().optional().nullable()),
  rt: z.string().max(10).optional().nullable(),
  rw: z.string().max(10).optional().nullable(),
  qr_code: z.string().optional().nullable(),
  owner_phone: z.string().optional().nullable(),
  owner_address: optionalAddressSchema,
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  location_notes: z.string().optional().nullable(),
});

export const updateCanSchema = createCanSchema.partial().extend({
  /** @deprecated Alias lama; dipetakan ke condition (false → DIKEMBALIKAN, true → AKTIF). */
  is_active: z.boolean().optional(),
  /** Transisi kondisi eksplisit (lihat services/conditionRules.ts). */
  condition: z.enum(['AKTIF', 'NON_AKTIF', 'RUSAK', 'HILANG', 'DIKEMBALIKAN']).optional(),
  condition_reason_code: z.string().max(40).optional().nullable(),
});

export const createOfficerSchema = z.object({
  full_name: z.string().min(1).max(100),
  phone: z.string().min(10).max(20),
  assigned_zone: z.string().optional(),
  photo_url: z.string().url().optional(),
});

export const updateOfficerSchema = createOfficerSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export const createAssignmentSchema = z.object({
  can_id: z.string().uuid(),
  officer_id: z.string().uuid(),
  backup_officer_id: z.string().uuid().optional(),
  period_year: z.number().min(2020).max(2100),
  period_month: z.number().min(1).max(12),
});

/** C1-T3: ganti petugas satu item draft (harus aktif + satu ranting/program). */
export const updateDraftItemSchema = z.object({
  officer_id: z.string().uuid(),
});

/**
 * C1-T5: sign tingkat ranting (Admin Ranting di sesinya + angka T4).
 * signer_id = pemilik sesi — kunci *_signer_id otomatis 400 (.strict()).
 */
export const signBranchSchema = z.object({
  signature_png: z.string().min(100),
  consent: z.boolean(),
  expected_version: z.number().int().min(1).optional(),
  share_mwc: z.number().min(0),
  variance_reason: z.enum(['KURANG_BAYAR', 'LEBIH_BAYAR', 'GABUNG_PERIODE', 'KOREKSI_ADMIN', 'HP_HILANG']).optional(),
  linked_periods: z.array(z.string()).optional(),
  as_nol: z.boolean().optional(),
}).strict();

/** C1-T5: hapus coretan TTD (retensi UU 27/2022) — Admin MWC beralasan. */
export const purgeSignatureSchema = z.object({
  key: z.string().min(1),
  reason: z.string().min(5).max(255),
}).strict();

/**
 * C1-T7 (§14.8): reopen ranting FINAL/FINAL_NOL → DRAFT. Hanya Admin Ranting
 * pemilik + MWC (scope di service); alasan wajib min 10 untuk audit.
 */
export const reopenBranchSchema = z.object({
  reason: z.string().min(10).max(255),
  expected_version: z.number().int().min(1).optional(),
}).strict();

/**
 * C1-T6 (§14.7): Kunci Periode MWC 2 tahap — REKAP (27–9, tarik FINAL saja)
 * vs KUNCI_KERAS (10+, FINAL_NOL massal + LOCKED). Hanya ADMIN_KECAMATAN.
 */
export const kunciPeriodeSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
}).strict();

/**
 * C1-T8 (§14 #5c): agregat darurat — 1 angka dari uang fisik + saksi
 * bendahara + alasan HP_HILANG/KOREKSI_ADMIN. Upsert per officer+periode.
 */
export const emergencyAggregateSchema = z.object({
  officer_id: z.string().uuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().int().min(1),
  reason: z.enum(['HP_HILANG', 'KOREKSI_ADMIN']),
  witness_user_id: z.string().uuid(),
  note: z.string().min(10).max(255),
}).strict();

/**
 * C1-T8 (§14 #5b): salin manual per kaleng dari catatan kertas + alasan
 * KOREKSI_ADMIN. Validasi inti sama dengan submit PPK (service).
 */
export const manualCollectionSchema = z.object({
  assignment_id: z.string().uuid(),
  can_id: z.string().uuid(),
  officer_id: z.string().uuid(),
  nominal: z.number().min(0),
  collected_at: z.string().datetime(),
  reason: z.string().min(10).max(255),
}).strict();
