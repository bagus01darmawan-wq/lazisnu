/**
 * C1-T8 — unit murni: keketatan schema insiden (.strict(), pola F4).
 */
import { emergencyAggregateSchema, manualCollectionSchema } from '../../routes/admin/schemas';

describe('C1-T8 schema insiden ketat', () => {
  test('agregat: alasan di luar HP_HILANG/KOREKSI_ADMIN ditolak; kunci asing ditolak', () => {
    const base = {
      officer_id: '00000000-0000-0000-0000-000000000001',
      year: 2026,
      month: 9,
      amount: 50000,
      reason: 'HP_HILANG',
      witness_user_id: '00000000-0000-0000-0000-000000000002',
      note: 'uang fisik dihitung bersama bendahara',
    };
    expect(emergencyAggregateSchema.safeParse(base).success).toBe(true);
    expect(emergencyAggregateSchema.safeParse({ ...base, reason: 'LEBIH_BAYAR' }).success).toBe(false);
    expect(emergencyAggregateSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(emergencyAggregateSchema.safeParse({ ...base, note: 'pendek' }).success).toBe(false);
    expect(emergencyAggregateSchema.safeParse({ ...base, hacker: 1 }).success).toBe(false);
  });

  test('salin manual: alasan pendek & nominal negatif ditolak; kunci asing ditolak', () => {
    const base = {
      assignment_id: '00000000-0000-0000-0000-000000000001',
      can_id: '00000000-0000-0000-0000-000000000002',
      officer_id: '00000000-0000-0000-0000-000000000003',
      nominal: 75000,
      collected_at: new Date(2026, 8, 25, 10, 0, 0).toISOString(),
      reason: 'salinan catatan kertas halaman 3',
    };
    expect(manualCollectionSchema.safeParse(base).success).toBe(true);
    expect(manualCollectionSchema.safeParse({ ...base, reason: 'pendek' }).success).toBe(false);
    expect(manualCollectionSchema.safeParse({ ...base, nominal: -1 }).success).toBe(false);
    expect(manualCollectionSchema.safeParse({ ...base, officer_id: 'bukan-uuid' }).success).toBe(false);
  });
});
