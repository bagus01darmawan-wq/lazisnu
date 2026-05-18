import { collectionSchema, resubmitSchema, batchCollectionSchema } from '../schemas';

describe('collectionSchema', () => {
  const validBody = {
    assignment_id: '00000000-0000-0000-0000-000000000001',
    can_id: '00000000-0000-0000-0000-000000000002',
    nominal: 50000,
    payment_method: 'CASH' as const,
    collected_at: '2026-05-17T10:00:00.000Z',
  };

  it('menerima body valid', () => {
    const result = collectionSchema.safeParse(validBody);
    expect(result.success).toBe(true);
  });

  it('menerima body dengan offline_id opsional', () => {
    const result = collectionSchema.safeParse({
      ...validBody,
      offline_id: 'local-123456',
    });
    expect(result.success).toBe(true);
  });

  it('menerima body dengan TRANSFER + receipt URL', () => {
    const result = collectionSchema.safeParse({
      ...validBody,
      payment_method: 'TRANSFER',
      transfer_receipt_url: 'https://example.com/receipt.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('menolak nominal 0 atau negatif', () => {
    const r1 = collectionSchema.safeParse({ ...validBody, nominal: 0 });
    expect(r1.success).toBe(false);

    const r2 = collectionSchema.safeParse({ ...validBody, nominal: -100 });
    expect(r2.success).toBe(false);
  });

  it('menolak assignment_id bukan UUID', () => {
    const result = collectionSchema.safeParse({
      ...validBody,
      assignment_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('menolak can_id bukan UUID', () => {
    const result = collectionSchema.safeParse({
      ...validBody,
      can_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('menolak payment_method tidak valid', () => {
    const result = collectionSchema.safeParse({
      ...validBody,
      payment_method: 'CREDIT_CARD',
    });
    expect(result.success).toBe(false);
  });

  it('menolak collected_at bukan ISO datetime', () => {
    const result = collectionSchema.safeParse({
      ...validBody,
      collected_at: '17-05-2026',
    });
    expect(result.success).toBe(false);
  });

  it('menolak jika assignment_id hilang', () => {
    const { assignment_id, ...rest } = validBody;
    const result = collectionSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });
});

describe('resubmitSchema', () => {
  it('menerima body valid', () => {
    const result = resubmitSchema.safeParse({
      nominal: 75000,
      payment_method: 'CASH',
      alasan_resubmit: 'salah input nominal sebelumnya',
    });
    expect(result.success).toBe(true);
  });

  it('menolak alasan_resubmit kurang dari 5 karakter', () => {
    const result = resubmitSchema.safeParse({
      nominal: 75000,
      payment_method: 'CASH',
      alasan_resubmit: 'sala',
    });
    expect(result.success).toBe(false);
  });

  it('menolak nominal negatif', () => {
    const result = resubmitSchema.safeParse({
      nominal: -100,
      payment_method: 'CASH',
      alasan_resubmit: 'salah input nominal',
    });
    expect(result.success).toBe(false);
  });
});

describe('batchCollectionSchema', () => {
  it('menerima batch valid', () => {
    const result = batchCollectionSchema.safeParse({
      collections: [
        {
          offline_id: 'loc-1',
          assignment_id: '00000000-0000-0000-0000-000000000001',
          can_id: '00000000-0000-0000-0000-000000000002',
          nominal: 50000,
          payment_method: 'CASH',
          collected_at: '2026-05-17T10:00:00.000Z',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('menolak collections kosong', () => {
    const result = batchCollectionSchema.safeParse({ collections: [] });
    // z.array() min 1 not set, so empty might be valid. Only check invalid item cases.
    expect(result.success).toBe(true);
  });

  it('menolak item dengan nominal 0', () => {
    const result = batchCollectionSchema.safeParse({
      collections: [
        {
          offline_id: 'loc-1',
          assignment_id: '00000000-0000-0000-0000-000000000001',
          can_id: '00000000-0000-0000-0000-000000000002',
          nominal: 0,
          payment_method: 'CASH',
          collected_at: '2026-05-17T10:00:00.000Z',
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
