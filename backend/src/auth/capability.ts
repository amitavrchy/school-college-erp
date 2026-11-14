import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { config } from '../config';
/**
 * Short-lived capability links (document upload/download, website preview, result download).
 * They use their own secret and audience, so a capability token can never be accepted as a
 * session and a session token can never be used as a capability.
 */
const AUDIENCE = 'campus-one-capability';
let derived: string | undefined;
const secret = () =>
  config.DOCUMENT_TOKEN_SECRET ??
  (derived ??= createHmac('sha256', config.JWT_ACCESS_SECRET)
    .update('campus-one-capability-v1')
    .digest('hex'));
type Expiry = '5m' | '15m' | '1h' | '24h';
export const signClaims = (jwt: JwtService, claims: Record<string, unknown>, expiresIn: Expiry) =>
  jwt.signAsync(claims, { secret: secret(), audience: AUDIENCE, expiresIn });
/** Returns the claims or null when the token is invalid, expired or not a capability token. */
export async function readClaims(jwt: JwtService, token: string) {
  try {
    return (await jwt.verifyAsync(token || '', { secret: secret(), audience: AUDIENCE })) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}
export type Capability = 'ADMISSION_UPLOAD' | 'DOCUMENT_DOWNLOAD';
export const signCapability = (
  jwt: JwtService,
  subject: string,
  purpose: Capability,
  expiresIn: Expiry,
) => signClaims(jwt, { sub: subject, purpose }, expiresIn);
export async function verifyCapability(
  jwt: JwtService,
  token: string,
  purpose: Capability,
  subject: string,
) {
  const c = await readClaims(jwt, token);
  if (!c || c.purpose !== purpose || c.sub !== subject)
    throw new UnauthorizedException('This document link has expired or is invalid');
}
