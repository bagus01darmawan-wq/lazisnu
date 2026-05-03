import { FastifyReply } from 'fastify';
import { ApiResponse } from '@lazisnu/shared-types';
import { serializeOutput } from './serializer';

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
 * Common internal server error response
 */
export function sendInternalError(reply: FastifyReply, error?: any, logger?: any) {
  if (logger && error) {
    logger.error(error);
  } else if (error) {
    console.error(error);
  }
  
  return sendError(reply, 500, 'INTERNAL_ERROR', 'Terjadi kesalahan server');
}
