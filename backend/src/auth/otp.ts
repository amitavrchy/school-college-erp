import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Db } from '../db';
import { config } from '../config';
import { Notifier } from '../notify';
export const CODE_PURPOSES = ['SIGNUP', 'PASSWORD_RESET', 'GUARDIAN_LOGIN'] as const;
export type CodePurpose = (typeof CODE_PURPOSES)[number];
const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
/** Bangladesh mobile numbers are stored as 01XXXXXXXXX; emails in lower case. */
export function normalizeContact(value: string) {
  const v = value.trim();
  if (v.includes('@')) return z.email().parse(v.toLowerCase());
  const digits = v.replace(/[\s-]/g, '');
  const m = digits.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  if (!m) throw new BadRequestException('Enter a valid email address or Bangladesh mobile number');
  return m[1];
}
export const contactSchema = z
  .string()
  .min(5)
  .max(200)
  .transform((v, ctx) => {
    try {
      return normalizeContact(v);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid email or Bangladesh mobile number' });
      return z.NEVER;
    }
  });
export const hashCode = (purpose: string, contact: string, code: string) =>
  createHmac('sha256', config.JWT_ACCESS_SECRET)
    .update(`otp:${purpose}:${contact}:${code}`)
    .digest('hex');
const MESSAGES: Record<CodePurpose, (code: string) => [string, string]> = {
  SIGNUP: (c) => [
    'Your Campus One verification code',
    `Your Campus One verification code is ${c}. It expires in 10 minutes.`,
  ],
  PASSWORD_RESET: (c) => [
    'Reset your Campus One password',
    `Your Campus One password reset code is ${c}. It expires in 10 minutes. Ignore this if you did not ask for it.`,
  ],
  GUARDIAN_LOGIN: (c) => [
    'Your Campus One sign-in code',
    `Your Campus One sign-in code is ${c}. It expires in 10 minutes.`,
  ],
};
@Injectable()
export class OneTimeCodes {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Notifier) private notifier: Notifier,
  ) {}
  /**
   * Creates and sends a code. When `deliver` is false (e.g. a reset for an unknown account) the
   * caller still gets the same response shape so account existence is not revealed.
   */
  /**
   * `key` scopes the code when the same phone may belong to accounts in several schools
   * (school-app sign-in uses "<organisation id>:<phone>"); the message still goes to `contact`.
   */
  async issue(purpose: CodePurpose, contact: string, deliver = true, key = contact) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (deliver) {
      await this.db.oneTimeCode.updateMany({
        where: { contact: key, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await this.db.oneTimeCode.create({
        data: {
          purpose,
          contact: key,
          codeHash: hashCode(purpose, key, code),
          expiresAt: new Date(Date.now() + TTL_MS),
        },
      });
      const [subject, text] = MESSAGES[purpose](code);
      await this.notifier.send(contact, subject, text);
    }
    return { ok: true, ...(config.OTP_DEBUG && deliver ? { debugCode: code } : {}) };
  }
  /** Consumes a valid code inside the caller's transaction; throws a uniform error otherwise. */
  async consume(tx: Prisma.TransactionClient, purpose: CodePurpose, contact: string, code: string) {
    const invalid = new BadRequestException('The code is incorrect or has expired');
    const row = await tx.oneTimeCode.findFirst({
      where: { contact, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.attempts >= MAX_ATTEMPTS) throw invalid;
    const expected = Buffer.from(row.codeHash, 'hex');
    const actual = Buffer.from(hashCode(purpose, contact, code.trim()), 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      // Counted outside the caller's transaction so a rollback cannot erase the failed attempt.
      await this.db.oneTimeCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      throw invalid;
    }
    const claimed = await tx.oneTimeCode.updateMany({
      where: { id: row.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalid;
  }
}
