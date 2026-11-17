import { config } from '../config';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Db } from '../db';
@Injectable()
export class Billing {
  constructor(@Inject(Db) private db: Db) {}
  async generate(campusId: string, structureId: string, dueDate: Date) {
    const structure = await this.db.feeStructure.findFirstOrThrow({
      where: { id: structureId, session: { campusId, status: { not: 'CLOSED' } } },
      include: { heads: true, session: true },
    });
    if (dueDate < structure.session.startsOn || dueDate > structure.session.endsOn)
      throw new BadRequestException('Due date must be within the session');
    const month = dueDate.getUTCMonth();
    const heads = structure.heads.filter(
      (h) =>
        h.frequency === 'MONTHLY' ||
        (h.frequency === 'QUARTERLY' &&
          month % 3 === structure.session.startsOn.getUTCMonth() % 3) ||
        (h.frequency === 'ONCE' && month === structure.session.startsOn.getUTCMonth()),
    );
    if (!heads.length) return { generated: 0 };
    const enrollments = await this.db.enrollment.findMany({
      where: {
        sessionId: structure.sessionId,
        status: 'ACTIVE',
        section: { classId: structure.classId },
      },
      include: { student: { include: { guardians: { where: { isPrimary: true } } } } },
    });
    let generated = 0;
    for (const e of enrollments) {
      let discountBps = 0;
      const configured = config.SIBLING_DISCOUNT_BPS;
      if (configured > 0 && configured <= 10000 && e.student.guardians.length) {
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
        if (siblings > 1) discountBps = configured;
      }
      const lines = heads.map((h) => ({
        feeHeadName: h.name,
        amountMinor:
          h.amountMinor -
          (/tuition/i.test(h.name) ? Math.floor((h.amountMinor * discountBps) / 10000) : 0),
      }));
      const generationKey = `${structure.id}-${e.studentId}-${dueDate.toISOString().slice(0, 7)}`;
      await this.db.invoice.upsert({
        where: { generationKey },
        update: { generationKey },
        create: {
          generationKey,
          studentId: e.studentId,
          sessionId: e.sessionId,
          dueDate,
          totalMinor: lines.reduce((s, h) => s + h.amountMinor, 0),
          lines: { create: lines },
        },
      });
      generated++;
    }
    return { generated };
  }
}
