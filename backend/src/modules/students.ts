import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Db } from '../db';
import { Actor, Context, Roles, ACADEMIC, ADMISSIONS } from '../auth/access';
import { Scope } from '../auth/scope';
import { Audit } from '../audit';
import { date, id, parse } from '../common';
import { requireQuota } from '../saas/policy';
@Controller()
export class StudentsController {
  constructor(
    @Inject(Db) private db: Db,
    @Inject(Scope) private scope: Scope,
    @Inject(Audit) private audit: Audit,
  ) {}
  @Get('students')
  async students(@Actor() c: Context, @Query() query: Record<string, string>) {
    const q = parse(
      z.object({
        search: z.string().max(100).default(''),
        sectionId: id.optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(200).default(20),
      }),
      query,
    );
    const where = {
      AND: [
        this.scope.studentFilter(c),
        {
          OR: [
            { fullName: { contains: q.search, mode: 'insensitive' as const } },
            { studentCode: { contains: q.search, mode: 'insensitive' as const } },
          ],
          ...(q.sectionId
            ? { enrollments: { some: { sectionId: q.sectionId, status: 'ACTIVE' } } }
            : {}),
        },
      ],
    };
    const [items, total] = await Promise.all([
      this.db.student.findMany({
        where,
        include: {
          enrollments: {
            where: { status: 'ACTIVE' },
            include: { section: { include: { schoolClass: true } } },
          },
          guardians: { include: { guardian: { select: { fullName: true, phone: true } } } },
        },
        orderBy: { studentCode: 'asc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.db.student.count({ where }),
    ]);
    return { items, total, page: q.page, pages: Math.ceil(total / q.limit) };
  }
  @Get('students/:id')
  async detail(@Actor() c: Context, @Param('id') studentId: string) {
    await this.scope.student(c, studentId);
    return this.db.student.findUnique({
      where: { id: studentId },
      include: {
        enrollments: { include: { section: { include: { schoolClass: true } }, session: true } },
        guardians: {
          include: { guardian: { select: { fullName: true, phone: true, email: true } } },
        },
      },
    });
  }
  @Post('students')
  @Roles(...ADMISSIONS)
  async create(@Actor() c: Context, @Body() body: unknown) {
    const v = parse(
      z.object({
        fullName: z.string().min(2).max(100),
        studentCode: z.string().min(2).max(40),
        dob: date.optional(),
        gender: z.enum(['Male', 'Female', 'Other']).optional(),
        bloodGroup: z.string().max(5).optional(),
        sectionId: id,
      }),
      body,
    );
    const section = await this.scope.section(c, v.sectionId, true);
    const { sectionId, ...data } = v;
    const student = await this.db.serial(async (tx) => {
      await requireQuota(tx, c.orgId, 'students');
      await tx.$queryRaw`SELECT id FROM "Section" WHERE id = ${sectionId} FOR UPDATE`;
      const count = await tx.enrollment.count({ where: { sectionId, status: 'ACTIVE' } });
      if (count >= section.capacity)
        throw new (await import('@nestjs/common')).ConflictException('Section is full');
      return tx.student.create({
        data: {
          ...data,
          campusId: c.campusId,
          enrollments: {
            create: { sectionId, sessionId: section.sessionId, rollNumber: String(count + 1) },
          },
        },
      });
    });
    await this.audit.log(c, 'CREATE', 'Student', student.id);
    return student;
  }
  @Post('students/:id/guardians')
  @Roles(...ACADEMIC)
  async guardian(@Actor() c: Context, @Param('id') studentId: string, @Body() body: unknown) {
    await this.scope.student(c, studentId);
    const v = parse(
      z.object({
        guardianUserId: id,
        relation: z.string().min(2).max(30),
        isPrimary: z.boolean().default(false),
      }),
      body,
    );
    await this.db.userCampusRole.findFirstOrThrow({
      where: { userId: v.guardianUserId, campusId: c.campusId, role: 'GUARDIAN' },
    });
    return this.db.serial(async (tx) => {
      if (v.isPrimary)
        await tx.guardianStudent.updateMany({ where: { studentId }, data: { isPrimary: false } });
      return tx.guardianStudent.upsert({
        where: { guardianUserId_studentId: { guardianUserId: v.guardianUserId, studentId } },
        create: { ...v, studentId },
        update: v,
      });
    });
  }
}
