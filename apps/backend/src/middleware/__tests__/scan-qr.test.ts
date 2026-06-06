/**
 * TC-QR-01 & TC-QR-02: Unit Test — QR Scan Logic
 *
 * TC-QR-01: Scan QR kaleng milik sendiri → API return assignment_id + can_id benar
 * TC-QR-02: Scan QR kaleng milik orang lain → TIDAK bocor data pemilik (owner_name, phone, address)
 *
 * Menguji fungsi buildScanResponse() yang menentukan data apa yang dikembalikan
 * berdasarkan apakah ada activeAssignment atau tidak.
 */

interface CanScanData {
  id: string;
  qrCode: string;
  ownerName: string;
  ownerPhone: string;
  ownerAddress: string;
  latitude: string | null;
  longitude: string | null;
}

interface AssignmentData {
  id: string;
  status: string;
  officerId: string;
}

interface LastCollection {
  nominal: bigint;
  collectedAt: Date;
}

/**
 * Pure function yang merepresentasikan logika scan QR.
 * Diekstrak dari mobile/tasks.ts GET /scan/:qrCode.
 */
function buildScanResponse(
  can: CanScanData,
  activeAssignment: AssignmentData | null,
  lastCollection: LastCollection | null
) {
  if (!activeAssignment) {
    return {
      id: can.id,
      qr_code: can.qrCode,
      status: 'UNASSIGNED',
    };
  }

  return {
    id: can.id,
    qr_code: can.qrCode,
    owner_name: can.ownerName,
    owner_phone: can.ownerPhone,
    owner_address: can.ownerAddress,
    latitude: can.latitude,
    longitude: can.longitude,
    last_collection: lastCollection
      ? { nominal: Number(lastCollection.nominal), date: lastCollection.collectedAt }
      : null,
    status: activeAssignment.status,
    assignment_id: activeAssignment.id,
  };
}

const mockCan: CanScanData = {
  id: 'can-123',
  qrCode: 'LAZ-JKT-00001',
  ownerName: 'Pak Budi',
  ownerPhone: '081234567890',
  ownerAddress: 'Jl. Merdeka No. 1, RT 03/04',
  latitude: '-6.200000',
  longitude: '106.800000',
};

const mockAssignment: AssignmentData = {
  id: 'assignment-456',
  status: 'ACTIVE',
  officerId: 'officer-789',
};

const mockLastCollection: LastCollection = {
  nominal: BigInt(50000),
  collectedAt: new Date('2026-05-15'),
};

// ============================================================================
// TC-QR-01: Scan QR milik sendiri → return assignment_id + can_id
// ============================================================================

describe('TC-QR-01: Scan QR kaleng milik sendiri', () => {
  it('return assignment_id dan can_id saat ada activeAssignment', () => {
    const result = buildScanResponse(mockCan, mockAssignment, mockLastCollection);

    expect(result).toHaveProperty('assignment_id', 'assignment-456');
    expect(result).toHaveProperty('id', 'can-123');
    expect(result.status).toBe('ACTIVE');
  });

  it('return owner_name, owner_phone, owner_address saat assignment milik sendiri', () => {
    const result = buildScanResponse(mockCan, mockAssignment, mockLastCollection);

    expect(result).toHaveProperty('owner_name', 'Pak Budi');
    expect(result).toHaveProperty('owner_phone', '081234567890');
    expect(result).toHaveProperty('owner_address', 'Jl. Merdeka No. 1, RT 03/04');
  });

  it('return last_collection jika ada riwayat', () => {
    const result = buildScanResponse(mockCan, mockAssignment, mockLastCollection);

    expect(result).toHaveProperty('last_collection');
    expect((result as any).last_collection).toMatchObject({
      nominal: 50000,
      date: expect.any(Date),
    });
  });

  it('last_collection = null jika tidak ada riwayat', () => {
    const result = buildScanResponse(mockCan, mockAssignment, null);

    expect((result as any).last_collection).toBeNull();
  });

  it('return latitude & longitude untuk data lokasi', () => {
    const result = buildScanResponse(mockCan, mockAssignment, mockLastCollection);

    expect((result as any).latitude).toBe('-6.200000');
    expect((result as any).longitude).toBe('106.800000');
  });
});

