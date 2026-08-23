/**
 * Utility fungsi murni untuk format mata uang, angka, dan tanggal dalam locale Indonesia (id-ID).
 * Tidak memiliki efek samping (side-effect) dan mudah diuji dengan unit test.
 */

/**
 * Memformat angka ke format mata uang Rupiah standar (contoh: Rp 50.000).
 */
export const formatCurrency = (nominal: number): string => {
  const safeNominal = typeof nominal === 'number' && !isNaN(nominal) ? nominal : 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(safeNominal);
};

/**
 * Memformat input string atau number menjadi format ribuan tanpa simbol mata uang (contoh: "10000" -> "10.000").
 * Sangat cocok untuk input teks nominal di form.
 */
export const formatInputCurrency = (value: string | number): string => {
  if (typeof value === 'number') {
    return isNaN(value) ? '' : new Intl.NumberFormat('id-ID').format(value);
  }
  const cleanNumber = Number(String(value).replace(/\D/g, ''));
  return cleanNumber ? new Intl.NumberFormat('id-ID').format(cleanNumber) : '';
};

/**
 * Memformat tanggal dan waktu ke format standar Indonesia (contoh: 22 Agu 2026, 14.30).
 */
export const formatDate = (
  value: string | Date | number,
  options?: Intl.DateTimeFormatOptions,
): string => {
  if (!value) {
    return '';
  }
  const date = typeof value === 'object' ? value : new Date(value);
  if (isNaN(date.getTime())) {
    return '';
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };

  return new Intl.DateTimeFormat('id-ID', defaultOptions).format(date);
};

/**
 * Memformat string periode YYYY-MM menjadi nama bulan dan tahun (contoh: "2026-08" -> "Agustus 2026").
 */
export const formatPeriod = (period: string): string => {
  if (!period) {
    return '';
  }
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) {
    return period;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
  }).format(date);
};
