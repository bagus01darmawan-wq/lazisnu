import {
  canReceiveReturnedVisit,
  isOrdinaryBatchCondition,
  resolveNonActiveVisit,
} from '../conditionRules';

describe('aturan kunjungan kaleng NON_AKTIF', () => {
  it('tidak dikunjungi tetap NON_AKTIF dan tidak meminta collection', () => {
    expect(resolveNonActiveVisit('TIDAK_DIKUNJUNGI')).toEqual({
      outcome: 'TIDAK_DIKUNJUNGI',
      condition: 'NON_AKTIF',
      isActive: true,
      requiresCollection: false,
    });
  });

  it('kaleng kosong tetap NON_AKTIF dan tidak meminta collection', () => {
    expect(resolveNonActiveVisit('KOSONG')).toEqual({
      outcome: 'KOSONG',
      condition: 'NON_AKTIF',
      isActive: true,
      requiresCollection: false,
    });
  });

  it('kaleng dikembalikan menjadi DIKEMBALIKAN dan tidak aktif', () => {
    expect(resolveNonActiveVisit('DIKEMBALIKAN')).toEqual({
      outcome: 'DIKEMBALIKAN',
      condition: 'DIKEMBALIKAN',
      isActive: false,
      requiresCollection: false,
    });
  });

  it('kaleng isi menerima kondisi fisik dan tetap menjadi can yang aktif', () => {
    expect(resolveNonActiveVisit('ISI', 'RUSAK')).toEqual({
      outcome: 'ISI',
      condition: 'RUSAK',
      isActive: true,
      requiresCollection: true,
    });
  });

  it('menolak kaleng isi tanpa kondisi fisik eksplisit', () => {
    expect(() => resolveNonActiveVisit('ISI')).toThrow(
      'Kaleng isi wajib memilih kondisi fisik AKTIF, RUSAK, atau HILANG',
    );
  });

  it('hanya tiga kondisi fisik yang boleh menjadi hasil kaleng isi', () => {
    expect(() => resolveNonActiveVisit('ISI', 'NON_AKTIF')).toThrow(
      'Kaleng isi wajib memilih kondisi fisik AKTIF, RUSAK, atau HILANG',
    );
    expect(() => resolveNonActiveVisit('ISI', 'DIKEMBALIKAN')).toThrow(
      'Kaleng isi wajib memilih kondisi fisik AKTIF, RUSAK, atau HILANG',
    );
  });

  it('batch biasa hanya menerima tiga kondisi ordinary', () => {
    expect(isOrdinaryBatchCondition('AKTIF')).toBe(true);
    expect(isOrdinaryBatchCondition('RUSAK')).toBe(true);
    expect(isOrdinaryBatchCondition('HILANG')).toBe(true);
    expect(isOrdinaryBatchCondition('NON_AKTIF')).toBe(false);
    expect(isOrdinaryBatchCondition('DIKEMBALIKAN')).toBe(false);
  });

  it('penerimaan pengembalian hanya bisa dilakukan pada kunjungan dikembalikan', () => {
    expect(canReceiveReturnedVisit('DIKEMBALIKAN')).toBe(true);
    expect(canReceiveReturnedVisit('KOSONG')).toBe(false);
    expect(canReceiveReturnedVisit('TIDAK_DIKUNJUNGI')).toBe(false);
  });
});
