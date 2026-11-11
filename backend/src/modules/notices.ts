import { BadRequestException, Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Roles, TEACHING, ACADEMIC, hasRole } from '../auth/access';
import { Scope } from '../auth/scope';
import { id, parse } from '../common';
import { smsSegments } from '../domain/workflow';
@Controller('notices')
export class NoticesController {
  constructor(@Inject(Db) private db: Db, @Inject(Scope) private scope: Scope) {}
  @Post(':id/schedule') @Roles(...ACADEMIC)
  async schedule(@Actor() c: Context, @Param('id') noticeId: string) {
    await this.db.notice.findFirstOrThrow({ where: { id: noticeId, campusId: c.campusId, status: 'DRAFT' } });
    return this.db.notice.update({ where: { id: noticeId }, data: { status: 'SCHEDULED' } });
  }
  @Get()
  async list(@Actor() c: Context) {
    const all = await this.db.notice.findMany({ where: { campusId: c.campusId, ...(!hasRole(c, TEACHING) ? { status: 'SENT', channels: { has: 'IN_APP' } } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
    if (hasRole(c, ACADEMIC)) return all;
    const students = await this.db.student.findMany({ where: this.scope.studentFilter(c), include: { enrollments: true } });
    const sectionIds = new Set(students.flatMap(s => s.enrollments.map(e => e.sectionId)));
    return all.filter(n => {
      const a = n.audience as { sectionIds?: string[]; studentIds?: string[] };
      return (!a.sectionIds?.length && !a.studentIds?.length) || (!a.sectionIds?.length || a.sectionIds.some(id => sectionIds.has(id))) && (!a.studentIds?.length || students.some(s => a.studentIds!.includes(s.id)));
    });
  }
  @Post() @Roles(...TEACHING)
  async create(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(z.object({ title: z.string().min(3).max(120), body: z.string().min(5).max(2000), bodyBn: z.string().max(2000).optional(), sectionIds: z.array(id).max(50).default([]), studentIds: z.array(id).max(200).default([]), channels: z.array(z.enum(['IN_APP','SMS'])).min(1).default(['IN_APP']), scheduledAt: z.iso.datetime().transform(s => new Date(s)).optional(), status: z.enum(['DRAFT','SCHEDULED']).default('SCHEDULED') }), body);
    if (!hasRole(c, ACADEMIC) && !v.sectionIds.length) throw new BadRequestException('Teachers must target an assigned section');
    for (const sectionId of v.sectionIds) await this.scope.section(c, sectionId, true);
    for (const studentId of v.studentIds) await this.scope.student(c, studentId);
    if (v.channels.includes('SMS') && smsSegments(v.bodyBn || v.body).segments > 6) throw new BadRequestException('SMS must fit within six segments');
    const { sectionIds, studentIds, ...data } = v;
    return this.db.notice.create({ data: { ...data, campusId: c.campusId, audience: { sectionIds, studentIds } } });
  }
  @Get('sms') @Roles(...ACADEMIC)
  sms(@Actor() c: Context) { return this.db.smsMessage.findMany({ where: { campusId: c.campusId }, orderBy: { createdAt: 'desc' }, take: 100 }); }
}
