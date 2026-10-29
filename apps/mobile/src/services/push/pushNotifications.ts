/**
 * Notifikasi push (FCM) — fondasi T11.
 *
 * Semua akses ke modul messaging lewat `require` di dalam try/catch, meniru
 * `config/crashlytics.ts`: build staging bisa berjalan tanpa konfigurasi
 * Firebase default, dan meng-import modul di level atas akan menginisialisasi
 * Firebase lebih awal sehingga penanganan error aplikasi tidak sempat jalan.
 */
import {getApps} from '@react-native-firebase/app';
import {c1Service} from '../api';

type RemoteMessageLike = {data?: Record<string, string>};

/**
 * Hanya bagian API yang dipakai, dideklarasikan sendiri — supaya berkas ini
 * tidak bergantung pada tipe internal paket messaging.
 */
type MessagingSdk = {
  getMessaging: () => unknown;
  requestPermission: (messaging: unknown) => Promise<number>;
  getToken: (messaging: unknown) => Promise<string>;
  onTokenRefresh: (messaging: unknown, cb: (token: string) => void) => () => void;
  onNotificationOpenedApp: (
    messaging: unknown,
    cb: (message: RemoteMessageLike) => void,
  ) => () => void;
  getInitialNotification: (messaging: unknown) => Promise<RemoteMessageLike | null>;
  onMessage: (messaging: unknown, cb: (message: RemoteMessageLike) => void) => () => void;
  AuthorizationStatus: {AUTHORIZED: number; PROVISIONAL: number};
};

function loadSdk(): {sdk: MessagingSdk; messaging: unknown} | null {
  if (!getApps().some(app => app.name === '[DEFAULT]')) {
    return null;
  }
  const sdk = require('@react-native-firebase/messaging') as MessagingSdk;
  return {sdk, messaging: sdk.getMessaging()};
}

let tokenRefreshUnsubscribe: (() => void) | null = null;

/**
 * Minta izin notifikasi, ambil token FCM, lalu kirim ke server
 * (`POST /mobile/device-token`). Tanpa langkah ini server tidak punya alamat
 * tujuan, sehingga `dispatchNotif` selalu jatuh ke jalur WhatsApp.
 *
 * Aman dipanggil berulang: token didaftarkan ulang, listener hanya sekali.
 */
export async function registerPushToken(): Promise<void> {
  try {
    const ctx = loadSdk();
    if (!ctx) {
      return;
    }
    const {sdk, messaging} = ctx;
    const status = await sdk.requestPermission(messaging);
    if (
      status !== sdk.AuthorizationStatus.AUTHORIZED &&
      status !== sdk.AuthorizationStatus.PROVISIONAL
    ) {
      // Ditolak pengguna — jangan paksa; server tetap punya jalur WhatsApp.
      return;
    }
    const token = await sdk.getToken(messaging);
    if (token) {
      // Hanya di dev: dipakai untuk menguji kirim dari Firebase Console
      // ("Send test message") sebelum ada BA yang benar-benar FINAL.
      if (__DEV__) {
        console.log('[Push] token perangkat:', token);
      }
      await c1Service.saveDeviceToken(token);
    }
    if (!tokenRefreshUnsubscribe) {
      tokenRefreshUnsubscribe = sdk.onTokenRefresh(messaging, next => {
        c1Service.saveDeviceToken(next).catch(() => undefined);
      });
    }
  } catch (error) {
    console.warn('[Push] Registrasi token gagal:', error);
  }
}

/** Template backend yang berarti "berita acara siap" (lihat notifications.ts). */
const BA_READY_TEMPLATES = ['BA_SIAP', 'PPK_FINAL'];

function isBaReady(message: RemoteMessageLike | null): boolean {
  const template = message?.data?.template;
  return !!template && BA_READY_TEMPLATES.includes(template);
}

/**
 * Ketukan notifikasi → buka halaman Setoran. Menangani dua keadaan: aplikasi
 * di latar belakang (`onNotificationOpenedApp`) dan aplikasi benar-benar mati
 * (`getInitialNotification`, dipanggil sekali saat start).
 */
export function attachPushNavigation(onOpenSetoran: () => void): () => void {
  try {
    const ctx = loadSdk();
    if (!ctx) {
      return () => undefined;
    }
    const {sdk, messaging} = ctx;
    const offOpened = sdk.onNotificationOpenedApp(messaging, message => {
      if (isBaReady(message)) {
        onOpenSetoran();
      }
    });
    sdk
      .getInitialNotification(messaging)
      .then(message => {
        if (isBaReady(message)) {
          onOpenSetoran();
        }
      })
      .catch(() => undefined);
    // Foreground: aplikasi sedang terbuka, sistem tidak menampilkan notifikasi.
    const offMessage = sdk.onMessage(messaging, () => undefined);
    return () => {
      offOpened();
      offMessage();
    };
  } catch (error) {
    console.warn('[Push] Pemasangan handler gagal:', error);
    return () => undefined;
  }
}
