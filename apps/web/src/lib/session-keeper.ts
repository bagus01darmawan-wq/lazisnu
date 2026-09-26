/**
 * session-keeper.ts — Refresh token proaktif (sliding session) untuk Web Dashboard.
 *
 * Masalah yang diselesaikan: access token hanya berlaku 15 menit dan dulu
 * hanya di-refresh REAKTIF (saat request API kena 401). Akibatnya pengguna
 * yang idle >15 menit lalu reload/navigasi full-page ter-logout oleh
 * middleware (jwtVerify gagal) sebelum sempat refresh.
 *
 * Solusi: timer interval (default 10 menit — refresh lebih dulu sebelum
 * token 15 menit expire) memanggil POST /api/auth/refresh selama tab
 * terlihat (visibilityState === 'visible'). Timer pause saat tab hidden
 * untuk tidak memboroskan request, dan langsung refresh saat tab kembali
 * aktif sehingga sesi idle panjang ikut pulih.
 *
 * Keamanan: endpoint /v1/auth/refresh bersifat soft-rotation & fail-open
 * (RENCANA-SESI-PERMANEN-SLIDING), jadi timer ini aman terhadap rate limit
 * 30 request/5 menit dan tidak pernah mematikan sesi sendiri — kegagalan
 * refresh dibiarkan ditangani interceptor sebagai jaring pengaman terakhir.
 */

import axios from 'axios';
import { authHelper } from './auth';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 menit (access token 15 menit)

let keeperStarted = false;

async function refreshNow(force = false): Promise<void> {
  // Tanpa access cookie = belum login / sudah logout → jangan berisik,
  // KECUALI pemulihan paksa (mount & tab kembali aktif): cookie access bisa
  // saja kedaluwarsa saat tab hidden sementara refresh cookie (HttpOnly,
  // tidak terbaca JS) masih hidup. Percobaan paksa aman: gagal 401 tidak
  // me-logout (interceptor tidak terlibat di sini), berhasil = sesi pulih.
  if (!force && !authHelper.isAuthenticated()) return;
  try {
    const res = await axios.post('/api/auth/refresh', null, { withCredentials: true });
    const accessToken = res.data?.data?.access_token;
    if (typeof accessToken === 'string' && accessToken.length > 0) {
      authHelper.setToken(accessToken);
    }
  } catch {
    // Diamkan — interceptor api.ts tetap menjadi jaring pengaman (logout
    // hanya bila refresh DITOLAK otoritatif 401/403).
  }
}

/**
 * Mulai session keeper. Idempotent — aman dipanggil berulang (mis. dari
 * layout yang dirender ulang). Hanya berjalan di sisi client.
 */
export function startSessionKeeper(): void {
  if (typeof window === 'undefined' || keeperStarted) return;
  keeperStarted = true;

  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const start = () => {
    if (timer) return;
    timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshNow();
    }, REFRESH_INTERVAL_MS);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      start();
      void refreshNow(true); // pulihkan sesi begitu tab kembali aktif
    } else {
      stop();
    }
  });

  start();
  void refreshNow(true); // refresh sekali saat mount — pulihkan sesi idle lama
}
