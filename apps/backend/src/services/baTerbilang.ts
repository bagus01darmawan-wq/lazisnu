/**
 * F7/D-14 — Terbilang nominal Bahasa Indonesia untuk BA org.
 * Modul MURNI (tanpa DB/IO). Cakupan: 0 s/d 999 triliun (cukup untuk
 * nominal koin; di atas itu melempar VALIDATION_ERROR).
 */
import { Errors } from '../utils/errorCatalog';

const SATUAN = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

function belowThousand(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${belowThousand(n - 10)} Belas`;
  if (n < 100) {
    const t = belowThousand(Math.floor(n / 10));
    const r = n % 10;
    return r === 0 ? `${t} Puluh` : `${t} Puluh ${belowThousand(r)}`;
  }
  if (n < 200) return n === 100 ? 'Seratus' : `Seratus ${belowThousand(n - 100)}`;
  const h = belowThousand(Math.floor(n / 100));
  const r = n % 100;
  return r === 0 ? `${h} Ratus` : `${h} Ratus ${belowThousand(r)}`;
}

function recurse(n: number): string {
  if (n < 1000) return belowThousand(n);
  if (n < 2000) return n === 1000 ? 'Seribu' : `Seribu ${recurse(n - 1000)}`;
  if (n < 1_000_000) {
    const t = recurse(Math.floor(n / 1000));
    const r = n % 1000;
    return r === 0 ? `${t} Ribu` : `${t} Ribu ${recurse(r)}`;
  }
  if (n < 1_000_000_000) {
    const m = recurse(Math.floor(n / 1_000_000));
    const r = n % 1_000_000;
    return r === 0 ? `${m} Juta` : `${m} Juta ${recurse(r)}`;
  }
  if (n < 1_000_000_000_000) {
    const b = recurse(Math.floor(n / 1_000_000_000));
    const r = n % 1_000_000_000;
    return r === 0 ? `${b} Miliar` : `${b} Miliar ${recurse(r)}`;
  }
  const t = recurse(Math.floor(n / 1_000_000_000_000));
  const r = n % 1_000_000_000_000;
  return r === 0 ? `${t} Triliun` : `${t} Triliun ${recurse(r)}`;
}

/** 608000 → "Enam Ratus Delapan Ribu Rupiah". */
export function terbilangRupiah(n: number | bigint): string {
  const v = typeof n === 'bigint' ? n : BigInt(Math.trunc(n));
  if (v < 0) throw Errors.VALIDATION_ERROR('Nominal terbilang tidak menerima negatif.');
  if (v > 999_999_999_999_999n) throw Errors.VALIDATION_ERROR('Nominal terbilang melebihi 999 triliun.');
  if (v === 0n) return 'Nol Rupiah';
  return `${recurse(Number(v))} Rupiah`;
}
