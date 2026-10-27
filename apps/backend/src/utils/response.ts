import { FastifyReply } from 'fastify';
import { ApiResponse } from '@lazisnu/shared-types';
import { serializeOutput } from './serializer';
import { translateDatabaseError } from './dbErrorMessages';

/**
 * Standardize success response
 */
export function sendSuccess<T>(reply: FastifyReply, data?: T, statusCode = 200) {
  const response: ApiResponse<T> = {
    success: true,
  };
  
  if (data !== undefined) {
    // Auto-transform camelCase to snake_case and handle BigInt for all API outputs
    response.data = serializeOutput(data);
  }

  return reply.status(statusCode).send(response);
}

/**
 * Standardize error response
 */
export function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  details?: any
) {
  const response: ApiResponse<any> = {
    success: false,
    error: {
      code,
      message,
    },
  };

  if (details !== undefined) {
    response.error!.details = details;
  }

  return reply.status(statusCode).send(response);
}

/**
 * Common internal server error response.
 *
 * Sebelum menjawab 500, error database yang bisa dijelaskan (pelanggaran foreign
 * key / nilai unik / isian wajib) diterjemahkan lebih dulu menjadi 4xx dengan
 * pesan yang menyebut penyebabnya — lihat `utils/dbErrorMessages.ts`. Tanpa
 * langkah ini, penolakan database yang wajar (mis. "kaleng masih tercatat di
 * draft penugasan") tampil sebagai "Terjadi kesalahan server" yang menyesatkan.
 *
 * Detail mesin (kode Postgres, nama constraint) TIDAK ikut ke respons — hanya
 * ke log — supaya nama tabel tidak bocor ke klien.
 */
export function sendInternalError(reply: FastifyReply, error?: unknown, logger?: { error: (error: unknown) => void }) {
  if (logger && error) {
    logger.error(error);
  } else if (error) {
    console.error(error);
  }

  const translated = translateDatabaseError(error);
  if (translated) {
    return sendError(reply, translated.statusCode, translated.code, translated.message);
  }

  return sendError(reply, 500, 'INTERNAL_ERROR', 'Terjadi kesalahan server');
}
