import {createNavigationContainerRef} from '@react-navigation/native';
import type {RootStackParamList} from './types';

/**
 * Ref ke NavigationContainer supaya kode di luar React — penanganan ketukan
 * notifikasi — bisa membuka layar. Aman dipanggil kapan saja: bila container
 * belum siap atau rute tidak tersedia (mis. sedang di stack login), panggilan
 * diabaikan alih-alih melempar error.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Dipakai notifikasi "BA siap diunduh" untuk membuka halaman Setoran. */
export function navigateToSetoran(attempt = 0): void {
  if (!navigationRef.isReady()) {
    // Aplikasi bisa dibuka DARI notifikasi (cold start): saat itu container
    // belum siap dan auth belum pulih. Coba lagi beberapa kali, lalu menyerah
    // diam-diam — lebih baik tidak pindah layar daripada crash.
    if (attempt < 5) {
      setTimeout(() => navigateToSetoran(attempt + 1), 400);
    }
    return;
  }
  try {
    navigationRef.navigate('Setoran');
  } catch {
    // Container hidup tapi rute tak tersedia (belum login) — abaikan.
  }
}
