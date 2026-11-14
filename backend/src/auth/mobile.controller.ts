import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Db } from '../db';
import { parse } from '../common';
import { decryptText } from '../crypto';
import { Actor, AccountAccess, Context, Public } from './access';
import { contactSchema, OneTimeCodes } from './otp';
import { hashRecovery, verifyTotp } from './totp';
import { subscriptionUsable } from '../saas/policy';
const DUMMY_HASH = '$2b$12$F1bm6P9VN1H9nQJ0J1utbu6s4H.eOVxw0QRqAwEL3qpIrR/5FyiX2';
const ACCESS_TTL = '15m';
const ACCESS_SECONDS = 15 * 60;
const REFRESH_DAYS = 60;
const MFA_AUDIENCE = 'campus-one-mfa';
const slug = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
/** The app's version string, e.g. "1.4.0"; compared numerically per part. */
export function versionAtLeast(version: string, minimum: string) {
  const a = version.split('.').map(Number),
    b = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a.at(i) ?? 0,
      y = b.at(i) ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}
/**
 * Sign-in for the school-branded mobile apps. Each app is built for one school: its tokens carry
 * that school's organisation id, and the access guard refuses them anywhere else.
 * Access tokens live 15 minutes; refresh tokens rotate on every use and a reused one revokes the
 * whole chain (it means the token was copied).
 */
