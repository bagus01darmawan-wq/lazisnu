import { FastifyReply, FastifyRequest } from 'fastify';

// Pemutus arus sistem — bagian D3 rencana trustProxy (keputusan 2 Nov 2026):
// batas 200/menit per IP tidak membatasi total sistem, jadi perlu pagar
// kedua di level proses. Angka 3.000/menit dari data: satu sinkronisasi besar
// terukur 58 permintaan/menit per petugas; 50 petugas menyinkron bersamaan
// ≈ 2.900/menit — jadi 3.000 tidak memotong skenario sah itu.
//
// Fixed window (jendela 1 menit): sederhana dan tanpa dependensi. Properti
// yang sengaja diterima — di perbatasan dua jendela, lemparan beruntun bisa
// melewatkan hingga 2×max — cukup untuk jaring pengaman; kelebihan beban yang
// menetap ditangkap alarm P1 (CPU > 70% mesin, p95 > 500 ms). In-memory per
// proses, konsisten dengan status quo rate-limit (store Redis = perubahan
// terpisah sesuai rencana).
//
// PENTING tentang urutan hook: hook ini didaftarkan SETELAH @fastify/rate-limit
// di app.ts, dan keduanya berjalan di onRequest. Permintaan yang sudah ditolak
// per-IP berhenti di hook rate-limit (lifecycle berhenti saat reply dikirim)
// dan tidak pernah sampai ke sini — satu IP yang mengamuk tidak bisa
// menggerus jatah global 3.000/menit.

export interface SystemBreakerOptions {
  /** Batas permintaan per jendela. */
  max: number;
  /** Lebar jendela fixed-window dalam milidetik. */
  windowMs: number;
  /** Sumber waktu — disuntik untuk uji deterministik; default Date.now. */
  now?: () => number;
}

export function createSystemBreaker(options: SystemBreakerOptions) {
  const { max, windowMs, now = Date.now } = options;
  let windowStart = now();
  let count = 0;

  return async function systemBreaker(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const t = now();
    if (t - windowStart >= windowMs) {
      windowStart = t;
      count = 0;
    }
    count++;
    if (count > max) {
      const retryAfter = Math.max(1, Math.ceil((windowStart + windowMs - t) / 1000));
      reply.code(429).header('retry-after', String(retryAfter));
      await reply.send({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: 'Sistem sedang sibuk, silakan coba lagi sebentar lagi',
        },
      });
      return;
    }
  };
}
