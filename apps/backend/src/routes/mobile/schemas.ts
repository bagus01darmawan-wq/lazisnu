import { z } from 'zod';

/**
 * Kondisi fisik tiga nilai — kontrak baru (2026-11-13).
 * `condition` lama tetap diterima sebagai alias; pasangan yang bertentangan
 * ditolak di superRefine, bukan diam-diam dipilih salah satu.
 */
const physicalConditionSchema = z.enum(['BAIK', 'RUSAK', 'HILANG']);
const legacyBatchConditionSchema = z.enum(['AKTIF', 'RUSAK', 'HILANG']);

type ConditionPair = {
  condition?: 'AKTIF' | 'RUSAK' | 'HILANG';
  physical_condition?: 'BAIK' | 'RUSAK' | 'HILANG';
};

const physicalOfLegacy = (
  condition: 'AKTIF' | 'RUSAK' | 'HILANG',
): 'BAIK' | 'RUSAK' | 'HILANG' => (condition === 'AKTIF' ? 'BAIK' : condition);

const legacyOfPhysical = (
  physical: 'BAIK' | 'RUSAK' | 'HILANG',
): 'AKTIF' | 'RUSAK' | 'HILANG' => (physical === 'BAIK' ? 'AKTIF' : physical);

function refineConditionPair(
  body: ConditionPair,
  ctx: z.RefinementCtx,
  required: boolean,
): void {
  if (!body.condition && !body.physical_condition) {
    if (required) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['physical_condition'],
        message: 'physical_condition (atau condition legacy) wajib diisi',
      });
    }
    return;
  }
  if (body.condition && body.physical_condition) {
    const projected = physicalOfLegacy(body.condition);
    if (projected !== body.physical_condition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['physical_condition'],
        message: `physical_condition ${body.physical_condition} bertentangan dengan condition ${body.condition} (proyeksi ${projected})`,
      });
    }
  }
}

function normalizeConditionPair<T extends ConditionPair>(
  body: T,
): T & { condition: 'AKTIF' | 'RUSAK' | 'HILANG'; physical_condition: 'BAIK' | 'RUSAK' | 'HILANG' } {
  const physical = body.physical_condition ?? physicalOfLegacy(body.condition as 'AKTIF' | 'RUSAK' | 'HILANG');
  return {
    ...body,
    physical_condition: physical,
    condition: body.condition ?? legacyOfPhysical(physical),
  };
}

