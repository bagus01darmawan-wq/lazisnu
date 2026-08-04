/**
 * Normalisasi nomor HP Indonesia ke format internasional (62xxx).
 * - "082134536151" → "6282134536151"
 * - "6282134536151" → "6282134536151"
 * - "+62 821-3453-6151" → "6282134536151"
 * - "82134536151" (tanpa prefix) → "6282134536151"
 */
export function normalizePhoneTo62(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) {
    return '62' + digits.slice(1);
  }
  if (digits.startsWith('62')) {
    return digits;
  }
  return '62' + digits;
}

/**
 * Kandidat format nomor HP untuk lookup database.
 * Data `officers.phone` memakai format 62xxx, sedangkan `users.phone` memakai
 * format 08xx. Kembalikan semua varian agar input user dalam format apa pun
 * (08xx / 62xx / tanpa prefix) tetap cocok dengan record di DB.
 */
export function getPhoneLookupVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  const variants = [digits];

  const to62 = normalizePhoneTo62(digits);
  if (!variants.includes(to62)) {
    variants.push(to62);
  }

  if (digits.startsWith('62') && digits.length > 10) {
    const to0 = '0' + digits.slice(2);
    if (!variants.includes(to0)) {
      variants.push(to0);
    }
  }

  return variants;
}
