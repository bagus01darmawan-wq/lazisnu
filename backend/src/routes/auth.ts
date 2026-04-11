// Auth Routes - Login, OTP, Token Refresh

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../config/database';
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
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = loginSchema.parse(request.body);

      // Find user by phone
      const user = await prisma.user.findUnique({
        where: { phone: body.phone },
        include: { officers: true },
      });

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
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });

      // Generate tokens
      const officer = user.officers[0];
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
  fastify.post('/request-otp', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = requestOTPSchema.parse(request.body);

      // Check if user/officer exists
      const user = await prisma.user.findUnique({
        where: { phone: body.phone },
      });

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
  fastify.post('/verify-otp', async (request: FastifyRequest, reply: FastifyReply) => {
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
      const officer = await prisma.officer.findFirst({
        where: { phone: body.phone },
        include: { user: true },
      });

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
      await prisma.user.update({
        where: { id: officer.user.id },
        data: { lastLogin: new Date() },
      });

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

      // Verify refresh token
      const decoded = await reply.jwtVerify<any>(refresh_token);

      // Generate new tokens
      const tokens = generateTokens(decoded, fastify);

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