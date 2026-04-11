// JWT Authentication Middleware

import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../config/database';

// JWT Payload type
export interface JWTPayload {
  userId: string;
  role: 'ADMIN_KECAMATAN' | 'ADMIN_RANTING' | 'BENDAHARA' | 'PETUGAS';
  officerId?: string;
  branchId?: string;
  districtId?: string;
}

// Extend FastifyRequest
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
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

    const token = authHeader.split(' ')[1];
    const decoded = await request.jwtVerify<JWTPayload>();

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, is_active: true },
    });

    if (!user || !user.is_active) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Akun tidak aktif',
        },
      });
    }

    // Attach user to request
    request.user = decoded;
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

// Role-based access middleware
export function authorize(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthorized',
        },
      });
    }

    if (!allowedRoles.includes(request.user.role)) {
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

// Generate tokens
export function generateTokens(payload: JWTPayload, fastify: any) {
  const accessToken = fastify.jwt.sign(payload, { expiresIn: '15m' });
  const refreshToken = fastify.jwt.sign(payload, { expiresIn: '7d' });

  return { accessToken, refreshToken };
}

export default {
  authenticate,
  authorize,
  generateTokens,
};