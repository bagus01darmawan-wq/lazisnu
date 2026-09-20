import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendSuccess } from '../utils/response';
import { verifyBaRecord } from '../services/baPdfService';

/**
 * C1-T5 (§14.9) — verifikasi QR BA, MINIMAL dan PUBLIK (tanpa auth).
 * Selalu 200 `{ valid: bool }` — seragam untuk id tak dikenal, format salah,
 * versi beda, maupun hash salah. Tidak membocorkan nominal, nama, pihak,
 * atau keberadaan id (pola privasi scan-qr.test.ts).
 */
export async function verifyRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/ba',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as { type?: string; id?: string; version?: string; hash?: string };
      let valid = false;
      try {
        if (query.type === 'ppk' || query.type === 'branch') {
          valid = await verifyBaRecord(
            query.type,
            typeof query.id === 'string' ? query.id : '',
            Number(query.version),
            typeof query.hash === 'string' ? query.hash : '',
          );
        }
      } catch {
        valid = false;
      }
      return sendSuccess(reply, { valid });
    },
  );
}
