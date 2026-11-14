import {GOOD_CAN_CONDITION_LABEL} from '../collectionConditionLabels';

describe('pilihan kondisi fisik pada input penjemputan', () => {
  it('menampilkan kondisi AKTIF dengan label Baik', () => {
    expect(GOOD_CAN_CONDITION_LABEL).toBe('Baik');
  });
});
