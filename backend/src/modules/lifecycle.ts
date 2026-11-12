import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Inject,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Roles, ACADEMIC } from '../auth/access';
import { Scope } from '../auth/scope';
import { id, parse, today } from '../common';
import { outstanding } from '../domain/fees';
import { requireQuota } from '../saas/policy';
@Controller('lifecycle')
@Roles(...ACADEMIC)
export class LifecycleController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
  ) {}
  @Post('promote')
  async promote(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        enrollmentIds: z.array(id).min(1).max(200),
        targetSectionId: id,
        carryDues: z.boolean().default(false),
      }),
      body,
    );
    const target = await this.scope.section(c, v.targetSectionId, true);
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Section" WHERE id = ${target.id} FOR UPDATE`;
      const enrollments = await tx.enrollment.findMany({
        where: {
          id: { in: v.enrollmentIds },
          status: 'ACTIVE',
          student: { campusId: c.campusId },
          session: { status: { not: 'CLOSED' } },
        },
        include: { section: { include: { schoolClass: true } }, session: true },
      });
      if (enrollments.length !== new Set(v.enrollmentIds).size)
        throw new BadRequestException(
          'Some enrollments are unavailable or belong to a closed session',
        );
      const count = await tx.enrollment.count({
        where: { sectionId: target.id, status: 'ACTIVE' },
      });
      if (count + enrollments.length > target.capacity)
        throw new BadRequestException('Target section capacity exceeded');
      const targetClass = await tx.schoolClass.findUniqueOrThrow({ where: { id: target.classId } });
      for (const e of enrollments) {
        if (
          e.sessionId === target.sessionId ||
          target.session.startsOn <= e.session.startsOn ||
          e.section.schoolClass.numericLevel + 1 !== targetClass.numericLevel
        )
          throw new BadRequestException('Promotion must advance one class into a new session');
        const dues = await tx.invoice.findMany({
          where: {
            studentId: e.studentId,
            sessionId: e.sessionId,
            status: { in: ['DUE', 'PARTIAL'] },
          },
        });
        const balance = dues.reduce((s, i) => s + outstanding(i), 0);
        if (balance && !v.carryDues)
          throw new BadRequestException(
            'Unpaid dues block promotion. Enable carry forward or collect payment.',
          );
        if (balance) {
          await tx.invoice.create({
            data: {
              studentId: e.studentId,
              sessionId: target.sessionId,
              dueDate: target.session.startsOn,
              totalMinor: balance,
              generationKey: `carry-${e.id}-${target.sessionId}`,
              lines: { create: { feeHeadName: 'Previous session dues', amountMinor: balance } },
            },
          });
          for (const i of dues)
            await tx.invoice.update({
              where: { id: i.id },
              data: { waivedMinor: i.waivedMinor + outstanding(i), status: 'CANCELLED' },
            });
        }
        await tx.enrollment.create({
          data: { studentId: e.studentId, sessionId: target.sessionId, sectionId: target.id },
        });
        await tx.enrollment.update({ where: { id: e.id }, data: { status: 'PROMOTED' } });
      }
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: 'PROMOTE',
          entity: 'Enrollment',
          entityId: target.id,
          meta: { count: enrollments.length, carryDues: v.carryDues },
        },
      });
      return { promoted: enrollments.length };
    });
  }
  @Post('transfer')
  async transfer(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        enrollmentId: id,
        targetSectionId: id,
        effectiveDate: z.iso.date().transform((v) => new Date(v)),
      }),
      body,
    );
    const source = await this.db.enrollment.findFirstOrThrow({
      where: {
        id: v.enrollmentId,
        status: 'ACTIVE',
        student: { campusId: c.campusId },
        session: { status: { not: 'CLOSED' } },
      },
      include: {
        student: { include: { guardians: true } },
        session: true,
        section: { include: { schoolClass: true } },
      },
    });
    const target = await this.db.section.findUniqueOrThrow({
      where: { id: v.targetSectionId },
      include: { schoolClass: { include: { campus: true } }, session: true },
    });
    const sourceCampus = await this.db.campus.findUniqueOrThrow({ where: { id: c.campusId } });
    const permission = await this.db.userCampusRole.findFirst({
      where: {
        userId: c.userId,
        campusId: target.schoolClass.campusId,
        role: { in: [...ACADEMIC] },
      },
    });
    if (
      !permission ||
      sourceCampus.orgId !== target.schoolClass.campus.orgId ||
      target.schoolClass.campusId === c.campusId
    )
      throw new ForbiddenException(
        'Transfer requires administrative access to both campuses in this organization',
      );
    if (
      target.session.status === 'CLOSED' ||
      v.effectiveDate.toISOString().slice(0, 10) > today() ||
      v.effectiveDate < source.session.startsOn ||
      target.schoolClass.numericLevel !== source.section.schoolClass.numericLevel ||
      v.effectiveDate < target.session.startsOn ||
      v.effectiveDate > target.session.endsOn
    )
      throw new BadRequestException('Invalid transfer session or effective date');
    return this.db.serial(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Enrollment" WHERE id = ${source.id} FOR UPDATE`;
      await requireQuota(tx, sourceCampus.orgId, 'students');
      await tx.enrollment.findFirstOrThrow({
        where: { id: source.id, status: 'ACTIVE', session: { status: { not: 'CLOSED' } } },
      });
      await tx.$queryRaw`SELECT id FROM "Section" WHERE id = ${target.id} FOR UPDATE`;
      if (
        (await tx.enrollment.count({ where: { sectionId: target.id, status: 'ACTIVE' } })) >=
        target.capacity
      )
        throw new BadRequestException('Target section is full');
      const student = await tx.student.create({
        data: {
          campusId: target.schoolClass.campusId,
          fullName: source.student.fullName,
          studentCode: `TR-${source.student.id}`,
          dob: source.student.dob,
          gender: source.student.gender,
          enrollments: { create: { sessionId: target.sessionId, sectionId: target.id } },
        },
      });
      for (const g of source.student.guardians) {
        await tx.guardianStudent.create({
          data: {
            guardianUserId: g.guardianUserId,
            studentId: student.id,
            relation: g.relation,
            isPrimary: g.isPrimary,
          },
        });
        await tx.userCampusRole.upsert({
          where: {
            userId_campusId_role: {
              userId: g.guardianUserId,
              campusId: target.schoolClass.campusId,
              role: 'GUARDIAN',
            },
          },
          create: {
            userId: g.guardianUserId,
            campusId: target.schoolClass.campusId,
            role: 'GUARDIAN',
          },
          update: {},
        });
      }
      if (source.student.userId) {
        await tx.guardianStudent.create({
          data: {
            guardianUserId: source.student.userId,
            studentId: student.id,
            relation: 'Self',
            isPrimary: false,
          },
        });
        await tx.userCampusRole.upsert({
          where: {
            userId_campusId_role: {
              userId: source.student.userId,
              campusId: student.campusId,
              role: 'STUDENT',
            },
          },
          create: { userId: source.student.userId, campusId: student.campusId, role: 'STUDENT' },
          update: {},
        });
      }
      const monthStart = new Date(
        Date.UTC(v.effectiveDate.getUTCFullYear(), v.effectiveDate.getUTCMonth(), 1),
      );
      const nextMonth = new Date(
        Date.UTC(v.effectiveDate.getUTCFullYear(), v.effectiveDate.getUTCMonth() + 1, 1),
      );
      const days = Math.round((nextMonth.getTime() - monthStart.getTime()) / 86400000);
      const remainingDays = Math.round(
        (nextMonth.getTime() - v.effectiveDate.getTime()) / 86400000,
      );
      const sourceInvoices = await tx.invoice.findMany({
        where: {
          studentId: source.studentId,
          sessionId: source.sessionId,
          status: { in: ['DUE', 'PARTIAL'] },
          dueDate: { gte: monthStart },
        },
        include: { lines: true },
      });
      const monthlyHeads = await tx.feeHead.findMany({
        where: {
          frequency: 'MONTHLY',
          structure: { classId: source.section.classId, sessionId: source.sessionId },
        },
      });
      for (const i of sourceInvoices) {
        const monthlyTotal = i.lines
          .filter((l) => monthlyHeads.some((h) => h.name === l.feeHeadName))
          .reduce((sum, l) => sum + l.amountMinor, 0);
        const reduction =
          i.dueDate >= nextMonth
            ? outstanding(i)
            : Math.min(outstanding(i), Math.floor((monthlyTotal * remainingDays) / days));
        await tx.invoice.update({
          where: { id: i.id },
          data: {
            status: reduction === outstanding(i) ? 'CANCELLED' : i.status,
            waivedMinor: i.waivedMinor + reduction,
          },
        });
      }
      const structures = await tx.feeStructure.findMany({
        where: { classId: target.classId, sessionId: target.sessionId },
        include: { heads: { where: { frequency: 'MONTHLY' } } },
      });
      for (const structure of structures) {
        const lines = structure.heads.map((h) => ({
          feeHeadName: `${h.name} (prorated transfer)`,
          amountMinor: Math.ceil((h.amountMinor * remainingDays) / days),
        }));
        if (lines.length)
          await tx.invoice.create({
            data: {
              studentId: student.id,
              sessionId: target.sessionId,
              dueDate: v.effectiveDate,
              totalMinor: lines.reduce((s, l) => s + l.amountMinor, 0),
              generationKey: `${structure.id}-${student.id}-${v.effectiveDate.toISOString().slice(0, 7)}`,
              lines: { create: lines },
            },
          });
      }
      await tx.enrollment.update({ where: { id: source.id }, data: { status: 'TRANSFERRED' } });
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: 'TRANSFER',
          entity: 'Student',
          entityId: source.studentId,
          meta: { newStudentId: student.id, targetCampusId: student.campusId },
        },
      });
      return student;
    });
  }
}
