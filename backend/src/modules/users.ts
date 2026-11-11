import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { hash } from 'bcryptjs';
import { Db } from '../db';
import { Actor, Context, Roles, ADMIN, ROLES } from '../auth/access';
import { parse, phone } from '../common';
import { Audit } from '../audit';
import { requireQuota } from '../saas/policy';
@Controller('users')
@Roles(...ADMIN)
export class UsersController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Audit) private audit: Audit,
  ) {}
  @Get()
  list(@Actor() c: Context) {
    return this.db.user.findMany({
      where: { roles: { some: { campusId: c.campusId } } },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        active: true,
        roles: { where: { campusId: c.campusId }, select: { role: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }
  @Post()
  async create(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        fullName: z.string().min(2).max(100),
        email: z.email().transform((s) => s.toLowerCase()),
        phone: phone.optional(),
        password: z.string().min(12).max(100),
        role: z.enum(ROLES.filter((r) => r !== 'SUPER_ADMIN') as ['CAMPUS_ADMIN', ...string[]]),
      }),
      body,
    );
    const { password, role, ...data } = v;
    const passwordHash=await hash(password,12);
    const user = await this.db.serial(async tx=>{
      if(!['GUARDIAN','STUDENT'].includes(role))await requireQuota(tx,c.orgId,'staff');
      return tx.user.create({
      data: {
        ...data,
        passwordHash,
        memberships:{create:{organizationId:c.orgId,role:'MEMBER'}},
        roles: { create: { campusId: c.campusId, role } },
      },
      select: { id: true, fullName: true, email: true },
      });
    });
    await this.audit.log(c, 'CREATE', 'User', user.id, { role });
    return user;
  }
}
