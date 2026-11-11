import { Body, Controller, Get, Inject, Post, Query, ForbiddenException } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Roles, ADMIN, ACADEMIC, hasRole } from '../auth/access';
import { Scope } from '../auth/scope';
import { id, parse } from '../common';
@Controller()
export class AcademicsController {
  constructor(@Inject(Db) private db: Db, @Inject(Scope) private scope: Scope) {}
  @Get('classes')
  classes(@Actor() c: Context) { return this.db.schoolClass.findMany({ where: { campusId: c.campusId }, orderBy: { numericLevel: 'asc' } }); }
  @Post('classes') @Roles(...ADMIN)
  schoolClass(@Actor() c: Context, @Body() body: unknown) { return this.db.schoolClass.create({ data: { ...parse(z.object({ name: z.string().min(2).max(50), numericLevel: z.number().int().min(1).max(12) }), body), campusId: c.campusId } }); }
  @Get('sections')
  sections(@Actor() c: Context, @Query('sessionId') sessionId?: string) {
    return this.db.section.findMany({ where: { schoolClass: { campusId: c.campusId }, sessionId, ...(hasRole(c, ['TEACHER','CLASS_TEACHER']) && !hasRole(c, ACADEMIC) ? { OR: [{ classTeacherId: c.userId }, { assignments: { some: { teacherId: c.userId } } }] } : {}) }, include: { schoolClass: true, session: true, _count: { select: { enrollments: { where: { status: 'ACTIVE' } } } } }, orderBy: { schoolClass: { numericLevel: 'asc' } } });
  }
  @Post('sections') @Roles(...ADMIN)
  async section(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ classId: id, sessionId: id, name: z.string().min(1).max(20), capacity: z.number().int().min(1).max(200), shift: z.enum(['MORNING','DAY']).default('MORNING'), classTeacherId: id.optional() }), body);
    await this.scope.session(c, v.sessionId);
    await this.db.schoolClass.findFirstOrThrow({ where: { id: v.classId, campusId: c.campusId } });
    if (v.classTeacherId) await this.db.userCampusRole.findFirstOrThrow({ where: { campusId: c.campusId, userId: v.classTeacherId, role: { in: ['TEACHER','CLASS_TEACHER'] } } });
    return this.db.section.create({ data: v });
  }
  @Get('subjects')
  subjects(@Actor() c: Context) { return this.db.subject.findMany({ where: { campusId: c.campusId }, orderBy: { name: 'asc' } }); }
  @Post('subjects') @Roles(...ADMIN)
  subject(@Actor() c: Context, @Body() body: unknown) { return this.db.subject.create({ data: { ...parse(z.object({ name: z.string().min(2).max(80), code: z.string().min(2).max(20), compulsory: z.boolean().default(true) }), body), campusId: c.campusId } }); }
  @Post('assignments') @Roles(...ACADEMIC)
  async assign(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ sectionId: id, subjectId: id, teacherId: id }), body);
    await this.scope.section(c, v.sectionId, true);
    await this.db.subject.findFirstOrThrow({ where: { id: v.subjectId, campusId: c.campusId } });
    await this.db.userCampusRole.findFirstOrThrow({ where: { userId: v.teacherId, campusId: c.campusId, role: { in: ['TEACHER','CLASS_TEACHER'] } } });
    return this.db.sectionSubjectTeacher.upsert({ where: { sectionId_subjectId: { sectionId: v.sectionId, subjectId: v.subjectId } }, create: v, update: { teacherId: v.teacherId } });
  }
  @Get('timetable')
  async timetable(@Actor() c: Context, @Query('sectionId') sectionId: string) {
    parse(id, sectionId);
    if (hasRole(c, ['GUARDIAN','STUDENT']) && !hasRole(c, ACADEMIC)) {
      await this.db.enrollment.findFirstOrThrow({ where: { sectionId, student: this.scope.studentFilter(c) } });
    } else await this.scope.section(c, sectionId);
    return this.db.timetableSlot.findMany({ where: { sectionId }, include: { subject: true }, orderBy: [{ dayOfWeek: 'asc' }, { period: 'asc' }] });
  }
  @Post('timetable') @Roles(...ACADEMIC)
  async slot(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ sectionId: id, subjectId: id, teacherId: id, dayOfWeek: z.number().int().min(0).max(6), period: z.number().int().min(1).max(12), room: z.string().max(30) }), body);
    await this.scope.section(c, v.sectionId, true);
    await this.db.sectionSubjectTeacher.findFirstOrThrow({ where: { sectionId: v.sectionId, subjectId: v.subjectId, teacherId: v.teacherId } });
    return this.db.timetableSlot.upsert({ where: { sectionId_dayOfWeek_period: { sectionId: v.sectionId, dayOfWeek: v.dayOfWeek, period: v.period } }, create: v, update: v });
  }
}
