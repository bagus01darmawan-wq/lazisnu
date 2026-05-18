import { createCanSchema, createAssignmentSchema, resubmitCollectionSchema } from '../schemas';

describe('createCanSchema', () => {
  const validBody = {
    owner_name: 'Bapak Ahmad',
    owner_whatsapp: '081234567890',
  };

  it('menerima body minimal', () => {
    const result = createCanSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it('menerima body dengan semua field opsional', () => {
    const result = createCanSchema.safeParse({
      ...validBody,
      branch_id: '00000000-0000-0000-0000-000000000001',
      dukuh_id: '00000000-0000-0000-0000-000000000002',
      rt: '01',
      rw: '02',
      owner_address: 'Jl. Merdeka No. 1',
      latitude: -6.2088,
      longitude: 106.8456,
      location_notes: 'Dekat masjid',
    });
    expect(result.success).toBe(true);
  });

  it('menerima branch_id kosong (string kosong di-preprocess jadi undefined)', () => {
    const result = createCanSchema.safeParse({
      ...validBody,
      branch_id: '',
    });
    expect(result.success).toBe(true);
  });

  it('menerima dukuh_id kosong', () => {
    const result = createCanSchema.safeParse({
      ...validBody,
      dukuh_id: '',
    });
    expect(result.success).toBe(true);
  });

  it('menolak owner_name kosong', () => {
    const result = createCanSchema.safeParse({
      ...validBody,
      owner_name: '',
    });
    expect(result.success).toBe(false);
  });

  it('menolak owner_whatsapp kurang dari 10 karakter', () => {
    const result = createCanSchema.safeParse({
      ...validBody,
      owner_whatsapp: '08123',
    });
    expect(result.success).toBe(false);
  });

  it('menolak owner_name lebih dari 100 karakter', () => {
    const result = createCanSchema.safeParse({
      ...validBody,
      owner_name: 'A'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('menolak branch_id bukan UUID', () => {
    const result = createCanSchema.safeParse({
      ...validBody,
      branch_id: 'not-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('createAssignmentSchema', () => {
  it('menerima body valid', () => {
    const result = createAssignmentSchema.safeParse({
      can_id: '00000000-0000-0000-0000-000000000001',
      officer_id: '00000000-0000-0000-0000-000000000002',
      period_year: 2026,
      period_month: 5,
    });
    expect(result.success).toBe(true);
  });

  it('menerima dengan backup_officer_id', () => {
    const result = createAssignmentSchema.safeParse({
      can_id: '00000000-0000-0000-0000-000000000001',
      officer_id: '00000000-0000-0000-0000-000000000002',
      backup_officer_id: '00000000-0000-0000-0000-000000000003',
      period_year: 2026,
      period_month: 5,
    });
    expect(result.success).toBe(true);
  });

  it('menolak period_year di bawah 2020', () => {
    const result = createAssignmentSchema.safeParse({
      can_id: '00000000-0000-0000-0000-000000000001',
      officer_id: '00000000-0000-0000-0000-000000000002',
      period_year: 2019,
      period_month: 5,
    });
    expect(result.success).toBe(false);
  });

  it('menolak period_month di luar 1-12', () => {
    const result = createAssignmentSchema.safeParse({
      can_id: '00000000-0000-0000-0000-000000000001',
      officer_id: '00000000-0000-0000-0000-000000000002',
      period_year: 2026,
      period_month: 13,
    });
    expect(result.success).toBe(false);
  });
});

describe('resubmitCollectionSchema', () => {
  it('menerima body valid', () => {
    const result = resubmitCollectionSchema.safeParse({
      nominal: 75000,
      alasan_resubmit: 'koreksi nominal',
    });
    expect(result.success).toBe(true);
  });

  it('menolak alasan_resubmit kurang dari 5 karakter', () => {
    const result = resubmitCollectionSchema.safeParse({
      nominal: 75000,
      alasan_resubmit: 'sala',
    });
    expect(result.success).toBe(false);
  });

  it('menolak nominal negatif', () => {
    const result = resubmitCollectionSchema.safeParse({
      nominal: -100,
      alasan_resubmit: 'koreksi nominal',
    });
    expect(result.success).toBe(false);
  });
});
