import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Feature, ACADEMIC, hasRole, Roles } from '../auth/access';
import { id, parse } from '../common';
@Controller('support')
@Feature('support')
export class SupportController {
  constructor(@Inject(Db) private db: Db) {}
  @Get('agents')
  @Roles(...ACADEMIC)
  agents(@Actor() c: Context) {
    return this.db.user.findMany({
      where: { roles: { some: { campusId: c.campusId, role: { in: [...ACADEMIC] } } } },
      select: { id: true, fullName: true },
    });
  }
  @Get('tickets')
  list(@Actor() c: Context) {
    return this.db.supportTicket.findMany({
      where: {
        organizationId: c.orgId,
        campusId: c.campusId,
        ...(!hasRole(c, ACADEMIC) ? { createdById: c.userId } : {}),
      },
      include: {
        createdBy: { select: { fullName: true } },
        comments: {
          include: { author: { select: { fullName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    });
  }
  @Post('tickets')
  async create(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        title: z.string().min(5).max(160),
        category: z.enum(['ACADEMIC', 'FINANCE', 'TRANSPORT', 'TECHNICAL', 'OTHER']),
        priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
        body: z.string().min(10).max(5000),
      }),
      body,
    );
    const { body: message, ...data } = v;
    return this.db.supportTicket.create({
      data: {
        ...data,
        organizationId: c.orgId,
        campusId: c.campusId,
        createdById: c.userId,
        slaDueAt: new Date(
          Date.now() + (v.priority === 'URGENT' ? 4 : v.priority === 'HIGH' ? 24 : 72) * 3600000,
        ),
        comments: { create: { authorId: c.userId, body: message } },
      },
    });
  }
  @Post('tickets/:id/comments')
  async comment(@Actor() c: Context, @Param('id') ticketId: string, @Body() body: unknown) {
    const v = parse(z.object({ body: z.string().min(2).max(5000) }), body);
    const ticket = await this.db.supportTicket.findFirstOrThrow({
      where: {
        id: ticketId,
        organizationId: c.orgId,
        campusId: c.campusId,
        ...(!hasRole(c, ACADEMIC) ? { createdById: c.userId } : {}),
      },
    });
    if (ticket.status === 'CLOSED')
      throw new ForbiddenException('Reopen this ticket before replying');
    return this.db.$transaction(async (tx) => {
      const comment = await tx.ticketComment.create({
        data: { ticketId, authorId: c.userId, ...v },
      });
      await tx.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } });
      return comment;
    });
  }
  @Patch('tickets/:id')
  async status(@Actor() c: Context, @Param('id') ticketId: string, @Body() body: unknown) {
    const v = parse(
      z.object({
        status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
        assignedToId: id.optional(),
      }),
      body,
    );
    const ticket = await this.db.supportTicket.findFirstOrThrow({
      where: { id: ticketId, organizationId: c.orgId, campusId: c.campusId },
    });
    if (
      !hasRole(c, ACADEMIC) &&
      (ticket.createdById !== c.userId || !['OPEN', 'CLOSED'].includes(v.status) || v.assignedToId)
    )
      throw new ForbiddenException('Only campus administrators can manage this ticket');
    if (v.assignedToId)
      await this.db.userCampusRole.findFirstOrThrow({
        where: { userId: v.assignedToId, campusId: c.campusId, role: { in: [...ACADEMIC] } },
      });
    return this.db.$transaction(async (tx) => {
      const updated = await tx.supportTicket.update({ where: { id: ticketId }, data: v });
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: `TICKET_${v.status}`,
          entity: 'SupportTicket',
          entityId: ticketId,
        },
      });
      return updated;
    });
  }
}
