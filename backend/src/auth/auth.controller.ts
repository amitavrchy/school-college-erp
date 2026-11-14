import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import type { Response } from 'express';
import { z } from 'zod';
import { Db } from '../db';
import { parse } from '../common';
import { config } from '../config';
import { decryptText, encryptText } from '../crypto';
import { Actor, Context, Public, AccountAccess } from './access';
import { contactSchema, OneTimeCodes } from './otp';
import { requiresMfa, SESSION_COOKIE, startSession } from './session';
import { hashRecovery, newSecret, otpauthUri, recoveryCodes, verifyTotp } from './totp';
const DUMMY_HASH = '$2b$12$F1bm6P9VN1H9nQJ0J1utbu6s4H.eOVxw0QRqAwEL3qpIrR/5FyiX2';
const MFA_AUDIENCE = 'campus-one-mfa';
const password = z.string().min(12).max(100);
@Controller('auth')
@AccountAccess()
export class AuthController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(JwtService) private jwt: JwtService,
    @Inject(OneTimeCodes) private codes: OneTimeCodes,
  ) {}
  @Public()
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const value = parse(
      z.object({
        email: z.email().transform((s) => s.toLowerCase()),
        password: z.string().min(1).max(200),
      }),
      body,
    );
    const user = await this.db.user.findUnique({ where: { email: value.email } });
    const valid = await compare(value.password, user?.passwordHash || DUMMY_HASH);
    if (!user?.active || !valid) throw new UnauthorizedException('Email or password is incorrect');
    if (user.mfaEnabledAt) {
      const challenge = await this.jwt.signAsync(
        { sub: user.id, v: user.tokenVersion },
        { audience: MFA_AUDIENCE, expiresIn: '5m' },
      );
      return { mfaRequired: true, challenge };
    }
    await startSession(this.jwt, res, user);
    return { id: user.id, fullName: user.fullName, platformAdmin: user.platformAdmin };
  }
  /** Second step of sign-in for accounts with an authenticator app. */
  @Public()
  @Post('mfa/login')
  async mfaLogin(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const v = parse(
      z.object({ challenge: z.string().max(2000), code: z.string().min(6).max(20) }),
      body,
    );
    let claims: { sub: string; v: number };
    try {
      claims = await this.jwt.verifyAsync(v.challenge, { audience: MFA_AUDIENCE });
    } catch {
      throw new UnauthorizedException('Sign-in expired. Enter your password again.');
    }
    const user = await this.db.user.findUnique({ where: { id: claims.sub } });
    if (!user?.active || user.tokenVersion !== claims.v || !user.mfaEnabledAt || !user.mfaSecret)
      throw new UnauthorizedException('Sign-in expired. Enter your password again.');
    if (!verifyTotp(decryptText(user.mfaSecret), v.code)) {
      const h = hashRecovery(v.code);
      if (!user.mfaRecoveryHashes.includes(h))
        throw new UnauthorizedException('The authentication code is incorrect');
      // Recovery codes are single use; the conditional update stops two parallel uses.
      const used = await this.db.user.updateMany({
        where: { id: user.id, mfaRecoveryHashes: { has: h } },
        data: { mfaRecoveryHashes: user.mfaRecoveryHashes.filter((x) => x !== h) },
      });
      if (used.count !== 1) throw new UnauthorizedException('The authentication code is incorrect');
    }
    await startSession(this.jwt, res, user);
    return { id: user.id, fullName: user.fullName, platformAdmin: user.platformAdmin };
  }
  /**
   * Sends a one-time code. Password-reset codes are only delivered to existing accounts, but the
   * response is identical either way so the endpoint cannot be used to discover accounts.
   */
  @Public()
  @Post('codes')
  async sendCode(@Body() body: unknown) {
    const v = parse(
      z.object({ purpose: z.enum(['SIGNUP', 'PASSWORD_RESET']), contact: contactSchema }),
      body,
    );
    if (v.purpose === 'SIGNUP') return this.codes.issue('SIGNUP', v.contact);
    const user = await this.findByContact(v.contact);
    return this.codes.issue('PASSWORD_RESET', v.contact, !!user);
  }
  @Public()
  @Post('password-reset')
  async resetPassword(@Body() body: unknown) {
    const v = parse(
      z.object({ contact: contactSchema, code: z.string().min(4).max(10), password }),
      body,
    );
    const user = await this.findByContact(v.contact);
    const passwordHash = await hash(v.password, 12);
    if (!user) throw new BadRequestException('The code is incorrect or has expired');
    await this.db.serial(async (tx) => {
      await this.codes.consume(tx, 'PASSWORD_RESET', v.contact, v.code);
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          tokenVersion: { increment: 1 },
          ...(v.contact.includes('@')
            ? { emailVerifiedAt: new Date() }
            : { phoneVerifiedAt: new Date() }),
        },
      });
      await tx.auditLog.create({
        data: { actorId: user.id, action: 'PASSWORD_RESET', entity: 'User', entityId: user.id },
      });
    });
    return { ok: true };
  }
  private async findByContact(contact: string) {
    if (contact.includes('@'))
      return this.db.user.findFirst({ where: { email: contact, active: true } });
    // Phone numbers are not unique across accounts; reset by phone only when it is unambiguous.
    const users = await this.db.user.findMany({
      where: { phone: { in: [contact, `+88${contact}`, `88${contact}`] }, active: true },
      take: 2,
    });
    return users.length === 1 ? users[0] : null;
  }
  @Get('me')
  async me(@Actor() ctx: Context) {
    const user = await this.db.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        platformAdmin: true,
        mfaEnabledAt: true,
        memberships: {
          include: { organization: { include: { subscription: { include: { plan: true } } } } },
        },
        roles: {
          include: {
            campus: {
              include: { organization: { include: { subscription: { include: { plan: true } } } } },
            },
          },
        },
      },
    });
    if (!user) return user;
    return {
      ...user,
      mfaEnabled: !!user.mfaEnabledAt,
      mfaSetupRequired: !user.mfaEnabledAt && requiresMfa(user),
    };
  }
  @Post('logout')
  async logout(@Actor() ctx: Context, @Res({ passthrough: true }) res: Response) {
    await this.db.user.update({
      where: { id: ctx.userId },
      data: { tokenVersion: { increment: 1 } },
    });
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }
  @Post('password')
  async password(@Actor() ctx: Context, @Body() body: unknown) {
    const v = parse(z.object({ currentPassword: z.string(), password }), body);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (!(await compare(v.currentPassword, user.passwordHash)))
      throw new UnauthorizedException('Current password is incorrect');
    await this.db.user.update({
      where: { id: ctx.userId },
      data: { passwordHash: await hash(v.password, 12), tokenVersion: { increment: 1 } },
    });
    return { ok: true };
  }
  /** Starts enrolment: stores a pending secret and returns it for the authenticator app. */
  @Post('mfa/setup')
  async mfaSetup(@Actor() ctx: Context) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (user.mfaEnabledAt) throw new BadRequestException('Two-step sign-in is already enabled');
    const secret = newSecret();
    await this.db.user.update({
      where: { id: user.id },
      data: { mfaSecret: encryptText(secret) },
    });
    return { secret, otpauthUrl: otpauthUri(config.MFA_ISSUER, user.email, secret) };
  }
  /** Confirms enrolment with a code from the app and returns single-use recovery codes once. */
  @Post('mfa/enable')
  async mfaEnable(@Actor() ctx: Context, @Body() body: unknown) {
    const v = parse(z.object({ code: z.string().min(6).max(10) }), body);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (user.mfaEnabledAt) throw new BadRequestException('Two-step sign-in is already enabled');
    if (!user.mfaSecret || !verifyTotp(decryptText(user.mfaSecret), v.code))
      throw new BadRequestException('The authentication code is incorrect');
    const codes = recoveryCodes();
    await this.db.user.update({
      where: { id: user.id },
      data: { mfaEnabledAt: new Date(), mfaRecoveryHashes: codes.map(hashRecovery) },
    });
    await this.db.auditLog.create({
      data: { actorId: user.id, action: 'MFA_ENABLED', entity: 'User', entityId: user.id },
    });
    return { recoveryCodes: codes };
  }
  @Post('mfa/disable')
  async mfaDisable(@Actor() ctx: Context, @Body() body: unknown) {
    const v = parse(
      z.object({ password: z.string().min(1).max(200), code: z.string().min(6).max(20) }),
      body,
    );
    const user = await this.db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (!user.mfaEnabledAt || !user.mfaSecret)
      throw new BadRequestException('Two-step sign-in is not enabled');
    if (
      !(await compare(v.password, user.passwordHash)) ||
      !(
        verifyTotp(decryptText(user.mfaSecret), v.code) ||
        user.mfaRecoveryHashes.includes(hashRecovery(v.code))
      )
    )
      throw new UnauthorizedException('Password or authentication code is incorrect');
    await this.db.user.update({
      where: { id: user.id },
      data: {
        mfaEnabledAt: null,
        mfaSecret: null,
        mfaRecoveryHashes: [],
        tokenVersion: { increment: 1 },
      },
    });
    await this.db.auditLog.create({
      data: { actorId: user.id, action: 'MFA_DISABLED', entity: 'User', entityId: user.id },
    });
    return { ok: true };
  }
}
