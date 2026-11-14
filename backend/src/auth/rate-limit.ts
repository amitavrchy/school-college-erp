import { createHash } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import type { JwtService } from '@nestjs/jwt';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
/** Normalises the client address; IPv6 clients are grouped by /56 as express-rate-limit recommends. */
export const clientIp = (req: { ip?: string }) => ipKeyGenerator(req.ip || '127.0.0.1');
export async function requestBucket(
  req: {
    ip?: string;
    originalUrl?: string;
    cookies?: Record<string, string>;
    headers: { authorization?: string };
  },
  jwt: Pick<JwtService, 'verifyAsync'>,
) {
  let identity = 'anonymous';
  try {
    const claims = await jwt.verifyAsync(
      req.cookies?.campus_session || req.headers.authorization?.replace(/^Bearer /, '') || '',
    );
    if (typeof claims.sub === 'string' && Number.isInteger(claims.v)) identity = claims.sub;
  } catch {}
  return digest(
    `${clientIp(req)}:${identity}:${req.originalUrl?.match(/^\/api\/public-websites\/([a-z0-9-]+)/)?.[1] || 'app'}`,
  );
}
/** Login attempts are counted per address and account so one office cannot lock out another. */
export const loginBucket = (req: { ip?: string; body?: any }) =>
  digest(
    `${clientIp(req)}:${String(req.body?.email || req.body?.contact || '')
      .trim()
      .toLowerCase()}`,
  );
/**
 * Public admission submissions are counted per address and admission session, so a school
 * receiving many applicants from one shared connection is not throttled by another school.
 */
export const admissionBucket = (req: { ip?: string; body?: any; query?: any }) =>
  digest(
    `${clientIp(req)}:${String(req.body?.sessionId || req.query?.school || 'unknown').slice(0, 100)}`,
  );
export const ipBucket = (req: { ip?: string }) => digest(clientIp(req));
/** One-time-code requests are limited per destination as well as per address. */
export const contactBucket = (req: { body?: any }) =>
  digest(
    String(req.body?.contact || req.body?.email || '')
      .trim()
      .toLowerCase(),
  );
