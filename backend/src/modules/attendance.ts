import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Roles, ACADEMIC, TEACHING } from '../auth/access';
import { Scope } from '../auth/scope';
import { date, id, parse, today } from '../common';
import { Jobs } from '../jobs';
import { Audit } from '../audit';
import { Realtime } from '../realtime';
@Controller()
export class AttendanceController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
    @Inject(Jobs) private jobs: Jobs,
    @Inject(Audit) private audit: Audit,
    @Inject(Realtime) private live: Realtime,
  ) {}
  @Get('attendance')
  async list(@Actor() c: Context, @Query() query: Record<string, string>) {
    const v = parse(
      z.object({ date: date, sectionId: id.optional(), studentId: id.optional() }),
      query,
    );
    if (v.sectionId)
      await this.db.section.findFirstOrThrow({
        where: { id: v.sectionId, schoolClass: { campusId: c.campusId } },
      });
    return this.db.attendanceRecord.findMany({
      where: {
        date: v.date,
        enrollment: {
          sectionId: v.sectionId,
          studentId: v.studentId,
          student: this.scope.studentFilter(c),
        },
      },
      include: { enrollment: { include: { student: true } } },
    });
  }
  @Post('attendance/bulk')
  @Roles(...TEACHING)
  async bulk(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        sectionId: id,
        date,
        period: z.number().int().min(0).max(12).default(0),
        records: z
          .array(
            z.object({ enrollmentId: id, status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'LEAVE']) }),
          )
          .min(1)
          .max(200),
      }),
      body,
    );
    await this.scope.section(c, v.sectionId, true);
    if (v.date.toISOString().slice(0, 10) > today())
      throw new BadRequestException('Cannot mark future attendance');
    if (new Set(v.records.map((r) => r.enrollmentId)).size !== v.records.length)
      throw new BadRequestException('Duplicate students in attendance');
    const enrollments = await this.db.enrollment.findMany({
      where: {
        id: { in: v.records.map((r) => r.enrollmentId) },
        sectionId: v.sectionId,
        status: 'ACTIVE',
      },
    });
    if (enrollments.length !== v.records.length)
      throw new BadRequestException('A student is outside this section');
    await this.db.$transaction(
      v.records.map((r) =>
        this.db.attendanceRecord.upsert({
          where: {
            enrollmentId_date_period: {
              enrollmentId: r.enrollmentId,
              date: v.date,
              period: v.period,
            },
          },
          create: { ...r, date: v.date, period: v.period, markedBy: c.userId },
          update: { status: r.status, markedBy: c.userId },
        }),
      ),
    );
    for (const r of v.records)
      if (r.status === 'ABSENT' && v.period === 0)
        await this.jobs.enqueueAbsence(r.enrollmentId, v.date.toISOString().slice(0, 10));
    await this.audit.log(c, 'BULK_MARK', 'Attendance', v.sectionId, {
      date: v.date.toISOString(),
      count: v.records.length,
    });
    this.live.campus(c.campusId, 'attendance');
    return { saved: v.records.length };
  }
  @Get('leaves')
  leaves(@Actor() c: Context) {
    return this.db.leaveRequest.findMany({
      where: { student: this.scope.studentFilter(c) },
      include: { student: true },
      orderBy: { fromDate: 'desc' },
    });
  }
  @Post('leaves')
  @Roles('GUARDIAN', 'STUDENT', ...ACADEMIC)
  async request(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z
        .object({ studentId: id, fromDate: date, toDate: date, reason: z.string().min(5).max(500) })
        .refine((v) => v.toDate >= v.fromDate, 'End date precedes start date'),
      body,
    );
    await this.scope.student(c, v.studentId);
    return this.db.leaveRequest.create({ data: v });
  }
  @Patch('leaves/:id')
  @Roles(...TEACHING)
  async approve(@Actor() c: Context, @Param('id') leaveId: string, @Body() body: unknown) {
    const v = parse(z.object({ status: z.enum(['APPROVED', 'REJECTED']) }), body);
    const leave = await this.db.leaveRequest.findFirstOrThrow({
      where: { id: leaveId, status: 'REQUESTED', student: this.scope.studentFilter(c) },
    });
    return this.db.leaveRequest.update({ where: { id: leave.id }, data: v });
  }
}
