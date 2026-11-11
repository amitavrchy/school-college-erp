import { z } from 'zod';
export const config = z.object({
  DATABASE_URL: z.string().min(1), REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32), PORT: z.coerce.number().default(4000),
  APP_URL: z.url().default('http://localhost:3000'), CORS_ORIGINS: z.string().default('http://localhost:3000'),
  NODE_ENV: z.string().default('development'), SMS_PROVIDER: z.enum(['console', 'http']).default('console'),
  PAYMENT_MODE: z.enum(['manual', 'sslcommerz']).default('manual'),
}).parse(process.env);
