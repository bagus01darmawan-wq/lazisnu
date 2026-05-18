import { serializeOutput } from '../serializer';

describe('serializeOutput', () => {
  describe('camelCase → snake_case', () => {
    it('konversi object datar', () => {
      const input = { fullName: 'Budi', ownerAddress: 'Jl. A' };
      const output = serializeOutput(input);
      expect(output).toEqual({ full_name: 'Budi', owner_address: 'Jl. A' });
    });

    it('tidak mengubah key yang sudah snake_case', () => {
      const input = { full_name: 'Budi' };
      const output = serializeOutput(input);
      expect(output).toEqual({ full_name: 'Budi' });
    });

    it('konversi nested object', () => {
      const input = {
        userProfile: {
          fullName: 'Budi',
          lastLogin: '2026-01-01',
        },
      };
      const output = serializeOutput(input);
      expect(output).toEqual({
        user_profile: {
          full_name: 'Budi',
          last_login: '2026-01-01',
        },
      });
    });

    it('konversi array of objects', () => {
      const input = [{ fullName: 'A' }, { fullName: 'B' }];
      const output = serializeOutput(input);
      expect(output).toEqual([{ full_name: 'A' }, { full_name: 'B' }]);
    });
  });

  describe('BigInt handling', () => {
    it('konversi BigInt ke Number', () => {
      const input = { nominal: BigInt(50000), count: 3 };
      const output = serializeOutput(input);
      expect(output).toEqual({ nominal: 50000, count: 3 });
      expect(typeof output.nominal).toBe('number');
    });

    it('konversi BigInt dalam nested object', () => {
      const input = { data: { total: BigInt(100000) } };
      const output = serializeOutput(input);
      expect(output.data.total).toBe(100000);
      expect(typeof output.data.total).toBe('number');
    });

    it('konversi BigInt dalam array', () => {
      const input = [{ amount: BigInt(5000) }, { amount: BigInt(10000) }];
      const output = serializeOutput(input);
      expect(output).toEqual([{ amount: 5000 }, { amount: 10000 }]);
    });
  });

  describe('edge cases', () => {
    it('null return null', () => {
      expect(serializeOutput(null)).toBeNull();
    });

    it('undefined return undefined', () => {
      expect(serializeOutput(undefined)).toBeUndefined();
    });

    it('string tidak berubah', () => {
      expect(serializeOutput('hello')).toBe('hello');
    });

    it('number tidak berubah', () => {
      expect(serializeOutput(42)).toBe(42);
    });

    it('boolean tidak berubah', () => {
      expect(serializeOutput(true)).toBe(true);
    });

    it('Date tidak dikonversi key-nya (tetap Date object)', () => {
      const d = new Date('2026-05-17');
      const output = serializeOutput(d);
      expect(output instanceof Date).toBe(true);
    });
  });
});
