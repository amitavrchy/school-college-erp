import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Feature, Roles, ACADEMIC, hasRole } from '../auth/access';
import { Scope } from '../auth/scope';
import { date, id, parse, phone, today } from '../common';
import { Realtime } from '../realtime';
const STAFF = [...ACADEMIC, 'TRANSPORT_MANAGER'] as const;
@Controller('transport')
@Feature('transport')
export class TransportController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
    @Inject(Realtime) private realtime: Realtime,
  ) {}
  @Get('routes')
  routes(@Actor() c: Context) {
    return this.db.transportRoute.findMany({
      where: {
        campusId: c.campusId,
        ...(!hasRole(c, STAFF)
          ? { assignments: { some: { student: this.scope.studentFilter(c) } } }
          : {}),
      },
      include: {
        stops: { orderBy: { sequence: 'asc' } },
        _count: { select: { assignments: { where: { active: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }
  @Post('routes')
  @Roles(...STAFF)
  route(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        name: z.string().min(3).max(80),
        vehicleNumber: z.string().min(4).max(40),
        driverName: z.string().min(2).max(80),
        driverPhone: phone,
        capacity: z.number().int().min(1).max(100),
        monthlyMinor: z.number().int().min(0).max(10000000),
      }),
      body,
    );
    return this.db.transportRoute.create({ data: { ...v, campusId: c.campusId } });
  }
  @Post('routes/:id/stops')
  @Roles(...STAFF)
  async stop(@Actor() c: Context, @Param('id') routeId: string, @Body() body: unknown) {
    const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
    const v = parse(
      z.object({
        name: z.string().min(2).max(100),
        pickupTime: time,
        dropTime: time,
        sequence: z.number().int().min(1).max(100),
      }),
      body,
    );
    await this.db.transportRoute.findFirstOrThrow({ where: { id: routeId, campusId: c.campusId } });
    return this.db.transportStop.create({ data: { routeId, ...v } });
  }
  @Get('assignments')
  assignments(@Actor() c: Context) {
    return this.db.studentTransport.findMany({
      where: {
        route: { campusId: c.campusId },
        ...(!hasRole(c, STAFF) ? { student: this.scope.studentFilter(c) } : {}),
      },
      include: {
        route: true,
        stop: true,
        student: true,
        session: true,
        trips: { orderBy: { date: 'desc' }, take: 8 },
      },
      orderBy: { student: { fullName: 'asc' } },
    });
  }
  @Post('assignments')
  @Roles(...STAFF)
  async assign(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ studentId: id, routeId: id, stopId: id, sessionId: id }), body);
    await this.scope.student(c, v.studentId);
    await this.scope.session(c, v.sessionId);
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TransportRoute" WHERE id = ${v.routeId} FOR UPDATE`;
      const route = await tx.transportRoute.findFirstOrThrow({
        where: { id: v.routeId, campusId: c.campusId, active: true },
      });
      await tx.transportStop.findFirstOrThrow({ where: { id: v.stopId, routeId: v.routeId } });
      await tx.enrollment.findFirstOrThrow({
        where: { studentId: v.studentId, sessionId: v.sessionId, status: 'ACTIVE' },
      });
      const existing = await tx.studentTransport.findUnique({
        where: { studentId_sessionId: { studentId: v.studentId, sessionId: v.sessionId } },
      });
      const count = await tx.studentTransport.count({
        where: { routeId: v.routeId, active: true },
      });
      if ((!existing?.active || existing.routeId !== v.routeId) && count >= route.capacity)
        throw new ConflictException('This vehicle is at capacity');
      return tx.studentTransport.upsert({
        where: { studentId_sessionId: { studentId: v.studentId, sessionId: v.sessionId } },
        create: v,
        update: { routeId: v.routeId, stopId: v.stopId, active: true },
      });
    });
  }
  @Post('assignments/:id/cancel')
  @Roles(...STAFF)
  async cancel(@Actor() c: Context, @Param('id') assignmentId: string) {
    await this.db.studentTransport.findFirstOrThrow({
      where: { id: assignmentId, route: { campusId: c.campusId } },
    });
    return this.db.studentTransport.update({
      where: { id: assignmentId },
      data: { active: false },
    });
  }
  @Post('trips')
  @Roles(...STAFF)
  async trip(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        assignmentId: id,
        date,
        journey: z.enum(['MORNING', 'RETURN']),
        status: z.enum(['BOARDED', 'DROPPED', 'ABSENT']),
      }),
      body,
    );
    if (v.date > new Date(today()))
      throw new BadRequestException('Trips cannot be marked in the future');
    const result = await this.db.serial(async (tx) => {
      const a = await tx.studentTransport.findFirstOrThrow({
        where: {
          id: v.assignmentId,
          active: true,
          route: { campusId: c.campusId },
          session: { status: { not: 'CLOSED' } },
        },
      });
      const key = { assignmentId: v.assignmentId, date: v.date, journey: v.journey };
      const existing = await tx.transportTrip.findUnique({
        where: { assignmentId_date_journey: key },
      });
      if (v.status === 'DROPPED' && !['BOARDED', 'DROPPED'].includes(existing?.status || ''))
        throw new BadRequestException('Mark boarding before confirming drop-off');
      if (existing?.status === 'DROPPED' && v.status !== 'DROPPED')
        throw new ConflictException('A completed journey cannot be reset');
      return tx.transportTrip.upsert({
        where: { assignmentId_date_journey: key },
        create: { ...v, markedBy: c.userId },
        update: { status: v.status, markedBy: c.userId },
      });
    });
    const assignment = await this.db.studentTransport.findUniqueOrThrow({
      where: { id: v.assignmentId },
      include: { student: { include: { guardians: true } } },
    });
    for (const g of assignment.student.guardians) this.realtime.user(g.guardianUserId, 'transport');
    this.realtime.campus(c.campusId, 'transport');
    return result;
  }
  @Post('bill')
  @Roles(...ACADEMIC, 'ACCOUNTS', 'TRANSPORT_MANAGER')
  async bill(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ sessionId: id, dueDate: date }), body);
    const session = await this.scope.session(c, v.sessionId);
    if (v.dueDate < session.startsOn || v.dueDate > session.endsOn)
      throw new BadRequestException('Due date is outside the session');
    const assignments = await this.db.studentTransport.findMany({
      where: { sessionId: v.sessionId, active: true, route: { campusId: c.campusId } },
      include: { route: true },
    });
    for (const a of assignments) {
      if (!a.route.monthlyMinor) continue;
      const generationKey = `transport-${a.studentId}-${v.dueDate.toISOString().slice(0, 7)}`;
      await this.db.invoice.upsert({
        where: { generationKey },
        create: {
          generationKey,
          studentId: a.studentId,
          sessionId: v.sessionId,
          dueDate: v.dueDate,
          totalMinor: a.route.monthlyMinor,
          lines: {
            create: {
              feeHeadName: `Transport · ${a.route.name}`,
              amountMinor: a.route.monthlyMinor,
            },
          },
        },
        update: { generationKey },
      });
    }
    return { generated: assignments.filter((a) => a.route.monthlyMinor > 0).length };
  }
}
