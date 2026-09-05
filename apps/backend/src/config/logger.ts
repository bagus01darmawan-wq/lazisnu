import pino from 'pino';
import { isProduction } from './env';

/**
 * Shared Pino logger — digunakan oleh worker, service, dan kode
 * di luar konteks Fastify yang tidak punya akses ke server.log.
 *
 * Redact paths disamakan dengan app.ts untuk mencegah bocornya
 * data sensitif (token, password, OTP) ke log output.
 */
export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'body.password',
      'body.otp',
      'authorization',
      'password',
      'otp',
      'token',
      'accessToken',
      'refreshToken',
    ],
    censor: '[REDACTED]',
  },
});