@Controller()
@AccountAccess()
export class MobileController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(JwtService) private jwt: JwtService,
    @Inject(OneTimeCodes) private codes: OneTimeCodes,
  ) {}
  private async school(schoolSlug: string) {
    const org = await this.db.organization.findFirst({
      where: { slug: schoolSlug },
      include: { subscription: true, settings: { omit: { logoData: true } } },
    });
    if (!org) throw new NotFoundException('School not found');
    return org;
  }
  /** Users who may use this school's app: an active member with a role on one of its campuses. */
  private async member(userId: string, organizationId: string) {
    const roles = await this.db.userCampusRole.findMany({
      where: { userId, campus: { orgId: organizationId } },
      include: { campus: { select: { id: true, name: true } } },
    });
    const membership = await this.db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!roles.length || !membership?.active) return null;
    return roles;
  }
  private async issue(
    tx: Prisma.TransactionClient | Db,
    user: { id: string; tokenVersion: number; fullName: string },
    organizationId: string,
    familyId?: string,
    deviceName?: string,
  ) {
    const refreshToken = randomBytes(32).toString('base64url');
    const row = await tx.refreshToken.create({
      data: {
        userId: user.id,
        organizationId,
        tokenHash: sha(refreshToken),
        familyId: familyId ?? randomBytes(12).toString('hex'),
        tokenVersion: user.tokenVersion,
        deviceName,
        expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400_000),
      },
    });
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, v: user.tokenVersion, org: organizationId },
      { expiresIn: ACCESS_TTL },
    );
    return { row, tokens: { accessToken, refreshToken, expiresIn: ACCESS_SECONDS } };
  }
  private async signedIn(
    user: { id: string; tokenVersion: number; fullName: string },
    organizationId: string,
    deviceName?: string,
  ) {
    const roles = await this.member(user.id, organizationId);
    if (!roles) throw new ForbiddenException('This account does not belong to this school');
    const { tokens } = await this.issue(this.db, user, organizationId, undefined, deviceName);
    return {
      ...tokens,
      user: { id: user.id, fullName: user.fullName },
      campuses: [...new Map(roles.map((r) => [r.campus.id, r.campus])).values()],
      roles: roles.map((r) => ({ campusId: r.campusId, role: r.role })),
    };
  }
  /** Public branding and switches the app reads at start, before anyone signs in. */
  @Public()
  @Get('app/config')
  async config(@Query('school') schoolSlug: string) {
    const org = await this.school(parse(slug, schoolSlug));
    const s = org.settings;
    return {
      school: { slug: org.slug, name: org.name, nameBn: s?.institutionNameBn ?? null },
      accentColor: org.accentColor,
      logoUrl: s?.logoMime ? `/api/app/logo?school=${org.slug}` : null,
      // Raise when an API change would break older app builds; the app then asks to update.
      minimumVersion: '1.0.0',
      active: org.status === 'ACTIVE' && subscriptionUsable(org.subscription),
      support: { phone: s?.phone ?? null, email: s?.email ?? org.supportEmail ?? null },
    };
  }
  @Public()
  @Get('app/logo')
  async logo(@Query('school') schoolSlug: string, @Res() res: Response) {
    const org = await this.db.organization.findFirst({
      where: { slug: parse(slug, schoolSlug) },
      select: { settings: { select: { logoData: true, logoMime: true } } },
    });
    if (!org?.settings?.logoData)
      return res.status(404).json({ statusCode: 404, message: 'No logo' });
    res.setHeader('Content-Type', org.settings.logoMime || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(org.settings.logoData));
  }
  /** Staff (and anyone with an email) sign in with email and password. */
  @Public()
  @Post('auth/token')
  async token(@Body() body: unknown) {
    const v = parse(
      z.object({
        school: slug,
        email: z.email().transform((s) => s.toLowerCase()),
        password: z.string().min(1).max(200),
        deviceName: z.string().max(100).optional(),
      }),
      body,
    );
    const org = await this.school(v.school);
    const user = await this.db.user.findUnique({ where: { email: v.email } });
    const valid = await compare(v.password, user?.passwordHash || DUMMY_HASH);
    if (!user?.active || !valid) throw new UnauthorizedException('Email or password is incorrect');
    if (user.mfaEnabledAt) {
      const challenge = await this.jwt.signAsync(
        { sub: user.id, v: user.tokenVersion, org: org.id },
        { audience: MFA_AUDIENCE, expiresIn: '5m' },
      );
      return { mfaRequired: true, challenge };
    }
    return this.signedIn(user, org.id, v.deviceName);
  }
  @Public()
  @Post('auth/token/mfa')
  async tokenMfa(@Body() body: unknown) {
    const v = parse(
      z.object({
        challenge: z.string().max(2000),
        code: z.string().min(6).max(20),
        deviceName: z.string().max(100).optional(),
      }),
      body,
    );
    let claims: { sub: string; v: number; org: string };
    try {
      claims = await this.jwt.verifyAsync(v.challenge, { audience: MFA_AUDIENCE });
    } catch {
      throw new UnauthorizedException('Sign-in expired. Enter your password again.');
    }
    const user = await this.db.user.findUnique({ where: { id: claims.sub } });
    if (!user?.active || user.tokenVersion !== claims.v || !user.mfaSecret || !claims.org)
      throw new UnauthorizedException('Sign-in expired. Enter your password again.');
    if (!verifyTotp(decryptText(user.mfaSecret), v.code)) {
      const h = hashRecovery(v.code);
      const used = await this.db.user.updateMany({
        where: { id: user.id, mfaRecoveryHashes: { has: h } },
        data: { mfaRecoveryHashes: user.mfaRecoveryHashes.filter((x) => x !== h) },
      });
      if (used.count !== 1) throw new UnauthorizedException('The authentication code is incorrect');
    }
    return this.signedIn(user, claims.org, v.deviceName);
  }
  /**
   * Guardians and students sign in with their mobile number and a one-time code. The code is sent
   * by `POST auth/codes` with purpose GUARDIAN_LOGIN and the school's slug.
   */
  @Public()
  @Post('auth/token/otp')
  async tokenOtp(@Body() body: unknown) {
    const v = parse(
      z.object({
        school: slug,
        contact: contactSchema,
        code: z.string().min(4).max(10),
        deviceName: z.string().max(100).optional(),
      }),
      body,
    );
    const org = await this.school(v.school);
    const user = await this.familyAccount(org.id, v.contact);
    if (!user) throw new BadRequestException('The code is incorrect or has expired');
    await this.db.serial((tx) =>
      this.codes.consume(tx, 'GUARDIAN_LOGIN', `${org.id}:${v.contact}`, v.code),
    );
    await this.db.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
    return this.signedIn(user, org.id, v.deviceName);
  }
  /** The single guardian or student account in this school using this phone or email. */
  async familyAccount(organizationId: string, contact: string) {
    const where = contact.includes('@')
      ? { email: contact }
      : { phone: { in: [contact, `+88${contact}`, `88${contact}`] } };
    const users = await this.db.user.findMany({
      where: {
        ...where,
        active: true,
        memberships: { some: { organizationId, active: true } },
        roles: {
          some: { campus: { orgId: organizationId }, role: { in: ['GUARDIAN', 'STUDENT'] } },
        },
      },
      take: 2,
    });
    return users.length === 1 ? users[0] : null;
  }
  @Public()
  @Post('auth/refresh')
  async refresh(@Body() body: unknown) {
    const v = parse(z.object({ refreshToken: z.string().min(20).max(200) }), body);
    const expired = new UnauthorizedException('Session expired. Please sign in again.');
    const row = await this.db.refreshToken.findUnique({
      where: { tokenHash: sha(v.refreshToken) },
      include: { user: true },
    });
    if (!row) throw expired;
    if (row.revokedAt) {
      // A rotated token came back: it was copied. End every session in the chain.
      await this.db.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw expired;
    }
    if (
      row.expiresAt < new Date() ||
      !row.user.active ||
      row.user.tokenVersion !== row.tokenVersion ||
      !(await this.member(row.userId, row.organizationId))
    )
      throw expired;
    return this.db.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: row.id, revokedAt: null },
        data: { revokedAt: new Date(), lastUsedAt: new Date() },
      });
      if (claimed.count !== 1) throw expired;
      const next = await this.issue(
        tx,
        row.user,
        row.organizationId,
        row.familyId,
        row.deviceName ?? undefined,
      );
      await tx.refreshToken.update({ where: { id: row.id }, data: { replacedById: next.row.id } });
      return next.tokens;
    });
  }
  /** Signs this device out: revokes its refresh chain and forgets its push token. */
  @Public()
  @Post('auth/token/revoke')
  async revoke(@Body() body: unknown) {
    const v = parse(
      z.object({
        refreshToken: z.string().min(20).max(200),
        pushToken: z.string().max(4096).optional(),
      }),
      body,
    );
    const row = await this.db.refreshToken.findUnique({
      where: { tokenHash: sha(v.refreshToken) },
    });
    if (row)
      await this.db.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    if (row && v.pushToken)
      await this.db.device.deleteMany({ where: { pushToken: v.pushToken, userId: row.userId } });
    return { ok: true };
  }
  /** Registers (or moves) this phone's push token to the signed-in user. */
  @Post('devices')
  async register(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        platform: z.enum(['android', 'ios']),
        pushToken: z.string().min(20).max(4096),
        appVersion: z.string().max(20).optional(),
        locale: z.enum(['bn', 'en']).optional(),
      }),
      body,
    );
    if (!c.orgId) throw new ForbiddenException('Choose a campus first');
    const data = { ...v, userId: c.userId, organizationId: c.orgId, lastSeenAt: new Date() };
    const device = await this.db.device.upsert({
      where: { pushToken: v.pushToken },
      create: data,
      update: data,
      select: { id: true },
    });
    return device;
  }
  @Delete('devices/:id')
  async unregister(@Actor() c: Context, @Param('id') deviceId: string) {
    await this.db.device.deleteMany({ where: { id: deviceId, userId: c.userId } });
    return { ok: true };
  }
  /** The signed-in user's active app sessions, to review and sign out lost phones. */
  @Get('auth/sessions')
  async sessions(@Actor() c: Context) {
    return this.db.refreshToken.findMany({
      where: { userId: c.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, familyId: true, deviceName: true, lastUsedAt: true, createdAt: true },
      orderBy: { lastUsedAt: 'desc' },
    });
  }
  @Delete('auth/sessions/:familyId')
  async endSession(@Actor() c: Context, @Param('familyId') familyId: string) {
    await this.db.refreshToken.updateMany({
      where: { userId: c.userId, familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
