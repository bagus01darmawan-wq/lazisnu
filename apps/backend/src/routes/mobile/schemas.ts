import { z } from 'zod';

export const collectionSchema = z.object({
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
  /** Kondisi fisik wajib dari PPK; batch biasa tidak menerima status lifecycle. */
  condition: z.enum(['AKTIF', 'RUSAK', 'HILANG']),
}).strict();

export const batchCollectionSchema = z.object({
  collections: z.array(z.object({
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
    /** Batch biasa hanya menerima kondisi fisik tiga nilai. */
    condition: z.enum(['AKTIF', 'RUSAK', 'HILANG']),
    /** Penanda satu-satunya jalur NOMINAL untuk NON_AKTIF. */
    visit_outcome: z.literal('ISI').optional(),
  }).strict()),
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

/** C1-T5: countersign ranting oleh Bendahara MWC (angka sudah di-sign). */
export const countersignBranchSchema = signSubmissionSchema;

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

export const canVisitSubmitSchema = collectionSchema.extend({
  outcome: z.literal('ISI'),
  notes: z.string().max(255).optional(),
}).strict();

/** POST /mobile/cans/:canId/visits — tindakan NON_AKTIF tanpa nominal. */
export const canVisitSchema = z.object({
  outcome: z.enum(['ISI', 'KOSONG', 'DIKEMBALIKAN', 'TIDAK_DIKUNJUNGI']),
  condition: z.enum(['AKTIF', 'RUSAK', 'HILANG']).optional(),
  visited_at: z.string().datetime().optional(),
  notes: z.string().max(255).optional(),
}).strict().superRefine((body, ctx) => {
  if (body.outcome === 'ISI' && !body.condition) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['condition'],
      message: 'condition wajib diisi untuk Kaleng Isi',
    });
  }
  if (body.outcome !== 'ISI' && body.condition) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['condition'],
      message: 'condition hanya boleh diisi untuk Kaleng Isi',
    });
  }
});

/** POST /mobile/cans/:canId/visits — form nominal untuk Kaleng Isi. */
export const canVisitWithNominalSchema = z.object({
  outcome: z.literal('ISI'),
  condition: z.enum(['AKTIF', 'RUSAK', 'HILANG']),
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
}).strict();

/**
 * C1-T9: token perangkat milik sendiri (fondasi push T11). Token milik sesi
 * login — tanpa userId body.
 */
export const deviceTokenSchema = z.object({
  fcm_token: z.string().min(1).max(255),
}).strict();
