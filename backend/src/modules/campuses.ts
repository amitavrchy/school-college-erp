import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Roles, ADMIN, ACADEMIC } from '../auth/access';
import { parse, date, id } from '../common';
import { Scope } from '../auth/scope';
@Controller()
export class CampusesController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
  ) {}
  @Get('campuses')
  campuses(@Actor() c: Context) {
    return this.db.campus.findMany({
      where: { roles: { some: { userId: c.userId } } },
      include: { sessions: { orderBy: { startsOn: 'desc' } } },
    });
  }
  @Post('campuses')
  @Roles('SUPER_ADMIN')
  async create(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        name: z.string().min(3).max(100),
        code: z.string().min(2).max(20),
        address: z.string().max(300).optional(),
      }),
      body,
    );
    const campus = await this.db.campus.findUniqueOrThrow({ where: { id: c.campusId } });
    return this.db.campus.create({
      data: {
        ...v,
        orgId: campus.orgId,
        roles: { create: { userId: c.userId, role: 'SUPER_ADMIN' } },
      },
    });
  }
  @Get('campuses/:id/sessions')
  async sessions(@Actor() c: Context, @Param('id') campusId: string) {
    const grant = await this.db.userCampusRole.findFirst({ where: { campusId, userId: c.userId } });
    if (!grant) return [];
    return this.db.academicSession.findMany({ where: { campusId }, orderBy: { startsOn: 'desc' } });
  }
  @Post('sessions')
  @Roles(...ADMIN)
  async session(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z
        .object({
          name: z.string().min(3).max(30),
          startsOn: date,
          endsOn: date,
          status: z.enum(['PLANNED', 'ACTIVE']).default('PLANNED'),
        })
        .refine((v) => v.endsOn > v.startsOn, 'End date must follow start date'),
      body,
    );
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Campus" WHERE id = ${c.campusId} FOR UPDATE`;
      if (v.status === 'ACTIVE')
        await tx.academicSession.updateMany({
          where: { campusId: c.campusId, status: 'ACTIVE' },
          data: { status: 'CLOSED' },
        });
      return tx.academicSession.create({ data: { ...v, campusId: c.campusId } });
    });
  }
  @Patch('sessions/:id')
  @Roles(...ADMIN)
  async close(@Actor() c: Context, @Param('id') sessionId: string, @Body() body: unknown) {
    const v = parse(z.object({ status: z.enum(['ACTIVE', 'CLOSED']) }), body);
    await this.scope.session(c, sessionId);
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Campus" WHERE id = ${c.campusId} FOR UPDATE`;
      await tx.academicSession.findFirstOrThrow({
        where: { id: sessionId, campusId: c.campusId, status: { not: 'CLOSED' } },
      });
      if (v.status === 'ACTIVE')
        await tx.academicSession.updateMany({
          where: { campusId: c.campusId, id: { not: sessionId }, status: 'ACTIVE' },
          data: { status: 'CLOSED' },
        });
      const result = await tx.academicSession.update({ where: { id: sessionId }, data: v });
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: `SESSION_${v.status}`,
          entity: 'AcademicSession',
          entityId: sessionId,
        },
      });
      return result;
    });
  }
  @Get('holidays')
  holidays(@Actor() c: Context) {
    return this.db.holiday.findMany({ where: { campusId: c.campusId }, orderBy: { date: 'asc' } });
  }
  @Post('holidays')
  @Roles(...ACADEMIC)
  holiday(@Actor() c: Context, @Body() body: unknown) {
    return this.db.holiday.create({
      data: {
        ...parse(z.object({ name: z.string().min(3).max(100), date }), body),
        campusId: c.campusId,
      },
    });
  }
}
