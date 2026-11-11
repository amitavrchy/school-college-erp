import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Db } from '../db';
import { allocateFifo, outstanding } from '../domain/fees';
import { Realtime } from '../realtime';
@Injectable()
export class PaymentService {
  constructor(@Inject(Db) private db: Db, @Inject(Realtime) private live: Realtime) {}
  async create(studentId: string, amountMinor: number, provider: string, idempotencyKey: string) {
    return this.db.serial(async tx => {
      const existing = await tx.payment.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (existing.studentId !== studentId || existing.amountMinor !== amountMinor || existing.provider !== provider) throw new ConflictException('Idempotency key was used for a different payment');
        return existing;
      }
      const invoices = await tx.invoice.findMany({ where: { studentId, status: { in: ['DUE','PARTIAL'] }, session: { status: { not: 'CLOSED' } } } });
      if (invoices.reduce((s,i) => s+outstanding(i),0) < amountMinor) throw new BadRequestException('Payment exceeds the outstanding balance');
      return tx.payment.create({ data: { studentId, amountMinor, provider, idempotencyKey } });
    });
  }
  async settle(paymentId: string, providerRef: string) {
    const result = await this.db.serial(async tx => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${payment.studentId} FOR UPDATE`;
      if (payment.status === 'SUCCESS') return payment;
      if (payment.status !== 'PENDING') throw new ConflictException('Payment cannot be settled');
      const invoices = await tx.invoice.findMany({ where: { studentId: payment.studentId, status: { in: ['DUE','PARTIAL'] }, session: { status: { not: 'CLOSED' } } } });
      const plan = allocateFifo(invoices, payment.amountMinor);
      if (plan.unallocated) throw new ConflictException('Balance changed. Payment requires reconciliation before allocation.');
      for (const a of plan.allocations) {
        const invoice = invoices.find(i => i.id === a.invoiceId)!;
        const paidMinor = invoice.paidMinor + a.amountMinor;
        await tx.invoice.update({ where: { id: invoice.id }, data: { paidMinor, status: outstanding({ ...invoice, paidMinor }) === 0 ? 'PAID' : 'PARTIAL' } });
        await tx.paymentAllocation.create({ data: { ...a, paymentId } });
      }
      const student = await tx.student.findUniqueOrThrow({ where: { id: payment.studentId } });
      await tx.auditLog.create({ data: { campusId: student.campusId, action: 'SETTLE', entity: 'Payment', entityId: paymentId, meta: { amountMinor: payment.amountMinor, providerRef } } });
      return tx.payment.update({ where: { id: paymentId }, data: { status: 'SUCCESS', providerRef, paidAt: new Date() } });
    });
    const student = await this.db.student.findUniqueOrThrow({ where: { id: result.studentId }, include: { guardians: true } });
    for (const g of student.guardians) this.live.user(g.guardianUserId, 'payment');
    this.live.campus(student.campusId, 'payment'); return result;
  }
}
