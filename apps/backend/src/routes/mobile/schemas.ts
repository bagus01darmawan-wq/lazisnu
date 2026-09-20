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
  }).strict()),
}).strict();

export const resubmitSchema = z.object({
  // BR-06: nominal: 0 VALID (lihat collectionSchema.nominal)
  nominal: z.number().min(0),
  alasan_resubmit: z.string().min(5, "Alasan resubmit minimal 5 karakter"),
}).strict();

export const skipAssignmentSchema = z.object({
  /**
   * Kode alasan baku. Wajib untuk APK baru; selama masa transisi APK lama yang belum
   * mengirim kode dipetakan ke `OTHER` di route (dan tetap dicatat `notes`-nya).
   */
  reason_code: z.enum([
    'OWNER_ABSENT',
    'OWNER_REFUSED',
    'CAN_LOST',
    'CAN_DAMAGED',
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

/** POST /mobile/cans/:canId/visits — kunjungan verifikasi / penggantian (BUKAN penjemputan). */
export const canVisitSchema = z.object({
  purpose: z.enum(['VERIFIKASI', 'PENGGANTIAN', 'PENCABUTAN']),
  visited_at: z.string().datetime().optional(),
  assignment_id: z.string().uuid().optional(),
  notes: z.string().max(255).optional(),
}).strict();
