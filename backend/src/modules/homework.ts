import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Feature, Roles, TEACHING, ACADEMIC, hasRole } from '../auth/access';
import { Scope } from '../auth/scope';
import { id, parse } from '../common';
@Controller('homework')
@Feature('homework')
export class HomeworkController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
  ) {}
  @Get()
  async list(@Actor() c: Context) {
    const staff = hasRole(c, TEACHING);
    const sections = staff
      ? undefined
      : await this.db.enrollment.findMany({
          where: { student: this.scope.studentFilter(c) },
          select: { sectionId: true },
        });
    return this.db.homework.findMany({
      where: {
        section: {
          schoolClass: { campusId: c.campusId },
          ...(!hasRole(c, ACADEMIC) && staff
            ? {
                OR: [
                  { classTeacherId: c.userId },
                  { assignments: { some: { teacherId: c.userId } } },
                ],
              }
            : {}),
        },
        ...(!staff
          ? { published: true, sectionId: { in: sections!.map((s) => s.sectionId) } }
          : {}),
      },
      include: {
        section: { include: { schoolClass: true } },
        subject: true,
        submissions: {
          where: staff ? {} : { student: this.scope.studentFilter(c) },
          include: { student: { select: { id: true, fullName: true, studentCode: true } } },
        },
      },
      orderBy: { dueAt: 'desc' },
      take: 100,
    });
  }
  @Post()
  @Roles(...TEACHING)
  async create(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        sectionId: id,
        subjectId: id,
        title: z.string().min(3).max(160),
        instructions: z.string().min(10).max(10000),
        dueAt: z.iso.datetime().transform((s) => new Date(s)),
        maxPoints: z.number().int().min(1).max(1000).default(100),
        allowLate: z.boolean().default(false),
      }),
      body,
    );
    const section = await this.scope.section(c, v.sectionId, true);
    if (
      !hasRole(c, ACADEMIC) &&
      !section.assignments.some((a) => a.subjectId === v.subjectId && a.teacherId === c.userId)
    )
      throw new ForbiddenException('This subject is not assigned to you');
    await this.db.subject.findFirstOrThrow({ where: { id: v.subjectId, campusId: c.campusId } });
    if (v.dueAt <= new Date()) throw new BadRequestException('Choose a future deadline');
    return this.db.homework.create({ data: { ...v, teacherId: c.userId } });
  }
  @Post(':id/submit')
  @Roles('STUDENT', 'GUARDIAN')
  async submit(@Actor() c: Context, @Param('id') homeworkId: string, @Body() body: unknown) {
    const v = parse(z.object({ studentId: id, answer: z.string().min(10).max(10000) }), body);
    await this.scope.student(c, v.studentId);
    return this.db.serial(async (tx) => {
      const homework = await tx.homework.findFirstOrThrow({
        where: {
          id: homeworkId,
          published: true,
          section: {
            schoolClass: { campusId: c.campusId },
            session: { status: { not: 'CLOSED' } },
          },
        },
      });
      await tx.enrollment.findFirstOrThrow({
        where: { studentId: v.studentId, sectionId: homework.sectionId, status: 'ACTIVE' },
      });
      if (!homework.allowLate && new Date() > homework.dueAt)
        throw new BadRequestException('The submission deadline has passed');
      const existing = await tx.homeworkSubmission.findUnique({
        where: { homeworkId_studentId: { homeworkId, studentId: v.studentId } },
      });
      if (existing?.gradedBy) throw new ConflictException('A graded submission cannot be edited');
      return tx.homeworkSubmission.upsert({
        where: { homeworkId_studentId: { homeworkId, studentId: v.studentId } },
        create: { homeworkId, ...v },
        update: { answer: v.answer, submittedAt: new Date() },
      });
    });
  }
  @Post('submissions/:id/grade')
  @Roles(...TEACHING)
  async grade(@Actor() c: Context, @Param('id') submissionId: string, @Body() body: unknown) {
    const v = parse(
      z.object({
        points: z.number().int().min(0).max(1000),
        feedback: z.string().min(3).max(2000),
      }),
      body,
    );
    const submission = await this.db.homeworkSubmission.findFirstOrThrow({
      where: {
        id: submissionId,
        homework: {
          section: {
            schoolClass: { campusId: c.campusId },
            session: { status: { not: 'CLOSED' } },
          },
        },
      },
      include: { homework: true },
    });
    if (!hasRole(c, ACADEMIC) && submission.homework.teacherId !== c.userId)
      throw new ForbiddenException('Only the assignment teacher can grade this work');
    if (v.points > submission.homework.maxPoints)
      throw new BadRequestException('Score exceeds the assignment maximum');
    return this.db.homeworkSubmission.update({
      where: { id: submissionId },
      data: { ...v, gradedBy: c.userId },
    });
  }
}
