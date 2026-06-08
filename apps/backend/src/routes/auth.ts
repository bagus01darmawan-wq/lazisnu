// Auth Routes - Login, OTP, Token Refresh

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../config/database';
import { users, officers } from '../database/schema';
import { eq, or } from 'drizzle-orm';
import { generateTokens } from '../middleware/auth';
import { otpService } from '../services/otp';
import { storeRefreshJti, validateRefreshJti, revokeRefreshJti } from '../services/tokenService';
import { createSession, getUserSessions, revokeSession, revokeAllUserSessions } from '../services/sessionService';
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

      // Cek account lockout
      const lockoutKey = `login:lockout:${body.identifier}`;
      const isLocked = await redisConnection.get(lockoutKey);
      if (isLocked) {
        return sendError(reply, 423, 'ACCOUNT_LOCKED', 'Akun terkunci sementara, coba lagi nanti');
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
        // Increment login attempt counter
        const attemptKey = `login:attempts:${body.identifier}`;
        const attemptCount = await redisConnection.incr(attemptKey);
        if (attemptCount === 1) {
          await redisConnection.expire(attemptKey, 3600); // 1 jam window
        }

        // Lock account jika >= 10 gagal
        if (attemptCount >= 10) {
          await redisConnection.set(lockoutKey, '1', 'EX', 3600); // Lock 1 jam
          await redisConnection.del(attemptKey);
        }

        await db.insert(activityLogs).values({
          actionType: 'FAILED_LOGIN',
          userId: user.id,
          newData: { identifier: body.identifier, reason: 'INVALID_PASSWORD', attempts: attemptCount },
        });
        return sendError(reply, 401, 'INVALID_CREDENTIALS', 'Email/Nomor HP atau password salah');
      }

      // Reset login attempt counter on success
      await redisConnection.del(`login:attempts:${body.identifier}`);
      await redisConnection.del(lockoutKey);

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

      // Simpan jti refresh token ke Redis
      await storeRefreshJti(tokens.refreshJti, user.id, 30 * 24 * 60 * 60);

      // Simpan session ke DB
      await createSession({
        userId: user.id,
        jti: tokens.refreshJti,
        userAgent: request.headers['user-agent'] || undefined,
        ipAddress: request.ip,
      });

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

      // Cek OTP attempt counter
      const attemptKey = `otp:attempts:${body.phone}`;
      const attemptCount = await redisConnection.get(attemptKey);
      if (attemptCount && parseInt(attemptCount) >= 5) {
        // Hapus OTP yang ada
        await otpService.delete(body.phone);
        await redisConnection.del(attemptKey);
        return sendError(reply, 429, 'OTP_TOO_MANY_ATTEMPTS', 'Terlalu banyak percobaan, minta OTP baru');
      }

      // Verify OTP first
      const isValid = await otpService.verify(body.phone, body.otp);

      if (!isValid) {
        // Increment attempt counter
        const newCount = await redisConnection.incr(attemptKey);
        if (newCount === 1) {
          await redisConnection.expire(attemptKey, 300); // 5 menit
        }

        await db.insert(activityLogs).values({
          actionType: 'FAILED_OTP',
          newData: { phone: body.phone, reason: 'INVALID_OTP' },
        });
        return sendError(reply, 401, 'INVALID_OTP', 'OTP tidak valid atau sudah expired');
      }

      // Reset attempt counter on success
      await redisConnection.del(attemptKey);

      // Find officer and user (for petugas login with OTP)
      const officer = await db.query.officers.findFirst({
        where: eq(officers.phone, body.phone),
        with: { user: true }
      });
      
      if (!officer || !officer.user) {
        return sendError(reply, 404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan');
      }

      // Cek status officer aktif
      if (!officer.isActive) {
        await otpService.delete(body.phone);
        return sendError(reply, 403, 'OFFICER_DISABLED', 'Akun petugas Anda tidak aktif');
      }

      // Delete used OTP
      await otpService.delete(body.phone);

      // Update last login
      await db.update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.id, officer.user.id));

      // Check if user account is active
      if (!officer.user.isActive) {
        return sendError(reply, 403, 'ACCOUNT_DISABLED', 'Akun Anda tidak aktif');
      }

      // Generate tokens
      const payload = {
        userId: officer.user.id,
        role: 'PETUGAS' as const,
        officerId: officer.id,
        branchId: officer.branchId,
        districtId: officer.districtId,
      };

      const tokens = generateTokens(payload, fastify);

      // Simpan jti refresh token ke Redis
      await storeRefreshJti(tokens.refreshJti, officer.user.id, 30 * 24 * 60 * 60);

      // Simpan session ke DB
      await createSession({
        userId: officer.user.id,
        jti: tokens.refreshJti,
        userAgent: request.headers['user-agent'] || undefined,
        ipAddress: request.ip,
      });

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
        refresh_token: tokens.refreshToken,
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
  fastify.post('/refresh', {
    config: {
      rateLimit: { max: 30, timeWindow: '5 minutes' }
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { refresh_token } = request.body as { refresh_token: string };

      if (!refresh_token) {
        return sendError(reply, 400, 'MISSING_TOKEN', 'Refresh token diperlukan');
      }

      // 1. Verify refresh token
      const decoded = await request.server.jwt.verify<any>(refresh_token);

      if (decoded.tokenType !== 'refresh') {
        return sendError(reply, 401, 'INVALID_TOKEN', 'Token yang diberikan bukan refresh token');
      }

      // 2. Validasi jti — cek apakah masih valid (belum di-revoke)
      if (decoded.jti) {
        const jtiUserId = await validateRefreshJti(decoded.jti);
        if (!jtiUserId) {
          return sendError(reply, 401, 'REFRESH_REVOKED', 'Refresh token sudah tidak berlaku');
        }
        // Revoke jti lama (rotation)
        await revokeRefreshJti(decoded.jti);
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

      // Re-resolve scope untuk PETUGAS: query officer fresh dari DB
      let freshOfficerId: string | undefined = decoded.officerId;
      if (decoded.officerId) {
        const officerRes = await db.select().from(officers).where(eq(officers.id, decoded.officerId)).limit(1);
        const officer = officerRes[0];
        if (!officer || !officer.isActive) {
           return sendError(reply, 403, 'OFFICER_DISABLED', 'Akun petugas Anda tidak aktif');
        }
        freshOfficerId = officer.id;
      }

      const newPayload = {
        userId: user.id,
        role: user.role,
        branchId: user.branchId || undefined,
        districtId: user.districtId || undefined,
        officerId: freshOfficerId,
      };

      // 4. Generate new tokens dengan jti baru
      const tokens = generateTokens(newPayload, request.server);

      // 5. Simpan jti baru ke Redis dan update session activity
      await storeRefreshJti(tokens.refreshJti, user.id, 30 * 24 * 60 * 60);

      // Update session activity untuk jti lama (sudah di-revoke, buat session baru)
      await createSession({
        userId: user.id,
        jti: tokens.refreshJti,
        userAgent: request.headers['user-agent'] || undefined,
        ipAddress: request.ip,
      });

      return sendSuccess(reply, {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
    } catch (error) {
      return sendError(reply, 401, 'INVALID_TOKEN', 'Refresh token tidak valid');
    }
  });

  // POST /auth/logout
  fastify.post('/logout', {
    config: {
      rateLimit: { max: 10, timeWindow: '5 minutes' }
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { refresh_token } = request.body as { refresh_token: string };
      const access_token = (request.headers.authorization || '').replace('Bearer ', '');

      if (refresh_token) {
        try {
          // Decode untuk mendapatkan jti
          const decoded = await request.server.jwt.verify<any>(refresh_token);
          if (decoded.jti) {
            await revokeRefreshJti(decoded.jti);
          }

          // Blacklist access token juga (optional)
          if (access_token) {
            try {
              const accessDecoded = await request.server.jwt.verify<any>(access_token);
              const now = Math.floor(Date.now() / 1000);
              const ttl = accessDecoded.exp - now;
              if (ttl > 0) {
                await redisConnection.set(`blacklist:at:${access_token}`, '1', 'EX', ttl);
              }
            } catch {
              // Abaikan jika access token sudah expired
            }
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

  // ============ Session Management ============

  // GET /auth/sessions — daftar sesi aktif
  fastify.get('/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const decoded = request.user as any;

      const sessions = await getUserSessions(decoded.userId);

      return sendSuccess(reply, sessions.map((s: any) => ({
        id: s.id,
        device_label: s.deviceLabel,
        ip_address: s.ipAddress,
        last_used_at: s.lastUsedAt,
        created_at: s.createdAt,
      })));
    } catch (error: unknown) {
      if (isJwtErrorLike(error) && (error.statusCode === 401 || error.code?.includes('JWT'))) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Token tidak valid atau expired');
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // DELETE /auth/sessions/:id — cabut 1 sesi
  fastify.delete('/sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const decoded = request.user as any;
      const { id } = request.params as { id: string };

      const revoked = await revokeSession(id, decoded.userId);

      if (!revoked) {
        return sendError(reply, 404, 'SESSION_NOT_FOUND', 'Sesi tidak ditemukan atau sudah dicabut');
      }

      return sendSuccess(reply, { message: 'Sesi berhasil dicabut' });
    } catch (error: unknown) {
      if (isJwtErrorLike(error) && (error.statusCode === 401 || error.code?.includes('JWT'))) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Token tidak valid atau expired');
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });

  // DELETE /auth/sessions — cabut semua sesi lain (logout other devices)
  fastify.delete('/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const decoded = request.user as any;

      const count = await revokeAllUserSessions(decoded.userId);

      return sendSuccess(reply, {
        message: `${count} sesi lain berhasil dicabut`,
        revoked_count: count,
      });
    } catch (error: unknown) {
      if (isJwtErrorLike(error) && (error.statusCode === 401 || error.code?.includes('JWT'))) {
        return sendError(reply, 401, 'UNAUTHORIZED', 'Token tidak valid atau expired');
      }
      return sendInternalError(reply, error, fastify.log);
    }
  });
}

export default authRoutes;

