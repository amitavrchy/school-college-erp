import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Roles, FINANCE, hasRole } from '../auth/access';
import { Scope } from '../auth/scope';
import { id, money, parse, date } from '../common';
import { outstanding } from '../domain/fees';
import { Audit } from '../audit';
import { Billing } from './billing';
@Controller('fees')
export class FeesController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
    @Inject(Audit) private audit: Audit,
    @Inject(Billing) private billing: Billing,
  ) {}
  @Get('invoices')
  @Roles(...FINANCE, 'GUARDIAN', 'STUDENT')
  invoices(@Actor() c: Context) {
    return this.db.invoice.findMany({
      where: { student: this.scope.studentFilter(c) },
      include: { student: true, lines: true },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });
  }
  @Get('structures')
  @Roles(...FINANCE)
  structures(@Actor() c: Context) {
    return this.db.feeStructure.findMany({
      where: { session: { campusId: c.campusId } },
      include: { heads: true, schoolClass: true, session: true },
    });
  }
  @Post('structures')
  @Roles(...FINANCE)
  async structure(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        sessionId: id,
        classId: id,
        name: z.string().min(3).max(100),
        heads: z
          .array(
            z.object({
              name: z.string().min(2).max(50),
              amountMinor: money,
              frequency: z.enum(['MONTHLY', 'QUARTERLY', 'ONCE']),
            }),
          )
          .min(1)
          .max(20),
      }),
      body,
    );
    await this.scope.session(c, v.sessionId);
    await this.db.schoolClass.findFirstOrThrow({ where: { id: v.classId, campusId: c.campusId } });
    const { heads, ...data } = v;
    return this.db.feeStructure.create({
      data: { ...data, heads: { create: heads } },
      include: { heads: true },
    });
  }
  @Post('generate')
  @Roles(...FINANCE)
  async generate(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ structureId: id, dueDate: date }), body);
    const result = await this.billing.generate(c.campusId, v.structureId, v.dueDate);
    await this.audit.log(c, 'GENERATE', 'Invoice', v.structureId, result);
    return result;
  }
  @Get('waivers')
  @Roles(...FINANCE)
  waivers(@Actor() c: Context) {
    return this.db.waiver.findMany({
      where: { student: { campusId: c.campusId } },
      include: { student: true, invoice: true },
    });
  }
  @Post('waivers')
  @Roles(...FINANCE)
  async request(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        invoiceId: id,
        feeHeadName: z.string().min(1).max(50),
        amountMinor: money,
        reason: z.string().min(5).max(500),
      }),
      body,
    );
    const invoice = await this.db.invoice.findFirstOrThrow({
      where: {
        id: v.invoiceId,
        student: { campusId: c.campusId },
        session: { status: { not: 'CLOSED' } },
        status: { in: ['DUE', 'PARTIAL'] },
      },
      include: { lines: true },
    });
    const head = invoice.lines.find((l) => l.feeHeadName === v.feeHeadName);
    if (!head || v.amountMinor > head.amountMinor || v.amountMinor > outstanding(invoice))
      throw new BadRequestException('Waiver exceeds the selected fee head or outstanding balance');
    return this.db.waiver.create({
      data: { ...v, studentId: invoice.studentId, requestedBy: c.userId },
    });
  }
  @Post('waivers/:id/approve')
  @Roles(...FINANCE)
  async approve(@Actor() c: Context, @Param('id') waiverId: string) {
    return this.db.serial(async (tx) => {
      const waiver = await tx.waiver.findFirstOrThrow({
        where: { id: waiverId, student: { campusId: c.campusId }, status: 'REQUESTED' },
        include: { invoice: { include: { lines: true, session: true } } },
      });
      if (waiver.requestedBy === c.userId)
        throw new ForbiddenException('A different staff member must approve this waiver');
      if (waiver.amountMinor > 100000 && !hasRole(c, ['PRINCIPAL']))
        throw new ForbiddenException('Waivers above ৳1,000 require Principal approval');
      if (waiver.invoice.session.status === 'CLOSED')
        throw new ForbiddenException('Closed sessions are read-only');
      const used = await tx.waiver.aggregate({
        where: { invoiceId: waiver.invoiceId, feeHeadName: waiver.feeHeadName, status: 'APPROVED' },
        _sum: { amountMinor: true },
      });
      const head = waiver.invoice.lines.find((l) => l.feeHeadName === waiver.feeHeadName);
      if (
        !head ||
        waiver.amountMinor + (used._sum.amountMinor || 0) > head.amountMinor ||
        waiver.amountMinor > outstanding(waiver.invoice)
      )
        throw new BadRequestException('Waiver exceeds remaining balance');
      const waivedMinor = waiver.invoice.waivedMinor + waiver.amountMinor;
      await tx.invoice.update({
        where: { id: waiver.invoiceId },
        data: {
          waivedMinor,
          status:
            outstanding({ ...waiver.invoice, waivedMinor }) === 0
              ? 'WAIVED'
              : waiver.invoice.status,
        },
      });
      const result = await tx.waiver.update({
        where: { id: waiverId },
        data: { status: 'APPROVED', approvedBy: c.userId },
      });
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: 'APPROVE',
          entity: 'Waiver',
          entityId: waiverId,
        },
      });
      return result;
    });
  }
}
