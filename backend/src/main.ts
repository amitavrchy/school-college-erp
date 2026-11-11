import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { AppModule } from './app.module';
import { config } from './config';
import { ApiErrors } from './common';
import express from 'express';
async function main() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalFilters(new ApiErrors());
  const origins = config.CORS_ORIGINS.split(',');
  app.use('/api/saas/register',rateLimit({windowMs:3600000,limit:10,standardHeaders:'draft-8',legacyHeaders:false}));
  app.enableCors({ origin: origins, credentials: true });
  app.use(
    '/api',
    rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use(
    '/api/auth/login',
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 30,
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
  app
    .getHttpAdapter()
    .get('/api/health', (_req: any, res: any) =>
      res.json({ status: 'ok', service: 'campus-one-api' }),
    );
  await app.listen(config.PORT, '0.0.0.0');
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
