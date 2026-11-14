import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Db } from '../db';
import type { Context } from '../auth/access';
import { today } from '../common';
import { allocateFifo, outstanding } from '../domain/fees';
import { Realtime } from '../realtime';
@Injectable()
export class PaymentService {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Realtime) private live: Realtime,
  ) {}
  async create(
    studentId: string,
    amountMinor: number,
    provider: string,
    idempotencyKey: string,
    recordedBy?: string,
  ) {
    return this.db.serial(async (tx) => {
      const existing = await tx.payment.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (
          existing.studentId !== studentId ||
          existing.amountMinor !== amountMinor ||
          existing.provider !== provider
        )
          throw new ConflictException('Idempotency key was used for a different payment');
        return existing;
      }
      const invoices = await tx.invoice.findMany({
        where: {
          studentId,
          status: { in: ['DUE', 'PARTIAL'] },
          session: { status: { not: 'CLOSED' } },
        },
      });
      if (invoices.reduce((s, i) => s + outstanding(i), 0) < amountMinor)
        throw new BadRequestException('Payment exceeds the outstanding balance');
      return tx.payment.create({
        data: { studentId, amountMinor, provider, idempotencyKey, recordedBy },
      });
    });
  }
  async settle(paymentId: string, providerRef: string) {
    const result = await this.db.serial(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${payment.studentId} FOR UPDATE`;
      if (payment.status === 'SUCCESS') return payment;
      if (payment.status !== 'PENDING') throw new ConflictException('Payment cannot be settled');
      const invoices = await tx.invoice.findMany({
        where: {
          studentId: payment.studentId,
          status: { in: ['DUE', 'PARTIAL'] },
          session: { status: { not: 'CLOSED' } },
        },
      });
      const plan = allocateFifo(invoices, payment.amountMinor);
      if (plan.unallocated)
        throw new ConflictException(
          'Balance changed. Payment requires reconciliation before allocation.',
        );
      for (const a of plan.allocations) {
        const invoice = invoices.find((i) => i.id === a.invoiceId)!;
        const paidMinor = invoice.paidMinor + a.amountMinor;
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidMinor,
            status: outstanding({ ...invoice, paidMinor }) === 0 ? 'PAID' : 'PARTIAL',
          },
        });
        await tx.paymentAllocation.create({ data: { ...a, paymentId } });
      }
      const student = await tx.student.findUniqueOrThrow({
        where: { id: payment.studentId },
        include: { campus: true },
      });
      const receiptNo = await this.nextReceipt(tx, student.campusId, student.campus.code);
      await tx.auditLog.create({
        data: {
          campusId: student.campusId,
          action: 'SETTLE',
          entity: 'Payment',
          entityId: paymentId,
          meta: { amountMinor: payment.amountMinor, providerRef },
        },
      });
      return tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'SUCCESS',
          providerRef,
          paidAt: new Date(),
          receiptNo,
          receiptCampusId: student.campusId,
        },
      });
    });
    const student = await this.db.student.findUniqueOrThrow({
      where: { id: result.studentId },
      include: { guardians: true },
    });
    for (const g of student.guardians) this.live.user(g.guardianUserId, 'payment');
    this.live.campus(student.campusId, 'payment');
    return result;
  }
  /** Sequential per campus and calendar year (Asia/Dhaka), e.g. MAIN-2026-000042. */
  private async nextReceipt(tx: Prisma.TransactionClient, campusId: string, code: string) {
    const year = Number(today().slice(0, 4));
    const [row] = await tx.$queryRaw<{ next: number }[]>`
      INSERT INTO "ReceiptCounter" ("campusId", "year", "next") VALUES (${campusId}, ${year}, 2)
      ON CONFLICT ("campusId", "year") DO UPDATE SET "next" = "ReceiptCounter"."next" + 1
      RETURNING "next"`;
    return `${code}-${year}-${String(row.next - 1).padStart(6, '0')}`;
  }
  private async scoped(tx: Prisma.TransactionClient, c: Context, paymentId: string) {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, student: { campusId: c.campusId } },
      include: { allocations: { include: { invoice: { include: { session: true } } } } },
    });
    if (!payment) throw new NotFoundException('Record not found');
    return payment;
  }
  /** First step of a correction: a finance user records why the payment must be voided. */
  async requestVoid(c: Context, paymentId: string, reason: string) {
    return this.db.serial(async (tx) => {
      const payment = await this.scoped(tx, c, paymentId);
      if (payment.status !== 'SUCCESS')
        throw new ConflictException('Only completed payments can be voided');
      if (payment.voidRequestedBy)
        throw new ConflictException('A void is already awaiting approval');
      if (payment.allocations.some((a) => a.invoice.session.status === 'CLOSED'))
        throw new ForbiddenException('Closed sessions are read-only');
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: 'VOID_REQUEST',
          entity: 'Payment',
          entityId: paymentId,
          meta: { reason, amountMinor: payment.amountMinor },
        },
      });
      return tx.payment.update({
        where: { id: paymentId },
        data: { voidRequestedBy: c.userId, voidRequestedAt: new Date(), voidReason: reason },
      });
    });
  }
  async cancelVoid(c: Context, paymentId: string) {
    return this.db.serial(async (tx) => {
      const payment = await this.scoped(tx, c, paymentId);
      if (payment.status !== 'SUCCESS' || !payment.voidRequestedBy)
        throw new ConflictException('No void request to cancel');
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: 'VOID_CANCELLED',
          entity: 'Payment',
          entityId: paymentId,
        },
      });
      return tx.payment.update({
        where: { id: paymentId },
        data: { voidRequestedBy: null, voidRequestedAt: null, voidReason: null },
      });
    });
  }
  /**
   * Second step: a different finance user approves. Allocations are reversed onto their
   * invoices and the payment is kept, marked VOIDED, so receipts and history stay traceable.
   */
  async approveVoid(c: Context, paymentId: string) {
    const result = await this.db.serial(async (tx) => {
      const payment = await this.scoped(tx, c, paymentId);
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${payment.studentId} FOR UPDATE`;
      if (payment.status !== 'SUCCESS' || !payment.voidRequestedBy)
        throw new ConflictException('This payment has no pending void request');
      if (payment.voidRequestedBy === c.userId)
        throw new ForbiddenException('A different staff member must approve this void');
      if (payment.allocations.some((a) => a.invoice.session.status === 'CLOSED'))
        throw new ForbiddenException('Closed sessions are read-only');
      for (const a of payment.allocations) {
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: a.invoiceId } });
        const paidMinor = invoice.paidMinor - a.amountMinor;
        if (paidMinor < 0)
          throw new ConflictException('Invoice balance is inconsistent; contact support');
        const left = outstanding({ ...invoice, paidMinor });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidMinor,
            status:
              left === 0
                ? invoice.waivedMinor > 0 && paidMinor === 0
                  ? 'WAIVED'
                  : 'PAID'
                : paidMinor > 0
                  ? 'PARTIAL'
                  : 'DUE',
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: 'VOID',
          entity: 'Payment',
          entityId: paymentId,
          meta: {
            reason: payment.voidReason,
            requestedBy: payment.voidRequestedBy,
            amountMinor: payment.amountMinor,
          },
        },
      });
      return tx.payment.update({
        where: { id: paymentId },
        data: { status: 'VOIDED', voidedBy: c.userId, voidedAt: new Date() },
      });
    });
    this.live.campus(c.campusId, 'payment');
    return result;
  }
}
