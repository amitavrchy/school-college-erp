import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Db } from '../db';
import { Settings } from '../settings';
@Injectable()
export class Billing {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Settings) private settings: Settings,
  ) {}
  /**
   * Creates the invoices for one fee structure and due month. Safe to run repeatedly:
   * monthly/quarterly invoices are keyed by structure, student and month, and one-time heads
   * are recorded per enrolment so a student admitted mid-session is charged them exactly once.
   */
  async generate(campusId: string, structureId: string, dueDate: Date) {
    const structure = await this.db.feeStructure.findFirstOrThrow({
      where: { id: structureId, session: { campusId, status: { not: 'CLOSED' } } },
      include: { heads: true, session: { include: { campus: true } } },
    });
    if (dueDate < structure.session.startsOn || dueDate > structure.session.endsOn)
      throw new BadRequestException('Due date must be within the session');
    const policy = await this.settings.policy(structure.session.campus.orgId);
    const month = dueDate.getUTCMonth();
    const recurring = structure.heads.filter(
      (h) =>
        h.frequency === 'MONTHLY' ||
        (h.frequency === 'QUARTERLY' && month % 3 === structure.session.startsOn.getUTCMonth() % 3),
    );
    const once = structure.heads.filter((h) => h.frequency === 'ONCE');
    if (!recurring.length && !once.length) return { generated: 0 };
    const enrollments = await this.db.enrollment.findMany({
      where: {
        sessionId: structure.sessionId,
        status: 'ACTIVE',
        section: { classId: structure.classId },
      },
      include: { student: { include: { guardians: { where: { isPrimary: true } } } } },
    });
    const bps = policy.siblingDiscountBps;
    let generated = 0;
    for (const e of enrollments) {
      let discountBps = 0;
      if (bps > 0 && bps <= 10000 && e.student.guardians.length) {
        const siblings = await this.db.student.count({
          where: {
            campusId,
            guardians: {
              some: {
                guardianUserId: { in: e.student.guardians.map((g) => g.guardianUserId) },
                isPrimary: true,
              },
            },
            enrollments: { some: { sessionId: structure.sessionId, status: 'ACTIVE' } },
          },
        });
        if (siblings > 1) discountBps = bps;
      }
      const price = (h: { amountMinor: number; siblingDiscountEligible: boolean }) =>
        h.amountMinor -
        (h.siblingDiscountEligible ? Math.floor((h.amountMinor * discountBps) / 10000) : 0);
      const generationKey = `${structure.id}-${e.studentId}-${dueDate.toISOString().slice(0, 7)}`;
      const created = await this.db.serial(async (tx) => {
        if (await tx.invoice.findUnique({ where: { generationKey } })) return false;
        const charged = new Set(
          (
            await tx.feeHeadCharge.findMany({
              where: { enrollmentId: e.id, feeHeadId: { in: once.map((h) => h.id) } },
              select: { feeHeadId: true },
            })
          ).map((c) => c.feeHeadId),
        );
        const dueOnce = once.filter((h) => !charged.has(h.id));
        const heads = [...recurring, ...dueOnce];
        if (!heads.length) return false;
        const lines = heads.map((h) => ({ feeHeadName: h.name, amountMinor: price(h) }));
        const invoice = await tx.invoice.create({
          data: {
            generationKey,
            studentId: e.studentId,
            sessionId: e.sessionId,
            dueDate,
            totalMinor: lines.reduce((s, h) => s + h.amountMinor, 0),
            lines: { create: lines },
          },
        });
        if (dueOnce.length)
          await tx.feeHeadCharge.createMany({
            data: dueOnce.map((h) => ({
              enrollmentId: e.id,
              feeHeadId: h.id,
              invoiceId: invoice.id,
            })),
          });
        return true;
      });
      if (created) generated++;
    }
    return { generated };
  }
}
