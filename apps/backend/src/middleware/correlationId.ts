/**
 * Correlation ID middleware — memastikan setiap request punya ID yang bisa dilacak.
 *
 * - Membaca `x-request-id` dari header incoming (jika ada)
 * - Set `request.id` dan `reply.header('x-request-id')`
 * - Membuat child logger dengan field `requestId`
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

export async function correlationIdHook(request: FastifyRequest, reply: FastifyReply) {
  const incoming = request.headers['x-request-id'] as string | undefined;
  const id = incoming || request.id || uuidv4();

  // Fastify request.id sudah dipakai internal, kita set di header saja
  // untuk memastikan response selalu membawa x-request-id
  reply.header('x-request-id', id);

  // Update request.id jika tidak ada dari incoming
  if (!incoming && !request.id) {
    (request as any).id = id;
  }
}
