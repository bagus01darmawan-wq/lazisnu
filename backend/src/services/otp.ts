// OTP Service - Generate, Store, and Verify OTP codes using Redis

import { getRedis } from '../config/redis';

// OTP validity in seconds (5 minutes)
const OTP_EXPIRY_SECONDS = 5 * 60;
// Rate limit: max OTP requests per window
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SECONDS = 5 * 60;

// Fallback in-memory store when Redis is not configured
const otpStore: Map<string, { otp: string; expiresAt: number }> = new Map();

/**
 * OTP Service
 * Uses Redis if REDIS_URL is configured, falls back to in-memory for development.
 */
export const otpService = {
  /**
   * Generate a 6-digit OTP and store it
   */
  generateAndStore: async (phone: string): Promise<{ success: boolean; otp: string }> => {
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const redis = getRedis();

      if (redis) {
        // Store in Redis with TTL
        await redis.set(`otp:${phone}`, otp, 'EX', OTP_EXPIRY_SECONDS);
      } else {
        // Fallback: in-memory store
        const expiresAt = Date.now() + OTP_EXPIRY_SECONDS * 1000;
        otpStore.set(phone, { otp, expiresAt });
        // Cleanup expired entries
        for (const [key, val] of otpStore.entries()) {
          if (Date.now() > val.expiresAt) otpStore.delete(key);
        }
      }

      return { success: true, otp };
    } catch (error) {
      console.error('OTP generation error:', error);
      return { success: false, otp: '' };
    }
  },

  /**
   * Verify an OTP code
   */
  verify: async (phone: string, otp: string): Promise<boolean> => {
    try {
      const redis = getRedis();

      if (redis) {
        const storedOTP = await redis.get(`otp:${phone}`);
        return storedOTP === otp;
      } else {
        // Fallback: in-memory store
        const stored = otpStore.get(phone);
        if (!stored) return false;
        if (Date.now() > stored.expiresAt) {
          otpStore.delete(phone);
          return false;
        }
        return stored.otp === otp;
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      return false;
    }
  },

  /**
   * Delete OTP after successful verification
   */
  delete: async (phone: string): Promise<void> => {
    try {
      const redis = getRedis();
      if (redis) {
        await redis.del(`otp:${phone}`);
      } else {
        otpStore.delete(phone);
      }
    } catch (error) {
      console.error('OTP delete error:', error);
    }
  },

  /**
   * Get remaining TTL for OTP (in seconds)
   */
  getRemainingTime: async (phone: string): Promise<number> => {
    try {
      const redis = getRedis();
      if (redis) {
        const ttl = await redis.ttl(`otp:${phone}`);
        return Math.max(0, ttl);
      } else {
        const stored = otpStore.get(phone);
        if (!stored) return 0;
        return Math.max(0, Math.floor((stored.expiresAt - Date.now()) / 1000));
      }
    } catch {
      return 0;
    }
  },

  /**
   * Check rate limit: max 3 OTP requests per 5 minutes per phone
   * Returns true if allowed, false if rate limited
   */
  checkRateLimit: async (phone: string): Promise<boolean> => {
    try {
      const redis = getRedis();
      if (redis) {
        const key = `otp_rate:${phone}`;
        const count = await redis.incr(key);
        if (count === 1) {
          // First request: set expiry
          await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
        }
        return count <= RATE_LIMIT_MAX;
      }
      // In development without Redis, always allow
      return true;
    } catch {
      return true;
    }
  },
};

export default otpService;