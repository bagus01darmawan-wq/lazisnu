// OTP Service - Generate, Store, and Verify OTP codes

import { config } from '../config/env';

// In-memory store for development (use Redis in production)
const otpStore: Map<string, { otp: string; expiresAt: number }> = new Map();

// OTP validity duration in milliseconds (5 minutes)
const OTP_EXPIRY = 5 * 60 * 1000;

/**
 * OTP Service
 * Handles generation, storage, and verification of OTP codes
 *
 * For production:
 * - Use Redis instead of in-memory store
 * - Integrate with WhatsApp Business API for sending
 */
export const otpService = {
  /**
   * Generate a 6-digit OTP and store it
   */
  generateAndStore: async (phone: string): Promise<{ success: boolean; otp: string }> => {
    try {
      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + OTP_EXPIRY;

      // In production, use Redis:
      // await redis.set(`otp:${phone}`, otp, 'EX', 300);

      // For now, use in-memory store
      otpStore.set(phone, { otp, expiresAt });

      // Auto-cleanup expired OTPs periodically
      cleanupExpiredOTPs();

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
      // In production, use Redis:
      // const storedOTP = await redis.get(`otp:${phone}`);
      // return storedOTP === otp;

      // For now, use in-memory store
      const stored = otpStore.get(phone);

      if (!stored) {
        return false;
      }

      // Check if OTP has expired
      if (Date.now() > stored.expiresAt) {
        otpStore.delete(phone);
        return false;
      }

      // Verify OTP matches
      const isValid = stored.otp === otp;

      // Clean up after verification attempt
      if (isValid || Date.now() > stored.expiresAt) {
        otpStore.delete(phone);
      }

      return isValid;
    } catch (error) {
      console.error('OTP verification error:', error);
      return false;
    }
  },

  /**
   * Delete OTP after successful verification
   */
  delete: async (phone: string): Promise<void> => {
    otpStore.delete(phone);

    // In production:
    // await redis.del(`otp:${phone}`);
  },

  /**
   * Get remaining time for OTP (in seconds)
   */
  getRemainingTime: async (phone: string): Promise<number> => {
    const stored = otpStore.get(phone);

    if (!stored) {
      return 0;
    }

    const remaining = stored.expiresAt - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  },

  /**
   * Check if rate limit is exceeded
   * Limits: 3 OTP requests per phone per 5 minutes
   */
  checkRateLimit: async (phone: string): Promise<boolean> => {
    // In production, use Redis with rate limit:
    // const count = await redis.incr(`otp_rate:${phone}`);
    // if (count === 1) await redis.expire(`otp_rate:${phone}`, 300);
    // return count > 3;

    // For development, skip rate limiting
    return true;
  },
};

/**
 * Cleanup expired OTPs from memory
 */
function cleanupExpiredOTPs() {
  const now = Date.now();
  for (const [phone, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(phone);
    }
  }
}

// Auto-cleanup every minute
if (config.NODE_ENV === 'development') {
  setInterval(cleanupExpiredOTPs, 60000);
}

export default otpService;