// JWT Authentication Middleware

import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import * as schema from '../database/schema';
import { eq } from 'drizzle-orm';

// JWT Payload type
export interface JWTPayload {
  userId: string;
  role: 'ADMIN_KECAMATAN' | 'ADMIN_RANTING' | 'BENDAHARA' | 'PETUGAS';
  officerId?: string;
  branchId?: string;
  districtId?: string;
}

// Extend FastifyRequest to add typed `currentUser`
// We use `currentUser` instead of `user` to avoid conflict with @fastify/jwt
declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: JWTPayload;
  }
}

// Auth middleware for protected routes
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Token tidak ditemukan',
        },
      });
    }

    const decoded = await request.jwtVerify<JWTPayload>();

    // Verify user still exists and is active
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, decoded.userId),
      columns: { id: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Akun tidak aktif',
        },
      });
    }

    // Attach typed user to request
    request.currentUser = decoded;
  } catch (error) {
    return reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token tidak valid atau sudah expire',
      },
    });
  }
}

// Role-based access control — use as preHandler hook
export function authorize(...allowedRoles: Array<JWTPayload['role']>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      });
    }

    if (!allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Anda tidak memiliki akses ke resource ini',
        },
      });
    }
  };
}

// Generate access + refresh tokens
export function generateTokens(payload: JWTPayload, fastify: any) {
  const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' });
  const refreshToken = fastify.jwt.sign(payload, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

export default { authenticate, authorize, generateTokens };