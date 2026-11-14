import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { Db } from '../db';
import { Actor, Context, Roles, ADMIN, ROLES, Role, hasRole } from '../auth/access';
import { parse, phone } from '../common';
import { normalizeContact } from '../auth/otp';
import { Audit } from '../audit';
import { requireQuota } from '../saas/policy';
const NON_STAFF = ['GUARDIAN', 'STUDENT'];
const role = z.enum(ROLES as unknown as [Role, ...Role[]]);
@Controller('users')
@Roles(...ADMIN)
export class UsersController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Audit) private audit: Audit,
  ) {}
  @Get()
  async list(@Actor() c: Context, @Query('page') page?: string, @Query('limit') limit?: string) {
    const take = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const users = await this.db.user.findMany({
      where: { roles: { some: { campusId: c.campusId } } },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        active: true,
        mfaEnabledAt: true,
        roles: { where: { campusId: c.campusId }, select: { role: true } },
        memberships: { where: { organizationId: c.orgId }, select: { active: true } },
      },
      orderBy: { fullName: 'asc' },
      skip,
      take,
    });
    // "active" here means active in this institution; a person may still be active elsewhere.
    return users.map(({ memberships, mfaEnabledAt, ...u }) => ({
      ...u,
      active: u.active && (memberships[0]?.active ?? false),
      mfaEnabled: !!mfaEnabledAt,
    }));
  }
  /**
   * Adds a staff member or guardian. When the email already belongs to an account (for example a
   * teacher who also works at another school), the caller must confirm with `attachExisting` and
   * the existing account is added to this institution instead of failing.
   */
  @Post()
  async create(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        fullName: z.string().min(2).max(100),
        email: z
          .email()
          .transform((s) => s.toLowerCase())
          .optional(),
        phone: phone.transform((p) => normalizeContact(p)).optional(),
        password: z.string().min(12).max(100).optional(),
        role,
        attachExisting: z.boolean().default(false),
      }),
      body,
    );
    this.assertCanGrant(c, [v.role]);
    const phoneOnly = !v.email;
    // Guardians and students may have only a mobile number; they sign in with a one-time code.
    if (phoneOnly && (!v.phone || !NON_STAFF.includes(v.role)))
      throw new BadRequestException(
        'Staff need an email address; guardians and students need an email or a mobile number',
      );
    const existing = v.email
      ? await this.db.user.findUnique({
          where: { email: v.email },
          select: { id: true, fullName: true },
        })
      : await this.db.user.findFirst({
          where: { phone: v.phone, memberships: { some: { organizationId: c.orgId } } },
          select: { id: true, fullName: true },
        });
    if (existing && !v.attachExisting)
      throw new ConflictException({
        statusCode: 409,
        code: 'USER_EXISTS',
        message: `An account with this ${phoneOnly ? 'mobile number' : 'email'} already exists (${existing.fullName}). Confirm to add that person to this institution.`,
      });
    if (!existing && !v.password && !phoneOnly)
      throw new BadRequestException('A password is required for a new account');
    // Phone-only accounts get an unusable random password; they sign in by one-time code.
    const passwordHash = existing
      ? undefined
      : await hash(v.password ?? randomBytes(24).toString('base64url'), 12);
    return this.db.serial(async (tx) => {
      if (!NON_STAFF.includes(v.role)) await requireQuota(tx, c.orgId, 'staff');
      let user: { id: string; fullName: string; email: string | null };
      if (existing) {
        await tx.organizationMember.upsert({
          where: { organizationId_userId: { organizationId: c.orgId, userId: existing.id } },
          create: { organizationId: c.orgId, userId: existing.id, role: 'MEMBER' },
          update: { active: true },
        });
        await tx.userCampusRole.createMany({
          data: [{ userId: existing.id, campusId: c.campusId, role: v.role }],
          skipDuplicates: true,
        });
        user = await tx.user.findUniqueOrThrow({
          where: { id: existing.id },
          select: { id: true, fullName: true, email: true },
        });
        await this.audit.log(c, 'ATTACH', 'User', user.id, { role: v.role }, tx);
      } else {
        user = await tx.user.create({
          data: {
            fullName: v.fullName,
            email: v.email,
            phone: v.phone,
            passwordHash: passwordHash!,
            memberships: { create: { organizationId: c.orgId, role: 'MEMBER' } },
            roles: { create: { campusId: c.campusId, role: v.role } },
          },
          select: { id: true, fullName: true, email: true },
        });
        await this.audit.log(c, 'CREATE', 'User', user.id, { role: v.role }, tx);
      }
      return { ...user, attached: !!existing };
    });
  }
  /** Changes a person's roles on this campus or their active status in this institution. */
  @Patch(':id')
  async update(@Actor() c: Context, @Param('id') userId: string, @Body() body: unknown) {
    const v = parse(
      z
        .object({
          active: z.boolean().optional(),
          roles: z.array(role).min(1).max(5).optional(),
          fullName: z.string().min(2).max(100).optional(),
          phone: phone.nullable().optional(),
        })
        .refine((x) => Object.keys(x).length > 0, 'Nothing to change'),
      body,
    );
    if (userId === c.userId && (v.active === false || v.roles))
      throw new ForbiddenException('You cannot change your own access. Ask another administrator.');
    return this.db.serial(async (tx) => {
      const target = await this.target(tx, c, userId);
      const current = target.roles.map((r) => r.role as Role);
      if (current.includes('SUPER_ADMIN') && !hasRole(c, ['SUPER_ADMIN']))
        throw new ForbiddenException(
          'Only a super administrator can change another super administrator',
        );
      if (v.roles) {
        this.assertCanGrant(c, v.roles);
        const wasStaff = current.some((r) => !NON_STAFF.includes(r));
        if (!wasStaff && v.roles.some((r) => !NON_STAFF.includes(r)))
          await requireQuota(tx, c.orgId, 'staff');
        if (current.includes('SUPER_ADMIN') && !v.roles.includes('SUPER_ADMIN'))
          await this.keepOneSuperAdmin(tx, c, userId);
        await tx.userCampusRole.deleteMany({
          where: { userId, campusId: c.campusId, role: { notIn: v.roles } },
        });
        await tx.userCampusRole.createMany({
          data: v.roles.map((r) => ({ userId, campusId: c.campusId, role: r })),
          skipDuplicates: true,
        });
      }
      if (v.active !== undefined) {
        const wasActive = target.memberships.find((m) => m.organizationId === c.orgId)?.active;
        // Inactive members are not counted, so reactivating a staff member uses one seat.
        if (v.active && !wasActive && current.some((r) => !NON_STAFF.includes(r)))
          await requireQuota(tx, c.orgId, 'staff');
        if (!v.active && current.includes('SUPER_ADMIN'))
          await this.keepOneSuperAdmin(tx, c, userId);
        await tx.organizationMember.update({
          where: { organizationId_userId: { organizationId: c.orgId, userId } },
          data: { active: v.active },
        });
      }
      if (v.fullName !== undefined || v.phone !== undefined) {
        if (!this.ownedOnlyHere(target, c.orgId))
          throw new ForbiddenException(
            'This person also belongs to another institution; they must update their own profile',
          );
        await tx.user.update({
          where: { id: userId },
          data: { fullName: v.fullName, phone: v.phone },
        });
      }
      // Ends existing sessions so a removed role or deactivation takes effect immediately.
      if (v.active === false || v.roles)
        await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
      await this.audit.log(c, 'UPDATE', 'User', userId, { ...v, previousRoles: current }, tx);
      return { ok: true };
    });
  }
  /**
   * Issues a temporary password, shown once to the administrator. Only allowed for people who
   * belong to this institution alone — otherwise one school could take over an account used at
   * another, so those people use "forgot password" themselves.
   */
  @Post(':id/reset-password')
  async resetPassword(@Actor() c: Context, @Param('id') userId: string) {
    if (userId === c.userId)
      throw new BadRequestException('Use "Change password" for your own account');
    const temporaryPassword = randomBytes(9).toString('base64url');
    const passwordHash = await hash(temporaryPassword, 12);
    await this.db.serial(async (tx) => {
      const target = await this.target(tx, c, userId);
      if (target.roles.some((r) => r.role === 'SUPER_ADMIN') && !hasRole(c, ['SUPER_ADMIN']))
        throw new ForbiddenException('Only a super administrator can reset this password');
      if (!this.ownedOnlyHere(target, c.orgId))
        throw new ForbiddenException(
          'This person also belongs to another institution or the platform team; ask them to use "Forgot password"',
        );
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      await this.audit.log(c, 'RESET_PASSWORD', 'User', userId, undefined, tx);
    });
    return { temporaryPassword };
  }
  private async target(tx: Prisma.TransactionClient, c: Context, userId: string) {
    const target = await tx.user.findFirst({
      where: { id: userId, roles: { some: { campusId: c.campusId } } },
      include: {
        roles: { where: { campusId: c.campusId } },
        memberships: { select: { organizationId: true, active: true } },
      },
    });
    if (!target) throw new NotFoundException('Record not found');
    return target;
  }
  private ownedOnlyHere(
    target: { platformAdmin: boolean; memberships: { organizationId: string }[] },
    orgId: string,
  ) {
    return !target.platformAdmin && target.memberships.every((m) => m.organizationId === orgId);
  }
  private assertCanGrant(c: Context, roles: Role[]) {
    if (roles.includes('SUPER_ADMIN') && !hasRole(c, ['SUPER_ADMIN']))
      throw new ForbiddenException(
        'Only a super administrator can grant super administrator access',
      );
  }
  private async keepOneSuperAdmin(tx: Prisma.TransactionClient, c: Context, leaving: string) {
    const others = await tx.userCampusRole.count({
      where: {
        role: 'SUPER_ADMIN',
        userId: { not: leaving },
        campus: { orgId: c.orgId },
        user: { active: true, memberships: { some: { organizationId: c.orgId, active: true } } },
      },
    });
    if (!others)
      throw new ForbiddenException('The institution must keep at least one super administrator');
  }
}
