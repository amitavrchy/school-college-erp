import { createHash } from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import type { JwtService } from '@nestjs/jwt';
export async function requestBucket(
  req: { ip?: string; cookies?: Record<string, string>; headers: { authorization?: string } },
  jwt: Pick<JwtService, 'verifyAsync'>,
) {
  let identity = 'anonymous';
  try {
    const claims = await jwt.verifyAsync(
      req.cookies?.campus_session || req.headers.authorization?.replace(/^Bearer /, '') || '',
    );
    if (typeof claims.sub === 'string' && Number.isInteger(claims.v)) identity = claims.sub;
  } catch {}
  return createHash('sha256')
    .update(`${ipKeyGenerator(req.ip || '127.0.0.1')}:${identity}`)
    .digest('hex');
}
