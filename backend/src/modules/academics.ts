import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Roles, ADMIN, ACADEMIC, hasRole } from '../auth/access';
import { Scope } from '../auth/scope';
import { id, parse } from '../common';
@Controller()
export class AcademicsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
  ) {}
  @Get('teachers')
  @Roles(...ACADEMIC, 'TEACHER', 'CLASS_TEACHER')
  teachers(@Actor() c: Context) {
    return this.db.user.findMany({
      where: {
        roles: { some: { campusId: c.campusId, role: { in: ['TEACHER', 'CLASS_TEACHER'] } } },
      },
      select: { id: true, fullName: true },
    });
  }
  @Get('classes')
  classes(@Actor() c: Context) {
    return this.db.schoolClass.findMany({
      where: { campusId: c.campusId },
      orderBy: { numericLevel: 'asc' },
    });
  }
  @Post('classes')
  @Roles(...ADMIN)
  schoolClass(@Actor() c: Context, @Body() body: unknown) {
    return this.db.schoolClass.create({
      data: {
        ...parse(
          z.object({
            name: z.string().min(2).max(50),
            numericLevel: z.number().int().min(1).max(12),
          }),
          body,
        ),
        campusId: c.campusId,
      },
    });
  }
  @Get('sections')
  sections(@Actor() c: Context, @Query('sessionId') sessionId?: string) {
    return this.db.section.findMany({
      where: {
        schoolClass: { campusId: c.campusId },
        sessionId,
        ...(hasRole(c, ['TEACHER', 'CLASS_TEACHER']) && !hasRole(c, ACADEMIC)
          ? {
              OR: [
                { classTeacherId: c.userId },
                { assignments: { some: { teacherId: c.userId } } },
              ],
            }
          : {}),
      },
      include: {
        schoolClass: true,
        session: true,
        _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: { schoolClass: { numericLevel: 'asc' } },
    });
  }
  @Post('sections')
  @Roles(...ADMIN)
  async section(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        classId: id,
        sessionId: id,
        name: z.string().min(1).max(20),
        capacity: z.number().int().min(1).max(200),
        shift: z.enum(['MORNING', 'DAY']).default('MORNING'),
        classTeacherId: id.optional(),
      }),
      body,
    );
    await this.scope.session(c, v.sessionId);
    await this.db.schoolClass.findFirstOrThrow({ where: { id: v.classId, campusId: c.campusId } });
    if (v.classTeacherId)
      await this.db.userCampusRole.findFirstOrThrow({
        where: {
          campusId: c.campusId,
          userId: v.classTeacherId,
          role: { in: ['TEACHER', 'CLASS_TEACHER'] },
        },
      });
    return this.db.section.create({ data: v });
  }
  @Get('subjects')
  subjects(@Actor() c: Context) {
    return this.db.subject.findMany({ where: { campusId: c.campusId }, orderBy: { name: 'asc' } });
  }
  @Post('subjects')
  @Roles(...ADMIN)
  subject(@Actor() c: Context, @Body() body: unknown) {
    return this.db.subject.create({
      data: {
        ...parse(
          z.object({
            name: z.string().min(2).max(80),
            code: z.string().min(2).max(20),
            compulsory: z.boolean().default(true),
          }),
          body,
        ),
        campusId: c.campusId,
      },
    });
  }
  @Post('assignments')
  @Roles(...ACADEMIC)
  async assign(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ sectionId: id, subjectId: id, teacherId: id }), body);
    await this.scope.section(c, v.sectionId, true);
    await this.db.subject.findFirstOrThrow({ where: { id: v.subjectId, campusId: c.campusId } });
    await this.db.userCampusRole.findFirstOrThrow({
      where: {
        userId: v.teacherId,
        campusId: c.campusId,
        role: { in: ['TEACHER', 'CLASS_TEACHER'] },
      },
    });
    return this.db.sectionSubjectTeacher.upsert({
      where: { sectionId_subjectId: { sectionId: v.sectionId, subjectId: v.subjectId } },
      create: v,
      update: { teacherId: v.teacherId },
    });
  }
  @Get('timetable')
  async timetable(@Actor() c: Context, @Query('sectionId') sectionId: string) {
    parse(id, sectionId);
    if (hasRole(c, ['GUARDIAN', 'STUDENT']) && !hasRole(c, ACADEMIC)) {
      await this.db.enrollment.findFirstOrThrow({
        where: { sectionId, student: this.scope.studentFilter(c) },
      });
    } else await this.scope.section(c, sectionId);
    return this.db.timetableSlot.findMany({
      where: { sectionId },
      include: { subject: true },
      orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }],
    });
  }
  @Post('timetable')
  @Roles(...ACADEMIC)
  async slot(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        sectionId: id,
        subjectId: id,
        teacherId: id,
        dayOfWeek: z.number().int().min(0).max(6),
        period: z.number().int().min(1).max(12),
        room: z.string().max(30),
      }),
      body,
    );
    const section = await this.scope.section(c, v.sectionId, true);
    await this.db.sectionSubjectTeacher.findFirstOrThrow({
      where: { sectionId: v.sectionId, subjectId: v.subjectId, teacherId: v.teacherId },
    });
    const data = { ...v, sessionId: section.sessionId };
    return this.db.timetableSlot.upsert({
      where: {
        sessionId_sectionId_dayOfWeek_period: {
          sessionId: section.sessionId,
          sectionId: v.sectionId,
          dayOfWeek: v.dayOfWeek,
          period: v.period,
        },
      },
      create: data,
      update: data,
    });
  }
  @Delete('timetable/:id')
  @Roles(...ACADEMIC)
  async removeSlot(@Actor() c: Context, @Param('id') slotId: string) {
    const slot = await this.db.timetableSlot.findFirst({
      where: { id: slotId, section: { schoolClass: { campusId: c.campusId } } },
    });
    if (!slot) throw new NotFoundException('Record not found');
    await this.scope.section(c, slot.sectionId, true);
    await this.db.timetableSlot.delete({ where: { id: slot.id } });
    return { ok: true };
  }
  /**
   * Copies a section's routine (typically last session's) into another section. Slots are kept
   * only where the target section has a teacher for that subject and nobody is double-booked.
   */
  @Post('timetable/copy')
  @Roles(...ACADEMIC)
  async copyTimetable(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ fromSectionId: id, toSectionId: id }), body);
    await this.scope.section(c, v.fromSectionId);
    const target = await this.scope.section(c, v.toSectionId, true);
    const [slots, assignments] = await Promise.all([
      this.db.timetableSlot.findMany({ where: { sectionId: v.fromSectionId } }),
      this.db.sectionSubjectTeacher.findMany({ where: { sectionId: v.toSectionId } }),
    ]);
    const teacherFor = new Map(assignments.map((a) => [a.subjectId, a.teacherId]));
    let copied = 0,
      skipped = 0;
    for (const s of slots) {
      const teacherId = teacherFor.get(s.subjectId);
      if (!teacherId) {
        skipped++;
        continue;
      }
      const result = await this.db.timetableSlot.createMany({
        data: [
          {
            sessionId: target.sessionId,
            sectionId: v.toSectionId,
            subjectId: s.subjectId,
            teacherId,
            dayOfWeek: s.dayOfWeek,
            period: s.period,
            room: s.room,
          },
        ],
        skipDuplicates: true,
      });
      if (result.count) copied++;
      else skipped++;
    }
    return { copied, skipped };
  }
}
