import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Optional,
} from '@nestjs/common';
import { Jobs } from '../jobs';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Roles, TEACHING, ACADEMIC, hasRole } from '../auth/access';
import { Scope } from '../auth/scope';
import { id, parse } from '../common';
import { EXAM_FLOW, canTransition } from '../domain/workflow';
import { grade, gpa, NCTB, weightedGpa } from '../domain/grading';
@Controller('exams')
export class ExamsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
    @Optional() @Inject(Jobs) private jobs?: Jobs,
  ) {}
  @Get('terms')
  terms(@Actor() c: Context) {
    return this.db.examTerm.findMany({
      where: {
        session: { campusId: c.campusId },
        ...(!hasRole(c, TEACHING) ? { status: 'PUBLISHED' } : {}),
      },
      include: { session: true },
      orderBy: { name: 'asc' },
    });
  }
  @Post('terms')
  @Roles(...ACADEMIC)
  async create(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        sessionId: id,
        name: z.string().min(3).max(100),
        weightBps: z.number().int().min(1).max(10000).default(10000),
        entryDeadline: z.iso
          .datetime()
          .transform((v) => new Date(v))
          .optional(),
      }),
      body,
    );
    await this.scope.session(c, v.sessionId);
    return this.db.examTerm.create({ data: v });
  }
  @Patch('terms/:id')
  @Roles(...ACADEMIC)
  async transition(@Actor() c: Context, @Param('id') termId: string, @Body() body: unknown) {
    const v = parse(
      z.object({
        status: z.enum(['ENTRY_OPEN', 'ENTRY_LOCKED', 'MODERATION']),
        entryDeadline: z.iso
          .datetime()
          .transform((v) => new Date(v))
          .optional(),
      }),
      body,
    );
    return this.db.serial(async (tx) => {
      const term = await tx.examTerm.findFirstOrThrow({
        where: { id: termId, session: { campusId: c.campusId, status: { not: 'CLOSED' } } },
      });
      if (!canTransition(EXAM_FLOW, term.status, v.status))
        throw new BadRequestException('Invalid exam workflow transition');
      if (v.status === 'ENTRY_OPEN' && term.status !== 'SETUP' && !hasRole(c, ['PRINCIPAL']))
        throw new ForbiddenException('Principal permission is required to unlock marks');
      const result = await tx.examTerm.update({ where: { id: termId }, data: v });
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: `EXAM_${v.status}`,
          entity: 'ExamTerm',
          entityId: termId,
        },
      });
      return result;
    });
  }
  @Get('terms/:id/marks')
  @Roles(...TEACHING)
  marks(@Actor() c: Context, @Param('id') termId: string) {
    return this.db.examMark.findMany({
      where: {
        termId,
        term: { session: { campusId: c.campusId } },
        enrollment: { student: this.scope.studentFilter(c) },
      },
      include: { subject: true, enrollment: { include: { student: true } } },
    });
  }
  @Post('terms/:id/marks')
  @Roles(...TEACHING)
  async save(@Actor() c: Context, @Param('id') termId: string, @Body() body: unknown) {
    const v = parse(
      z.object({
        sectionId: id,
        subjectId: id,
        maxMarks: z.number().positive().max(1000).default(100),
        marks: z
          .array(
            z.object({
              enrollmentId: id,
              marksObtained: z.number().min(0),
              isAbsent: z.boolean().default(false),
            }),
          )
          .min(1)
          .max(200),
      }),
      body,
    );
    const section = await this.scope.section(c, v.sectionId, true);
    if (
      !hasRole(c, ACADEMIC) &&
      !section.assignments.some((a) => a.subjectId === v.subjectId && a.teacherId === c.userId)
    )
      throw new ForbiddenException('Subject is not assigned to you');
    await this.db.subject.findFirstOrThrow({ where: { id: v.subjectId, campusId: c.campusId } });
    if (
      v.marks.some((m) => m.marksObtained > v.maxMarks) ||
      new Set(v.marks.map((m) => m.enrollmentId)).size !== v.marks.length
    )
      throw new BadRequestException('Invalid or duplicate marks');
    return this.db.serial(async (tx) => {
      const term = await tx.examTerm.findFirstOrThrow({
        where: { id: termId, sessionId: section.sessionId },
      });
      if (term.status !== 'ENTRY_OPEN' || (term.entryDeadline && term.entryDeadline < new Date()))
        throw new ForbiddenException('Marks entry is locked or past the deadline');
      const count = await tx.enrollment.count({
        where: {
          id: { in: v.marks.map((m) => m.enrollmentId) },
          sectionId: v.sectionId,
          status: 'ACTIVE',
        },
      });
      if (count !== v.marks.length)
        throw new BadRequestException('Student is outside this section');
      for (const m of v.marks)
        await tx.examMark.upsert({
          where: {
            termId_enrollmentId_subjectId: {
              termId,
              enrollmentId: m.enrollmentId,
              subjectId: v.subjectId,
            },
          },
          create: { ...m, termId, subjectId: v.subjectId, maxMarks: v.maxMarks },
          update: { marksObtained: m.marksObtained, isAbsent: m.isAbsent, maxMarks: v.maxMarks },
        });
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: 'MARKS_ENTRY',
          entity: 'ExamTerm',
          entityId: termId,
          meta: { subjectId: v.subjectId, count },
        },
      });
      return { saved: count };
    });
  }
  @Post('terms/:id/publish')
  @Roles(...ACADEMIC)
  async publish(@Actor() c: Context, @Param('id') termId: string) {
    const published = await this.db.serial(async (tx) => {
      const term = await tx.examTerm.findFirstOrThrow({
        where: {
          id: termId,
          status: 'MODERATION',
          session: { campusId: c.campusId, status: { not: 'CLOSED' } },
        },
      });
      const enrollments = await tx.enrollment.findMany({
        where: { sessionId: term.sessionId, status: 'ACTIVE' },
        include: { section: { include: { assignments: true } }, marks: { where: { termId } } },
      });
      if (
        !enrollments.length ||
        enrollments.some(
          (e) =>
            !e.section.assignments.length ||
            e.section.assignments.some((a) => !e.marks.some((m) => m.subjectId === a.subjectId)),
        )
      )
        throw new BadRequestException(
          'Every active student needs marks for all assigned subjects before publication',
        );
      await tx.auditLog.create({
        data: {
          actorId: c.userId,
          campusId: c.campusId,
          action: 'PUBLISH',
          entity: 'ExamTerm',
          entityId: termId,
        },
      });
      return tx.examTerm.update({ where: { id: termId }, data: { status: 'PUBLISHED' } });
    });
    const guardians = await this.db.guardianStudent.findMany({
      where: {
        student: { enrollments: { some: { sessionId: published.sessionId, status: 'ACTIVE' } } },
      },
      select: { guardianUserId: true },
    });
    await this.jobs?.enqueuePush(
      guardians.map((g) => g.guardianUserId),
      'results',
      termId,
      { termId },
    );
    return published;
  }
  @Get('results/:studentId')
  async results(@Actor() c: Context, @Param('studentId') studentId: string) {
    await this.scope.student(c, studentId);
    const scales = await this.db.gradeScale.findMany({ where: { campusId: c.campusId } });
    const scale = scales.length ? scales : NCTB;
    const enrollments = await this.db.enrollment.findMany({
      where: { studentId },
      include: {
        session: true,
        marks: {
          where: { ...(!hasRole(c, TEACHING) ? { term: { status: 'PUBLISHED' } } : {}) },
          include: { subject: true, term: true },
        },
      },
    });
    return enrollments.map((e) => {
      const terms = [...new Set(e.marks.map((m) => m.termId))].map((termId) => {
        const marks = e.marks.filter((m) => m.termId === termId);
        return {
          term: marks[0].term,
          marks: marks.map((m) => ({
            ...m,
            grade: grade(Number(m.marksObtained), Number(m.maxMarks), m.isAbsent, scale),
          })),
          ...gpa(
            marks.map((m) => ({
              marks: Number(m.marksObtained),
              maxMarks: Number(m.maxMarks),
              absent: m.isAbsent,
              compulsory: m.subject.compulsory,
            })),
            scale,
          ),
        };
      });
      return {
        session: e.session,
        terms,
        finalGpa: terms.length
          ? weightedGpa(terms.map((t) => ({ gpa: t.gpa, weightBps: t.term.weightBps })))
          : null,
      };
    });
  }
}
