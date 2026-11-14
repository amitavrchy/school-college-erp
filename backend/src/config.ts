import { z } from 'zod';
const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : v === 'true' || v === '1'));
const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));
export const configSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_ACCESS_SECRET: z.string().min(32),
    PORT: z.coerce.number().default(4000),
    APP_URL: z.url().default('http://localhost:3000'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    NODE_ENV: z.string().default('development'),
    /** Express "trust proxy": false, true, a hop count, or a comma-separated subnet list. */
    TRUST_PROXY: z.string().default('false'),
    COOKIE_SECURE: optional,
    SMS_PROVIDER: z.enum(['console', 'http']).default('console'),
    SMS_API_URL: optional,
    SMS_API_KEY: optional,
    SMS_SENDER_ID: optional,
    EMAIL_PROVIDER: z.enum(['console', 'http']).default('console'),
    EMAIL_API_URL: optional,
    EMAIL_API_KEY: optional,
    EMAIL_FROM: z.string().default('Campus One <no-reply@campusone.local>'),
    PAYMENT_MODE: z.enum(['manual', 'sslcommerz']).default('manual'),
    SSLCOMMERZ_STORE_ID: optional,
    SSLCOMMERZ_STORE_PASSWORD: optional,
    SSLCOMMERZ_SANDBOX: bool(true),
    DOCUMENT_ENCRYPTION_KEY: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/, 'DOCUMENT_ENCRYPTION_KEY must be 64 hex characters')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /** Secret for short-lived upload/download capability tokens; falls back to a derived key. */
    DOCUMENT_TOKEN_SECRET: z
      .string()
      .min(32)
      .optional()
      .or(z.literal('').transform(() => undefined)),
    /**
     * Returns one-time codes in API responses so automated tests can complete verification.
     * Only accepted while no real SMS/email provider is configured; never enable for real schools.
     */
    OTP_DEBUG: bool(false),
    /** Issuer label shown in authenticator apps. */
    MFA_ISSUER: z.string().default('Campus One'),
    /**
     * When true, platform administrators and SUPER_ADMINs without MFA can reach only account
     * routes (to enrol). Turn on once existing administrators have enrolled.
     */
    MFA_ENFORCE: bool(false),
    FEE_FINE_PER_DAY_MINOR: z.coerce.number().int().min(0).default(1000),
    ADMISSION_OFFER_HOURS: z.coerce.number().int().min(1).default(48),
    SIBLING_DISCOUNT_BPS: z.coerce.number().int().min(0).max(10000).default(0),
    FEE_REMINDERS_ENABLED: bool(false),
    SCHOOL_SITE_BASE_DOMAIN: z.string().default('localhost'),
    SCHOOL_SITE_CNAME_TARGET: optional,
    /**
     * Firebase Cloud Messaging service account (the JSON file, base64-encoded). One Firebase
     * project holds every school's Android app. Empty = pushes are logged, not sent.
     */
    FCM_SERVICE_ACCOUNT: optional,
    /** Run BullMQ processors in this process. The API sets false when a worker container exists. */
    RUN_JOBS: bool(true),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === 'production' && !v.DOCUMENT_ENCRYPTION_KEY)
      ctx.addIssue({
        code: 'custom',
        path: ['DOCUMENT_ENCRYPTION_KEY'],
        message: 'DOCUMENT_ENCRYPTION_KEY is required in production',
      });
    if (v.OTP_DEBUG && (v.SMS_PROVIDER !== 'console' || v.EMAIL_PROVIDER !== 'console'))
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_DEBUG'],
        message: 'OTP_DEBUG cannot be used while a real SMS or email provider is configured',
      });
    if (v.PAYMENT_MODE === 'sslcommerz' && (!v.SSLCOMMERZ_STORE_ID || !v.SSLCOMMERZ_STORE_PASSWORD))
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_MODE'],
        message:
          'PAYMENT_MODE=sslcommerz requires SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD',
      });
  });
export type AppConfig = z.infer<typeof configSchema>;
export const config: AppConfig = configSchema.parse(process.env);
/** Converts TRUST_PROXY into the value Express expects. */
export function trustProxy(value: string): boolean | number | string {
  const v = value.trim();
  if (v === '' || v === 'false') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
export const cookieSecure = () =>
  config.COOKIE_SECURE === 'true' ||
  (config.NODE_ENV === 'production' && config.COOKIE_SECURE !== 'false');
