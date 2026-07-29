const QR_CODE_PATTERN = /^LAZ-[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const QR_CODE_MAX_LENGTH = 50;

/**
 * Memvalidasi qr_code mentah secara exact-match.
 * Fungsi ini sengaja tidak melakukan trim atau perubahan kapitalisasi.
 */
export function isValidQRCode(qrCode: string): boolean {
  return (
    qrCode.length > 0 &&
    qrCode.length <= QR_CODE_MAX_LENGTH &&
    QR_CODE_PATTERN.test(qrCode)
  );
}