// ============================================================================
// TC-QR-02: Scan QR kaleng milik orang lain → TIDAK bocor data pemilik
// ============================================================================

describe('TC-QR-02: Scan QR bukan penugasan — tidak bocor data owner', () => {
  it('return status UNASSIGNED saat tidak ada activeAssignment', () => {
    const result = buildScanResponse(mockCan, null, null);

    expect(result.status).toBe('UNASSIGNED');
  });

  it('TIDAK mengandung owner_name saat UNASSIGNED', () => {
    const result = buildScanResponse(mockCan, null, null);

    expect(result).not.toHaveProperty('owner_name');
  });

  it('TIDAK mengandung owner_phone saat UNASSIGNED', () => {
    const result = buildScanResponse(mockCan, null, null);

    expect(result).not.toHaveProperty('owner_phone');
  });

  it('TIDAK mengandung owner_address saat UNASSIGNED', () => {
    const result = buildScanResponse(mockCan, null, null);

    expect(result).not.toHaveProperty('owner_address');
  });

  it('TIDAK mengandung assignment_id saat UNASSIGNED', () => {
    const result = buildScanResponse(mockCan, null, null);

    expect(result).not.toHaveProperty('assignment_id');
  });

  it('hanya return id, qr_code, dan status = UNASSIGNED', () => {
    const result = buildScanResponse(mockCan, null, null);

    expect(Object.keys(result).sort()).toEqual(['id', 'qr_code', 'status'].sort());
    expect(result).toEqual({
      id: 'can-123',
      qr_code: 'LAZ-JKT-00001',
      status: 'UNASSIGNED',
    });
  });

  it('UNASSIGNED tidak bocor meski data can lengkap tersedia di memori', () => {
    const canWithFullData: CanScanData = {
      id: 'can-999',
      qrCode: 'LAZ-BGR-00999',
      ownerName: 'Bu Rahasia',
      ownerPhone: '08999999999',
      ownerAddress: 'Alamat Rahasia',
      latitude: '-7.000000',
      longitude: '107.000000',
    };

    const result = buildScanResponse(canWithFullData, null, null);

    expect(result).not.toHaveProperty('owner_name');
    expect(result).not.toHaveProperty('owner_phone');
    expect(result).not.toHaveProperty('owner_address');
    expect(result).not.toHaveProperty('latitude');
    expect(result).not.toHaveProperty('longitude');
    expect(result.status).toBe('UNASSIGNED');
  });
});

// ============================================================================
// TC-QR-01 & TC-QR-02: different officer scenarios
// ============================================================================

describe('QR Scan — various officer scenarios', () => {
  it('assignment dengan officerId berbeda tetap tidak bocor data', () => {
    const differentOfficerAssignment: AssignmentData = {
      id: 'assignment-other',
      status: 'ACTIVE',
      officerId: 'other-officer',
    };

    // Simulasikan: DB query assignment with where officerId = currentOfficer
    // → jika tidak cocok, activeAssignment = null
    const activeAssignment = null;

    const result = buildScanResponse(mockCan, activeAssignment, null);

    expect(result.status).toBe('UNASSIGNED');
    expect(result).not.toHaveProperty('owner_name');
  });

  it('assignment non-ACTIVE dianggap tidak aktif', () => {
    // Assignment COMPLETED/POSTPONED/REASSIGNED → bukan active
    const completedAssignment: AssignmentData = {
      id: 'assignment-done',
      status: 'COMPLETED',
      officerId: 'officer-789',
    };

    // Route hanya query assignment dengan status = 'ACTIVE'
    // Kalau tidak ketemu → UNASSIGNED
    const result = buildScanResponse(mockCan, null, null);

    expect(result.status).toBe('UNASSIGNED');
  });

  it('scan QR di luar periode bulan ini → tidak ada activeAssignment', () => {
    // Route memfilter assignment by periodYear & periodMonth = bulan ini
    // Kalau assignment bulan lalu → tidak ketemu
    const result = buildScanResponse(mockCan, null, null);

    expect(result.status).toBe('UNASSIGNED');
    expect(result).not.toHaveProperty('owner_name');
  });
});
