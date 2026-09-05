// Auth Routes - Login, OTP, Token Refresh

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../config/database';
import { users, officers, userSessions } from '../database/schema';
import { eq, or, and, isNull } from 'drizzle-orm';
import { generateTokens } from '../middleware/auth';
import { otpService } from '../services/otp';
import { storeDeviceSession, isDeviceRevoked, revokeDeviceSession, revokeAllUserSessions, clearDeviceRevocation } from '../services/tokenService';
import { createSession, getUserSessions } from '../services/sessionService';
import { ApiResponse, User } from '@lazisnu/shared-types';
import { isJwtErrorLike } from '../utils/error-guards';
import { redisConnection } from '../config/redis';
import { sendSuccess, sendError, sendInternalError } from '../utils/response';
import { insertActivityLog } from '../services/auditLogService';
import { config } from '../config/env';
import { sendOtpMessage } from '../services/whatsapp';
import { getPhoneLookupVariants } from '../utils/phone';

// Request schemas
const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(6),
  device_id: z.string().optional(),
  device_label: z.string().max(100).optional(),
});

const requestOTPSchema = z.object({
  phone: z.string().min(10).max(15),
});

const verifyOTPSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
  device_id: z.string().optional(),
  device_label: z.string().max(100).optional(),
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

      // Find user by email or phone with proper field mapping.
      // Identifier numerik dicocokkan dengan semua varian format (08xx / 62xx)
      // karena `users.phone` disimpan format lokal sedangkan input bisa 62xx.
      const lookupConditions = [
        eq(users.email, body.identifier),
        eq(users.phone, body.identifier),
      ];
      if (/^\d{9,15}$/.test(body.identifier)) {
        for (const variant of getPhoneLookupVariants(body.identifier)) {
          if (variant !== body.identifier) {
            lookupConditions.push(eq(users.phone, variant));
          }
        }
      }
      const user = await db.query.users.findFirst({
        where: or(...lookupConditions)
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
        try {
          await insertActivityLog({
            actionType: 'FAILED_LOGIN',
            userId: null,
            officerId: null,
            entityType: 'auth',
            entityId: null,
            newData: { identifier: body.identifier, reason: 'USER_NOT_FOUND' },
            ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
            userAgent: request.headers['user-agent'] || null,
          });
        } catch (err) {
          request.log.error({ err }, 'FAILED_LOGIN audit log failed');
        }
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

        try {
          await insertActivityLog({
            actionType: 'FAILED_LOGIN',
            userId: user.id,
            officerId: null,
            entityType: 'auth',
            entityId: null,
            newData: { identifier: body.identifier, reason: 'INVALID_PASSWORD', attempts: attemptCount },
            ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
            userAgent: request.headers['user-agent'] || null,
          });
        } catch (err) {
          request.log.error({ err }, 'FAILED_LOGIN audit log failed');
        }
        return sendError(reply, 401, 'INVALID_CREDENTIALS', 'Email/Nomor HP atau password salah');
      }

      // Reset login attempt counter on success
      await redisConnection.del(`login:attempts:${body.identifier}`);
      await redisConnection.del(lockoutKey);

      // Check if user is active
      if (!user.isActive) {
        try {
          await insertActivityLog({
            actionType: 'FAILED_LOGIN',
            userId: user.id,
            officerId: null,
            entityType: 'auth',
            entityId: null,
            newData: { identifier: body.identifier, reason: 'ACCOUNT_DISABLED' },
            ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
            userAgent: request.headers['user-agent'] || null,
          });
        } catch (err) {
          request.log.error({ err }, 'FAILED_LOGIN audit log failed');
        }
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

      const deviceId = body.device_id || undefined;
      const deviceLabel = body.device_label || undefined;

      const tokens = generateTokens(payload, fastify, undefined, deviceId);

      await storeDeviceSession(user.id, tokens.did, tokens.refreshJti, 365 * 24 * 60 * 60);
      // Login kredensial berhasil pada device ini = bukti pemegang akun hadir —
      // hapus blokir lama agar refresh berikutnya tidak tertolak denylist usang
      await clearDeviceRevocation(user.id, tokens.did);

      await createSession({
        userId: user.id,
        jti: tokens.refreshJti,
        deviceId: tokens.did,
        deviceLabel,
        userAgent: request.headers['user-agent'] || undefined,
        ipAddress: request.ip,
      });

      try {
        await insertActivityLog({
          actionType: 'LOGIN_SUCCESS',
          userId: user.id,
          officerId: officer?.id || null,
          entityType: 'auth',
          entityId: null,
          newData: { method: 'password', identifier: body.identifier },
          ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
          userAgent: request.headers['user-agent'] || null,
        });
      } catch (err) {
        request.log.error({ err }, 'LOGIN_SUCCESS audit log failed');
      }

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

      // Check if officer exists (OTP khusus petugas — lookup via officers join users).
      // `officers.phone` disimpan format 62xx; input user bisa 08xx — cocokkan
      // semua varian format nomor (normalisasi di lookup, bukan di penyimpanan).
      const officer = await db.query.officers.findFirst({
        where: or(...getPhoneLookupVariants(body.phone).map(p => eq(officers.phone, p))),
        with: { user: true }
      });

      if (!officer || !officer.user) {
        return sendError(reply, 404, 'USER_NOT_FOUND', 'Pengguna tidak ditemukan');
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

      // Kirim OTP via WhatsApp — dipanggil langsung (bukan via queue)
      // karena OTP time-sensitive (TTL 5 menit).
      const waResult = await sendOtpMessage(body.phone, result.otp);
      if (waResult.status === 'FAILED') {
        return sendError(reply, 502, 'WA_SEND_FAILED', 'Gagal mengirim OTP via WhatsApp. Coba lagi.');
      }

      // OTP tidak di-log — hanya catat metadata
      const maskedPhone = body.phone.slice(0, 4) + '****' + body.phone.slice(-3);
      fastify.log.info({ phone: maskedPhone, waMessageId: waResult.message_id }, 'OTP dikirim via WhatsApp');

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

        try {
          await insertActivityLog({
            actionType: 'FAILED_OTP',
            userId: null,
            officerId: null,
            entityType: 'auth',
            entityId: null,
            newData: { phone: body.phone, reason: 'INVALID_OTP' },
            ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
            userAgent: request.headers['user-agent'] || null,
          });
        } catch (err) {
          request.log.error({ err }, 'FAILED_OTP audit log failed');
        }
        return sendError(reply, 401, 'INVALID_OTP', 'OTP tidak valid atau sudah expired');
      }

      // Reset attempt counter on success
      await redisConnection.del(attemptKey);

      // Find officer and user (for petugas login with OTP) — lookup phone
      // via semua varian format (08xx / 62xx), lihat catatan request-otp.
      const officer = await db.query.officers.findFirst({
        where: or(...getPhoneLookupVariants(body.phone).map(p => eq(officers.phone, p))),
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

      const deviceId = body.device_id || undefined;
      const tokens = generateTokens(payload, fastify, undefined, deviceId);

      // Simpan sesi per-device ke Redis
      await storeDeviceSession(officer.user.id, tokens.did, tokens.refreshJti, 365 * 24 * 60 * 60);
      // Login OTP berhasil = bukti pemegang akun hadir — hapus blokir lama device ini
      await clearDeviceRevocation(officer.user.id, tokens.did);

      // Simpan session ke DB
      await createSession({
        userId: officer.user.id,
        jti: tokens.refreshJti,
        deviceId: tokens.did,
        deviceLabel: body.device_label,
        userAgent: request.headers['user-agent'] || undefined,
        ipAddress: request.ip,
      });

      try {
        await insertActivityLog({
          actionType: 'LOGIN_SUCCESS',
          userId: officer.user.id,
          officerId: officer.id,
          entityType: 'auth',
          entityId: null,
          newData: { method: 'otp', phone: body.phone },
          ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
          userAgent: request.headers['user-agent'] || null,
        });
      } catch (err) {
        request.log.error({ err }, 'LOGIN_SUCCESS audit log failed');
      }

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

  // POST /auth/refresh — Sesi Permanen Sliding (RENCANA-SESI-PERMANEN-SLIDING)
  // Prinsip: kegagalan infrastruktur TIDAK BOLEH me-logout petugas.
  //  - Redis = daftar blokir eksplisit saja (fail-open).
  //  - Rotasi lunak: token lama tidak dicabut; kedaluwarsa alami. Respons yang
  //    hilang karena sinyal tidak lagi mematikan sesi (F1).
  //  - did stabil per perangkat — memperbaiki bug deterministik F0 (sebelumnya
  //    setiap rotasi menghasilkan did acak baru sehingga refresh ke-2 selalu
  //    REFRESH_REVOKED).
  fastify.post('/refresh', {
    config: {
      rateLimit: { max: 30, timeWindow: '5 minutes' }
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { refresh_token } = request.body as { refresh_token?: string };

      if (!refresh_token) {
        request.log.warn({ ip: request.ip, userAgent: request.headers['user-agent'] }, 'auth_refresh_failed:missing_token');
        return sendError(reply, 400, 'MISSING_TOKEN', 'Refresh token diperlukan');
      }

      // 1. Verifikasi tanda tangan + masa berlaku — satu-satunya sumber 401 INVALID_TOKEN
      let decoded: any;
      try {
        decoded = await request.server.jwt.verify<any>(refresh_token, { key: config.JWT_REFRESH_SECRET });
      } catch (jwtError) {
        const jwtCode = isJwtErrorLike(jwtError) ? jwtError.code : 'verify_failed';
        request.log.warn({ jwtCode, ip: request.ip, userAgent: request.headers['user-agent'] }, 'auth_refresh_failed:invalid_token');
        return sendError(reply, 401, 'INVALID_TOKEN', 'Refresh token tidak valid');
      }

      if (decoded.tokenType !== 'refresh') {
        request.log.warn({ userId: decoded.userId, tokenType: decoded.tokenType, ip: request.ip, userAgent: request.headers['user-agent'] }, 'auth_refresh_failed:invalid_token_type');
        return sendError(reply, 401, 'INVALID_TOKEN', 'Token yang diberikan bukan refresh token');
      }

      // Fallback jti hanya untuk token legacy pra-F0 yang tidak membawa did
      const deviceId: string = decoded.did || decoded.jti;

      // 2. Denylist eksplisit (fail-open — Redis bermasalah tidak menolak sesi)
      const revoked = await isDeviceRevoked(decoded.userId, deviceId);
      if (revoked) {
        request.log.warn({ userId: decoded.userId, deviceId, ip: request.ip, userAgent: request.headers['user-agent'] }, 'auth_refresh_failed:revoked');
        return sendError(reply, 401, 'REFRESH_REVOKED', 'Refresh token sudah dicabut');
      }

      // 3-4. Status akun selalu dari database (nonaktif = terblokir cepat)
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

      // 5. Rotasi lunak — did DITERUSKAN (F0); jti lama dibiarkan hidup sampai exp-nya
      const tokens = generateTokens(newPayload, request.server, undefined, deviceId);

      // 6. Catatan jti terakhir (informatif — UI daftar perangkat), fail-open
      await storeDeviceSession(user.id, deviceId, tokens.refreshJti, 365 * 24 * 60 * 60);

      // 7. userSessions: SATU baris terbuka per device (update, bukan insert baru)
      try {
        const openRows = await db.select().from(userSessions).where(and(
          eq(userSessions.userId, user.id),
          eq(userSessions.deviceId, deviceId),
          isNull(userSessions.revokedAt),
        )).limit(1);

        if (openRows[0]) {
          await db.update(userSessions)
            .set({ jti: tokens.refreshJti, lastUsedAt: new Date() } as any)
            .where(eq(userSessions.id, openRows[0].id));
        } else {
          await createSession({
            userId: user.id,
            jti: tokens.refreshJti,
            deviceId,
            userAgent: request.headers['user-agent'] || undefined,
            ipAddress: request.ip,
          });
        }
      } catch (sessionErr) {
        // Best-effort — kegagalan pencatatan sesi tidak boleh menggagalkan refresh
        request.log.warn({ err: sessionErr }, 'refresh_session_upsert_failed');
      }

      return sendSuccess(reply, {
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
    } catch (error) {
      // F2: semua jalur 401 legitimen sudah return di atas — apapun yang lolos
      // ke sini adalah gangguan infrastruktur → 503 agar klien TIDAK membersihkan
      // token lokal dan mencoba lagi nanti.
      request.log.error({ err: error, ip: request.ip }, 'auth_refresh_failed:service_unavailable');
      return sendError(reply, 503, 'SERVICE_UNAVAILABLE', 'Layanan autentikasi sedang tidak tersedia');
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

      let userId: string | null = null;
      let officerId: string | null = null;
      let deviceId: string | null = null;

      if (refresh_token) {
        try {
          const decoded = await request.server.jwt.verify<any>(refresh_token, { key: config.JWT_REFRESH_SECRET });
          userId = decoded.userId || null;
          officerId = decoded.officerId || null;
          deviceId = decoded.did || decoded.jti || null;

          if (userId && deviceId) {
            // Denylist TTL = sisa umur token yang dicabut (self-cleaning);
            // token yang sudah exp tidak perlu ditandai
            const nowSec = Math.floor(Date.now() / 1000);
            const remainTtl = typeof decoded.exp === 'number' ? decoded.exp - nowSec : 365 * 24 * 60 * 60;
            if (remainTtl > 0) {
              await revokeDeviceSession(userId, deviceId, remainTtl);
            }
          }

          // Tutup session DB
          if (decoded.jti) {
            await db.update(userSessions)
              .set({ revokedAt: new Date() } as any)
              .where(eq(userSessions.jti, decoded.jti))
              .catch(() => {});
          }
        } catch (e) {
          // Token sudah expired — tidak masalah
        }
      }

      // Resolve userId dari access token jika belum dapat
      if (!userId && access_token) {
        try {
          const decodedAccess = await request.server.jwt.verify<any>(access_token);
          userId = decodedAccess.userId || null;
          officerId = decodedAccess.officerId || null;
        } catch {
          // Abaikan error decoding
        }
      }

      if (userId) {
        try {
          await insertActivityLog({
            actionType: 'LOGOUT',
            userId,
            officerId,
            entityType: 'auth',
            newData: { reason: 'USER_LOGOUT' },
            ipAddress: (request.headers['x-forwarded-for'] as string) || request.ip,
            userAgent: request.headers['user-agent'] || null,
            entityId: null,
          });
        } catch (err) {
          request.log.error({ err }, 'Manual logout audit log insertion failed');
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

      // Cari session untuk mendapatkan jti dan deviceId
      const session = await db.query.userSessions.findFirst({
        where: and(eq(userSessions.id, id), eq(userSessions.userId, decoded.userId), isNull(userSessions.revokedAt)),
      });

      if (!session) {
        return sendError(reply, 404, 'SESSION_NOT_FOUND', 'Sesi tidak ditemukan atau sudah dicabut');
      }

      // Revoke di Redis (FIX P0-2: sebelumnya hanya set revokedAt di DB, Redis tidak disentuh)
      // Target = device milik sesi yang dicabut; JANGAN pakai decoded.did
      // (itu device pemanggil saat ini).
      const sessionDeviceId = (session as any).deviceId || session.jti;
      await revokeDeviceSession(decoded.userId, sessionDeviceId);

      // Tandai revokedAt di DB
      await db.update(userSessions)
        .set({ revokedAt: new Date() } as any)
        .where(eq(userSessions.id, id));

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

      const currentDeviceId = decoded.did || decoded.jti;
      const revokedDeviceIds = await revokeAllUserSessions(decoded.userId, currentDeviceId);

      // Tandai revokedAt di DB untuk semua device yang di-revoke
      for (const did of revokedDeviceIds) {
        await db.update(userSessions)
          .set({ revokedAt: new Date() } as any)
          .where(and(
            eq(userSessions.userId, decoded.userId),
            eq(userSessions.deviceId, did),
            isNull(userSessions.revokedAt),
          ))
          .catch(() => {});
      }

      return sendSuccess(reply, {
        message: `${revokedDeviceIds.length} sesi lain berhasil dicabut`,
        revoked_count: revokedDeviceIds.length,
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