const collectionFields = {
  assignment_id: z.string().uuid(),
  can_id: z.string().uuid(),
  // BR-06: nominal: 0 VALID — hak pemilik kaleng memberi nominal berapapun
  // (termasuk 0 jika kaleng kosong). min(0) mengizinkan 0, hanya menolak negatif.
  // JANGAN ubah ke .positive() / .gt(0) — itu akan reject use case yang sah.
  nominal: z.number().min(0),
  collected_at: z.string().datetime(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  device_info: z.object({
    model: z.string(),
    os_version: z.string(),
    app_version: z.string(),
  }).optional(),
  offline_id: z.string().optional(),
  /** @deprecated Alias legacy; selalu konsisten dengan physical_condition. */
  condition: legacyBatchConditionSchema.optional(),
  /** Kondisi fisik eksplisit; batch biasa tidak menerima status lifecycle. */
  physical_condition: physicalConditionSchema.optional(),
  /** Penanda satu-satunya jalur NOMINAL untuk NON_AKTIF. */
  visit_outcome: z.literal('ISI').optional(),
} as const;

const collectionBaseSchema = z.object(collectionFields).strict();

export const collectionSchema = collectionBaseSchema
  .superRefine((body, ctx) => refineConditionPair(body, ctx, true))
  .transform((body) => normalizeConditionPair(body));

const batchItemBaseSchema = z.object({
  offline_id: z.string(),
  assignment_id: z.string().uuid(),
  can_id: z.string().uuid(),
  // BR-06: nominal: 0 VALID (lihat collectionSchema.nominal)
  nominal: z.number().min(0),
  collected_at: z.string().datetime(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  device_info: z.object({
    model: z.string(),
    os_version: z.string(),
    app_version: z.string(),
  }).optional(),
  /** @deprecated Alias legacy; selalu konsisten dengan physical_condition. */
  condition: legacyBatchConditionSchema.optional(),
  /** Kondisi fisik eksplisit. */
  physical_condition: physicalConditionSchema.optional(),
  /** Penanda satu-satunya jalur NOMINAL untuk NON_AKTIF. */
  visit_outcome: z.literal('ISI').optional(),
}).strict();

export const batchCollectionSchema = z.object({
  collections: z.array(
    batchItemBaseSchema
      .superRefine((body, ctx) => refineConditionPair(body, ctx, true))
      .transform((body) => normalizeConditionPair(body)),
  ),
}).strict();

export const resubmitSchema = z.object({
  // BR-06: nominal: 0 VALID (lihat collectionSchema.nominal)
  nominal: z.number().min(0),
  alasan_resubmit: z.string().min(5, "Alasan resubmit minimal 5 karakter"),
}).strict();

export const skipAssignmentSchema = z.object({
  /** Alasan tidak dijemput yang masih menjadi jalur ordinary. */
  reason_code: z.enum([
    'OWNER_ABSENT',
    'OWNER_REFUSED',
    'ACCESS_DIFFICULT',
    'OTHER',
  ]).optional(),
  notes: z.string().max(255).optional(),
}).strict();

/**
 * C1-T5: upacara co-sign. signer_id SELALU pemilik sesi (bukan body —
 * kunci berisi *_signer_id otomatis 400 karena .strict()).
 */
export const signSubmissionSchema = z.object({
  signature_png: z.string().min(100),
  consent: z.boolean(),
  expected_version: z.number().int().min(1).optional(),
}).strict();


/** C1-T5: force FINAL Admin Ranting (mensyaratkan PPK_SIGNED + kedua TTD). */
export const forceFinalizePpkSchema = z.object({
  force_reason: z.string().min(5).max(255),
  expected_version: z.number().int().min(1).optional(),
}).strict();

/**
 * C1-T7 (§14.8): reopen PPK FINAL → DRAFT menular. Hanya Admin Ranting
 * pemilik + MWC (scope di service); alasan wajib min 10 untuk audit.
 */
export const reopenSubmissionSchema = z.object({
  reason: z.string().min(10).max(255),
  expected_version: z.number().int().min(1).optional(),
}).strict();

export const canVisitSubmitSchema = collectionBaseSchema.extend({
  outcome: z.literal('ISI'),
  notes: z.string().max(255).optional(),
}).strict()
  .superRefine((body, ctx) => refineConditionPair(body, ctx, true))
  .transform((body) => normalizeConditionPair(body));

/** POST /mobile/cans/:canId/visits — tindakan NON_AKTIF tanpa nominal. */
export const canVisitSchema = z.object({
  outcome: z.enum(['ISI', 'KOSONG', 'DIKEMBALIKAN', 'TIDAK_DIKUNJUNGI']),
  /** @deprecated Alias legacy; selalu konsisten dengan physical_condition. */
  condition: legacyBatchConditionSchema.optional(),
  /** Kondisi fisik eksplisit untuk outcome ISI. */
  physical_condition: physicalConditionSchema.optional(),
  /** Tugas VISIT yang sedang dikerjakan (wajib untuk APK baru). */
  assignment_id: z.string().uuid().optional(),
  visited_at: z.string().datetime().optional(),
  notes: z.string().max(255).optional(),
}).strict().superRefine((body, ctx) => {
  if (body.outcome === 'ISI') {
    refineConditionPair(body, ctx, true);
    return;
  }
  if (body.condition || body.physical_condition) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['condition'],
      message: 'condition hanya boleh diisi untuk Kaleng Isi',
    });
  }
}).transform((body) => {
  if (!body.condition && !body.physical_condition) return body;
  const normalized = normalizeConditionPair(body);
  return {
    ...body,
    condition: normalized.condition,
    physical_condition: normalized.physical_condition,
  };
});

/** POST /mobile/cans/:canId/visits — form nominal untuk Kaleng Isi. */
export const canVisitWithNominalSchema = z.object({
  outcome: z.literal('ISI'),
  /** @deprecated Alias legacy; selalu konsisten dengan physical_condition. */
  condition: legacyBatchConditionSchema.optional(),
  physical_condition: physicalConditionSchema.optional(),
  nominal: z.number().min(0),
  collected_at: z.string().datetime(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  device_info: z.object({
    model: z.string(),
    os_version: z.string(),
    app_version: z.string(),
  }).optional(),
  offline_id: z.string().optional(),
}).strict()
  .superRefine((body, ctx) => refineConditionPair(body, ctx, true))
  .transform((body) => normalizeConditionPair(body));

/**
 * C1-T9: token perangkat milik sendiri (fondasi push T11). Token milik sesi
 * login — tanpa userId body.
 */
export const deviceTokenSchema = z.object({
  fcm_token: z.string().min(1).max(255),
}).strict();
