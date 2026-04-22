import { z } from 'zod';

export const collectionSchema = z.object({
  assignment_id: z.string().uuid(),
  can_id: z.string().uuid(),
  nominal: z.number().positive(),
  payment_method: z.enum(['CASH', 'TRANSFER']),
  transfer_receipt_url: z.string().url().optional(),
  collected_at: z.string().datetime(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  device_info: z.object({
    model: z.string(),
    os_version: z.string(),
    app_version: z.string(),
  }).optional(),
  offline_id: z.string().optional(),
});

export const batchCollectionSchema = z.object({
  collections: z.array(z.object({
    offline_id: z.string(),
    assignment_id: z.string().uuid(),
    can_id: z.string().uuid(),
    nominal: z.number().positive(),
    payment_method: z.enum(['CASH', 'TRANSFER']),
    collected_at: z.string().datetime(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })),
});

export const resubmitSchema = z.object({
  nominal: z.number().positive(),
  payment_method: z.enum(['CASH', 'TRANSFER']),
  alasan_resubmit: z.string().min(5, "Alasan resubmit minimal 5 karakter"),
});
