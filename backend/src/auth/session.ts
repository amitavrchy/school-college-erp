import type { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { cookieSecure } from '../config';
export const SESSION_COOKIE = 'campus_session';
/** Signs a session token and sets the httpOnly cookie used by the browser app. */
export async function startSession(
  jwt: JwtService,
  res: Response,
  user: { id: string; tokenVersion: number },
) {
  const token = await jwt.signAsync({ sub: user.id, v: user.tokenVersion });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 3600_000,
  });
  return token;
}
/** Roles that must protect their account with a second factor. */
export const requiresMfa = (user: { platformAdmin: boolean; roles: { role: string }[] }) =>
  user.platformAdmin || user.roles.some((r) => r.role === 'SUPER_ADMIN');
