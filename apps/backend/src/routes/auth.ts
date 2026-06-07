// Auth Routes - Login, OTP, Token Refresh

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../config/database';
import { users, officers } from '../database/schema';
import { eq, or } from 'drizzle-orm';
import { generateTokens } from '../middleware/auth';
import { otpService } from '../services/otp';
import { redisConnection } from '../config/redis';
import { ApiResponse, User } from '@lazisnu/shared-types';
import { isJwtErrorLike } from '../utils/error-guards';
import { sendSuccess, sendError, sendInternalError } from '../utils/response';
import { activityLogs } from '../database/schema';

// Request schemas
const loginSchema = z.object({
  identifier: z.string().min(3),
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
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' }
    },
    schema: {
      tags: ['Auth'],
      summary: 'Login dengan nomor HP atau email dan password',
      body: {
        type: 'object',
        required: ['identifier', 'password'],
        properties: {
          identifier: { type: 'string', minLength: 3 },
          password: { type: 'string', minLength: 6 },
        },
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = loginSchema.parse(request.body);

      // Find user by email or phone with proper field mapping
      const user = await db.query.users.findFirst({
        where: or(
          eq(users.email, body.identifier),
          eq(users.phone, body.identifier)
        )
      });
      let userOfficers: any[] = [];
      if (user) {
        userOfficers = await db.select().from(officers).where(eq(officers.userId, user.id));
      }

      if (!user) {
        await db.insert(activityLogs).values({
          actionType: 'FAILED_LOGIN',
          newData: { identifier: body.identifier, reason: 'USER_NOT_FOUND' },
        });
        return sendError(reply, 401, 'INVALID_CREDENTIALS', 'Email/Nomor HP atau password salah');
      }

      // Verify password - Lazisnu uses Drizzle ORM (camelCase mapped)
      const isValidPassword = await bcrypt.compare(body.password, user.passwordHash);

      if (!isValidPassword) {
        await db.insert(activityLogs).values({
          actionType: 'FAILED_LOGIN',
          userId: user.id,
          newData: { identifier: body.identifier, reason: 'INVALID_PASSWORD' },
        });
        return sendError(reply, 401, 'INVALID_CREDENTIALS', 'Email/Nomor HP atau password salah');
      }

      // Check if user is active
      if (!user.isActive) {
        await db.insert(activityLogs).values({
          actionType: 'FAILED_LOGIN',
          userId: user.id,
          newData: { identifier: body.identifier, reason: 'ACCOUNT_DISABLED' },
        });
        return sendError(reply, 403, 'ACCOUNT_DISABLED', 'Akun Anda tidak aktif');
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

      await db.insert(activityLogs).values({
        actionType: 'LOGIN_SUCCESS',
        userId: user.id,
        officerId: officer?.id || null,
        entityType: 'auth',
        newData: { method: 'password', identifier: body.identifier },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] || null,
      });

      return sendSuccess(reply, {
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
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }

      return sendInternalError(reply, error, fastify.log);
    }
    }
  });

  // POST /auth/request-otp
  fastify.post('/request-otp', {
    config: {
      rateLimit: { max: 3, timeWindow: '1 minute' }
    },
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
        return sendSuccess(reply, {
          message: 'OTP dikirim ke WhatsApp',
          expires_in: 300,
        });
      }

      // Check rate limit before generating
      const allowed = await otpService.checkRateLimit(body.phone);
      if (!allowed) {
        return sendError(reply, 429, 'RATE_LIMITED', 'Terlalu banyak permintaan OTP. Coba lagi nanti.');
      }

      // Generate and store OTP
      const result = await otpService.generateAndStore(body.phone);

      if (!result.success) {
        return sendError(reply, 500, 'OTP_ERROR', 'Gagal membuat OTP');
      }

      // In production, send via WhatsApp Business API
      // For now, mask the phone number in log
      const maskedPhone = body.phone.slice(0, 4) + '****' + body.phone.slice(-3);
      fastify.log.info({ phone: maskedPhone }, 'OTP generated and sent to WhatsApp');

      return sendSuccess(reply, {
        message: 'OTP dikirim ke WhatsApp',
        expires_in: 300,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }

      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /auth/verify-otp
  fastify.post('/verify-otp', {
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' }
    },
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
        await db.insert(activityLogs).values({
          actionType: 'FAILED_OTP',
          newData: { phone: body.phone, reason: 'INVALID_OTP' },
        });
        return sendError(reply, 401, 'INVALID_OTP', 'OTP tidak valid atau sudah expired');
      }

      // Find officer and user (for petugas login with OTP)
      const officer = await db.query.officers.findFirst({
        where: eq(officers.phone, body.phone),
        with: { user: true }
      });
      
      if (!officer || !officer.user) {
        return sendError(reply, 404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan');
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

      await db.insert(activityLogs).values({
        actionType: 'LOGIN_SUCCESS',
        userId: officer.user.id,
        officerId: officer.id,
        entityType: 'auth',
        newData: { method: 'otp', phone: body.phone },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] || null,
      });

      return sendSuccess(reply, {
        access_token: tokens.accessToken,
        user: {
          id: officer.user.id,
          full_name: officer.fullName,
          role: 'PETUGAS',
        },
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return sendError(reply, 400, 'VALIDATION_ERROR', 'Input tidak valid', error.errors);
      }

      return sendInternalError(reply, error, fastify.log);
    }
  });

  // POST /auth/refresh
  fastify.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { refresh_token } = request.body as { refresh_token: string };

      if (!refresh_token) {
        return sendError(reply, 400, 'MISSING_TOKEN', 'Refresh token diperlukan');
      }

      // 1. Cek Redis blacklist
      const isBlacklisted = await redisConnection.get(`blacklist:rt:${refresh_token}`);
      if (isBlacklisted) {
        return sendError(reply, 401, 'TOKEN_BLACKLISTED', 'Token telah dicabut (sudah logout)');
      }

      // 2. Verify refresh token
      const decoded = await request.server.jwt.verify<any>(refresh_token);

      if (decoded.tokenType !== 'refresh') {
        return sendError(reply, 401, 'INVALID_TOKEN', 'Token yang diberikan bukan refresh token');
      }

      // 3. Check user active status
      const userRes = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
      const user = userRes[0];

      if (!user) {
        return sendError(reply, 401, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan');
      }

      if (!user.isActive) {
        return sendError(reply, 403, 'ACCOUNT_DISABLED', 'Akun Anda tidak aktif');
      }

      if (decoded.officerId) {
        const officerRes = await db.select().from(officers).where(eq(officers.id, decoded.officerId)).limit(1);
        const officer = officerRes[0];
        if (!officer || !officer.isActive) {
           return sendError(reply, 403, 'OFFICER_DISABLED', 'Akun petugas Anda tidak aktif');
        }
      }

      const newPayload = {
        userId: user.id,
        role: user.role,
        branchId: user.branchId || undefined,
        districtId: user.districtId || undefined,
        officerId: decoded.officerId,
      };

      // 4. Generate new tokens
      const tokens = generateTokens(newPayload, request.server);

      return sendSuccess(reply, {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
    } catch (error) {
      return sendError(reply, 401, 'INVALID_TOKEN', 'Refresh token tidak valid');
    }
  });

  // POST /auth/logout
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { refresh_token } = request.body as { refresh_token: string };

      if (refresh_token) {
        try {
          // Decode untuk mendapatkan expiry
          const decoded = await request.server.jwt.verify<any>(refresh_token);
          const now = Math.floor(Date.now() / 1000);
          const ttl = decoded.exp - now;

          if (ttl > 0) {
            // Simpan ke Redis blacklist
            await redisConnection.set(`blacklist:rt:${refresh_token}`, '1', 'EX', ttl);
          }
        } catch (e) {
          // Jika token sudah tidak valid/expired, abaikan saja
        }
      }

      return sendSuccess(reply, { message: 'Logout berhasil' });
    } catch (error) {
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // GET /auth/me
  fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const decoded = request.user as any;

      const userRes = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
      const user = userRes[0];

      if (!user) {
        return sendError(reply, 404, 'USER_NOT_FOUND', 'User tidak ditemukan');
      }
      if (!user.isActive) {
        return sendError(reply, 403, 'ACCOUNT_DISABLED', 'Akun tidak aktif');
      }

      let officerData: any = null;
      if (decoded.officerId) {
        const officerRes = await db.select().from(officers).where(eq(officers.id, decoded.officerId)).limit(1);
        if (officerRes[0]) {
          const o = officerRes[0];
          officerData = {
            id: o.id,
            employee_code: o.employeeCode,
            photo_url: o.photoUrl,
            assigned_zone: o.assignedZone,
            is_active: o.isActive,
          };
        }
      }

      const responseData: ApiResponse<User & { officer?: any }> = {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          full_name: user.fullName,
          phone: user.phone,
          role: user.role as any,
          branch_id: user.branchId || undefined,
          district_id: user.districtId || undefined,
          is_active: user.isActive,
          last_login: user.lastLogin ? user.lastLogin.toISOString() : undefined,
          officer: officerData,
        },
      };

      return reply.send(responseData);
    } catch (error: unknown) {
      if (isJwtErrorLike(error) && (error.statusCode === 401 || error.code?.includes('JWT'))) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Token tidak valid atau expired');
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });
}

export default authRoutes;

