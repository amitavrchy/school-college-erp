import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit, type Options } from 'express-rate-limit';
import IORedis from 'ioredis';
import { AppModule } from './app.module';
import { config, trustProxy } from './config';
import { ApiErrors } from './common';
import express from 'express';
import { JwtService } from '@nestjs/jwt';
import {
  admissionBucket,
  contactBucket,
  ipBucket,
  loginBucket,
  requestBucket,
} from './auth/rate-limit';
import { RedisRateLimitStore } from './auth/redis-store';
async function main() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // Must be set before any limiter reads req.ip, otherwise every client behind the proxy shares one bucket.
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy(config.TRUST_PROXY));
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalFilters(new ApiErrors());
  const origins = config.CORS_ORIGINS.split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const redis = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  redis.on('error', () => undefined);
  const limiter = (
    prefix: string,
    options: Partial<Options> & Pick<Options, 'windowMs'>,
    failOpen = false,
  ) =>
    rateLimit({
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      store: new RedisRateLimitStore(redis, prefix),
      passOnStoreError: failOpen,
      message: {
        statusCode: 429,
        message: 'Too many requests. Please wait a moment and try again.',
      },
      ...options,
    });
  app.use(
    '/api/saas/register',
    limiter('register', { windowMs: 3600_000, limit: 10, keyGenerator: ipBucket }),
  );
  app.use(
    '/api/auth/codes',
    limiter('codes-ip', { windowMs: 3600_000, limit: 20, keyGenerator: ipBucket }),
    limiter('codes-contact', { windowMs: 3600_000, limit: 5, keyGenerator: contactBucket }),
  );
  app.enableCors({ origin: origins, credentials: true });
  const jwt = app.get(JwtService);
  app.use(
    '/api',
    limiter(
      'api',
      {
        windowMs: 60_000,
        limit: (req) => (req.originalUrl.startsWith('/api/public-websites/') ? 3000 : 300),
        keyGenerator: (req) => requestBucket(req, jwt),
      },
      true,
    ),
  );
  app.use(
    '/api/auth/login',
    limiter('login', { windowMs: 15 * 60_000, limit: 30, keyGenerator: loginBucket }),
  );
  app.use(
    '/api/auth/mfa/login',
    limiter('mfa', { windowMs: 15 * 60_000, limit: 20, keyGenerator: ipBucket }),
  );
  app.use(
    '/api/auth/password-reset',
    limiter('reset', { windowMs: 15 * 60_000, limit: 10, keyGenerator: loginBucket }),
  );
  app.use(
    '/api/admissions/applications',
    limiter('admissions', {
      windowMs: 60_000,
      limit: 20,
      keyGenerator: admissionBucket,
      skip: (req) => req.method !== 'POST',
    }),
  );
  app.use((req: any, res: any, next: any) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      !origins.includes(req.headers.origin) &&
      !req.path.startsWith('/api/payments/webhooks/') &&
      !req.path.startsWith('/api/public-websites/') &&
      req.path !== '/api/payments/return'
    )
      return res.status(403).json({ message: 'Request origin is not allowed' });
    next();
  });
  if (config.PAYMENT_MODE === 'sslcommerz')
    console.warn(
      'PAYMENT_MODE=sslcommerz: fees settle to the platform merchant account. Online fees stay hidden until a platform administrator enables them in platform settings.',
    );
  if (config.OTP_DEBUG)
    console.warn('OTP_DEBUG is on: one-time codes are returned in API responses. Test use only.');
  await app.listen(config.PORT, '0.0.0.0');
  process.once('SIGTERM', () => void redis.quit().catch(() => undefined));
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
