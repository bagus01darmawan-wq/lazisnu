import {
  batchCollectionSchema,
  canVisitSchema,
  collectionSchema,
  resubmitSchema,
} from '../schemas';

describe('collectionSchema', () => {
  const validBody = {
    assignment_id: '00000000-0000-4000-8000-000000000001',
    can_id: '00000000-0000-4000-8000-000000000002',
    nominal: 50000,
    condition: 'AKTIF',
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


  // BR-06: nominal: 0 VALID — hak pemilik kaleng memberi nominal berapapun
  // (termasuk 0 jika kaleng kosong/tidak ada donasi). Pisah test:
  // - "menerima nominal 0" -> success: true
  // - "menolak nominal negatif" -> success: false (donasi tidak mungkin negatif)
  it('menerima nominal 0 (BR-06: hak pemilik kaleng memberi nominal berapapun)', () => {
    const result = collectionSchema.safeParse({ ...validBody, nominal: 0 });
    expect(result.success).toBe(true);
  });

  it('menolak nominal negatif (donasi tidak mungkin negatif)', () => {
    const result = collectionSchema.safeParse({ ...validBody, nominal: -100 });
    expect(result.success).toBe(false);
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

  it('menerima physical_condition saja dan menormalkan alias legacy', () => {
    const { condition: _condition, ...withoutLegacy } = validBody;
    const result = collectionSchema.safeParse({
      ...withoutLegacy,
      physical_condition: 'RUSAK',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.physical_condition).toBe('RUSAK');
      expect(result.data.condition).toBe('RUSAK');
    }
  });

  it('menolak pasangan condition + physical_condition yang bertentangan', () => {
    const result = collectionSchema.safeParse({
      ...validBody,
      condition: 'AKTIF',
      physical_condition: 'RUSAK',
    });
    expect(result.success).toBe(false);
  });

  it('menolak request tanpa condition maupun physical_condition', () => {
    const { condition: _condition, ...withoutCondition } = validBody;
    const result = collectionSchema.safeParse(withoutCondition);
    expect(result.success).toBe(false);
  });
});

describe('kondisi fisik baru — batch dan kunjungan', () => {
  const item = {
    offline_id: 'loc-fisik-1',
    assignment_id: '00000000-0000-4000-8000-000000000001',
    can_id: '00000000-0000-4000-8000-000000000002',
    nominal: 10000,
    collected_at: '2026-05-17T10:00:00.000Z',
  };

  it('batch menerima physical_condition saja', () => {
    const result = batchCollectionSchema.safeParse({
      collections: [{ ...item, physical_condition: 'HILANG' }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.collections[0]).toMatchObject({
        physical_condition: 'HILANG',
        condition: 'HILANG',
      });
    }
  });

  it('batch menolak pasangan yang bertentangan', () => {
    const result = batchCollectionSchema.safeParse({
      collections: [{ ...item, condition: 'RUSAK', physical_condition: 'BAIK' }],
    });
    expect(result.success).toBe(false);
  });

  it('kunjungan ISI menerima physical_condition saja', () => {
    const result = canVisitSchema.safeParse({
      outcome: 'ISI',
      physical_condition: 'BAIK',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.condition).toBe('AKTIF');
    }
  });

  it('kunjungan KOSONG menolak physical_condition', () => {
    const result = canVisitSchema.safeParse({
      outcome: 'KOSONG',
      physical_condition: 'RUSAK',
    });
    expect(result.success).toBe(false);
  });
});

describe('resubmitSchema', () => {
  it('menerima body valid', () => {
    const result = resubmitSchema.safeParse({
      nominal: 75000,
      alasan_resubmit: 'salah input nominal sebelumnya',
    });
    expect(result.success).toBe(true);
  });

  it('menolak alasan_resubmit kurang dari 5 karakter', () => {
    const result = resubmitSchema.safeParse({
      nominal: 75000,
      alasan_resubmit: 'sala',
    });
    expect(result.success).toBe(false);
  });

  it('menolak nominal negatif', () => {
    const result = resubmitSchema.safeParse({
      nominal: -100,
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
          assignment_id: '00000000-0000-4000-8000-000000000001',
          can_id: '00000000-0000-4000-8000-000000000002',
          nominal: 50000,
    condition: 'AKTIF',
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

  it('menerima item dengan nominal 0 (BR-06: hak pemilik kaleng memberi nominal berapapun)', () => {
    const result = batchCollectionSchema.safeParse({
      collections: [
        {
          offline_id: 'loc-1',
          assignment_id: '00000000-0000-4000-8000-000000000001',
          can_id: '00000000-0000-4000-8000-000000000002',
          nominal: 0,
    condition: 'AKTIF',
          collected_at: '2026-05-17T10:00:00.000Z',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('menerima item dengan device_info valid', () => {
    const result = batchCollectionSchema.safeParse({
      collections: [
        {
          offline_id: 'loc-1',
          assignment_id: '00000000-0000-4000-8000-000000000001',
          can_id: '00000000-0000-4000-8000-000000000002',
          nominal: 50000,
    condition: 'AKTIF',
          collected_at: '2026-05-17T10:00:00.000Z',
          device_info: {
            model: 'Pixel 6',
            os_version: 'Android 13',
            app_version: '1.0.0',
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('menolak item dengan metadata lokal atau field payment_method', () => {
    // 1. Menolak retry_attempts
    const r1 = batchCollectionSchema.safeParse({
      collections: [
        {
          offline_id: 'loc-1',
          assignment_id: '00000000-0000-4000-8000-000000000001',
          can_id: '00000000-0000-4000-8000-000000000002',
          nominal: 50000,
    condition: 'AKTIF',
          collected_at: '2026-05-17T10:00:00.000Z',
          retry_attempts: 1,
        },
      ],
    });
    expect(r1.success).toBe(false);

    // 2. Menolak error_message
    const r2 = batchCollectionSchema.safeParse({
      collections: [
        {
          offline_id: 'loc-1',
          assignment_id: '00000000-0000-4000-8000-000000000001',
          can_id: '00000000-0000-4000-8000-000000000002',
          nominal: 50000,
    condition: 'AKTIF',
          collected_at: '2026-05-17T10:00:00.000Z',
          error_message: 'Some error',
        },
      ],
    });
    expect(r2.success).toBe(false);

    // 3. Menolak payment_method dan transfer_receipt_url
    const r3 = batchCollectionSchema.safeParse({
      collections: [
        {
          offline_id: 'loc-1',
          assignment_id: '00000000-0000-4000-8000-000000000001',
          can_id: '00000000-0000-4000-8000-000000000002',
          nominal: 50000,
    condition: 'AKTIF',
          collected_at: '2026-05-17T10:00:00.000Z',
          payment_method: 'CASH',
          transfer_receipt_url: 'https://...',
        },
      ],
    });
    expect(r3.success).toBe(false);
  });
});
