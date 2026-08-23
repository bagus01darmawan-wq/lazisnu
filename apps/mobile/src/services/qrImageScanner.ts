import {NativeModules} from 'react-native';

type QrImageScannerNativeModule = {
  pickAndDecode: () => Promise<string | null>;
};

const qrImageScanner = NativeModules.QrImageScanner as QrImageScannerNativeModule | undefined;

export async function pickAndDecodeQRCode(): Promise<string | null> {
  if (!qrImageScanner) {
    throw new Error('QR image scanner native module tidak tersedia');
  }

  return qrImageScanner.pickAndDecode();
}
