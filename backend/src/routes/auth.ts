// Auth Routes - Login, OTP, Token Refresh

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../config/database';
import { users, officers } from '../database/schema';
import { eq } from 'drizzle-orm';
import { generateTokens } from '../middleware/auth';
import { otpService } from '../services/otp';

// Request schemas
const loginSchema = z.object({
  phone: z.string().min(10).max(15),
  password: z.string().min(6),
});

const requestOTPSchema = z.object({
  phone: z.string().min(10).max(15),
});

const verifyOTPSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
});

export async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/login
  fastify.post('/login', {
    schema: {
      tags: ['Auth'],
      summary: 'Login dengan nomor HP dan password',
      body: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string', minLength: 10, maxLength: 15 },
          password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = loginSchema.parse(request.body);

      // Find user by phone
      const userRes = await db.select().from(users).where(eq(users.phone, body.phone)).limit(1);
      const user = userRes[0];
      
      let userOfficers: any[] = [];
      if (user) {
        userOfficers = await db.select().from(officers).where(eq(officers.userId, user.id));
      }

      if (!user) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Nomor HP atau password salah',
          },
        });
      }

      // Verify password - use camelCase (Prisma auto-converts)
      const isValidPassword = await bcrypt.compare(body.password, user.passwordHash);

      if (!isValidPassword) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Nomor HP atau password salah',
          },
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'ACCOUNT_DISABLED',
            message: 'Akun Anda tidak aktif',
          },
        });
      }

      // Update last login
      await db.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, user.id));

      // Generate tokens
      const officer = userOfficers[0];
      const payload = {
        userId: user.id,
        role: user.role,
        branchId: user.branchId || undefined,
        districtId: user.districtId || undefined,
        officerId: officer?.id,
      };

      const tokens = generateTokens(payload, fastify);

      return reply.send({
        success: true,
        data: {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          user: {
            id: user.id,
            email: user.email,
            full_name: user.fullName,
            role: user.role,
            branch_id: user.branchId,
            district_id: user.districtId,
          },
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Input tidak valid',
            details: error.errors,
          },
        });
      }

      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Terjadi kesalahan server',
        },
      });
    }
  });

  // POST /auth/request-otp
  fastify.post('/request-otp', {
    schema: {
      tags: ['Auth'],
      summary: 'Request OTP via WhatsApp (untuk login petugas)',
      body: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', minLength: 10, maxLength: 15 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = requestOTPSchema.parse(request.body);

      // Check if user/officer exists
      const userRes = await db.select().from(users).where(eq(users.phone, body.phone)).limit(1);
      const user = userRes[0];

      if (!user) {
        // For security, don't reveal if user exists or not
        return reply.send({
          success: true,
          message: 'OTP dikirim ke WhatsApp',
          expires_in: 300,
        });
      }

      // Generate and store OTP
      const result = await otpService.generateAndStore(body.phone);

      if (!result.success) {
        return reply.status(500).send({
          success: false,
          error: {
            code: 'OTP_ERROR',
            message: 'Gagal membuat OTP',
          },
        });
      }

      // In production, send via WhatsApp Business API
      // For now, just log the OTP (remove in production)
      fastify.log.info(`OTP for ${body.phone}: ${result.otp}`);

      return reply.send({
        success: true,
        message: 'OTP dikirim ke WhatsApp',
        expires_in: 300,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Input tidak valid',
          },
        });
      }

      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Terjadi kesalahan server',
        },
      });
    }
  });

  // POST /auth/verify-otp
  fastify.post('/verify-otp', {
    schema: {
      tags: ['Auth'],
      summary: 'Verifikasi OTP untuk login petugas',
      body: {
        type: 'object',
        required: ['phone', 'otp'],
        properties: {
          phone: { type: 'string', minLength: 10, maxLength: 15 },
          otp: { type: 'string', minLength: 6, maxLength: 6 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = verifyOTPSchema.parse(request.body);

      // Verify OTP first
      const isValid = await otpService.verify(body.phone, body.otp);

      if (!isValid) {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_OTP',
            message: 'OTP tidak valid atau sudah expired',
          },
        });
      }

      // Find officer by phone (for petugas login with OTP)
      const officerRes = await db.select().from(officers).where(eq(officers.phone, body.phone)).limit(1);
      const officer = officerRes[0] as any;
      
      if (officer) {
        const userRes = await db.select().from(users).where(eq(users.id, officer.userId)).limit(1);
        officer.user = userRes[0];
      }

      if (!officer || !officer.user) {
        return reply.status(404).send({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'Pengguna tidak ditemukan',
          },
        });
      }

      // Delete used OTP
      await otpService.delete(body.phone);

      // Update last login
      await db.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, officer.user.id));

      // Generate tokens
      const payload = {
        userId: officer.user.id,
        role: 'PETUGAS' as const,
        officerId: officer.id,
        branchId: officer.branchId,
        districtId: officer.districtId,
      };

      const tokens = generateTokens(payload, fastify);

      return reply.send({
        success: true,
        data: {
          access_token: tokens.accessToken,
          user: {
            id: officer.user.id,
            full_name: officer.fullName,
            role: 'PETUGAS',
          },
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Input tidak valid',
          },
        });
      }

      fastify.log.error(error);
      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Terjadi kesalahan server',
        },
      });
    }
  });

  // POST /auth/refresh
  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { refresh_token } = request.body as { refresh_token: string };

      if (!refresh_token) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'MISSING_TOKEN',
            message: 'Refresh token diperlukan',
          },
        });
      }

      // Verify refresh token using request.jwtVerify with token option
      const decoded = await request.server.jwt.verify<any>(refresh_token);

      // Generate new tokens
      const tokens = generateTokens(decoded, request.server);

      return reply.send({
        success: true,
        data: {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        },
      });
    } catch (error) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Refresh token tidak valid',
        },
      });
    }
  });
}

export default authRoutes;

