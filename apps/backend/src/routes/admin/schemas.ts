import { z } from 'zod';

export const createCanSchema = z.object({
  owner_name: z.string().min(1).max(100),
  owner_whatsapp: z.string().min(10).max(20),
  branch_id: z.preprocess((v) => v === '' ? undefined : v, z.string().uuid().optional().nullable()),
  dukuh_id: z.preprocess((v) => v === '' ? undefined : v, z.string().uuid().optional().nullable()),
  rt: z.string().max(10).optional().nullable(),
  rw: z.string().max(10).optional().nullable(),
  qr_code: z.string().optional().nullable(),
  owner_phone: z.string().optional().nullable(),
  owner_address: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  location_notes: z.string().optional().nullable(),
});

export const updateCanSchema = createCanSchema.partial().extend({
  is_active: z.boolean().optional(),
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

export const resubmitCollectionSchema = z.object({
  nominal: z.number().positive(),
  alasan_resubmit: z.string().min(5),
});
