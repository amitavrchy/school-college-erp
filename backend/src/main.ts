import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { AppModule } from './app.module';
import { config } from './config';
import { ApiErrors } from './common';
import express from 'express';
import { JwtService } from '@nestjs/jwt';
import { requestBucket } from './auth/rate-limit';
async function main() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
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
  app.use(
    '/api/saas/register',
    rateLimit({ windowMs: 3600000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.enableCors({ origin: origins, credentials: true });
  const jwt = app.get(JwtService);
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (req) => requestBucket(req, jwt),
      message: {
        statusCode: 429,
        message: 'Too many requests. Please wait a moment and try again.',
      },
    }),
  );
  app.use(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 30,
      keyGenerator: (req) =>
        createHash('sha256')
          .update(
            `${ipKeyGenerator(req.ip || '127.0.0.1')}:${String(req.body?.email || '')
              .trim()
              .toLowerCase()}`,
          )
          .digest('hex'),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  app.use(
    '/api/admissions/applications',
    rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use((req: any, res: any, next: any) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      !origins.includes(req.headers.origin) &&
      !req.path.startsWith('/api/payments/webhooks/') &&
      req.path !== '/api/payments/return'
    )
      return res.status(403).json({ message: 'Request origin is not allowed' });
    next();
  });
  await app.listen(config.PORT, '0.0.0.0');
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
